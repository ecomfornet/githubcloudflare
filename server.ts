import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AuthError, AuthStore, isValidSpaceId, type PublicUser } from './src/auth-store.ts';
import { DashboardStore } from './src/store.ts';
import { rewritePreviewAssetsForSpace, WorkspacePool } from './src/workspace-pool.ts';

const DEFAULT_WORKSPACE_DIR = process.cwd();

for (const envFile of ['.env', '.env.local']) {
  const full = path.join(DEFAULT_WORKSPACE_DIR, envFile);
  if (fs.existsSync(full)) {
    try {
      for (const rawLine of fs.readFileSync(full, 'utf-8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignore unreadable env files
    }
  }
}

interface AuthedRequest extends express.Request {
  authUser?: PublicUser;
  authSid?: string;
  spaceId?: string;
  spaceOwner?: PublicUser;
  store?: DashboardStore;
}

function extractBearerToken(req: express.Request): string {
  const raw = req.headers.authorization || '';
  if (typeof raw !== 'string') return '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function handleAuthError(res: express.Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
}

export function createApp(opts: { workspaceDir?: string; publicDir?: string } = {}) {
  const rootDir = path.resolve(opts.workspaceDir || DEFAULT_WORKSPACE_DIR);
  const publicDir = path.resolve(opts.publicDir || path.join(DEFAULT_WORKSPACE_DIR, 'public'));
  const legacyAssetsDir = path.join(rootDir, 'assets');

  const authStore = new AuthStore({ rootDir });
  const workspacePool = new WorkspacePool(rootDir);

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Same-origin CORS policy (never wildcard '*' on authenticated endpoints)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost === host) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
      } catch {
        // ignore invalid Origin header
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Space-Id');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // --- Authentication & Role Middlewares ---
  const requireAuth: express.RequestHandler = (req: AuthedRequest, res, next) => {
    const token = extractBearerToken(req);
    const verified = authStore.verifyToken(token);
    if (!verified) {
      res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
      return;
    }
    req.authUser = verified.user;
    req.authSid = verified.sid;
    next();
  };

  const requireAdmin: express.RequestHandler = (req: AuthedRequest, res, next) => {
    if (!req.authUser || req.authUser.role !== 'admin') {
      res.status(403).json({ success: false, error: 'System Admin privileges required.' });
      return;
    }
    next();
  };

  const requireWorkspace: express.RequestHandler = (req: AuthedRequest, res, next) => {
    const token = extractBearerToken(req);
    const verified = authStore.verifyToken(token);
    if (!verified) {
      res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
      return;
    }

    const user = verified.user;
    const requestedSpace = String(req.headers['x-space-id'] || '').trim();
    let effectiveSpaceId = user.space_id;
    let owner: PublicUser = user;

    if (requestedSpace && requestedSpace !== user.space_id) {
      if (user.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Access denied: cannot access another user space.' });
        return;
      }
      if (!isValidSpaceId(requestedSpace)) {
        res.status(400).json({ success: false, error: 'Invalid space identifier.' });
        return;
      }
      const targetOwner = authStore.getUserBySpaceId(requestedSpace);
      if (!targetOwner) {
        res.status(404).json({ success: false, error: 'Target user space not found.' });
        return;
      }
      effectiveSpaceId = targetOwner.space_id;
      owner = targetOwner;
    }

    try {
      req.authUser = user;
      req.authSid = verified.sid;
      req.spaceId = effectiveSpaceId;
      req.spaceOwner = owner;
      req.store = workspacePool.getStore(effectiveSpaceId);
      next();
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const getReqStore = (req: AuthedRequest): DashboardStore => {
    if (!req.store) throw new Error('Workspace store not initialized.');
    return req.store;
  };

  // =========================================================================
  // PUBLIC AUTHENTICATION ROUTES
  // =========================================================================
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      multi_user: true,
      needs_admin_setup: !authStore.hasAdmin(),
    });
  });

  app.get('/api/auth/status', (_req, res) => {
    res.json({ success: true, ...authStore.getPublicStatus() });
  });

  app.post('/api/auth/setup-admin', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = authStore.setupFirstAdmin({
        username: String(body.username || ''),
        email: String(body.email || ''),
        password: String(body.password || ''),
        display_name: typeof body.display_name === 'string' ? body.display_name : undefined,
      });
      workspacePool.seedFirstAdminSpaceFromLegacyRoot(result.user.space_id);
      workspacePool.getStore(result.user.space_id);
      res.status(201).json({
        success: true,
        user: result.user,
        token: result.token,
        active_space_id: result.user.space_id,
        settings: authStore.getSettings(),
      });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = authStore.registerUser({
        username: String(body.username || ''),
        email: String(body.email || ''),
        password: String(body.password || ''),
        display_name: typeof body.display_name === 'string' ? body.display_name : undefined,
      });
      workspacePool.getStore(result.user.space_id);
      res.status(201).json({
        success: true,
        user: result.user,
        token: result.token,
        active_space_id: result.user.space_id,
      });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const identifier = String(body.identifier || body.username || body.email || '');
      const password = String(body.password || '');
      const result = authStore.login(identifier, password);
      workspacePool.getStore(result.user.space_id);
      res.json({
        success: true,
        user: result.user,
        token: result.token,
        active_space_id: result.user.space_id,
        settings: result.user.role === 'admin' ? authStore.getSettings() : undefined,
      });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.authSid) authStore.revokeSession(req.authSid);
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    res.json({
      success: true,
      user,
      active_space_id: user.space_id,
      space_stats: workspacePool.getSpaceStats(user.space_id),
      settings: user.role === 'admin' ? authStore.getSettings() : undefined,
    });
  });

  // =========================================================================
  // SYSTEM ADMIN ROUTES (ADMIN ROLE ONLY)
  // =========================================================================
  app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
    const users = authStore.listUsers().map((u) => ({
      ...u,
      space_stats: workspacePool.getSpaceStats(u.space_id),
    }));
    res.json({
      success: true,
      total: users.length,
      settings: authStore.getSettings(),
      users,
    });
  });

  app.post('/api/admin/users', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const created = authStore.createUserByAdmin(req.authUser!, {
        username: String(body.username || ''),
        email: String(body.email || ''),
        password: String(body.password || ''),
        display_name: typeof body.display_name === 'string' ? body.display_name : undefined,
        role: body.role === 'admin' ? 'admin' : 'user',
      });
      workspacePool.getStore(created.space_id);
      res.status(201).json({
        success: true,
        user: {
          ...created,
          space_stats: workspacePool.getSpaceStats(created.space_id),
        },
      });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const updated = authStore.updateUserByAdmin(req.authUser!, String(req.params.id || ''), {
        role: body.role === 'admin' || body.role === 'user' ? body.role : undefined,
        status: body.status === 'active' || body.status === 'suspended' ? body.status : undefined,
        display_name: typeof body.display_name === 'string' ? body.display_name : undefined,
        password: typeof body.password === 'string' ? body.password : undefined,
      });
      res.json({
        success: true,
        user: {
          ...updated,
          space_stats: workspacePool.getSpaceStats(updated.space_id),
        },
      });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const purgeSpace = body.purge_space !== false;
      const deleted = authStore.deleteUserByAdmin(req.authUser!, String(req.params.id || ''));
      if (purgeSpace) {
        workspacePool.deleteSpace(deleted.space_id);
      }
      res.json({ success: true, deleted_user: deleted, space_purged: purgeSpace });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  app.patch('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const updated = authStore.updateSettings({
        allow_self_signup: typeof body.allow_self_signup === 'boolean' ? body.allow_self_signup : undefined,
      });
      res.json({ success: true, settings: updated });
    } catch (err) {
      handleAuthError(res, err);
    }
  });

  // =========================================================================
  // ISOLATED PER-USER WORKSPACE API ROUTES (REQUIRE AUTHENTICATED SPACE)
  // =========================================================================
  app.get('/api/projects', requireWorkspace, (req: AuthedRequest, res) => {
    const store = getReqStore(req);
    res.json({
      success: true,
      space_id: req.spaceId,
      active_project: store.activeProjectId,
      projects: store.listProjects(),
    });
  });

  app.post('/api/projects', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const result = getReqStore(req).createProject(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/update', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const store = getReqStore(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const pid = String(body.project_id || body.id || store.activeProjectId).trim();
      const result = store.updateProject(pid, body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/switch', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const pid = String(body.project_id || body.id || '').trim();
      if (!pid) {
        res.status(400).json({ success: false, error: 'Project ID is required.' });
        return;
      }
      res.json(getReqStore(req).switchProject(pid));
    } catch (err) {
      res.status(404).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- System Status & Config ---
  app.get('/api/status', requireWorkspace, (req: AuthedRequest, res) => {
    res.json({
      ...getReqStore(req).getStatus(),
      space_id: req.spaceId,
      space_owner: req.spaceOwner ? { username: req.spaceOwner.username, display_name: req.spaceOwner.display_name, email: req.spaceOwner.email } : undefined,
    });
  });

  app.get('/api/config', requireWorkspace, (req: AuthedRequest, res) => {
    res.json(getReqStore(req).getConfigMasked());
  });

  app.post('/api/config', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const updated = getReqStore(req).updateConfig((req.body || {}) as Record<string, unknown>);
      res.json({ success: true, config: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/upload-logo', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      res.json(getReqStore(req).uploadLogo((req.body || {}) as Record<string, unknown>));
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/upload-block-image', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const result = await getReqStore(req).uploadThemeBlockImage((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Posts & Catalog ---
  app.get('/api/posts', requireWorkspace, (req: AuthedRequest, res) => {
    const q = String(req.query.q || '');
    const category = String(req.query.category || '');
    const customOnly = String(req.query.custom_only || 'false').toLowerCase() === 'true' || req.query.custom_only === '1';
    const status = String(req.query.status || '');
    const posts = getReqStore(req).listPosts({ query: q, category, customOnly, status });
    res.json({ total: posts.length, posts });
  });

  app.get('/api/posts/:slug', requireWorkspace, (req: AuthedRequest, res) => {
    const slug = String(req.params.slug || '');
    const post = getReqStore(req).getPost(slug);
    if (!post) {
      res.status(404).json({ error: `Post '${slug}' not found` });
      return;
    }
    res.json(post);
  });

  app.put('/api/posts/:slug', requireWorkspace, (req: AuthedRequest, res) => {
    const slug = String(req.params.slug || '');
    const updated = getReqStore(req).updatePost(slug, (req.body || {}) as Record<string, unknown>);
    if (!updated) {
      res.status(404).json({ error: `Post '${slug}' not found` });
      return;
    }
    res.json({ success: true, post: updated });
  });

  app.post('/api/posts/:slug/deploy', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const result = await getReqStore(req).deploySinglePost(String(req.params.slug || ''), (req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  app.delete('/api/posts/:slug', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const result = await getReqStore(req).deletePost(String(req.params.slug || ''), (req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  // --- Site Pages (9 Editable Company & Legal Pages) ---
  app.get('/api/pages', requireWorkspace, (req: AuthedRequest, res) => {
    const pages = getReqStore(req).listStaticPages();
    res.json({
      success: true,
      total: pages.length,
      custom_count: pages.filter((p) => p.is_custom).length,
      pages,
    });
  });

  app.post('/api/pages/deploy-all', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const result = await getReqStore(req).deployAllStaticPages((req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/pages/:slug', requireWorkspace, (req: AuthedRequest, res) => {
    const slug = String(req.params.slug || '');
    const page = getReqStore(req).getStaticPage(slug);
    if (!page) {
      res.status(404).json({ success: false, error: `Site page '${slug}' not found.` });
      return;
    }
    res.json({ success: true, page });
  });

  app.put('/api/pages/:slug', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const page = getReqStore(req).updateStaticPage(String(req.params.slug || ''), (req.body || {}) as Record<string, unknown>);
      res.json({ success: true, page });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not a valid') || message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  app.post('/api/pages/:slug/preview', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const rawHtml = getReqStore(req).renderStaticPagePreview(String(req.params.slug || ''), (req.body || {}) as Record<string, unknown>);
      const html = req.spaceId ? rewritePreviewAssetsForSpace(rawHtml, req.spaceId) : rawHtml;
      res.json({ success: true, html });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not a valid') || message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  app.post('/api/pages/:slug/deploy', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const result = await getReqStore(req).deployStaticPage(String(req.params.slug || ''), (req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not a valid') || message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  // --- Live Theme Preview ---
  app.post('/api/preview', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const rawHtml = getReqStore(req).renderPreview({
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        postData: body.post && typeof body.post === 'object' ? (body.post as Record<string, unknown>) : undefined,
        theme: typeof body.theme === 'string' ? body.theme : undefined,
        routingMode:
          typeof (body.route_structure || body.routing_mode) === 'string'
            ? String(body.route_structure || body.routing_mode)
            : undefined,
        viewMode:
          typeof (body.view_mode || body.type) === 'string' ? String(body.view_mode || body.type) : undefined,
        themeCustomizations:
          body.theme_customizations !== undefined ? body.theme_customizations : undefined,
      });
      const html = req.spaceId ? rewritePreviewAssetsForSpace(rawHtml, req.spaceId) : rawHtml;
      res.json({ success: true, html });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Ingestion & Sitemap Scan ---
  app.post('/api/sitemap/scan', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const parsedMax = body.max_posts !== undefined && body.max_posts !== '' ? Number(body.max_posts) : undefined;
      const result = await getReqStore(req).scanSitemap(
        typeof body.url_or_list === 'string' ? body.url_or_list : undefined,
        typeof body.source_type === 'string' ? body.source_type : 'sitemap',
        parsedMax !== undefined && Number.isFinite(parsedMax) ? parsedMax : undefined
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/ingest', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      res.json(getReqStore(req).startIngestJob((req.body || {}) as Record<string, unknown>));
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/ingest/stop', requireWorkspace, (req: AuthedRequest, res) => {
    res.json(getReqStore(req).stopIngestJob());
  });

  app.get('/api/ingest/status', requireWorkspace, (req: AuthedRequest, res) => {
    res.json(getReqStore(req).ingestJob);
  });

  app.post('/api/projects/clear', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const projectId = typeof body.project_id === 'string' ? body.project_id : undefined;
      res.json(getReqStore(req).clearActiveProjectData(projectId));
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Static Build & Assets ---
  app.post('/api/build', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = getReqStore(req).runBuild({
        clean: body.clean !== false,
        targetCloud: typeof (body.target_cloud || body.platform) === 'string' ? String(body.target_cloud || body.platform) : undefined,
        projectName:
          typeof (body.project_name || body.subdomain || body.worker_name) === 'string'
            ? String(body.project_name || body.subdomain || body.worker_name)
            : undefined,
        subdomain: typeof body.subdomain === 'string' ? body.subdomain : undefined,
        theme: typeof body.theme === 'string' ? body.theme : undefined,
        routingMode: typeof body.routing_mode === 'string' ? body.routing_mode : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/assets/sync', requireWorkspace, async (req: AuthedRequest, res) => {
    const store = getReqStore(req);
    const body = (req.body || {}) as Record<string, unknown>;
    if (body.cf_custom_domain !== undefined || body.custom_domain !== undefined || body.cf_project_name !== undefined || body.worker_name !== undefined) {
      try {
        store.updateProject(store.activeProjectId, body);
      } catch {
        // Ignore if no active project
      }
    }
    res.json(await store.syncAllPostImages());
  });

  app.post('/api/images/optimize', requireWorkspace, async (req: AuthedRequest, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    res.json(await getReqStore(req).optimizeAllImages(Number(body.quality || 82) || 82));
  });

  // --- Cloudflare Endpoints ---
  app.post('/api/cloudflare/verify', requireWorkspace, async (req: AuthedRequest, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = await getReqStore(req).verifyCloudflareCredentials(
      typeof (body.token || body.api_token) === 'string' ? String(body.token || body.api_token) : undefined,
      typeof body.account_id === 'string' ? body.account_id : undefined
    );
    res.json(result);
  });

  app.post('/api/cloudflare/deploy', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      res.json(
        getReqStore(req).startCloudflareDeploy({
          dryRun: Boolean(body.dry_run),
          subdomain:
            typeof (body.subdomain || body.project_name || body.worker_name) === 'string'
              ? String(body.subdomain || body.project_name || body.worker_name)
              : undefined,
          theme: typeof body.theme === 'string' ? body.theme : undefined,
        })
      );
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/cloudflare/fetch-posts', requireWorkspace, async (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await getReqStore(req).fetchLiveWorkerPosts({
        workerUrl: typeof body.worker_url === 'string' ? body.worker_url : undefined,
        subdomain:
          typeof (body.subdomain || body.project_name || body.worker_name) === 'string'
            ? String(body.subdomain || body.project_name || body.worker_name)
            : undefined,
        forceRefresh: Boolean(body.force_refresh),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- GitHub & Deploy Status ---
  app.get(['/api/deploy/status', '/api/deploy/logs'], requireWorkspace, (req: AuthedRequest, res) => {
    const store = getReqStore(req);
    res.json({
      ...store.deployJob,
      job: store.deployJob,
      logs: store.logs,
    });
  });

  app.post('/api/deploy', requireWorkspace, (req: AuthedRequest, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      res.json(
        getReqStore(req).startGitHubDeploy({
          dryRun: Boolean(body.dry_run),
          projectName:
            typeof (body.project_name || body.subdomain || body.owner) === 'string'
              ? String(body.project_name || body.subdomain || body.owner)
              : undefined,
        })
      );
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  async function handleGitHubOrgs(store: DashboardStore, rawToken: string, res: express.Response) {
    const token = !rawToken || rawToken.includes('****') ? store.getEffectiveGitHubToken() : rawToken;
    if (!token || token.includes('****')) {
      res.json({
        success: false,
        error: 'No GitHub Personal Access Token configured.',
        token_required: true,
        accounts: [],
      });
      return;
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pSEO-Dashboard/2.0',
      Authorization: `Bearer ${token}`,
    };
    const accounts: Array<Record<string, unknown>> = [];

    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (userRes.status === 401) {
        res.json({
          success: false,
          error: 'Invalid GitHub token (HTTP 401 Unauthorized).',
          token_invalid: true,
          accounts: [],
        });
        return;
      }
      if (userRes.ok) {
        const u = (await userRes.json()) as Record<string, unknown>;
        accounts.push({ login: u.login, type: 'User', is_org: false, avatar_url: u.avatar_url });
      }
      const orgRes = await fetch('https://api.github.com/user/orgs', {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (orgRes.ok) {
        const orgs = (await orgRes.json()) as Array<Record<string, unknown>>;
        for (const o of orgs) {
          accounts.push({ login: o.login, type: 'Organization', is_org: true, avatar_url: o.avatar_url });
        }
      }
      res.json({ success: true, accounts, detected_from_token: true });
    } catch (err) {
      res.status(500).json({ success: false, error: `GitHub API error: ${String(err)}`, accounts: [] });
    }
  }

  app.post('/api/github/orgs', requireWorkspace, async (req: AuthedRequest, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    await handleGitHubOrgs(getReqStore(req), String(body.token || '').trim(), res);
  });

  app.post('/api/github/check-org', requireWorkspace, async (req: AuthedRequest, res) => {
    const store = getReqStore(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const orgName = String(body.org || store.config.github.owner || '').trim();
    const rawToken = String(body.token || '').trim();
    const token = !rawToken || rawToken.includes('****') ? store.getEffectiveGitHubToken() : rawToken;

    if (!orgName) {
      res.status(400).json({ success: false, error: 'Organization name is required' });
      return;
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pSEO-Dashboard/2.0',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      let resp = await fetch(`https://api.github.com/orgs/${encodeURIComponent(orgName)}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      let accountType = 'Organization';
      if (resp.status === 404) {
        resp = await fetch(`https://api.github.com/users/${encodeURIComponent(orgName)}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        accountType = 'User';
      }
      if (resp.ok) {
        const orgData = (await resp.json()) as Record<string, unknown>;
        res.json({
          success: true,
          exists: true,
          org: orgName,
          account_type: accountType,
          is_org: accountType === 'Organization',
          url: orgData.html_url || `https://github.com/${orgName}`,
          message: `${accountType} '${orgName}' is verified and active on GitHub!`,
        });
        return;
      }
      res.json({
        success: false,
        exists: false,
        org: orgName,
        create_web_url: 'https://github.com/account/organizations/new?plan=free',
        message: `Organization '${orgName}' does not exist yet on GitHub.`,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: `Network error checking GitHub account: ${String(err)}` });
    }
  });

  app.post('/api/github/create-repo', requireWorkspace, async (req: AuthedRequest, res) => {
    const store = getReqStore(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const owner = String(body.owner || store.config.github.owner || '').trim();
    const repo = String(body.repo || store.config.github.repo || '').trim();
    const isOrg = body.is_org !== undefined ? Boolean(body.is_org) : store.config.github.is_org;
    const rawToken = String(body.token || '').trim();
    const token = !rawToken || rawToken.includes('****') ? store.getEffectiveGitHubToken() : rawToken;

    if (!owner || !repo) {
      res.status(400).json({ success: false, error: 'Both owner and repo are required.' });
      return;
    }
    if (!token) {
      res.status(400).json({ success: false, error: 'A GitHub Personal Access Token is required to create repositories.' });
      return;
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pSEO-Dashboard/2.0',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    try {
      const checkRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      let created = false;
      if (checkRes.status === 404) {
        const endpoint = isOrg
          ? `https://api.github.com/orgs/${encodeURIComponent(owner)}/repos`
          : 'https://api.github.com/user/repos';
        const createRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: repo, private: false, auto_init: true }),
          signal: AbortSignal.timeout(15000),
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          res.status(createRes.status).json({ success: false, error: `GitHub repo creation failed: ${errText}` });
          return;
        }
        created = true;
      }
      const pagesUrl = repo.endsWith('.github.io') ? `https://${repo}` : `https://${owner}.github.io/${repo}`;
      res.json({
        success: true,
        repo: `${owner}/${repo}`,
        repo_url: `https://github.com/${owner}/${repo}`,
        pages_url: pagesUrl,
        created,
        exists: true,
        message: `Repository '${owner}/${repo}' is ready for GitHub Pages!`,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: `Failed creating repository: ${String(err)}` });
    }
  });

  // --- Isolated Per-Space Static Assets (Strictly Confined) ---
  app.get('/spaces/:spaceId/assets/{*assetPath}', (req, res) => {
    const spaceId = String(req.params.spaceId || '').trim();
    if (!isValidSpaceId(spaceId) || !authStore.getUserBySpaceId(spaceId)) {
      res.status(404).end();
      return;
    }
    try {
      const assetsDir = workspacePool.resolveSpaceAssetsDir(spaceId);
      const rawParam = (req.params as Record<string, unknown>).assetPath;
      const relPath = Array.isArray(rawParam) ? rawParam.join('/') : String(rawParam || '');
      const resolvedFile = path.resolve(assetsDir, relPath);
      if (!resolvedFile.startsWith(assetsDir + path.sep) || !fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
        res.status(404).end();
        return;
      }
      res.sendFile(resolvedFile);
    } catch {
      res.status(404).end();
    }
  });

  app.use('/spaces', (_req, res) => {
    res.status(404).end();
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found.' });
  });

  // --- Static Assets & Dashboard SPA ---
  fs.mkdirSync(path.join(legacyAssetsDir, 'images'), { recursive: true });
  app.use('/assets', express.static(legacyAssetsDir, { maxAge: '1d' }));
  app.use('/static', express.static(publicDir));
  app.use(express.static(publicDir));

  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

const isDirectEntry =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectEntry) {
  const PORT = Number(process.env.PORT || 3000) || 3000;
  const HOST = '0.0.0.0';

  process.on('unhandledRejection', (reason) => {
    console.error('[stylesdays pSEO Hub] Unhandled promise rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[stylesdays pSEO Hub] Uncaught exception:', err);
  });

  const app = createApp();
  const server = app.listen(PORT, HOST, () => {
    console.log(`[stylesdays pSEO Hub] Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[stylesdays pSEO Hub] Server failed to bind ${HOST}:${PORT}:`, err.message);
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    console.log(`[stylesdays pSEO Hub] Received ${signal}, shutting down cleanly...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
