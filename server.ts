import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DashboardStore } from './src/store.ts';

const WORKSPACE_DIR = process.cwd();
const PUBLIC_DIR = path.join(WORKSPACE_DIR, 'public');
const ASSETS_DIR = path.join(WORKSPACE_DIR, 'assets');

for (const envFile of ['.env', '.env.local']) {
  const full = path.join(WORKSPACE_DIR, envFile);
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

const store = new DashboardStore({ workspaceDir: WORKSPACE_DIR });

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // --- Projects ---
  app.get('/api/projects', (_req, res) => {
    res.json({
      success: true,
      active_project: store.activeProjectId,
      projects: store.listProjects(),
    });
  });

  app.post('/api/projects', (req, res) => {
    try {
      const result = store.createProject(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/update', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const pid = String(body.project_id || body.id || store.activeProjectId).trim();
      const result = store.updateProject(pid, body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/switch', (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const pid = String(body.project_id || body.id || '').trim();
      if (!pid) {
        res.status(400).json({ success: false, error: 'Project ID is required.' });
        return;
      }
      res.json(store.switchProject(pid));
    } catch (err) {
      res.status(404).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- System Status & Config ---
  app.get('/api/status', (_req, res) => {
    res.json(store.getStatus());
  });

  app.get('/api/config', (_req, res) => {
    res.json(store.getConfigMasked());
  });

  app.post('/api/config', (req, res) => {
    const updated = store.updateConfig((req.body || {}) as Record<string, unknown>);
    res.json({ success: true, config: updated });
  });

  app.post('/api/upload-logo', (req, res) => {
    try {
      res.json(store.uploadLogo((req.body || {}) as Record<string, unknown>));
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Posts & Catalog ---
  app.get('/api/posts', (req, res) => {
    const q = String(req.query.q || '');
    const category = String(req.query.category || '');
    const customOnly = String(req.query.custom_only || 'false').toLowerCase() === 'true' || req.query.custom_only === '1';
    const posts = store.listPosts({ query: q, category, customOnly });
    res.json({ total: posts.length, posts });
  });

  app.get('/api/posts/:slug', (req, res) => {
    const post = store.getPost(req.params.slug);
    if (!post) {
      res.status(404).json({ error: `Post '${req.params.slug}' not found` });
      return;
    }
    res.json(post);
  });

  app.put('/api/posts/:slug', (req, res) => {
    const updated = store.updatePost(req.params.slug, (req.body || {}) as Record<string, unknown>);
    if (!updated) {
      res.status(404).json({ error: `Post '${req.params.slug}' not found` });
      return;
    }
    res.json({ success: true, post: updated });
  });

  app.post('/api/posts/:slug/deploy', async (req, res) => {
    try {
      const result = await store.deploySinglePost(req.params.slug, (req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  app.delete('/api/posts/:slug', async (req, res) => {
    try {
      const result = await store.deletePost(req.params.slug, (req.body || {}) as Record<string, unknown>);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: message });
    }
  });

  // --- Live Theme Preview ---
  app.post('/api/preview', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const html = store.renderPreview({
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      postData: body.post && typeof body.post === 'object' ? (body.post as Record<string, unknown>) : undefined,
      theme: typeof body.theme === 'string' ? body.theme : undefined,
      routingMode:
        typeof (body.route_structure || body.routing_mode) === 'string'
          ? String(body.route_structure || body.routing_mode)
          : undefined,
      viewMode:
        typeof (body.view_mode || body.type) === 'string' ? String(body.view_mode || body.type) : undefined,
    });
    res.json({ success: true, html });
  });

  // --- Ingestion & Sitemap Scan ---
  app.post('/api/sitemap/scan', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const parsedMax = body.max_posts !== undefined && body.max_posts !== '' ? Number(body.max_posts) : undefined;
    const result = await store.scanSitemap(
      typeof body.url_or_list === 'string' ? body.url_or_list : undefined,
      typeof body.source_type === 'string' ? body.source_type : 'sitemap',
      parsedMax !== undefined && Number.isFinite(parsedMax) ? parsedMax : undefined
    );
    res.json(result);
  });

  app.post('/api/ingest', (req, res) => {
    res.json(store.startIngestJob((req.body || {}) as Record<string, unknown>));
  });

  app.post('/api/ingest/stop', (_req, res) => {
    res.json(store.stopIngestJob());
  });

  app.get('/api/ingest/status', (_req, res) => {
    res.json(store.ingestJob);
  });

  app.post('/api/projects/clear', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const projectId = typeof body.project_id === 'string' ? body.project_id : undefined;
    res.json(store.clearActiveProjectData(projectId));
  });

  // --- Static Build & Assets ---
  app.post('/api/build', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = store.runBuild({
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
  });

  app.post('/api/assets/sync', async (req, res) => {
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

  app.post('/api/images/optimize', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    res.json(await store.optimizeAllImages(Number(body.quality || 82) || 82));
  });

  // --- Cloudflare Endpoints ---
  app.post('/api/cloudflare/verify', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = await store.verifyCloudflareCredentials(
      typeof (body.token || body.api_token) === 'string' ? String(body.token || body.api_token) : undefined,
      typeof body.account_id === 'string' ? body.account_id : undefined
    );
    res.json(result);
  });

  app.post('/api/cloudflare/deploy', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    res.json(
      store.startCloudflareDeploy({
        dryRun: Boolean(body.dry_run),
        subdomain:
          typeof (body.subdomain || body.project_name || body.worker_name) === 'string'
            ? String(body.subdomain || body.project_name || body.worker_name)
            : undefined,
        theme: typeof body.theme === 'string' ? body.theme : undefined,
      })
    );
  });

  app.post('/api/cloudflare/fetch-posts', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await store.fetchLiveWorkerPosts({
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
  app.get(['/api/deploy/status', '/api/deploy/logs'], (_req, res) => {
    res.json({
      ...store.deployJob,
      job: store.deployJob,
      logs: store.logs,
    });
  });

  app.post('/api/deploy', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    res.json(
      store.startGitHubDeploy({
        dryRun: Boolean(body.dry_run),
        projectName:
          typeof (body.project_name || body.subdomain || body.owner) === 'string'
            ? String(body.project_name || body.subdomain || body.owner)
            : undefined,
      })
    );
  });

  async function handleGitHubOrgs(rawToken: string, res: express.Response) {
    const token = !rawToken || rawToken.includes('****') ? store.config.github.token : rawToken;
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
      const userRes = await fetch('https://api.github.com/user', { headers });
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
      const orgRes = await fetch('https://api.github.com/user/orgs', { headers });
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

  app.post('/api/github/orgs', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    await handleGitHubOrgs(String(body.token || '').trim(), res);
  });

  app.post('/api/github/check-org', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const orgName = String(body.org || store.config.github.owner || '').trim();
    const rawToken = String(body.token || '').trim();
    const token = !rawToken || rawToken.includes('****') ? store.config.github.token : rawToken;

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
      let resp = await fetch(`https://api.github.com/orgs/${encodeURIComponent(orgName)}`, { headers });
      let accountType = 'Organization';
      if (resp.status === 404) {
        resp = await fetch(`https://api.github.com/users/${encodeURIComponent(orgName)}`, { headers });
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

  app.post('/api/github/create-repo', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const owner = String(body.owner || store.config.github.owner || '').trim();
    const repo = String(body.repo || store.config.github.repo || '').trim();
    const isOrg = body.is_org !== undefined ? Boolean(body.is_org) : store.config.github.is_org;
    const rawToken = String(body.token || '').trim();
    const token = !rawToken || rawToken.includes('****') ? store.config.github.token : rawToken;

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

  // --- Static Assets & Dashboard SPA ---
  fs.mkdirSync(path.join(ASSETS_DIR, 'images'), { recursive: true });
  app.use('/assets', express.static(ASSETS_DIR, { maxAge: '1d' }));
  app.use('/static', express.static(PUBLIC_DIR));
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), active_project: store.activeProjectId });
  });

  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  return app;
}

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
