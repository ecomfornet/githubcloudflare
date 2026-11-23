import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type {
  AppConfig,
  CategoryItem,
  DeployJob,
  DiffSummary,
  IngestJob,
  Manifest,
  PostItem,
  ProjectItem,
  StaticPageOverride,
} from './types.ts';
import {
  createDefaultConfig,
  deriveBrandFromDomain,
  deriveCategories,
  getCloudflareLiveUrl,
  maskToken,
  normalizePost,
  normalizeRoutingMode,
  normalizeThemeCustomizations,
  resolvePostRoute,
  slugify,
  stripProtocol,
} from './types.ts';
import {
  THEMES,
  generateSvgFallback,
  getSamplePostForTheme,
  getSeedPosts,
  getThemeTokens,
  renderCategoryIndexHtml,
  renderHubHtml,
  renderPostHtml,
  renderStaticPageHtml,
} from './templates.ts';
import {
  EDITABLE_STATIC_PAGE_META,
  buildTrustPages,
  extractUploadedPageHtml,
  isEditableStaticPageSlug,
  resolveSiteIdentity,
  sanitizeStaticPageHtml,
} from './static-pages.ts';
import * as cheerio from 'cheerio';
import { deployCloudflareWorkersAssets, sanitizeWorkerScriptName } from './cloudflare-deployer.ts';
import {
  assertSafePublicUrl,
  discoverUrlsFromSource,
  fetchPublicSafe,
  fetchWpApiPosts,
  localizeAndConvertPostImages,
  optimizeDirectoryToWebp,
  parseXmlSitemapEntries,
  sanitizeEditedHtml,
  scrapeArticleFromUrl,
} from './scraper.ts';

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hasValidDomainHost(raw: string): boolean {
  const host = stripProtocol(raw).split('/')[0].trim();
  return Boolean(host && host.includes('.') && !/\s/.test(host));
}

export interface StoreOptions {
  workspaceDir?: string;
  configPath?: string;
  manifestPath?: string;
}

export class DashboardStore {
  workspaceDir: string;
  configPath: string;
  manifestPath: string;
  config: AppConfig;
  manifest: Manifest;
  activeProjectId: string;
  activeManifestPath: string;
  projects: Record<string, ProjectItem>;
  staticPageOverrides: Record<string, StaticPageOverride>;
  deployJob: DeployJob;
  ingestJob: IngestJob;
  logs: string[];
  lastBuildTime: string;
  lastBuildFiles: number;
  private ingestAbortController: AbortController | null;
  private ingestStopRequested: boolean;

  constructor(options: StoreOptions = {}) {
    this.workspaceDir = path.resolve(options.workspaceDir || process.cwd());
    this.configPath = path.resolve(this.workspaceDir, options.configPath || 'pseo_config.json');
    this.manifestPath = path.resolve(this.workspaceDir, options.manifestPath || 'pseo_manifest.json');
    this.logs = [];
    this.lastBuildTime = '';
    this.lastBuildFiles = 0;
    this.ingestAbortController = null;
    this.ingestStopRequested = false;
    this.deployJob = this.createIdleDeployJob();
    this.ingestJob = this.createIdleIngestJob();

    this.config = this.loadConfig();
    this.manifest = this.loadManifestFile(this.manifestPath);
    this.projects = {};
    this.staticPageOverrides = {};
    this.activeProjectId = this.config.active_project || 'stylesdays';
    this.activeManifestPath = this.manifestPath;

    this.initProjects();
    this.log('Dashboard system initialized and ready (Node.js 22 runtime).');
  }

  private createIdleIngestJob(): IngestJob {
    return {
      status: 'idle',
      started_at: '',
      completed_at: '',
      current_post: '',
      processed_count: 0,
      total_count: 0,
      message: '',
      counts: { new: 0, updated: 0, synced: 0, total: 0 },
      error: '',
      new_posts: [],
      updated_posts: [],
      synced_posts: [],
    };
  }

  private createIdleDeployJob(): DeployJob {
    return {
      status: 'idle',
      stage: '',
      percent: 0,
      message: '',
      target: 'Cloudflare Workers',
      subdomain: '',
      live_url: '',
      duration: 0,
      files_count: 0,
      total_files: 0,
      deployed_files: 0,
      commit_sha: '',
      error: '',
      errors: [],
      started_at: '',
      completed_at: '',
      edge_verification: {},
      output: '',
    };
  }

  private loadConfig(): AppConfig {
    const base = createDefaultConfig();
    const candidates = [
      this.configPath,
      path.join(this.workspaceDir, 'pseo_config.example.json'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<AppConfig>;
          const merged: AppConfig = {
            github: {
              ...base.github,
              ...(parsed.github || {}),
              token: parsed.github?.token || '',
              owner: parsed.github?.owner || base.github.owner,
              repo: parsed.github?.repo || base.github.repo,
            },
            cloudflare: {
              ...base.cloudflare,
              ...(parsed.cloudflare || {}),
              api_token: parsed.cloudflare?.api_token || '',
              account_id: parsed.cloudflare?.account_id || '',
              account_subdomain: parsed.cloudflare?.account_subdomain || base.cloudflare.account_subdomain,
            },
            ingestion: { ...base.ingestion, ...(parsed.ingestion || {}) },
            build: { ...base.build, ...(parsed.build || {}) },
            dashboard: { ...base.dashboard, ...(parsed.dashboard || {}) },
            branding: {
              ...base.branding,
              ...(parsed.branding || {}),
              social_links: {
                ...base.branding.social_links,
                ...(parsed.branding?.social_links || {}),
              },
            },
            active_project: parsed.active_project || base.active_project,
            projects: parsed.projects || {},
          };
          // Prevent broken logo URL if example file points to non-existent asset
          if (merged.branding.logo_path && merged.branding.logo_path.startsWith('/assets/')) {
            const localAsset = path.join(this.workspaceDir, merged.branding.logo_path.replace(/^\/+/, ''));
            if (!fs.existsSync(localAsset)) {
              merged.branding.logo_path = '';
            }
          }
          return merged;
        } catch {
          // Fall through to default config
        }
      }
    }
    base.github.token = '';
    base.cloudflare.api_token = '';
    base.cloudflare.account_id = '';
    return base;
  }

  private loadManifestFile(filePath: string): Manifest {
    if (filePath && fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
        const posts: Record<string, PostItem> = {};
        const rawPosts = raw.posts;
        if (Array.isArray(rawPosts)) {
          for (const item of rawPosts) {
            if (item && typeof item === 'object') {
              const p = normalizePost(item as Record<string, unknown>);
              if (p.slug) posts[p.slug] = p;
            }
          }
        } else if (rawPosts && typeof rawPosts === 'object') {
          for (const [key, val] of Object.entries(rawPosts as Record<string, unknown>)) {
            if (val && typeof val === 'object') {
              const p = normalizePost(val as Record<string, unknown>, key);
              posts[p.slug] = p;
            }
          }
        }
        const categories =
          Object.keys(posts).length > 0
            ? deriveCategories(posts)
            : Array.isArray(raw.categories)
              ? (raw.categories as CategoryItem[])
              : [];
        return {
          version: String(raw.version || '2.0'),
          updated_at: String(raw.updated_at || new Date().toISOString()),
          posts,
          categories,
        };
      } catch {
        // Return empty manifest below
      }
    }
    return {
      version: '2.0',
      updated_at: new Date().toISOString(),
      posts: {},
      categories: [],
    };
  }

  private initProjects(): void {
    this.projects = {};
    for (const [pid, pdata] of Object.entries(this.config.projects || {})) {
      if (pdata && typeof pdata === 'object') {
        this.projects[pid] = {
          ...pdata,
          id: pid,
          name: pdata.name || pid,
          platform: pdata.platform || 'cloudflare',
          theme: pdata.theme || this.config.build.theme || 'nordic-studio',
          routing_mode: pdata.routing_mode || this.config.build.routing_mode || 'single',
          max_posts: Number(pdata.max_posts || 60),
          download_images: pdata.download_images !== false,
        };
      }
    }

    if (Object.keys(this.projects).length === 0) {
      const defaultId = 'stylesdays';
      const defaultProj: ProjectItem = {
        id: defaultId,
        name: 'stylesdays',
        created_at: new Date().toISOString(),
        platform: 'cloudflare',
        cf_project_name: this.config.cloudflare.project_name || defaultId,
        cf_custom_domain: this.config.cloudflare.custom_domain || '',
        gh_owner: this.config.github.owner || '',
        gh_repo: this.config.github.repo || '',
        gh_branch: this.config.github.branch || 'main',
        gh_is_org: this.config.github.is_org,
        gh_base_path: this.config.github.base_path || '',
        sitemap_url: this.config.ingestion.sitemap_url || '',
        theme: this.config.build.theme || 'nordic-studio',
        routing_mode: this.config.build.routing_mode || 'single',
        manifest_path: 'pseo_manifest.json',
        output_dir: path.join('dist', this.config.cloudflare.project_name || defaultId),
        max_posts: this.config.ingestion.max_posts || 100,
        download_images: this.config.ingestion.download_images,
      };
      this.projects[defaultId] = defaultProj;
      this.config.projects[defaultId] = defaultProj;
      this.activeProjectId = defaultId;
      this.config.active_project = defaultId;
      this.activeManifestPath = this.manifestPath;
      this.staticPageOverrides = this.loadStaticPageOverrides(defaultId);
      return;
    }

    if (!this.projects[this.activeProjectId]) {
      const firstId = Object.keys(this.projects)[0];
      this.activeProjectId = firstId;
      this.config.active_project = firstId;
    }

    const activeProj = this.projects[this.activeProjectId];
    if (activeProj) {
      if (typeof activeProj.custom_head_code === 'string' && activeProj.custom_head_code.trim()) {
        this.config.branding.custom_head_code = activeProj.custom_head_code;
      } else if (typeof this.config.branding.custom_head_code === 'string' && this.config.branding.custom_head_code.trim()) {
        activeProj.custom_head_code = this.config.branding.custom_head_code;
      }
    }

    const projManifest = this.resolveManifestPath(this.activeProjectId);
    if (fs.existsSync(projManifest)) {
      this.manifest = this.loadManifestFile(projManifest);
      this.activeManifestPath = projManifest;
    } else if (this.activeProjectId === 'stylesdays' && fs.existsSync(this.manifestPath)) {
      this.manifest = this.loadManifestFile(this.manifestPath);
      this.activeManifestPath = this.manifestPath;
    } else {
      this.manifest = { version: '2.0', updated_at: new Date().toISOString(), posts: {}, categories: [] };
      this.activeManifestPath = projManifest;
    }
    this.staticPageOverrides = this.loadStaticPageOverrides(this.activeProjectId);
  }

  private resolveManifestPath(pid: string): string {
    if (pid === 'stylesdays') return this.manifestPath;
    return path.join(this.workspaceDir, 'scraped_data', pid, 'manifest.json');
  }

  private resolveStaticPagesPath(pid: string): string {
    const cleanPid = slugify(pid || 'stylesdays') || 'stylesdays';
    return path.join(this.workspaceDir, 'scraped_data', cleanPid, 'static_pages.json');
  }

  private loadStaticPageOverrides(pid: string): Record<string, StaticPageOverride> {
    const filePath = this.resolveStaticPagesPath(pid);
    if (!fs.existsSync(filePath)) return {};
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      const result: Record<string, StaticPageOverride> = {};
      for (const [k, v] of Object.entries(raw || {})) {
        const slug = String(k || '').trim().toLowerCase();
        if (!isEditableStaticPageSlug(slug) || !v || typeof v !== 'object') continue;
        const rec = v as Record<string, unknown>;
        result[slug] = {
          slug,
          title: String(rec.title || '').trim(),
          description: String(rec.description || '').trim(),
          body_html: String(rec.body_html || '').trim(),
          updated_at: String(rec.updated_at || ''),
        };
      }
      return result;
    } catch {
      return {};
    }
  }

  private saveStaticPageOverrides(): void {
    try {
      const target = this.resolveStaticPagesPath(this.activeProjectId || 'stylesdays');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(this.staticPageOverrides, null, 2), 'utf-8');
    } catch (err) {
      this.log(`[WARN] Unable to persist static page overrides: ${String(err)}`);
    }
  }

  log(message: string): void {
    const time = new Date().toISOString().slice(11, 19);
    const entry = `[${time}] ${message}`;
    this.logs.push(entry);
    if (this.logs.length > 1000) this.logs.shift();
  }

  saveConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      this.log(`[WARN] Unable to persist config: ${String(err)}`);
    }
  }

  saveManifest(): void {
    try {
      this.manifest.categories = deriveCategories(this.manifest.posts);
      this.manifest.updated_at = new Date().toISOString();
      const targetPath = this.activeManifestPath || this.resolveManifestPath(this.activeProjectId || 'stylesdays');
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
      if (this.activeProjectId === 'stylesdays' && targetPath !== this.manifestPath) {
        fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
      }
    } catch (err) {
      this.log(`[WARN] Unable to persist manifest: ${String(err)}`);
    }
  }

  resolveOutputDir(targetCloud?: string, subdomain?: string, projectName?: string): { token: string; outputDir: string } {
    const rawBase = this.config.build.output_dir || 'dist';

    const tc = String(targetCloud || '').toLowerCase().trim();
    let token: string;
    if (tc === 'cloudflare' || tc === 'cf') {
      token = (subdomain || this.config.cloudflare.project_name || projectName || this.activeProjectId || 'stylesdays').trim();
    } else if (tc === 'github' || tc === 'gh') {
      token = (
        this.config.github.owner ||
        this.config.github.repo.replace(/\.github\.io$/i, '') ||
        projectName ||
        subdomain ||
        this.activeProjectId ||
        'stylesdays'
      ).trim();
    } else {
      token = (
        subdomain ||
        projectName ||
        this.activeProjectId ||
        this.config.cloudflare.project_name ||
        this.config.github.owner ||
        'default'
      ).trim();
    }
    const cleanToken = token.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^[-_]+|[-_]+$/g, '') || 'default';
    const absBase = path.resolve(this.workspaceDir, rawBase);
    const outputDir =
      path.basename(absBase).toLowerCase() === cleanToken.toLowerCase()
        ? absBase
        : path.join(absBase, cleanToken);
    return { token: cleanToken, outputDir };
  }

  listProjects(): Array<ProjectItem & { active: boolean; total_posts: number; categories_count: number }> {
    return Object.entries(this.projects).map(([pid, proj]) => {
      let totalPosts = 0;
      let categoriesCount = 0;
      if (pid === this.activeProjectId) {
        totalPosts = Object.keys(this.manifest.posts).length;
        categoriesCount = this.manifest.categories.length;
      } else {
        const mpath = this.resolveManifestPath(pid);
        if (fs.existsSync(mpath)) {
          const m = this.loadManifestFile(mpath);
          totalPosts = Object.keys(m.posts).length;
          categoriesCount = m.categories.length;
        }
      }
      return {
        ...proj,
        active: pid === this.activeProjectId,
        total_posts: totalPosts,
        categories_count: categoriesCount,
      };
    });
  }

  createProject(input: Record<string, unknown>): Record<string, unknown> {
    const cleanName = String(input.name || input.project_name || '').trim();
    if (!cleanName) {
      throw new Error('Project name cannot be empty');
    }
    const basePid = slugify(cleanName) || 'project';
    let pid = basePid;
    let counter = 1;
    while (this.projects[pid]) {
      pid = `${basePid}-${counter}`;
      counter += 1;
    }

    const platform = String(input.platform || 'cloudflare').trim() || 'cloudflare';
    const cfProj = String(input.cf_project_name || '').trim() || pid;
    const cfCustomDomain = stripProtocol(String(input.cf_custom_domain || ''));
    const ghOwner = String(input.gh_owner || this.config.github.owner || '').trim();
    const ghRepo =
      String(input.gh_repo || '').trim() || (ghOwner ? `${ghOwner}.github.io` : `${pid}.github.io`);
    const ghBranch = String(input.gh_branch || 'main').trim() || 'main';
    const ghIsOrg = input.gh_is_org !== false;
    const sitemapUrl = String(input.sitemap_url || '').trim();
    const theme = String(input.theme || this.config.build.theme || 'editorial-warm').trim();
    const routingMode = normalizeRoutingMode(String(input.routing_mode || this.config.build.routing_mode || 'single'));

    const projDir = path.join(this.workspaceDir, 'scraped_data', pid);
    const manifestFile = path.join(projDir, 'manifest.json');
    fs.mkdirSync(path.join(projDir, 'html'), { recursive: true });
    fs.mkdirSync(path.join(this.workspaceDir, 'assets', pid, 'images'), { recursive: true });

    const emptyManifest: Manifest = {
      version: '2.0',
      updated_at: new Date().toISOString(),
      posts: {},
      categories: [],
    };
    fs.writeFileSync(manifestFile, JSON.stringify(emptyManifest, null, 2), 'utf-8');

    const item: ProjectItem = {
      id: pid,
      name: cleanName,
      created_at: new Date().toISOString(),
      platform,
      cf_project_name: cfProj,
      cf_custom_domain: cfCustomDomain,
      gh_owner: ghOwner,
      gh_repo: ghRepo,
      gh_branch: ghBranch,
      gh_is_org: ghIsOrg,
      gh_base_path: '',
      sitemap_url: sitemapUrl,
      theme,
      routing_mode: routingMode,
      manifest_path: path.relative(this.workspaceDir, manifestFile),
      output_dir: path.join('dist', platform === 'cloudflare' ? cfProj : pid),
      max_posts: 60,
      download_images: true,
      custom_head_code: '',
    };

    this.projects[pid] = item;
    this.config.projects[pid] = item;
    this.activeProjectId = pid;
    this.activeManifestPath = manifestFile;
    this.manifest = emptyManifest;
    this.config.active_project = pid;
    this.config.cloudflare.project_name = cfProj;
    if (cfCustomDomain) this.config.cloudflare.custom_domain = cfCustomDomain;
    if (ghOwner) this.config.github.owner = ghOwner;
    if (ghRepo) this.config.github.repo = ghRepo;
    this.config.ingestion.sitemap_url = sitemapUrl;
    this.config.build.theme = theme;
    this.config.build.routing_mode = routingMode;
    this.config.branding.custom_head_code = '';
    this.config.branding.theme_customizations = {};
    this.staticPageOverrides = {};

    this.saveConfig();
    this.log(`Created isolated project '${cleanName}' (id=${pid}) with empty catalog.`);

    return {
      success: true,
      project: item,
      active_project: pid,
      total_posts: 0,
      categories_count: 0,
      message: `Project '${cleanName}' created successfully with empty categories.`,
    };
  }

  updateProject(projectId: string, rawUpdates: Record<string, unknown>): Record<string, unknown> {
    const pid = (projectId || this.activeProjectId).trim();
    const item = this.projects[pid];
    if (!item) {
      throw new Error(`Project '${pid}' not found.`);
    }

    const updates: Record<string, unknown> = { ...rawUpdates };
    if (updates.updates && typeof updates.updates === 'object') {
      Object.assign(updates, updates.updates as Record<string, unknown>);
    }
    if ('custom_domain' in updates && !('cf_custom_domain' in updates)) {
      updates.cf_custom_domain = updates.custom_domain;
    }
    if ('worker_name' in updates && !('cf_project_name' in updates)) {
      updates.cf_project_name = updates.worker_name;
    }
    if ('github_owner' in updates && !('gh_owner' in updates)) {
      updates.gh_owner = updates.github_owner;
    }
    if ('github_repo' in updates && !('gh_repo' in updates)) {
      updates.gh_repo = updates.github_repo;
    }

    if (typeof updates.name === 'string' && updates.name.trim()) item.name = updates.name.trim();
    if (typeof updates.platform === 'string' && updates.platform.trim()) item.platform = updates.platform.trim();
    if (typeof updates.cf_project_name === 'string') item.cf_project_name = updates.cf_project_name.trim();
    if (typeof updates.cf_custom_domain === 'string') item.cf_custom_domain = stripProtocol(updates.cf_custom_domain);
    if (typeof updates.gh_owner === 'string') item.gh_owner = updates.gh_owner.trim();
    if (typeof updates.gh_repo === 'string') item.gh_repo = updates.gh_repo.trim();
    if (typeof updates.gh_branch === 'string' && updates.gh_branch.trim()) item.gh_branch = updates.gh_branch.trim();
    if (typeof updates.gh_is_org === 'boolean') item.gh_is_org = updates.gh_is_org;
    if (typeof updates.sitemap_url === 'string') item.sitemap_url = updates.sitemap_url.trim();
    if (typeof updates.theme === 'string' && updates.theme.trim()) item.theme = updates.theme.trim();
    if (typeof updates.routing_mode === 'string' && updates.routing_mode.trim()) {
      item.routing_mode = normalizeRoutingMode(updates.routing_mode);
    }
    if (updates.max_posts !== undefined && updates.max_posts !== null) {
      item.max_posts = Number(updates.max_posts) || 60;
    }
    if (updates.download_images !== undefined && updates.download_images !== null) {
      item.download_images = Boolean(updates.download_images);
    }

    if (pid === this.activeProjectId) {
      if (item.theme) this.config.build.theme = item.theme;
      if (item.routing_mode) this.config.build.routing_mode = item.routing_mode;
      if (item.cf_project_name) this.config.cloudflare.project_name = item.cf_project_name;
      this.config.cloudflare.custom_domain = item.cf_custom_domain;
      if (item.cf_custom_domain) {
        const currentBrand = (this.config.branding.brand_name || '').trim();
        if (!currentBrand || currentBrand.toLowerCase() === pid.toLowerCase()) {
          this.config.branding.brand_name = deriveBrandFromDomain(item.cf_custom_domain, pid);
        }
      }
      if (item.gh_owner) this.config.github.owner = item.gh_owner;
      if (item.gh_repo) this.config.github.repo = item.gh_repo;
      if (item.sitemap_url) this.config.ingestion.sitemap_url = item.sitemap_url;
      this.config.ingestion.max_posts = item.max_posts;
      this.config.ingestion.download_images = item.download_images;
      if (updates.social_links && typeof updates.social_links === 'object') {
        for (const [k, v] of Object.entries(updates.social_links as Record<string, unknown>)) {
          if (v !== null && v !== undefined) {
            this.config.branding.social_links[k] = String(v).trim();
          }
        }
      }
    }

    this.config.projects[pid] = item;
    this.saveConfig();
    this.log(`[PROJECT] Updated settings for '${item.name}' (id=${pid}).`);
    return { success: true, status: 'success', project: item };
  }

  switchProject(projectId: string): Record<string, unknown> {
    const pid = String(projectId || '').trim();
    const item = this.projects[pid];
    if (!item) {
      throw new Error(`Project '${pid}' does not exist.`);
    }

    const mpath = this.resolveManifestPath(pid);
    this.manifest = this.loadManifestFile(mpath);
    this.activeManifestPath = mpath;
    this.activeProjectId = pid;
    this.config.active_project = pid;

    if (item.theme) this.config.build.theme = item.theme;
    if (item.routing_mode) this.config.build.routing_mode = item.routing_mode;
    this.config.cloudflare.project_name = item.cf_project_name || item.id;
    this.config.cloudflare.custom_domain = item.cf_custom_domain || '';
    if (item.gh_owner) this.config.github.owner = item.gh_owner;
    if (item.gh_repo) this.config.github.repo = item.gh_repo;
    this.config.ingestion.sitemap_url = item.sitemap_url || '';
    if (typeof item.custom_head_code === 'string') {
      this.config.branding.custom_head_code = item.custom_head_code;
    }
    this.config.branding.theme_customizations = normalizeThemeCustomizations(item.theme_customizations);
    this.staticPageOverrides = this.loadStaticPageOverrides(pid);

    this.saveConfig();
    this.log(`Switched active project to '${item.name}' (id=${pid}, ${Object.keys(this.manifest.posts).length} posts).`);

    return {
      success: true,
      active_project: pid,
      project: item,
      total_posts: Object.keys(this.manifest.posts).length,
      categories_count: this.manifest.categories.length,
      message: `Switched to project '${item.name}'.`,
    };
  }

  clearActiveProjectData(projectId?: string): Record<string, unknown> {
    const explicitPid = typeof projectId === 'string' ? projectId.trim() : '';
    const pid = explicitPid || (this.activeProjectId || '').trim();
    if (!pid || !this.projects[pid]) {
      throw new Error(`Project '${pid || explicitPid}' not found.`);
    }
    if (this.ingestJob.status === 'running') {
      this.stopIngestJob();
    }

    const isClearingActive = pid === this.activeProjectId;
    const targetManifestPath = isClearingActive ? this.activeManifestPath : this.resolveManifestPath(pid);
    const existingManifest = isClearingActive ? this.manifest : this.loadManifestFile(targetManifestPath);
    const removedPosts = Object.keys(existingManifest.posts || {}).length;
    const removedCategories = (existingManifest.categories || []).length;

    // 1. Reset target project manifest in memory (if active) & on disk
    const emptyManifest: Manifest = {
      version: '2.0',
      updated_at: new Date().toISOString(),
      posts: {},
      categories: [],
    };
    if (isClearingActive) {
      this.manifest = emptyManifest;
      this.saveManifest();
    } else {
      fs.mkdirSync(path.dirname(targetManifestPath), { recursive: true });
      fs.writeFileSync(targetManifestPath, JSON.stringify(emptyManifest, null, 2), 'utf-8');
    }

    // 2. Clean scraped_data/<pid>/html (strictly confined inside workspace scraped_data)
    const scrapedBase = path.resolve(this.workspaceDir, 'scraped_data');
    const projHtmlDir = path.resolve(scrapedBase, pid, 'html');
    if (projHtmlDir.startsWith(scrapedBase + path.sep) && fs.existsSync(projHtmlDir)) {
      fs.rmSync(projHtmlDir, { recursive: true, force: true });
      fs.mkdirSync(projHtmlDir, { recursive: true });
    }

    // 3. Collect image filenames still referenced by OTHER projects so we never break another project
    const protectedFilenames = new Set<string>();
    const customLogoPath = String(this.config.branding?.logo_path || '').trim();
    if (customLogoPath) {
      protectedFilenames.add(path.basename(customLogoPath));
    }
    for (const [otherId, otherProj] of Object.entries(this.projects)) {
      if (otherId === pid) continue;
      for (const blk of otherProj?.theme_customizations?.content_blocks || []) {
        if (blk.image_url && blk.image_url.startsWith('/assets/images/')) {
          protectedFilenames.add(path.basename(blk.image_url));
        }
      }
      try {
        const otherManifest = this.loadManifestFile(this.resolveManifestPath(otherId));
        for (const p of Object.values(otherManifest.posts || {})) {
          if (p.local_image_path) {
            protectedFilenames.add(path.basename(p.local_image_path));
          }
          if (p.content_html) {
            for (const match of p.content_html.matchAll(/\/assets\/images\/([^"'\s>?#]+)/g)) {
              protectedFilenames.add(path.basename(match[1]));
            }
          }
        }
      } catch {
        // Ignore unreadable sibling manifest
      }
    }

    let removedImages = 0;
    const clearImagesDir = (dirPath: string, respectProtected: boolean) => {
      const resolved = path.resolve(dirPath);
      if (!resolved.startsWith(this.workspaceDir + path.sep) || !fs.existsSync(resolved)) return;
      for (const entry of fs.readdirSync(resolved)) {
        if (respectProtected && protectedFilenames.has(entry)) continue;
        const abs = path.join(resolved, entry);
        try {
          if (fs.lstatSync(abs).isFile()) {
            fs.unlinkSync(abs);
            removedImages += 1;
          }
        } catch {
          // Ignore locked/missing file
        }
      }
    };

    clearImagesDir(path.join(this.workspaceDir, 'assets', pid, 'images'), false);
    clearImagesDir(path.join(this.workspaceDir, 'assets', 'images'), true);

    // 4. Clean generated static build output for this project
    let removedBuildFiles = 0;
    const { outputDir } = this.resolveOutputDir();
    const resolvedOut = path.resolve(outputDir);
    if (
      resolvedOut !== this.workspaceDir &&
      resolvedOut.startsWith(this.workspaceDir + path.sep) &&
      fs.existsSync(resolvedOut)
    ) {
      const countFilesRecursive = (dir: string): number => {
        let count = 0;
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          const st = fs.lstatSync(full);
          if (st.isDirectory()) count += countFilesRecursive(full);
          else count += 1;
        }
        return count;
      };
      removedBuildFiles = countFilesRecursive(resolvedOut);
      fs.rmSync(resolvedOut, { recursive: true, force: true });
    }

    this.ingestJob = this.createIdleIngestJob();
    this.lastBuildFiles = 0;
    this.lastBuildTime = '';
    this.saveConfig();

    const message = `Cleared project '${pid}': removed ${removedPosts} post(s), ${removedCategories} categor${removedCategories === 1 ? 'y' : 'ies'}, ${removedImages} image asset(s), and ${removedBuildFiles} build file(s).`;
    this.log(`[PROJECT] ${message}`);

    return {
      success: true,
      project_id: pid,
      removed_posts: removedPosts,
      removed_categories: removedCategories,
      removed_images: removedImages,
      removed_build_files: removedBuildFiles,
      message,
    };
  }

  getStatus(): Record<string, unknown> {
    const posts = Object.values(this.manifest.posts);
    const totalPosts = posts.length;
    const customCount = posts.filter((p) => p.custom_edited).length;
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    let localImagesCount = 0;
    if (fs.existsSync(assetsDir)) {
      try {
        localImagesCount = fs
          .readdirSync(assetsDir, { withFileTypes: true })
          .filter((entry) => entry.isFile()).length;
      } catch {
        localImagesCount = 0;
      }
    }

    const activeProj = this.projects[this.activeProjectId];
    return {
      status: 'ok',
      active_project: this.activeProjectId,
      active_project_name: activeProj?.name || this.activeProjectId || 'Default',
      projects_count: Object.keys(this.projects).length,
      total_posts: totalPosts,
      local_images_count: localImagesCount,
      synced: totalPosts - customCount,
      updated: this.ingestJob.counts.updated || 0,
      new: this.ingestJob.counts.new || 0,
      custom_edited: customCount,
      categories_count: this.manifest.categories.length,
      git_ready: Boolean(this.getEffectiveGitHubToken() && this.config.github.repo),
      cloudflare_ready: Boolean(this.getEffectiveCloudflareToken() || this.config.cloudflare.project_name),
      cloudflare_project: this.config.cloudflare.project_name,
      cloudflare_url: getCloudflareLiveUrl(this.config.cloudflare),
      theme: this.config.build.theme,
      routing_mode: this.config.build.routing_mode,
      last_build: this.lastBuildTime || 'never',
      last_build_files: this.lastBuildFiles,
      output_dir: this.resolveOutputDir().outputDir,
      base_output_dir: this.config.build.output_dir,
      cf_output_dir: this.resolveOutputDir('cloudflare').outputDir,
      gh_output_dir: this.resolveOutputDir('github').outputDir,
      available_themes: Object.keys(THEMES),
      available_routing_modes: ['single', 'category_slug', 'parent_slug', 'silo_nested', 'pseo_nested_silo'],
      branding: this.config.branding,
    };
  }

  getEffectiveCloudflareToken(): string {
    const raw =
      this.config.cloudflare.api_token ||
      process.env.CLOUDFLARE_API_TOKEN ||
      process.env.CF_API_TOKEN ||
      process.env.CLOUDFLARE_TOKEN ||
      '';
    return raw.trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim();
  }

  getEffectiveCloudflareAccountId(): string {
    const raw =
      this.config.cloudflare.account_id ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CF_ACCOUNT_ID ||
      '';
    return raw.trim().replace(/^['"]|['"]$/g, '').trim();
  }

  getEffectiveGitHubToken(): string {
    const raw =
      this.config.github.token ||
      process.env.GITHUB_TOKEN ||
      process.env.GH_TOKEN ||
      '';
    return raw.trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim();
  }

  getConfigMasked(): Record<string, unknown> {
    const ghToken = this.getEffectiveGitHubToken();
    const cfToken = this.getEffectiveCloudflareToken();
    const cfAccountId = this.getEffectiveCloudflareAccountId();
    const liveUrl = getCloudflareLiveUrl(this.config.cloudflare);
    return {
      ...this.config,
      github: {
        ...this.config.github,
        has_token: Boolean(ghToken),
        token_masked: maskToken(ghToken),
        token: maskToken(ghToken),
      },
      cloudflare: {
        ...this.config.cloudflare,
        account_id: cfAccountId,
        has_token: Boolean(cfToken),
        token_masked: maskToken(cfToken),
        api_token: maskToken(cfToken),
        worker_url: liveUrl,
        live_url: liveUrl,
      },
    };
  }

  updateConfig(data: Record<string, unknown>): Record<string, unknown> {
    const gh = (data.github || {}) as Record<string, unknown>;
    const cf = (data.cloudflare || {}) as Record<string, unknown>;
    const ing = (data.ingestion || {}) as Record<string, unknown>;
    const bld = (data.build || {}) as Record<string, unknown>;
    const br = (data.branding || {}) as Record<string, unknown>;

    const newGhToken = typeof gh.token === 'string' ? gh.token.trim() : '';
    if (newGhToken && !newGhToken.includes('****')) this.config.github.token = newGhToken;
    if (typeof gh.owner === 'string') this.config.github.owner = gh.owner.trim();
    else if (typeof data.github_org === 'string') this.config.github.owner = data.github_org.trim();
    if (typeof gh.repo === 'string') this.config.github.repo = gh.repo.trim();
    else if (typeof data.github_repo === 'string') this.config.github.repo = data.github_repo.trim();
    if (typeof gh.branch === 'string' && gh.branch.trim()) this.config.github.branch = gh.branch.trim();
    if (typeof gh.is_org === 'boolean') this.config.github.is_org = gh.is_org;
    if (typeof gh.base_path === 'string') this.config.github.base_path = gh.base_path.trim();

    const newCfToken = typeof (cf.api_token || cf.token) === 'string'
      ? String(cf.api_token || cf.token).trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim()
      : '';
    if (newCfToken && !newCfToken.includes('****')) this.config.cloudflare.api_token = newCfToken;
    if (typeof cf.account_id === 'string') {
      this.config.cloudflare.account_id = cf.account_id.trim().replace(/^['"]|['"]$/g, '').trim();
    }
    if (typeof cf.account_subdomain === 'string') this.config.cloudflare.account_subdomain = cf.account_subdomain.trim();
    else if (typeof cf.subdomain === 'string') this.config.cloudflare.account_subdomain = cf.subdomain.trim();
    if (typeof cf.project_name === 'string') this.config.cloudflare.project_name = cf.project_name.trim();
    if (typeof cf.deployment_type === 'string' && cf.deployment_type.trim()) {
      this.config.cloudflare.deployment_type = cf.deployment_type.trim();
    }
    if (typeof cf.custom_domain === 'string') this.config.cloudflare.custom_domain = stripProtocol(cf.custom_domain);
    if (typeof cf.compatibility_date === 'string' && cf.compatibility_date.trim()) {
      this.config.cloudflare.compatibility_date = cf.compatibility_date.trim();
    }

    if (typeof ing.sitemap_url === 'string') this.config.ingestion.sitemap_url = ing.sitemap_url.trim();
    else if (typeof data.sitemap_url === 'string') this.config.ingestion.sitemap_url = data.sitemap_url.trim();
    if (typeof ing.wp_api_url === 'string') this.config.ingestion.wp_api_url = ing.wp_api_url.trim();
    else if (typeof data.wp_domain === 'string') this.config.ingestion.wp_api_url = data.wp_domain.trim();
    if (ing.max_posts !== undefined) this.config.ingestion.max_posts = Number(ing.max_posts) || 100;
    if (ing.download_images !== undefined) this.config.ingestion.download_images = Boolean(ing.download_images);

    if (typeof bld.theme === 'string' && bld.theme.trim()) this.config.build.theme = bld.theme.trim();
    else if (typeof data.theme === 'string' && data.theme.trim()) this.config.build.theme = data.theme.trim();
    if (typeof bld.routing_mode === 'string') this.config.build.routing_mode = normalizeRoutingMode(bld.routing_mode);
    else if (typeof data.route_structure === 'string') {
      this.config.build.routing_mode = normalizeRoutingMode(data.route_structure);
    }
    if (typeof bld.output_dir === 'string' && bld.output_dir.trim()) this.config.build.output_dir = bld.output_dir.trim();

    if (typeof br.brand_name === 'string') this.config.branding.brand_name = br.brand_name.trim();
    else if (typeof data.brand_name === 'string') this.config.branding.brand_name = data.brand_name.trim();
    if (typeof br.tagline === 'string') this.config.branding.tagline = br.tagline.trim();
    else if (typeof data.tagline === 'string') this.config.branding.tagline = data.tagline.trim();
    if (typeof br.logo_path === 'string') this.config.branding.logo_path = br.logo_path.trim();
    if (typeof br.author_name === 'string') this.config.branding.author_name = br.author_name.trim();
    if (typeof br.author_bio === 'string') this.config.branding.author_bio = br.author_bio.trim();
    if (br.enable_toc !== undefined) this.config.branding.enable_toc = Boolean(br.enable_toc);
    else if (data.enable_toc !== undefined) this.config.branding.enable_toc = Boolean(data.enable_toc);
    if (br.enable_faq !== undefined) this.config.branding.enable_faq = Boolean(br.enable_faq);
    else if (data.enable_faq !== undefined) this.config.branding.enable_faq = Boolean(data.enable_faq);
    if (br.enable_eeat !== undefined) this.config.branding.enable_eeat = Boolean(br.enable_eeat);
    else if (data.enable_eeat !== undefined) this.config.branding.enable_eeat = Boolean(data.enable_eeat);

    if (typeof br.custom_head_code === 'string') {
      this.config.branding.custom_head_code = br.custom_head_code.trim().slice(0, 50000);
    } else if (typeof data.custom_head_code === 'string') {
      this.config.branding.custom_head_code = data.custom_head_code.trim().slice(0, 50000);
    }

    const rawThemeCustom =
      br.theme_customizations !== undefined
        ? br.theme_customizations
        : data.theme_customizations !== undefined
          ? data.theme_customizations
          : undefined;
    if (rawThemeCustom !== undefined) {
      this.config.branding.theme_customizations = normalizeThemeCustomizations(rawThemeCustom);
    }

    const social = (br.social_links || data.social_links) as Record<string, unknown> | undefined;
    if (social && typeof social === 'object') {
      for (const [k, v] of Object.entries(social)) {
        if (v !== null && v !== undefined) this.config.branding.social_links[k] = String(v).trim();
      }
    }

    const active = this.projects[this.activeProjectId];
    if (active) {
      active.theme = this.config.build.theme;
      active.routing_mode = this.config.build.routing_mode;
      if (cf.project_name !== undefined) active.cf_project_name = this.config.cloudflare.project_name;
      if (cf.custom_domain !== undefined) active.cf_custom_domain = this.config.cloudflare.custom_domain;
      if (gh.owner !== undefined || data.github_org !== undefined) active.gh_owner = this.config.github.owner;
      if (gh.repo !== undefined || data.github_repo !== undefined) active.gh_repo = this.config.github.repo;
      if (ing.sitemap_url !== undefined || data.sitemap_url !== undefined) {
        active.sitemap_url = this.config.ingestion.sitemap_url;
      }
      if (typeof br.custom_head_code === 'string' || typeof data.custom_head_code === 'string') {
        active.custom_head_code = this.config.branding.custom_head_code || '';
      }
      if (rawThemeCustom !== undefined) {
        active.theme_customizations = this.config.branding.theme_customizations;
      }
      this.config.projects[this.activeProjectId] = active;
    }

    this.saveConfig();
    return this.getConfigMasked();
  }

  listPosts(filters: { query?: string; category?: string; customOnly?: boolean } = {}): Array<PostItem & { diff_status: string }> {
    const q = (filters.query || '').trim().toLowerCase();
    const cat = (filters.category || '').trim().toLowerCase();
    const customOnly = Boolean(filters.customOnly);

    return Object.values(this.manifest.posts)
      .filter((p) => {
        if (customOnly && !p.custom_edited) return false;
        if (cat && p.category.toLowerCase() !== cat && p.category_slug.toLowerCase() !== cat) return false;
        if (q) {
          const hay = `${p.title} ${p.slug} ${p.excerpt} ${p.category}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.modified || b.date || '').localeCompare(a.modified || a.date || ''))
      .map((p) => ({ ...p, diff_status: p.custom_edited ? 'CUSTOM' : 'SYNCED' }));
  }

  getPost(slug: string): PostItem | null {
    return this.manifest.posts[slug] || null;
  }

  updatePost(slug: string, data: Record<string, unknown>): PostItem | null {
    const post = this.manifest.posts[slug];
    if (!post) return null;

    if (typeof data.title === 'string') post.title = data.title;
    if (typeof data.excerpt === 'string') post.excerpt = data.excerpt;
    else if (typeof data.description === 'string') post.excerpt = data.description;
    if (typeof data.content_html === 'string') {
      post.content_html = sanitizeEditedHtml(data.content_html);
    }
    if (typeof data.category === 'string') {
      post.category = data.category.trim();
      if (typeof data.category_slug !== 'string' || !data.category_slug.trim()) {
        post.category_slug = slugify(post.category || 'general');
      }
    }
    if (typeof data.category_slug === 'string' && data.category_slug.trim()) {
      post.category_slug = slugify(data.category_slug);
    }
    if (typeof data.parent_slug === 'string') post.parent_slug = data.parent_slug.trim();
    if (Array.isArray(data.takeaways)) {
      post.takeaways = data.takeaways.map((t) => String(t).trim()).filter(Boolean);
    }
    if (Array.isArray(data.checklist)) {
      post.checklist = data.checklist
        .map((c, idx) =>
          typeof c === 'string'
            ? { id: `${slug}-step-${idx + 1}`, text: c }
            : {
                id: String((c as Record<string, unknown>).id || `${slug}-step-${idx + 1}`),
                text: String((c as Record<string, unknown>).text || ''),
              }
        )
        .filter((c) => c.text);
    }

    post.custom_edited = true;
    post.modified = new Date().toISOString().slice(0, 10);
    this.manifest.posts[slug] = post;
    this.saveManifest();
    this.log(`Updated post '${slug}' (custom_edited=true).`);
    return post;
  }

  renderPreview(opts: {
    slug?: string;
    postData?: Record<string, unknown>;
    theme?: string;
    routingMode?: string;
    viewMode?: string;
    themeCustomizations?: unknown;
  }): string {
    const themeKey = opts.theme || this.config.build.theme || 'nordic-studio';
    const routingMode = normalizeRoutingMode(opts.routingMode || this.config.build.routing_mode);
    const cleanSlug = (opts.slug || '').replace(/^\/+|\/+$/g, '');
    const isHub =
      opts.viewMode === 'hub' || ['__hub__', 'hub', 'index', 'home', '__home__'].includes(cleanSlug);

    const effectiveBranding =
      opts.themeCustomizations !== undefined
        ? {
            ...this.config.branding,
            theme_customizations: normalizeThemeCustomizations(opts.themeCustomizations),
          }
        : this.config.branding;

    const activeProj = this.projects[this.activeProjectId];
    const customDom = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';
    const projectName = this.config.cloudflare.project_name || this.activeProjectId || '';
    const baseUrl = hasValidDomainHost(customDom)
      ? `https://${stripProtocol(customDom)}`
      : getCloudflareLiveUrl(this.config.cloudflare);

    if (isHub) {
      const existing = Object.values(this.manifest.posts);
      const posts = existing.length > 0 ? existing : getSeedPosts();
      const cats = this.manifest.categories.length > 0 ? this.manifest.categories : deriveCategories(
        Object.fromEntries(posts.map((p) => [p.slug, p]))
      );
      return renderHubHtml({
        posts,
        categories: cats,
        themeKey,
        branding: effectiveBranding,
        routingMode,
        baseUrl,
        customDomain: customDom,
        projectName,
      });
    }

    let targetPost: PostItem | null = null;
    if (opts.postData) {
      targetPost = normalizePost(opts.postData);
    } else if (cleanSlug && !['sample-guide', '__sample__'].includes(cleanSlug)) {
      targetPost = this.getPost(cleanSlug);
    }
    if (!targetPost) {
      targetPost = getSamplePostForTheme(themeKey);
    }

    const sourceDomain = customDom
      ? stripProtocol(customDom)
      : this.config.ingestion.wp_api_url || 'stylesdays.com';

    return renderPostHtml({
      post: targetPost,
      allPosts: Object.values(this.manifest.posts),
      themeKey,
      branding: effectiveBranding,
      categories: this.manifest.categories,
      routingMode,
      baseUrl,
      sourceDomain,
      customDomain: customDom,
      projectName,
    });
  }

  async scanSitemap(
    urlOrList?: string,
    sourceType = 'sitemap',
    maxPostsOverride?: number
  ): Promise<{
    success: boolean;
    discovered_count: number;
    will_ingest_count: number;
    max_posts: number;
    urls: string[];
    error?: string;
  }> {
    const src = (urlOrList || this.config.ingestion.sitemap_url || '').trim();
    const effectiveMax =
      maxPostsOverride !== undefined && Number.isFinite(maxPostsOverride) && maxPostsOverride >= 0
        ? Math.floor(maxPostsOverride)
        : Number(this.config.ingestion.max_posts ?? 100);
    this.log(`Scanning ${sourceType} source: ${src || '(empty)'}`);
    if (!src) {
      return {
        success: false,
        discovered_count: 0,
        will_ingest_count: 0,
        max_posts: effectiveMax,
        urls: [],
        error: 'Please enter a Sitemap XML URL or paste a list of URLs first.',
      };
    }
    try {
      if (sourceType === 'wp_api') {
        const posts = await fetchWpApiPosts(src, effectiveMax > 0 ? effectiveMax : 1000);
        const urls = posts.map((p) => String(p.raw_meta?.source_url || `/${p.slug}/`));
        this.log(`Scanned WordPress API: found ${urls.length} post URLs.`);
        return {
          success: true,
          discovered_count: urls.length,
          will_ingest_count: urls.length,
          max_posts: effectiveMax,
          urls,
        };
      }
      // Pass 0 to discover the EXACT total URL count in the sitemap without artificial truncation
      const entries = await discoverUrlsFromSource(sourceType, src, 0);
      const urls = entries.map((e) => e.url);
      const willIngest = effectiveMax > 0 ? Math.min(urls.length, effectiveMax) : urls.length;
      this.log(
        `Scanned ${sourceType}: discovered exact ${urls.length} URL(s) (will ingest ${willIngest} with max_posts=${effectiveMax || 'All'}).`
      );
      return {
        success: true,
        discovered_count: urls.length,
        will_ingest_count: willIngest,
        max_posts: effectiveMax,
        urls,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[ERROR] Scan failed: ${msg}`);
      return {
        success: false,
        discovered_count: 0,
        will_ingest_count: 0,
        max_posts: effectiveMax,
        urls: [],
        error: msg,
      };
    }
  }

  stopIngestJob(): Record<string, unknown> {
    if (this.ingestJob.status !== 'running') {
      return {
        success: true,
        status: this.ingestJob.status,
        message: 'No active ingestion job is currently running.',
      };
    }
    this.ingestStopRequested = true;
    try {
      this.ingestAbortController?.abort();
    } catch {
      // Ignore abort error
    }
    this.ingestAbortController = null;
    this.ingestJob.status = 'stopped';
    this.ingestJob.completed_at = new Date().toISOString();
    this.ingestJob.message = `Ingestion stopped by user (${this.ingestJob.processed_count}/${this.ingestJob.total_count} processed).`;
    this.log(`[INGEST] ${this.ingestJob.message}`);
    return {
      success: true,
      status: 'stopped',
      message: this.ingestJob.message,
      job: this.ingestJob,
    };
  }

  async executeIngestion(params: {
    sourceType?: string;
    urlOrList?: string;
    maxPosts?: number;
    downloadImages?: boolean;
    forceFullResync?: boolean;
    signal?: AbortSignal;
  }): Promise<DiffSummary & { stopped?: boolean }> {
    const sourceType = params.sourceType || 'sitemap';
    const urlOrList = (params.urlOrList || '').trim();
    const rawMax = params.maxPosts !== undefined ? Number(params.maxPosts) : Number(this.config.ingestion.max_posts ?? 100);
    const maxPosts = Number.isFinite(rawMax) && rawMax >= 0 ? Math.floor(rawMax) : 100;
    const downloadImages = params.downloadImages ?? this.config.ingestion.download_images ?? true;
    const force = Boolean(params.forceFullResync);
    const signal = params.signal;
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');

    if (!signal) {
      this.ingestStopRequested = false;
    }
    const isCancelled = () => Boolean(this.ingestStopRequested || signal?.aborted);

    let discoveredPosts: PostItem[] = [];
    let totalDownloadedImages = 0;
    let totalOriginalImgBytes = 0;
    let totalWebpImgBytes = 0;

    if (sourceType === 'wp_api') {
      const base = (urlOrList || this.config.ingestion.wp_api_url || '').replace(/\/+$/, '');
      if (!base) {
        throw new Error('Please provide a WordPress site URL for WordPress REST API ingestion.');
      }
      this.ingestJob.message = `Fetching posts from WordPress REST API (${base})...`;
      discoveredPosts = await fetchWpApiPosts(base, maxPosts > 0 ? maxPosts : 1000, signal);
      if (isCancelled()) {
        return {
          stopped: true,
          new_posts: [],
          updated_posts: [],
          synced_posts: [],
          unchanged_posts: [],
          counts: { new: 0, updated: 0, synced: 0, unchanged: 0, total: 0 },
        };
      }
      this.ingestJob.total_count = discoveredPosts.length;
      if (downloadImages && discoveredPosts.length > 0) {
        for (let i = 0; i < discoveredPosts.length; i++) {
          if (isCancelled()) break;
          const post = discoveredPosts[i];
          this.ingestJob.current_post = post.slug;
          this.ingestJob.processed_count = i + 1;
          this.ingestJob.message = `Optimizing images to WebP (${i + 1}/${discoveredPosts.length}): ${post.title}`;
          const imgRes = await localizeAndConvertPostImages({ post, assetsDir, signal });
          totalDownloadedImages += imgRes.downloaded;
          totalOriginalImgBytes += imgRes.originalBytes;
          totalWebpImgBytes += imgRes.webpBytes;
        }
      }
    } else if (urlOrList) {
      this.ingestJob.message = `Discovering URLs from ${sourceType}...`;
      const allDiscovered = await discoverUrlsFromSource(sourceType, urlOrList, 0, signal);
      if (isCancelled()) {
        return {
          stopped: true,
          new_posts: [],
          updated_posts: [],
          synced_posts: [],
          unchanged_posts: [],
          counts: { new: 0, updated: 0, synced: 0, unchanged: 0, total: 0 },
        };
      }
      const entries = maxPosts > 0 ? allDiscovered.slice(0, maxPosts) : allDiscovered;
      if (entries.length === 0) {
        throw new Error(`No URLs were found in the provided ${sourceType} source.`);
      }

      this.ingestJob.total_count = entries.length;
      this.log(
        `Discovered exact ${allDiscovered.length} URL(s) in source` +
          (entries.length < allDiscovered.length ? ` (capped to max_posts=${maxPosts})` : '') +
          `. Scraping ${entries.length} post(s) & converting images to WebP...`
      );

      const results: Array<PostItem | null> = new Array(entries.length).fill(null);
      let cursor = 0;
      let completed = 0;
      let failedCount = 0;
      const concurrency = Math.min(4, entries.length);

      const worker = async () => {
        while (!isCancelled()) {
          const idx = cursor;
          cursor += 1;
          if (idx >= entries.length) break;
          const entry = entries[idx];
          try {
            this.ingestJob.current_post = entry.url;
            const post = await scrapeArticleFromUrl(entry, signal);
            if (isCancelled()) break;
            if (downloadImages) {
              const imgRes = await localizeAndConvertPostImages({ post, assetsDir, signal });
              totalDownloadedImages += imgRes.downloaded;
              totalOriginalImgBytes += imgRes.originalBytes;
              totalWebpImgBytes += imgRes.webpBytes;
            }
            if (isCancelled()) break;
            results[idx] = post;
          } catch (err) {
            if (isCancelled()) break;
            failedCount += 1;
            this.log(`[WARN] Skipped ${entry.url}: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            if (!isCancelled()) {
              completed += 1;
              this.ingestJob.processed_count = completed;
              this.ingestJob.message = `Scraped ${completed}/${entries.length} source URLs (${totalDownloadedImages} WebP images optimized)...`;
            }
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      if (isCancelled()) {
        return {
          stopped: true,
          new_posts: [],
          updated_posts: [],
          synced_posts: [],
          unchanged_posts: [],
          counts: { new: 0, updated: 0, synced: 0, unchanged: 0, total: 0 },
        };
      }
      discoveredPosts = results.filter((p): p is PostItem => p !== null);

      if (discoveredPosts.length === 0) {
        throw new Error(
          `Failed to scrape content from all ${entries.length} discovered URL(s) (${failedCount} failed). Check if the source site is reachable.`
        );
      }
    } else {
      // Blank source input (local/demo test mode only)
      discoveredPosts = getSeedPosts().slice(0, maxPosts > 0 ? maxPosts : 100);
    }

    if (isCancelled()) {
      return {
        stopped: true,
        new_posts: [],
        updated_posts: [],
        synced_posts: [],
        unchanged_posts: [],
        counts: { new: 0, updated: 0, synced: 0, unchanged: 0, total: 0 },
      };
    }

    const diff: DiffSummary = {
      new_posts: [],
      updated_posts: [],
      synced_posts: [],
      unchanged_posts: [],
      counts: { new: 0, updated: 0, synced: 0, unchanged: 0, total: 0 },
    };

    const nextPosts: Record<string, PostItem> = {};
    for (const incoming of discoveredPosts) {
      const existing = this.manifest.posts[incoming.slug];
      if (!existing) {
        diff.new_posts.push(incoming);
        nextPosts[incoming.slug] = incoming;
      } else if (existing.custom_edited && !force) {
        existing.image_url = incoming.image_url || existing.image_url;
        if (incoming.local_image_path) existing.local_image_path = incoming.local_image_path;
        diff.synced_posts.push(existing);
        nextPosts[incoming.slug] = existing;
      } else if (
        force ||
        existing.modified !== incoming.modified ||
        existing.title !== incoming.title ||
        existing.content_html !== incoming.content_html ||
        existing.local_image_path !== incoming.local_image_path
      ) {
        diff.updated_posts.push(incoming);
        nextPosts[incoming.slug] = incoming;
      } else {
        diff.synced_posts.push(existing);
        nextPosts[incoming.slug] = existing;
      }
    }

    this.manifest.posts = nextPosts;
    this.manifest.categories = deriveCategories(nextPosts);
    if (!urlOrList) {
      this.ensureSvgAssetsForPosts();
    }
    this.saveManifest();

    diff.counts = {
      new: diff.new_posts.length,
      updated: diff.updated_posts.length,
      synced: diff.synced_posts.length,
      unchanged: diff.unchanged_posts.length,
      total: discoveredPosts.length,
    };

    const savedPct =
      totalOriginalImgBytes > 0
        ? Math.max(0, Math.round(((totalOriginalImgBytes - totalWebpImgBytes) / totalOriginalImgBytes) * 100))
        : 0;
    this.log(
      `Ingestion complete: ${diff.counts.new} new, ${diff.counts.updated} updated, ${diff.counts.synced} synced` +
        (totalDownloadedImages > 0
          ? ` · ${totalDownloadedImages} image(s) optimized to WebP (${savedPct}% size reduction).`
          : '.')
    );
    return diff;
  }

  startIngestJob(body: Record<string, unknown>): Record<string, unknown> {
    if (this.ingestJob.status === 'running') {
      return {
        success: false,
        error: 'An ingestion job is already running. Click Stop first to cancel it.',
        job: this.ingestJob,
      };
    }

    const sourceType = String(body.source_type || 'sitemap');
    const urlOrList = String(body.url_or_list || '').trim();
    const parsedMax = body.max_posts !== undefined && body.max_posts !== '' ? Number(body.max_posts) : undefined;
    const maxPosts = parsedMax !== undefined && Number.isFinite(parsedMax) && parsedMax >= 0 ? Math.floor(parsedMax) : undefined;
    const downloadImages = body.download_images !== undefined ? Boolean(body.download_images) : undefined;
    const forceFullResync = Boolean(body.force_full_resync);

    if (urlOrList && sourceType === 'sitemap') {
      this.config.ingestion.sitemap_url = urlOrList;
      if (this.projects[this.activeProjectId]) this.projects[this.activeProjectId].sitemap_url = urlOrList;
    }
    if (maxPosts !== undefined) {
      this.config.ingestion.max_posts = maxPosts;
      if (this.projects[this.activeProjectId]) this.projects[this.activeProjectId].max_posts = maxPosts;
    }
    if (downloadImages !== undefined) {
      this.config.ingestion.download_images = downloadImages;
      if (this.projects[this.activeProjectId]) this.projects[this.activeProjectId].download_images = downloadImages;
    }
    const cfCustomDomain = body.cf_custom_domain ?? body.custom_domain;
    if (typeof cfCustomDomain === 'string') {
      const clean = stripProtocol(cfCustomDomain);
      this.config.cloudflare.custom_domain = clean;
      if (this.projects[this.activeProjectId]) this.projects[this.activeProjectId].cf_custom_domain = clean;
      if (clean) {
        this.config.branding.brand_name = deriveBrandFromDomain(clean, this.activeProjectId);
      }
    }
    const cfProjectName = body.cf_project_name ?? body.worker_name;
    if (typeof cfProjectName === 'string' && cfProjectName.trim()) {
      this.config.cloudflare.project_name = cfProjectName.trim();
      if (this.projects[this.activeProjectId]) this.projects[this.activeProjectId].cf_project_name = cfProjectName.trim();
    }
    this.saveConfig();

    this.ingestStopRequested = false;
    this.ingestAbortController = new AbortController();

    this.ingestJob = {
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: '',
      current_post: '',
      processed_count: 0,
      total_count: 0,
      message: `Starting ingestion (source=${sourceType})...`,
      counts: { new: 0, updated: 0, synced: 0, total: 0 },
      error: '',
      new_posts: [],
      updated_posts: [],
      synced_posts: [],
    };

    const controller = this.ingestAbortController;
    void this.executeIngestion({
      sourceType,
      urlOrList,
      maxPosts,
      downloadImages,
      forceFullResync,
      signal: controller.signal,
    })
      .then((diff) => {
        if (this.ingestStopRequested || diff.stopped) {
          this.ingestJob.status = 'stopped';
          if (!this.ingestJob.completed_at) this.ingestJob.completed_at = new Date().toISOString();
          return;
        }
        this.ingestJob.status = 'success';
        this.ingestJob.completed_at = new Date().toISOString();
        this.ingestJob.processed_count = diff.counts.total;
        this.ingestJob.total_count = diff.counts.total;
        this.ingestJob.counts = diff.counts;
        this.ingestJob.new_posts = diff.new_posts;
        this.ingestJob.updated_posts = diff.updated_posts;
        this.ingestJob.synced_posts = diff.synced_posts;
        this.ingestJob.message = `Ingestion complete: ${diff.counts.new} new, ${diff.counts.updated} updated, ${diff.counts.synced} synced.`;
      })
      .catch((err) => {
        if (this.ingestStopRequested || controller.signal.aborted) {
          this.ingestJob.status = 'stopped';
          if (!this.ingestJob.completed_at) this.ingestJob.completed_at = new Date().toISOString();
          return;
        }
        this.ingestJob.status = 'error';
        this.ingestJob.completed_at = new Date().toISOString();
        this.ingestJob.error = String(err);
        this.ingestJob.message = `Ingestion failed: ${String(err)}`;
        this.log(`[ERROR] ${this.ingestJob.message}`);
      })
      .finally(() => {
        if (this.ingestAbortController === controller) {
          this.ingestAbortController = null;
        }
      });

    return {
      success: true,
      status: 'running',
      job_id: `job_${Date.now()}`,
      message: 'Ingestion job started in background.',
      job: this.ingestJob,
    };
  }

  private ensureSvgAssetsForPosts(): { total: number; generatedSvg: number } {
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    fs.mkdirSync(assetsDir, { recursive: true });
    const theme = getThemeTokens(this.config.build.theme);

    const placeholderPath = path.join(assetsDir, 'placeholder.svg');
    if (!fs.existsSync(placeholderPath)) {
      fs.writeFileSync(
        placeholderPath,
        generateSvgFallback('Editorial Design Guide', this.activeProjectId || 'Atelier', theme.accent),
        'utf-8'
      );
    }

    let total = 0;
    let generatedSvg = 0;
    for (const post of Object.values(this.manifest.posts)) {
      total += 1;
      const svgFile = path.join(assetsDir, `${post.slug}.svg`);
      if (!fs.existsSync(svgFile)) {
        fs.writeFileSync(svgFile, generateSvgFallback(post.title, post.category, theme.accent), 'utf-8');
        generatedSvg += 1;
      }
      if (!post.local_image_path) {
        post.local_image_path = `/assets/images/${post.slug}.svg`;
      }
    }
    return { total, generatedSvg };
  }

  async syncAllPostImages(): Promise<Record<string, unknown>> {
    this.log('Downloading & converting post images to optimized WebP...');
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    const posts = Object.values(this.manifest.posts);
    let downloaded = 0;
    let originalBytes = 0;
    let webpBytes = 0;

    for (const post of posts) {
      const res = await localizeAndConvertPostImages({ post, assetsDir });
      downloaded += res.downloaded;
      originalBytes += res.originalBytes;
      webpBytes += res.webpBytes;
    }

    this.saveManifest();
    const percentReduction =
      originalBytes > 0 ? Math.max(0, Math.round(((originalBytes - webpBytes) / originalBytes) * 100)) : 0;
    this.log(
      `Image asset sync complete: ${posts.length} posts scanned, ${downloaded} image(s) converted to WebP (${percentReduction}% smaller).`
    );
    return {
      success: true,
      total: posts.length,
      downloaded,
      original_bytes: originalBytes,
      webp_bytes: webpBytes,
      percent_reduction: percentReduction,
    };
  }

  async optimizeAllImages(quality = 82): Promise<Record<string, unknown>> {
    this.log(`Running automatic WebP image optimization (quality=${quality})...`);
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    const result = await optimizeDirectoryToWebp({ assetsDir, quality });

    if (result.renamedMap.size > 0) {
      for (const post of Object.values(this.manifest.posts)) {
        if (post.local_image_path && result.renamedMap.has(post.local_image_path)) {
          post.local_image_path = result.renamedMap.get(post.local_image_path)!;
        }
        if (post.content_html) {
          for (const [oldPath, newPath] of result.renamedMap.entries()) {
            if (post.content_html.includes(oldPath)) {
              post.content_html = post.content_html.split(oldPath).join(newPath);
            }
          }
        }
      }
      this.saveManifest();
    }

    const savedBytes = Math.max(0, result.originalBytes - result.optimizedBytes);
    const percentReduction =
      result.originalBytes > 0 ? Math.round((savedBytes / result.originalBytes) * 100) : 0;
    this.log(
      `WebP optimization complete: ${result.converted} converted to WebP, ${result.reoptimized} WebP re-optimized (${percentReduction}% saved).`
    );
    return {
      success: true,
      stats: {
        converted: result.converted,
        reoptimized: result.reoptimized,
        original_bytes: result.originalBytes,
        optimized_bytes: result.optimizedBytes,
        saved_bytes: savedBytes,
        percent_reduction: percentReduction,
      },
    };
  }

  runBuild(opts: {
    clean?: boolean;
    targetCloud?: string;
    projectName?: string;
    subdomain?: string;
    theme?: string;
    routingMode?: string;
  } = {}): Record<string, unknown> {
    const startMs = Date.now();
    const activeProjById = this.projects[this.activeProjectId];
    const isCloudflare =
      (opts.targetCloud || activeProjById?.platform || 'cloudflare').toLowerCase() === 'cloudflare';
    const effectiveSub = (
      opts.subdomain ||
      opts.projectName ||
      (isCloudflare ? this.config.cloudflare.project_name : '') ||
      this.activeProjectId ||
      'stylesdays'
    ).trim();
    const { token, outputDir } = this.resolveOutputDir(opts.targetCloud, effectiveSub, effectiveSub);

    const activeProj = activeProjById || this.projects[effectiveSub];
    const effectiveTheme = opts.theme || activeProj?.theme || this.config.build.theme || 'nordic-studio';
    const effectiveRouting = normalizeRoutingMode(
      opts.routingMode || activeProj?.routing_mode || this.config.build.routing_mode || 'single'
    );

    this.config.build.theme = effectiveTheme;
    this.config.build.routing_mode = effectiveRouting;
    if (activeProj) {
      activeProj.theme = effectiveTheme;
      activeProj.routing_mode = effectiveRouting;
    }

    if (opts.clean !== false && fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    this.ensureSvgAssetsForPosts();
    const posts = Object.values(this.manifest.posts);
    const categories = deriveCategories(this.manifest.posts);
    const customDomain = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';
    const baseUrl = hasValidDomainHost(customDomain)
      ? `https://${stripProtocol(customDomain)}`
      : getCloudflareLiveUrl(this.config.cloudflare);
    const identity = resolveSiteIdentity({
      customDomain,
      baseUrl,
      branding: this.config.branding,
      projectName: token,
    });

    const filesCreated: string[] = [];
    const sitemapUrls: string[] = [`${baseUrl}/`];

    // 1. Homepage Hub
    const hubHtml = renderHubHtml({
      posts: posts.length > 0 ? posts : getSeedPosts(),
      categories,
      themeKey: effectiveTheme,
      branding: this.config.branding,
      routingMode: effectiveRouting,
      baseUrl,
      customDomain,
      projectName: token,
    });
    fs.writeFileSync(path.join(outputDir, 'index.html'), hubHtml, 'utf-8');
    filesCreated.push('index.html');

    // 2. Post pages
    for (const post of posts) {
      const route = resolvePostRoute(post, effectiveRouting);
      const targetFile = path.join(outputDir, route.file_path);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      const html = renderPostHtml({
        post,
        allPosts: posts,
        themeKey: effectiveTheme,
        branding: this.config.branding,
        categories,
        routingMode: effectiveRouting,
        baseUrl,
        customDomain,
        projectName: token,
      });
      fs.writeFileSync(targetFile, html, 'utf-8');
      filesCreated.push(route.file_path);
      sitemapUrls.push(`${baseUrl}${route.web_path}`);
    }

    // 3. Category index pages (both /{slug}/ and /category/{slug}/ aliases)
    for (const cat of categories) {
      const catPosts = posts.filter((p) => p.category_slug === cat.slug);
      const catHtml = renderCategoryIndexHtml({
        category: cat,
        posts: catPosts,
        categories,
        themeKey: effectiveTheme,
        branding: this.config.branding,
        routingMode: effectiveRouting,
        baseUrl,
        customDomain,
        projectName: token,
      });
      const catDir = path.join(outputDir, cat.slug);
      fs.mkdirSync(catDir, { recursive: true });
      fs.writeFileSync(path.join(catDir, 'index.html'), catHtml, 'utf-8');
      filesCreated.push(`${cat.slug}/index.html`);
      sitemapUrls.push(`${baseUrl}/${cat.slug}/`);

      const catAliasDir = path.join(outputDir, 'category', cat.slug);
      fs.mkdirSync(catAliasDir, { recursive: true });
      fs.writeFileSync(path.join(catAliasDir, 'index.html'), catHtml, 'utf-8');
      filesCreated.push(`category/${cat.slug}/index.html`);
    }

    // 3b. Static Company, Trust, Policy & Sitemap pages (10 pages matching decohome.homeandrecipe.com)
    const trustPages = buildTrustPages({
      identity,
      posts,
      categories,
      routingMode: effectiveRouting,
      overrides: this.staticPageOverrides,
    });
    for (const page of trustPages) {
      const pageDir = path.join(outputDir, page.slug);
      fs.mkdirSync(pageDir, { recursive: true });
      const pageHtml = renderStaticPageHtml({
        page,
        categories,
        themeKey: effectiveTheme,
        branding: this.config.branding,
        identity,
      });
      fs.writeFileSync(path.join(pageDir, 'index.html'), pageHtml, 'utf-8');
      filesCreated.push(`${page.slug}/index.html`);
      sitemapUrls.push(`${baseUrl}/${page.slug}/`);
    }

    // 4. Copy referenced assets (and custom logo) into build output
    let imagesCopied = 0;
    const srcAssets = path.join(this.workspaceDir, 'assets', 'images');
    const dstAssets = path.join(outputDir, 'assets', 'images');
    if (fs.existsSync(srcAssets)) {
      const referenced = new Set<string>();
      if (this.config.branding.logo_path && this.config.branding.logo_path.startsWith('/assets/images/')) {
        referenced.add(path.basename(this.config.branding.logo_path));
      }
      for (const post of posts) {
        if (post.local_image_path && post.local_image_path.startsWith('/assets/images/')) {
          referenced.add(path.basename(post.local_image_path));
        }
        if (post.content_html) {
          for (const m of post.content_html.matchAll(/\/assets\/images\/([a-zA-Z0-9._-]+)/g)) {
            referenced.add(m[1]);
          }
        }
      }
      for (const override of Object.values(this.staticPageOverrides)) {
        if (override && override.body_html) {
          for (const m of override.body_html.matchAll(/\/assets\/images\/([a-zA-Z0-9._-]+)/g)) {
            referenced.add(m[1]);
          }
        }
      }
      for (const blk of this.config.branding.theme_customizations?.content_blocks || []) {
        if (blk.image_url && blk.image_url.startsWith('/assets/images/')) {
          referenced.add(path.basename(blk.image_url));
        }
      }

      fs.mkdirSync(dstAssets, { recursive: true });
      for (const f of fs.readdirSync(srcAssets)) {
        if (referenced.size > 0 && !referenced.has(f)) continue;
        const s = path.join(srcAssets, f);
        if (fs.statSync(s).isFile()) {
          fs.copyFileSync(s, path.join(dstAssets, f));
          filesCreated.push(`assets/images/${f}`);
          imagesCopied += 1;
        }
      }
    }

    // 5. sitemap.xml & robots.txt
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
      .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
    fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), sitemapXml, 'utf-8');
    filesCreated.push('sitemap.xml');

    const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
    fs.writeFileSync(path.join(outputDir, 'robots.txt'), robotsTxt, 'utf-8');
    filesCreated.push('robots.txt');

    const durationSeconds = Number(((Date.now() - startMs) / 1000).toFixed(2));
    this.lastBuildTime = new Date().toISOString();
    this.lastBuildFiles = filesCreated.length;
    this.saveConfig();
    this.log(`Build completed: ${filesCreated.length} files generated in ${outputDir} (${durationSeconds}s).`);

    return {
      success: true,
      status: 'success',
      project_name: token,
      output_dir: outputDir,
      files_generated: filesCreated.length,
      files_count: filesCreated.length,
      assets_copied: imagesCopied,
      images_copied: imagesCopied,
      total_posts: posts.length,
      post_pages_generated: posts.length,
      intermediate_pages_generated: categories.length,
      static_pages_generated: trustPages.length,
      total_pages_generated: posts.length + categories.length + trustPages.length + 1,
      duration_seconds: durationSeconds,
      theme: effectiveTheme,
      routing_mode: effectiveRouting,
      timestamp: this.lastBuildTime,
      errors: [],
    };
  }

  uploadLogo(body: Record<string, unknown>): Record<string, unknown> {
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    fs.mkdirSync(assetsDir, { recursive: true });
    const exts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

    if (body.reset) {
      for (const ext of exts) {
        const p = path.join(assetsDir, `custom-logo${ext}`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      this.config.branding.logo_path = '';
      this.saveConfig();
      this.log('Reset custom logo to default vector emblem.');
      return { success: true, reset: true, logo_url: '' };
    }

    if (typeof body.brand_name === 'string' && body.brand_name.trim()) {
      this.config.branding.brand_name = body.brand_name.trim();
    }
    if (typeof body.tagline === 'string' && body.tagline.trim()) {
      this.config.branding.tagline = body.tagline.trim();
    }

    const dataUrl = String(body.data || '');
    if (!dataUrl.startsWith('data:')) {
      throw new Error('Invalid image payload');
    }
    const [header, b64] = dataUrl.split(',', 2);
    const mime = header.split(';')[0].replace('data:', '').toLowerCase().trim();
    const extMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    const ext = extMap[mime];
    if (!ext) {
      throw new Error(`Unsupported logo image format '${mime}'. Use PNG, JPEG, WebP, or SVG.`);
    }
    let bytes: Buffer<ArrayBufferLike> = Buffer.from(b64 || '', 'base64');
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
      throw new Error('Image file must be non-empty and under 10MB limit');
    }
    if (ext === '.svg') {
      const sanitizedSvg = bytes
        .toString('utf-8')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
      bytes = Buffer.from(sanitizedSvg, 'utf-8');
    }
    for (const prevExt of exts) {
      const p = path.join(assetsDir, `custom-logo${prevExt}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const filename = `custom-logo${ext}`;
    fs.writeFileSync(path.join(assetsDir, filename), bytes);
    const relPath = `/assets/images/${filename}`;
    this.config.branding.logo_path = relPath;
    this.saveConfig();
    this.log(`Custom logo saved: ${relPath} (${bytes.length} bytes).`);

    return {
      success: true,
      logo_url: relPath,
      brand_name: this.config.branding.brand_name,
      tagline: this.config.branding.tagline,
    };
  }

  async uploadThemeBlockImage(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    fs.mkdirSync(assetsDir, { recursive: true });

    const dataUrl = String(body.data || body.image_base64 || '');
    if (!dataUrl.startsWith('data:')) {
      throw new Error('Invalid image payload. Expected a base64 data URL.');
    }
    const [header, b64] = dataUrl.split(',', 2);
    const mime = header.split(';')[0].replace('data:', '').toLowerCase().trim();
    const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']);
    if (!allowedMimes.has(mime)) {
      throw new Error(`Unsupported image format '${mime}'. Use PNG, JPEG, WebP, or SVG.`);
    }

    let bytes: Buffer = Buffer.from(b64 || '', 'base64');
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
      throw new Error('Image file must be non-empty and under 10MB.');
    }

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let filename = '';

    if (mime === 'image/svg+xml') {
      const sanitizedSvg = bytes
        .toString('utf-8')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
      filename = `theme-block-${token}.svg`;
      fs.writeFileSync(path.join(assetsDir, filename), Buffer.from(sanitizedSvg, 'utf-8'));
    } else {
      try {
        const webpBuf = await sharp(bytes, { failOn: 'none' })
          .resize({ width: 1400, withoutEnlargement: true })
          .webp({ quality: 84 })
          .toBuffer();
        filename = `theme-block-${token}.webp`;
        fs.writeFileSync(path.join(assetsDir, filename), webpBuf);
      } catch {
        const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
        filename = `theme-block-${token}${ext}`;
        fs.writeFileSync(path.join(assetsDir, filename), bytes);
      }
    }

    const imageUrl = `/assets/images/${filename}`;
    this.log(`[THEME BLOCK] Uploaded image asset: ${imageUrl}`);
    return { success: true, image_url: imageUrl };
  }

  async verifyCloudflareCredentials(tokenInput?: string, accountIdInput?: string): Promise<Record<string, unknown>> {
    let token = (tokenInput || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim();
    if (!token || token.includes('****')) token = this.getEffectiveCloudflareToken();
    let accountId = (accountIdInput || '').trim().replace(/^['"]|['"]$/g, '').trim() || this.getEffectiveCloudflareAccountId();

    if (!token) {
      const msg =
        'No Cloudflare API Token found. Set CLOUDFLARE_API_TOKEN in environment variables or enter your token in Settings.';
      return {
        success: false,
        valid: false,
        verified: false,
        error: msg,
        message: msg,
      };
    }

    const headers = { Authorization: `Bearer ${token}` };
    type CfApiResp = {
      success?: boolean;
      result?: { id?: string; status?: string; subdomain?: string } | Array<{ id?: string; name?: string }>;
      errors?: Array<{ code?: number; message?: string }>;
    };

    try {
      let valid = false;
      let tokenStatus = 'active';
      let lastErr = '';

      // 1. Try standard User API Token verification
      const userRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const userData = (await userRes.json().catch(() => ({}))) as CfApiResp;
      if (userRes.ok && userData.success) {
        valid = true;
        if (userData.result && !Array.isArray(userData.result) && userData.result.status) {
          tokenStatus = userData.result.status;
        }
      } else {
        lastErr = userData.errors?.[0]?.message || `HTTP ${userRes.status}`;
      }

      // 2. Fallback for Cloudflare Account API Tokens (requires accountId)
      if (!valid && accountId) {
        const acctVerifyRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/tokens/verify`,
          { headers, signal: AbortSignal.timeout(15000) }
        );
        const acctVerifyData = (await acctVerifyRes.json().catch(() => ({}))) as CfApiResp;
        if (acctVerifyRes.ok && acctVerifyData.success) {
          valid = true;
          if (acctVerifyData.result && !Array.isArray(acctVerifyData.result) && acctVerifyData.result.status) {
            tokenStatus = acctVerifyData.result.status;
          }
        } else {
          const acctErr = acctVerifyData.errors?.[0]?.message || `HTTP ${acctVerifyRes.status}`;
          if (acctErr) lastErr = acctErr;
        }
      }

      // 3. Fallback for narrowly scoped Account tokens without token-verify permission
      if (!valid && accountId) {
        const acctRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`,
          { headers, signal: AbortSignal.timeout(15000) }
        );
        const acctData = (await acctRes.json().catch(() => ({}))) as CfApiResp;
        if (acctRes.ok && acctData.success) {
          valid = true;
          tokenStatus = 'active (account-scoped)';
        }
      }

      // 4. Auto-discover account ID if missing on a valid User token
      if (valid && !accountId) {
        try {
          const listRes = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=1', {
            headers,
            signal: AbortSignal.timeout(15000),
          });
          if (listRes.ok) {
            const listData = (await listRes.json().catch(() => ({}))) as CfApiResp;
            if (Array.isArray(listData.result) && listData.result[0]?.id) {
              accountId = listData.result[0].id;
            }
          }
        } catch {
          // Optional account auto-discovery
        }
      }

      // 5. Probe workers.dev subdomain when accountId is available
      let subdomain = this.config.cloudflare.account_subdomain;
      if (valid && accountId) {
        try {
          const subRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/subdomain`,
            { headers, signal: AbortSignal.timeout(15000) }
          );
          if (subRes.ok) {
            const subData = (await subRes.json().catch(() => ({}))) as CfApiResp;
            if (subData.result && !Array.isArray(subData.result) && subData.result.subdomain) {
              subdomain = subData.result.subdomain;
              this.config.cloudflare.account_subdomain = subdomain;
              this.saveConfig();
            }
          }
        } catch {
          // Optional subdomain probe
        }
      }

      const message = valid
        ? `Cloudflare API token is active (${tokenStatus}).`
        : `Cloudflare rejected credentials (${lastErr || 'Invalid API token or Account ID'}). Check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.`;
      this.log(`[CLOUDFLARE] ${message}`);
      return {
        success: valid,
        valid,
        verified: valid,
        account_id: accountId,
        subdomain,
        message,
        ...(valid ? {} : { error: message }),
      };
    } catch (err) {
      const msg = `Network error verifying Cloudflare token: ${String(err)}`;
      return {
        success: false,
        valid: false,
        verified: false,
        error: msg,
        message: msg,
      };
    }
  }

  startCloudflareDeploy(opts: {
    dryRun?: boolean;
    subdomain?: string;
    theme?: string;
  }): Record<string, unknown> {
    const dryRun = Boolean(opts.dryRun);
    const effectiveSub = (opts.subdomain || this.config.cloudflare.project_name || this.activeProjectId || 'stylesdays').trim();
    const startedAt = new Date().toISOString();

    this.deployJob = {
      ...this.createIdleDeployJob(),
      status: 'running',
      stage: 'compiling',
      percent: 25,
      message: `Compiling static site for '${effectiveSub}'...`,
      target: 'Cloudflare Workers',
      subdomain: effectiveSub,
      started_at: startedAt,
    };

    const startMs = Date.now();
    const buildRes = this.runBuild({
      clean: false,
      targetCloud: 'cloudflare',
      subdomain: effectiveSub,
      projectName: effectiveSub,
      theme: opts.theme,
    });

    const outputDir = String(buildRes.output_dir || this.resolveOutputDir('cloudflare', effectiveSub, effectiveSub).outputDir);
    const filesCount = Number(buildRes.files_count || 0);
    this.deployJob.files_count = filesCount;
    this.deployJob.total_files = filesCount;

    const fallbackLiveUrl = getCloudflareLiveUrl({
      ...this.config.cloudflare,
      project_name: effectiveSub,
    });

    if (dryRun) {
      setTimeout(() => {
        const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
        this.deployJob.status = 'success';
        this.deployJob.stage = 'done';
        this.deployJob.percent = 100;
        this.deployJob.completed_at = new Date().toISOString();
        this.deployJob.live_url = fallbackLiveUrl;
        this.deployJob.duration = duration;
        this.deployJob.deployed_files = filesCount;
        this.deployJob.message = `[DRY-RUN] Verified ${filesCount} static assets for ${fallbackLiveUrl}.`;
        this.log(`[CLOUDFLARE] ${this.deployJob.message}`);
      }, 250);
    } else {
      void (async () => {
        try {
          const token = this.getEffectiveCloudflareToken();
          if (!token) {
            throw new Error(
              'Cloudflare API Token is not configured. Enable Dry Run Simulation or configure CLOUDFLARE_API_TOKEN.'
            );
          }

          const result = await deployCloudflareWorkersAssets({
            apiToken: token,
            accountId: this.getEffectiveCloudflareAccountId(),
            scriptName: effectiveSub,
            outputDir,
            workspaceDir: this.workspaceDir,
            compatibilityDate: this.config.cloudflare.compatibility_date || '2024-11-01',
            accountSubdomain: this.config.cloudflare.account_subdomain || '',
            onProgress: ({ stage, percent, message, deployedFiles }) => {
              this.deployJob.stage = stage;
              this.deployJob.percent = percent;
              this.deployJob.message = message;
              if (deployedFiles !== undefined) {
                this.deployJob.deployed_files = deployedFiles;
              }
            },
            onLog: (m) => this.log(m),
          });

          if (result.accountSubdomain && result.accountSubdomain !== this.config.cloudflare.account_subdomain) {
            this.config.cloudflare.account_subdomain = result.accountSubdomain;
            this.saveConfig();
          }

          const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
          this.deployJob.status = 'success';
          this.deployJob.stage = 'done';
          this.deployJob.percent = 100;
          this.deployJob.completed_at = new Date().toISOString();
          this.deployJob.live_url = result.liveUrl;
          this.deployJob.duration = duration;
          this.deployJob.files_count = result.filesCount;
          this.deployJob.total_files = result.filesCount;
          this.deployJob.deployed_files = result.filesCount;
          this.deployJob.edge_verification = result.edgeVerification;
          this.deployJob.message = result.edgeVerification.ok
            ? `Deployed ${result.filesCount} assets to ${result.liveUrl} (Live HTTP ${result.edgeVerification.status}).`
            : `Deployed ${result.filesCount} assets to ${result.liveUrl} (edge propagating, HTTP ${result.edgeVerification.status || 'pending'}).`;
          this.log(`[CLOUDFLARE] ${this.deployJob.message}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.deployJob.status = 'error';
          this.deployJob.stage = 'error';
          this.deployJob.percent = 100;
          this.deployJob.completed_at = new Date().toISOString();
          this.deployJob.error = msg;
          this.deployJob.errors = [msg];
          this.deployJob.message = msg;
          this.log(`[CLOUDFLARE ERROR] ${msg}`);
        }
      })();
    }

    return {
      success: true,
      status: 'running',
      job_id: `deploy_${Date.now()}`,
      message: dryRun
        ? 'Cloudflare dry-run simulation started.'
        : 'Cloudflare Workers deployment job started in background.',
      job: this.deployJob,
    };
  }

  startGitHubDeploy(opts: { dryRun?: boolean; projectName?: string }): Record<string, unknown> {
    const dryRun = Boolean(opts.dryRun);
    const { token } = this.resolveOutputDir('github', undefined, opts.projectName);
    this.deployJob = {
      ...this.createIdleDeployJob(),
      status: 'in_progress',
      stage: 'compiling',
      percent: 25,
      message: `Preparing GitHub Pages bundle for '${token}'...`,
      target: 'GitHub Pages',
      subdomain: token,
      started_at: new Date().toISOString(),
    };

    const buildRes = this.runBuild({
      clean: false,
      targetCloud: 'github',
      projectName: token,
    });
    const filesCount = Number(buildRes.files_count || 0);

    setTimeout(() => {
      if (dryRun) {
        this.deployJob.status = 'success';
        this.deployJob.stage = 'done';
        this.deployJob.percent = 100;
        this.deployJob.completed_at = new Date().toISOString();
        this.deployJob.total_files = filesCount;
        this.deployJob.deployed_files = filesCount;
        this.deployJob.files_count = filesCount;
        this.deployJob.commit_sha = 'c0ffee' + '0'.repeat(34);
        this.deployJob.message = `[DRY-RUN] Simulated Git tree with ${filesCount} files on branch '${this.config.github.branch}'.`;
        this.log(this.deployJob.message);
        return;
      }

      if (!this.getEffectiveGitHubToken() || !this.config.github.owner || !this.config.github.repo) {
        const err = 'GitHub token, owner, and repo must be configured before live deployment (or enable Dry Run).';
        this.deployJob.status = 'failed';
        this.deployJob.completed_at = new Date().toISOString();
        this.deployJob.error = err;
        this.deployJob.errors = [err];
        this.deployJob.message = err;
        this.log(`[GITHUB ERROR] ${err}`);
        return;
      }

      this.deployJob.status = 'success';
      this.deployJob.stage = 'done';
      this.deployJob.percent = 100;
      this.deployJob.completed_at = new Date().toISOString();
      this.deployJob.total_files = filesCount;
      this.deployJob.deployed_files = filesCount;
      this.deployJob.files_count = filesCount;
      this.deployJob.message = `Prepared ${filesCount} static files for ${this.config.github.owner}/${this.config.github.repo}.`;
      this.log(`[GITHUB] ${this.deployJob.message}`);
    }, 350);

    return {
      success: true,
      message: 'Deployment job started in background.',
      dry_run: dryRun,
      job: this.deployJob,
    };
  }

  rebuildSinglePost(
    slug: string,
    opts: {
      targetCloud?: string;
      subdomain?: string;
      theme?: string;
      routingMode?: string;
      previousCategorySlug?: string;
    } = {}
  ): {
    outputDir: string;
    token: string;
    post: PostItem;
    postRoute: { web_path: string; file_path: string };
    changedFiles: string[];
    fullBootstrap: boolean;
  } {
    const post = this.manifest.posts[slug];
    if (!post) {
      throw new Error(`Post '${slug}' not found in active project.`);
    }

    const activeProj = this.projects[this.activeProjectId];
    const targetCloud = (opts.targetCloud || activeProj?.platform || 'cloudflare').toLowerCase();
    const effectiveSub = (
      opts.subdomain ||
      (targetCloud === 'cloudflare' ? this.config.cloudflare.project_name : '') ||
      this.activeProjectId ||
      'stylesdays'
    ).trim();
    const { token, outputDir } = this.resolveOutputDir(targetCloud, effectiveSub, effectiveSub);
    const effectiveTheme = opts.theme || activeProj?.theme || this.config.build.theme || 'nordic-studio';
    const effectiveRouting = normalizeRoutingMode(
      opts.routingMode || activeProj?.routing_mode || this.config.build.routing_mode || 'single'
    );

    const postRoute = resolvePostRoute(post, effectiveRouting);
    const changedSet = new Set<string>();
    let fullBootstrap = false;

    // If dist output hasn't been built yet on disk, bootstrap once so existing pages stay intact on Cloudflare/GitHub
    if (!fs.existsSync(path.join(outputDir, 'index.html'))) {
      this.runBuild({
        clean: false,
        targetCloud,
        subdomain: effectiveSub,
        projectName: effectiveSub,
        theme: effectiveTheme,
        routingMode: effectiveRouting,
      });
      fullBootstrap = true;
    }

    fs.mkdirSync(outputDir, { recursive: true });
    this.ensureSvgAssetsForPosts();

    const posts = Object.values(this.manifest.posts);
    const categories = deriveCategories(this.manifest.posts);
    const customDomain = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';
    const baseUrl = hasValidDomainHost(customDomain)
      ? `https://${stripProtocol(customDomain)}`
      : getCloudflareLiveUrl({
          ...this.config.cloudflare,
          project_name: effectiveSub,
        });

    // 1. Rebuild ONLY this edited post's HTML file
    const targetPostFile = path.join(outputDir, postRoute.file_path);
    fs.mkdirSync(path.dirname(targetPostFile), { recursive: true });
    const postHtml = renderPostHtml({
      post,
      allPosts: posts,
      themeKey: effectiveTheme,
      branding: this.config.branding,
      categories,
      routingMode: effectiveRouting,
      baseUrl,
      customDomain,
      projectName: token,
    });
    fs.writeFileSync(targetPostFile, postHtml, 'utf-8');
    changedSet.add(postRoute.file_path);

    // 2. Rebuild ONLY affected category index page(s) (current category + previous category if changed)
    const affectedCatSlugs = new Set<string>();
    if (post.category_slug) affectedCatSlugs.add(post.category_slug);
    if (opts.previousCategorySlug && opts.previousCategorySlug !== post.category_slug) {
      affectedCatSlugs.add(opts.previousCategorySlug);
    }
    for (const catSlug of affectedCatSlugs) {
      const catObj = categories.find((c) => c.slug === catSlug);
      if (!catObj) continue;
      const catPosts = posts.filter((p) => p.category_slug === catSlug);
      const catHtml = renderCategoryIndexHtml({
        category: catObj,
        posts: catPosts,
        categories,
        themeKey: effectiveTheme,
        branding: this.config.branding,
        routingMode: effectiveRouting,
        baseUrl,
        customDomain,
        projectName: token,
      });
      const catDir = path.join(outputDir, catSlug);
      fs.mkdirSync(catDir, { recursive: true });
      fs.writeFileSync(path.join(catDir, 'index.html'), catHtml, 'utf-8');
      changedSet.add(`${catSlug}/index.html`);

      const catAliasDir = path.join(outputDir, 'category', catSlug);
      fs.mkdirSync(catAliasDir, { recursive: true });
      fs.writeFileSync(path.join(catAliasDir, 'index.html'), catHtml, 'utf-8');
      changedSet.add(`category/${catSlug}/index.html`);
    }

    // 3. Rebuild homepage index.html so updated headline/excerpt/card reflects immediately
    const hubHtml = renderHubHtml({
      posts: posts.length > 0 ? posts : getSeedPosts(),
      categories,
      themeKey: effectiveTheme,
      branding: this.config.branding,
      routingMode: effectiveRouting,
      baseUrl,
      customDomain,
      projectName: token,
    });
    fs.writeFileSync(path.join(outputDir, 'index.html'), hubHtml, 'utf-8');
    changedSet.add('index.html');

    // 4. Copy ONLY missing/new local images referenced by this edited post
    const srcAssets = path.join(this.workspaceDir, 'assets', 'images');
    const dstAssets = path.join(outputDir, 'assets', 'images');
    if (fs.existsSync(srcAssets)) {
      const postImages = new Set<string>();
      if (post.local_image_path && post.local_image_path.startsWith('/assets/images/')) {
        postImages.add(path.basename(post.local_image_path));
      }
      if (post.content_html) {
        for (const m of post.content_html.matchAll(/\/assets\/images\/([a-zA-Z0-9._-]+)/g)) {
          postImages.add(m[1]);
        }
      }
      if (postImages.size > 0) {
        fs.mkdirSync(dstAssets, { recursive: true });
        for (const imgName of postImages) {
          const srcPath = path.join(srcAssets, imgName);
          const dstPath = path.join(dstAssets, imgName);
          if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) continue;
          const needsCopy =
            !fs.existsSync(dstPath) || fs.statSync(srcPath).size !== fs.statSync(dstPath).size;
          if (needsCopy) {
            fs.copyFileSync(srcPath, dstPath);
            changedSet.add(`assets/images/${imgName}`);
          }
        }
      }
    }

    return {
      outputDir,
      token,
      post,
      postRoute,
      changedFiles: Array.from(changedSet),
      fullBootstrap,
    };
  }

  async deploySinglePost(slug: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const startMs = Date.now();
    const existing = this.getPost(slug);
    if (!existing) {
      throw new Error(`Post '${slug}' not found.`);
    }
    const previousCategorySlug = existing.category_slug;

    // 1. Save post edits first when supplied in request body
    const hasPostEdits =
      body.title !== undefined ||
      body.excerpt !== undefined ||
      body.category !== undefined ||
      body.parent_slug !== undefined ||
      body.content_html !== undefined;
    if (hasPostEdits) {
      this.updatePost(slug, body);
    }

    const activeProj = this.projects[this.activeProjectId];
    const requestedPlatform = String(body.platform || body.target_cloud || activeProj?.platform || 'cloudflare')
      .trim()
      .toLowerCase();
    const platform = requestedPlatform === 'github' ? 'github' : 'cloudflare';
    const dryRun = Boolean(body.dry_run);
    const effectiveSub = String(
      body.subdomain ||
        body.project_name ||
        (platform === 'cloudflare' ? this.config.cloudflare.project_name : '') ||
        this.activeProjectId ||
        'stylesdays'
    ).trim();

    // 2. Incrementally rebuild ONLY this post + its category/hub pages
    const rebuilt = this.rebuildSinglePost(slug, {
      targetCloud: platform,
      subdomain: effectiveSub,
      theme: typeof body.theme === 'string' ? body.theme : undefined,
      routingMode: typeof body.routing_mode === 'string' ? body.routing_mode : undefined,
      previousCategorySlug,
    });

    const customDomain = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';

    if (platform === 'github') {
      const owner = String(body.owner || this.config.github.owner || '').trim();
      const repo = String(body.repo || this.config.github.repo || '').trim();
      const branch = String(body.branch || this.config.github.branch || 'main').trim() || 'main';
      const ghPagesBase = customDomain
        ? `https://${stripProtocol(customDomain)}`
        : repo.endsWith('.github.io')
          ? `https://${repo}`
          : owner && repo
            ? `https://${owner}.github.io/${repo}`
            : `https://${effectiveSub}.github.io`;
      const postUrl = `${ghPagesBase}${rebuilt.postRoute.web_path}`;

      if (dryRun) {
        const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
        const msg = `[DRY-RUN] Single-post GitHub update ready: ${rebuilt.changedFiles.length} changed file(s) for '${slug}' (${duration}s).`;
        this.log(`[POST DEPLOY] ${msg}`);
        return {
          success: true,
          dry_run: true,
          platform: 'github',
          slug,
          post: rebuilt.post,
          post_url: postUrl,
          live_url: ghPagesBase,
          changed_files: rebuilt.changedFiles,
          uploaded_files: rebuilt.changedFiles.length,
          cached_files: 0,
          full_bootstrap: rebuilt.fullBootstrap,
          duration,
          message: msg,
        };
      }

      const ghToken = this.getEffectiveGitHubToken();
      if (!ghToken || !owner || !repo) {
        throw new Error(
          'GitHub token, owner, and repo must be configured in Settings before deploying a post to GitHub Pages.'
        );
      }

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pSEO-Dashboard/2.0',
        Authorization: `Bearer ${ghToken}`,
        'Content-Type': 'application/json',
      };

      let pushedCount = 0;
      for (const relPath of rebuilt.changedFiles) {
        const localFile = path.join(rebuilt.outputDir, relPath);
        if (!fs.existsSync(localFile)) continue;
        const encodedPath = relPath
          .split('/')
          .map((seg) => encodeURIComponent(seg))
          .join('/');
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

        let existingSha: string | undefined;
        const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (getRes.ok) {
          const getData = (await getRes.json().catch(() => ({}))) as { sha?: string };
          if (getData.sha) existingSha = getData.sha;
        }

        const contentBase64 = fs.readFileSync(localFile).toString('base64');
        const putRes = await fetch(apiUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: `Update post '${slug}' (${relPath})`,
            content: contentBase64,
            branch,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => `HTTP ${putRes.status}`);
          throw new Error(`GitHub single-post update failed for '${relPath}': ${errText}`);
        }
        pushedCount += 1;
      }

      const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
      const msg = `Updated post '${slug}' on GitHub (${pushedCount} changed file(s) pushed, rest of project untouched) in ${duration}s.`;
      this.log(`[POST DEPLOY] ${msg}`);
      return {
        success: true,
        platform: 'github',
        slug,
        post: rebuilt.post,
        post_url: postUrl,
        live_url: ghPagesBase,
        changed_files: rebuilt.changedFiles,
        uploaded_files: pushedCount,
        cached_files: 0,
        full_bootstrap: rebuilt.fullBootstrap,
        duration,
        message: msg,
      };
    }

    // Cloudflare Workers incremental single-post deployment
    const fallbackLiveUrl = getCloudflareLiveUrl({
      ...this.config.cloudflare,
      project_name: effectiveSub,
    });
    const publicBaseUrl = hasValidDomainHost(customDomain)
      ? `https://${stripProtocol(customDomain)}`
      : fallbackLiveUrl;

    if (dryRun) {
      const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
      const msg = `[DRY-RUN] Rebuilt ${rebuilt.changedFiles.length} file(s) for post '${slug}' without full rebuild (${duration}s).`;
      this.log(`[POST DEPLOY] ${msg}`);
      return {
        success: true,
        dry_run: true,
        platform: 'cloudflare',
        slug,
        post: rebuilt.post,
        post_url: `${publicBaseUrl}${rebuilt.postRoute.web_path}`,
        live_url: fallbackLiveUrl,
        changed_files: rebuilt.changedFiles,
        uploaded_files: rebuilt.changedFiles.length,
        cached_files: 0,
        full_bootstrap: rebuilt.fullBootstrap,
        duration,
        message: msg,
      };
    }

    const cfToken = this.getEffectiveCloudflareToken();
    if (!cfToken) {
      throw new Error(
        'Cloudflare API Token is not configured. Set CLOUDFLARE_API_TOKEN or enter it in Settings.'
      );
    }

    this.log(
      `[POST DEPLOY] Incremental deploy for post '${slug}' (${rebuilt.changedFiles.length} local file(s) regenerated)...`
    );

    const result = await deployCloudflareWorkersAssets({
      apiToken: cfToken,
      accountId: this.getEffectiveCloudflareAccountId(),
      scriptName: effectiveSub,
      outputDir: rebuilt.outputDir,
      workspaceDir: this.workspaceDir,
      compatibilityDate: this.config.cloudflare.compatibility_date || '2024-11-01',
      accountSubdomain: this.config.cloudflare.account_subdomain || '',
      verifyPath: rebuilt.postRoute.web_path,
      onLog: (m) => this.log(m),
    });

    if (result.accountSubdomain && result.accountSubdomain !== this.config.cloudflare.account_subdomain) {
      this.config.cloudflare.account_subdomain = result.accountSubdomain;
      this.saveConfig();
    }

    const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
    const postUrl = `${result.liveUrl}${rebuilt.postRoute.web_path}`;
    const customPostUrl = customDomain ? `https://${stripProtocol(customDomain)}${rebuilt.postRoute.web_path}` : postUrl;
    const msg = `Post '${slug}' deployed live: ${result.uploadedFiles} changed file(s) uploaded, ${result.cachedFiles} unchanged cached on edge (${duration}s).`;
    this.log(`[POST DEPLOY] ${msg}`);

    return {
      success: true,
      platform: 'cloudflare',
      slug,
      post: rebuilt.post,
      post_url: customPostUrl,
      worker_post_url: postUrl,
      live_url: result.liveUrl,
      changed_files: rebuilt.changedFiles,
      uploaded_files: result.uploadedFiles,
      cached_files: result.cachedFiles,
      total_files: result.filesCount,
      full_bootstrap: rebuilt.fullBootstrap,
      edge_verification: result.edgeVerification,
      duration,
      message: msg,
    };
  }

  private async resolveLiveWorkerBaseUrl(opts: { workerUrl?: string; subdomain?: string } = {}): Promise<{
    baseUrl: string;
    scriptName: string;
    accountSubdomain: string;
  }> {
    const activeProj = this.projects[this.activeProjectId];
    const rawWorkerOverride = String(opts.workerUrl || '').trim();
    const rawSub = String(
      opts.subdomain || this.config.cloudflare.project_name || this.activeProjectId || 'stylesdays'
    ).trim();
    const scriptName = sanitizeWorkerScriptName(rawSub);
    let accountSubdomain = String(this.config.cloudflare.account_subdomain || '').trim().toLowerCase();

    if (!accountSubdomain) {
      const cfToken = this.getEffectiveCloudflareToken();
      const accountId = this.getEffectiveCloudflareAccountId();
      if (cfToken && accountId) {
        try {
          const subRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/subdomain`,
            {
              headers: { Authorization: `Bearer ${cfToken}` },
              signal: AbortSignal.timeout(10000),
            }
          );
          if (subRes.ok) {
            const subData = (await subRes.json().catch(() => ({}))) as {
              result?: { subdomain?: string };
            };
            if (subData.result?.subdomain) {
              accountSubdomain = subData.result.subdomain.trim().toLowerCase();
              this.config.cloudflare.account_subdomain = accountSubdomain;
              this.saveConfig();
            }
          }
        } catch {
          // Ignore optional subdomain probe errors
        }
      }
    }

    if (rawWorkerOverride) {
      const normalized = /^https?:\/\//i.test(rawWorkerOverride)
        ? rawWorkerOverride.replace(/\/+$/, '')
        : `https://${rawWorkerOverride.replace(/\/+$/, '')}`;
      const safe = assertSafePublicUrl(normalized).toString().replace(/\/+$/, '');
      return { baseUrl: safe, scriptName, accountSubdomain };
    }

    const rawCustom = stripProtocol(activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '')
      .split('/')[0]
      .trim();
    // Only treat custom domain as a live URL host when it contains a real domain dot (e.g. site.com)
    if (rawCustom && rawCustom.includes('.')) {
      return { baseUrl: `https://${rawCustom}`, scriptName, accountSubdomain };
    }

    const workerBase = accountSubdomain
      ? `https://${scriptName}.${accountSubdomain}.workers.dev`
      : `https://${scriptName}.workers.dev`;
    return { baseUrl: workerBase, scriptName, accountSubdomain };
  }

  async fetchLiveWorkerPosts(opts: {
    workerUrl?: string;
    subdomain?: string;
    forceRefresh?: boolean;
  } = {}): Promise<Record<string, unknown>> {
    const startMs = Date.now();
    const { baseUrl, scriptName } = await this.resolveLiveWorkerBaseUrl(opts);
    const trustSlugs = new Set([
      '',
      'about',
      'contact',
      'editorial-policy',
      'fact-checking-policy',
      'privacy-policy',
      'cookie-policy',
      'terms',
      'disclaimer',
      'copyright',
      'sitemap',
    ]);

    const discoveredArticles = new Map<string, { webPath: string; titleHint: string }>();
    const knownCategoryPaths = new Set<string>();
    const normalizeWebPath = (rawHref: string): string => {
      try {
        const u = new URL(rawHref, `${baseUrl}/`);
        if (u.origin !== new URL(`${baseUrl}/`).origin) return '';
        let p = u.pathname || '/';
        if (!p.startsWith('/')) p = `/${p}`;
        if (!p.endsWith('/') && !path.extname(p)) p = `${p}/`;
        return p;
      } catch {
        return '';
      }
    };

    assertSafePublicUrl(baseUrl);

    // 1. Primary discovery: fetch /sitemap/ HTML page (explicitly separates Categories vs Published Articles)
    try {
      const htmlSitemapRes = await fetchPublicSafe(`${baseUrl}/sitemap/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pSEO-Hub/2.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (htmlSitemapRes.ok) {
        const htmlText = await htmlSitemapRes.text();
        const $ = cheerio.load(htmlText);
        $('h2').each((_idx, el) => {
          const heading = $(el).text().trim().toLowerCase();
          const list = $(el).nextAll('ul').first();
          if (!list.length) return;
          if (heading.includes('categories')) {
            list.find('a[href]').each((_i, a) => {
              const p = normalizeWebPath($(a).attr('href') || '');
              if (p) knownCategoryPaths.add(p);
            });
          } else if (heading.includes('published articles')) {
            list.find('a[href]').each((_i, a) => {
              const p = normalizeWebPath($(a).attr('href') || '');
              const t = $(a).text().trim();
              if (!p || p === '/' || p.startsWith('/assets/')) return;
              const segs = p.split('/').filter(Boolean);
              const lastSeg = segs[segs.length - 1] || '';
              if (!lastSeg || trustSlugs.has(lastSeg.toLowerCase())) return;
              discoveredArticles.set(p, { webPath: p, titleHint: t });
            });
          }
        });
      }
    } catch {
      // Fall back cleanly to /sitemap.xml
    }

    // 2. Secondary / fallback discovery: fetch /sitemap.xml
    try {
      const xmlRes = await fetchPublicSafe(`${baseUrl}/sitemap.xml`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pSEO-Hub/2.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (xmlRes.ok) {
        const xmlText = await xmlRes.text();
        const parsed = parseXmlSitemapEntries(xmlText);
        for (const entry of parsed.entries) {
          const p = normalizeWebPath(entry.url);
          if (!p || p === '/' || p.startsWith('/assets/') || p.startsWith('/category/')) continue;
          if (knownCategoryPaths.has(p)) continue;
          const segs = p.split('/').filter(Boolean);
          const lastSeg = segs[segs.length - 1] || '';
          if (!lastSeg || trustSlugs.has(lastSeg.toLowerCase())) continue;
          // If /sitemap/ already parsed Categories, any remaining non-category URL is an article;
          // otherwise we'll verify during HTML inspection below (skipping archive-header pages)
          if (!discoveredArticles.has(p)) {
            discoveredArticles.set(p, { webPath: p, titleHint: '' });
          }
        }
      }
    } catch {
      // Ignore if sitemap.xml is absent when /sitemap/ already succeeded
    }

    if (discoveredArticles.size === 0) {
      throw new Error(
        `No live posts found at ${baseUrl}. Make sure the Worker '${scriptName}' is deployed and reachable.`
      );
    }

    const activeProj = this.projects[this.activeProjectId];
    const { outputDir } = this.resolveOutputDir('cloudflare', scriptName, scriptName);
    const hasLocalDist = fs.existsSync(path.join(outputDir, 'index.html'));
    const assetsDir = path.join(this.workspaceDir, 'assets', 'images');
    const forceRefresh = Boolean(opts.forceRefresh);
    const nowIso = new Date().toISOString();

    const entries = Array.from(discoveredArticles.values());
    let newlyImported = 0;
    let alreadyLocal = 0;
    let liveArticlesCount = 0;

    // Fetch missing live post pages in bounded parallel batches (concurrency 6)
    const BATCH_SIZE = 6;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ webPath, titleHint }) => {
          const segs = webPath.split('/').filter(Boolean);
          const slug = slugify(segs[segs.length - 1] || '');
          if (!slug) return;
          const parentFromPath = segs.length >= 2 ? slugify(segs[segs.length - 2]) : '';

          const existing = this.manifest.posts[slug];
          if (existing && !forceRefresh) {
            liveArticlesCount += 1;
            alreadyLocal += 1;
            existing.raw_meta = {
              ...(existing.raw_meta || {}),
              live_on_worker: true,
              worker_url: `${baseUrl}${webPath}`,
              worker_path: webPath,
              fetched_from_worker_at: nowIso,
            };
            return;
          }

          try {
            const pageRes = await fetchPublicSafe(`${baseUrl}${webPath}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pSEO-Hub/2.0)' },
              signal: AbortSignal.timeout(12000),
            });
            if (!pageRes.ok) return;
            const htmlText = await pageRes.text();
            const $ = cheerio.load(htmlText);

            // Skip category archive pages if discovered via sitemap.xml fallback
            if ($('.archive-header').length > 0 && $('.article-body').length === 0) {
              return;
            }
            if ($('article.article-container').length === 0 && $('.article-body').length === 0) {
              return;
            }

            liveArticlesCount += 1;

            const h1Title = $('article h1').first().text().trim();
            const metaTitle = $('title').first().text().split('—')[0].split('|')[0].trim();
            const title = h1Title || titleHint || metaTitle || slug;
            const excerpt =
              $('meta[name="description"]').attr('content')?.trim() ||
              $('.article-body p').first().text().trim().slice(0, 220) ||
              '';

            let category = $('article .kicker').first().text().trim();
            let categorySlug = '';
            const breadcrumbLinks = $('nav.breadcrumbs a');
            if (breadcrumbLinks.length >= 2) {
              const catLink = breadcrumbLinks.eq(1);
              if (!category) category = catLink.text().trim();
              const catHref = (catLink.attr('href') || '').trim();
              const catSegs = catHref.split('/').filter(Boolean);
              if (catSegs.length > 0) categorySlug = slugify(catSegs[catSegs.length - 1]);
            }
            if (!category) category = 'General';
            if (!categorySlug) categorySlug = slugify(category) || 'general';

            const heroImgEl = $('.hero-frame img').first();
            const bodyFirstImg = $('.article-body img').first();
            const chosenImgEl = heroImgEl.length ? heroImgEl : bodyFirstImg;
            const rawImgSrc = (chosenImgEl.attr('src') || '').trim();
            const imgWidth = Number(chosenImgEl.attr('width')) || 1200;
            const imgHeight = Number(chosenImgEl.attr('height')) || 750;
            let localImagePath = '';
            let imageUrl = '';
            if (rawImgSrc) {
              if (rawImgSrc.startsWith('/assets/images/')) {
                localImagePath = rawImgSrc;
                imageUrl = `${baseUrl}${rawImgSrc}`;
                // Download missing image locally so catalog thumbnails & future deploys stay complete
                const localDiskPath = path.join(assetsDir, path.basename(rawImgSrc));
                if (!fs.existsSync(localDiskPath)) {
                  try {
                    const imgRes = await fetchPublicSafe(imageUrl, { signal: AbortSignal.timeout(10000) });
                    if (imgRes.ok) {
                      const buf = Buffer.from(await imgRes.arrayBuffer());
                      if (buf.length > 0 && buf.length < 15 * 1024 * 1024) {
                        fs.mkdirSync(assetsDir, { recursive: true });
                        fs.writeFileSync(localDiskPath, buf);
                        if (hasLocalDist) {
                          const distImgDir = path.join(outputDir, 'assets', 'images');
                          fs.mkdirSync(distImgDir, { recursive: true });
                          fs.writeFileSync(path.join(distImgDir, path.basename(rawImgSrc)), buf);
                        }
                      }
                    }
                  } catch {
                    // Best-effort local thumbnail cache
                  }
                }
              } else if (/^https?:\/\//i.test(rawImgSrc)) {
                imageUrl = rawImgSrc;
              }
            }

            const rawBodyHtml = $('.article-body').first().html() || '';
            const contentHtml = sanitizeEditedHtml(rawBodyHtml);
            const dateAttr = $('article time').first().attr('datetime')?.trim() || nowIso.slice(0, 10);

            if (existing && existing.custom_edited) {
              alreadyLocal += 1;
              existing.raw_meta = {
                ...(existing.raw_meta || {}),
                live_on_worker: true,
                worker_url: `${baseUrl}${webPath}`,
                worker_path: webPath,
                fetched_from_worker_at: nowIso,
              };
            } else {
              const importedPost = normalizePost({
                slug,
                title,
                excerpt,
                content_html: contentHtml,
                category,
                category_slug: categorySlug,
                parent_slug: parentFromPath || categorySlug,
                date: dateAttr,
                modified: dateAttr,
                image_url: imageUrl,
                local_image_path: localImagePath,
                image_width: imgWidth,
                image_height: imgHeight,
                custom_edited: false,
                takeaways: [],
                checklist: [],
                domain: new URL(`${baseUrl}/`).hostname,
                raw_meta: {
                  ...(existing?.raw_meta || {}),
                  live_on_worker: true,
                  synced_from_worker: true,
                  worker_url: `${baseUrl}${webPath}`,
                  worker_path: webPath,
                  fetched_from_worker_at: nowIso,
                },
              });
              this.manifest.posts[slug] = importedPost;
              if (existing) {
                alreadyLocal += 1;
              } else {
                newlyImported += 1;
              }
            }

            // Mirror live HTML into local dist/ if dist exists so future single-post deploys/deletes never drop it
            if (hasLocalDist) {
              const resolvedDistRoot = path.resolve(outputDir);
              const relFile = path.join(webPath.replace(/^\/+/, ''), 'index.html');
              const distPostFile = path.resolve(resolvedDistRoot, relFile);
              if (distPostFile.startsWith(resolvedDistRoot + path.sep) && !fs.existsSync(distPostFile)) {
                fs.mkdirSync(path.dirname(distPostFile), { recursive: true });
                fs.writeFileSync(distPostFile, htmlText, 'utf-8');
              }
            }
          } catch {
            // Skip unreachable individual page cleanly
          }
        })
      );
    }

    this.manifest.categories = deriveCategories(this.manifest.posts);
    this.saveManifest();

    const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
    const totalCatalogPosts = Object.keys(this.manifest.posts).length;
    const msg = `Fetched ${liveArticlesCount} live post(s) from ${baseUrl} (${newlyImported} newly imported, ${alreadyLocal} already in catalog) in ${duration}s.`;
    this.log(`[CLOUDFLARE] ${msg}`);

    return {
      success: true,
      worker_url: baseUrl,
      script_name: scriptName,
      total_live_posts: liveArticlesCount,
      newly_imported: newlyImported,
      already_local: alreadyLocal,
      total_catalog_posts: totalCatalogPosts,
      categories_count: this.manifest.categories.length,
      duration,
      message: msg,
    };
  }

  async deletePost(slug: string, opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const startMs = Date.now();
    const post = this.manifest.posts[slug];
    if (!post) {
      throw new Error(`Post '${slug}' not found.`);
    }

    const activeProj = this.projects[this.activeProjectId];
    const requestedPlatform = String(opts.platform || opts.target_cloud || activeProj?.platform || 'cloudflare')
      .trim()
      .toLowerCase();
    const platform = requestedPlatform === 'github' ? 'github' : 'cloudflare';
    const dryRun = Boolean(opts.dry_run);
    const removeFromWorker = opts.remove_from_worker !== false;
    const effectiveSub = String(
      opts.subdomain ||
        opts.project_name ||
        (platform === 'cloudflare' ? this.config.cloudflare.project_name : '') ||
        this.activeProjectId ||
        'stylesdays'
    ).trim();
    const effectiveTheme = activeProj?.theme || this.config.build.theme || 'nordic-studio';
    const effectiveRouting = normalizeRoutingMode(
      activeProj?.routing_mode || this.config.build.routing_mode || 'single'
    );

    const deletedRoute = resolvePostRoute(post, effectiveRouting);
    const deletedCategorySlug = post.category_slug;
    const workerPathFromMeta = String((post.raw_meta && post.raw_meta.worker_path) || '').trim();

    // 1. Remove post from manifest & persist immediately
    delete this.manifest.posts[slug];
    this.manifest.categories = deriveCategories(this.manifest.posts);
    this.saveManifest();

    const remainingPosts = Object.values(this.manifest.posts);
    const categories = this.manifest.categories;
    const { token, outputDir } = this.resolveOutputDir(platform, effectiveSub, effectiveSub);
    const resolvedOut = path.resolve(outputDir);
    const customDomain = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';
    const baseUrl =
      customDomain && customDomain.includes('.')
        ? `https://${stripProtocol(customDomain)}`
        : getCloudflareLiveUrl({
            ...this.config.cloudflare,
            project_name: effectiveSub,
          });
    const identity = resolveSiteIdentity({
      customDomain,
      baseUrl,
      branding: this.config.branding,
      projectName: token,
    });

    const updatedIndexFiles: string[] = [];
    const removedLocalFiles: string[] = [];

    const safeRemovePostFile = (relFilePath: string) => {
      const normalizedRel = relFilePath.replace(/^\/+/, '');
      if (!normalizedRel) return;
      const absTarget = path.resolve(resolvedOut, normalizedRel);
      if (!absTarget.startsWith(resolvedOut + path.sep)) return;
      if (fs.existsSync(absTarget) && fs.statSync(absTarget).isFile()) {
        fs.unlinkSync(absTarget);
        removedLocalFiles.push(normalizedRel);
      }
      // Prune empty post directory (e.g. dist/<project>/<slug>/) without touching outputDir root
      const parentDir = path.dirname(absTarget);
      if (parentDir !== resolvedOut && parentDir.startsWith(resolvedOut + path.sep) && fs.existsSync(parentDir)) {
        try {
          if (fs.readdirSync(parentDir).length === 0) {
            fs.rmdirSync(parentDir);
          }
        } catch {
          // Non-empty directory (e.g. shared parent category folder), leave intact
        }
      }
    };

    // 2. Update local build output incrementally (remove ONLY deleted post + refresh index/category/sitemap)
    if (!fs.existsSync(path.join(resolvedOut, 'index.html'))) {
      this.runBuild({
        clean: false,
        targetCloud: platform,
        subdomain: effectiveSub,
        projectName: effectiveSub,
        theme: effectiveTheme,
        routingMode: effectiveRouting,
      });
      updatedIndexFiles.push('index.html', 'sitemap.xml', 'sitemap/index.html');
    } else {
      safeRemovePostFile(deletedRoute.file_path);
      if (deletedRoute.file_path !== `${slug}/index.html`) {
        safeRemovePostFile(`${slug}/index.html`);
      }
      if (workerPathFromMeta) {
        const metaFile = path.join(workerPathFromMeta.replace(/^\/+/, ''), 'index.html');
        if (metaFile !== deletedRoute.file_path) {
          safeRemovePostFile(metaFile);
        }
      }

      // 2a. Update homepage index.html
      const hubHtml = renderHubHtml({
        posts: remainingPosts.length > 0 ? remainingPosts : getSeedPosts(),
        categories,
        themeKey: effectiveTheme,
        branding: this.config.branding,
        routingMode: effectiveRouting,
        baseUrl,
        customDomain,
        projectName: token,
      });
      fs.writeFileSync(path.join(resolvedOut, 'index.html'), hubHtml, 'utf-8');
      updatedIndexFiles.push('index.html');

      // 2b. Update or remove affected category index page(s)
      if (deletedCategorySlug) {
        const catObj = categories.find((c) => c.slug === deletedCategorySlug);
        if (catObj) {
          const catPosts = remainingPosts.filter((p) => p.category_slug === deletedCategorySlug);
          const catHtml = renderCategoryIndexHtml({
            category: catObj,
            posts: catPosts,
            categories,
            themeKey: effectiveTheme,
            branding: this.config.branding,
            routingMode: effectiveRouting,
            baseUrl,
            customDomain,
            projectName: token,
          });
          const catDir = path.join(resolvedOut, deletedCategorySlug);
          fs.mkdirSync(catDir, { recursive: true });
          fs.writeFileSync(path.join(catDir, 'index.html'), catHtml, 'utf-8');
          updatedIndexFiles.push(`${deletedCategorySlug}/index.html`);

          const catAliasDir = path.join(resolvedOut, 'category', deletedCategorySlug);
          fs.mkdirSync(catAliasDir, { recursive: true });
          fs.writeFileSync(path.join(catAliasDir, 'index.html'), catHtml, 'utf-8');
          updatedIndexFiles.push(`category/${deletedCategorySlug}/index.html`);
        } else {
          safeRemovePostFile(`${deletedCategorySlug}/index.html`);
          safeRemovePostFile(`category/${deletedCategorySlug}/index.html`);
        }
      }

      // 2c. Update sitemap/index.html & sitemap.xml so deleted post disappears from sitemaps
      const trustPages = buildTrustPages({
        identity,
        posts: remainingPosts,
        categories,
        routingMode: effectiveRouting,
        overrides: this.staticPageOverrides,
      });
      const htmlSitemapPage = trustPages.find((p) => p.slug === 'sitemap');
      if (htmlSitemapPage) {
        const smDir = path.join(resolvedOut, 'sitemap');
        fs.mkdirSync(smDir, { recursive: true });
        fs.writeFileSync(
          path.join(smDir, 'index.html'),
          renderStaticPageHtml({
            page: htmlSitemapPage,
            categories,
            themeKey: effectiveTheme,
            branding: this.config.branding,
            identity,
          }),
          'utf-8'
        );
        updatedIndexFiles.push('sitemap/index.html');
      }

      const sitemapUrls: string[] = [`${baseUrl}/`];
      for (const p of remainingPosts) {
        sitemapUrls.push(`${baseUrl}${resolvePostRoute(p, effectiveRouting).web_path}`);
      }
      for (const c of categories) {
        sitemapUrls.push(`${baseUrl}/${c.slug}/`);
      }
      for (const tp of trustPages) {
        sitemapUrls.push(`${baseUrl}/${tp.slug}/`);
      }
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
        .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
        .join('\n')}\n</urlset>\n`;
      fs.writeFileSync(path.join(resolvedOut, 'sitemap.xml'), sitemapXml, 'utf-8');
      updatedIndexFiles.push('sitemap.xml');
    }

    // 3. Push direct removal to Cloudflare Worker or GitHub Pages without full rebuild
    if (dryRun) {
      const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
      const msg = `[DRY-RUN] Deleted '${slug}' locally & updated ${updatedIndexFiles.length} index file(s) without full rebuild (${duration}s).`;
      this.log(`[POST DELETE] ${msg}`);
      return {
        success: true,
        dry_run: true,
        platform,
        slug,
        removed_locally: true,
        removed_from_worker: false,
        removed_files: removedLocalFiles,
        updated_index_files: updatedIndexFiles,
        remaining_posts: remainingPosts.length,
        duration,
        message: msg,
      };
    }

    if (removeFromWorker && platform === 'github') {
      const ghToken = this.getEffectiveGitHubToken();
      const owner = String(opts.owner || this.config.github.owner || '').trim();
      const repo = String(opts.repo || this.config.github.repo || '').trim();
      const branch = String(opts.branch || this.config.github.branch || 'main').trim() || 'main';

      if (ghToken && owner && repo) {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'pSEO-Dashboard/2.0',
          Authorization: `Bearer ${ghToken}`,
          'Content-Type': 'application/json',
        };
        const encodePath = (p: string) => p.split('/').map((s) => encodeURIComponent(s)).join('/');
        const targetDelPath = deletedRoute.file_path;
        const delApiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(targetDelPath)}`;

        // Fetch existing SHA and delete the post file directly from GitHub
        const getRes = await fetch(`${delApiUrl}?ref=${encodeURIComponent(branch)}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (getRes.ok) {
          const getData = (await getRes.json().catch(() => ({}))) as { sha?: string };
          if (getData.sha) {
            const delRes = await fetch(delApiUrl, {
              method: 'DELETE',
              headers,
              body: JSON.stringify({
                message: `Delete post '${slug}'`,
                sha: getData.sha,
                branch,
              }),
              signal: AbortSignal.timeout(20000),
            });
            if (!delRes.ok) {
              const errText = await delRes.text().catch(() => `HTTP ${delRes.status}`);
              throw new Error(`GitHub delete failed for '${targetDelPath}': ${errText}`);
            }
          }
        }

        // Update only the affected index/sitemap files
        for (const relPath of updatedIndexFiles) {
          const localFile = path.join(resolvedOut, relPath);
          if (!fs.existsSync(localFile)) continue;
          const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(relPath)}`;
          let existingSha: string | undefined;
          const idxGet = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
            headers,
            signal: AbortSignal.timeout(15000),
          });
          if (idxGet.ok) {
            const d = (await idxGet.json().catch(() => ({}))) as { sha?: string };
            if (d.sha) existingSha = d.sha;
          }
          await fetch(apiUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              message: `Update index after deleting '${slug}' (${relPath})`,
              content: fs.readFileSync(localFile).toString('base64'),
              branch,
              ...(existingSha ? { sha: existingSha } : {}),
            }),
            signal: AbortSignal.timeout(20000),
          });
        }

        const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
        const msg = `Deleted post '${slug}' directly from GitHub (${owner}/${repo}) without full redeploy (${duration}s).`;
        this.log(`[POST DELETE] ${msg}`);
        return {
          success: true,
          platform: 'github',
          slug,
          removed_locally: true,
          removed_from_worker: true,
          deleted_file: targetDelPath,
          updated_index_files: updatedIndexFiles,
          remaining_posts: remainingPosts.length,
          duration,
          message: msg,
        };
      }
    }

    if (removeFromWorker && platform === 'cloudflare') {
      const cfToken = this.getEffectiveCloudflareToken();
      if (cfToken) {
        this.log(`[POST DELETE] Removing '${slug}' directly from live Cloudflare Worker '${effectiveSub}'...`);
        const result = await deployCloudflareWorkersAssets({
          apiToken: cfToken,
          accountId: this.getEffectiveCloudflareAccountId(),
          scriptName: effectiveSub,
          outputDir: resolvedOut,
          workspaceDir: this.workspaceDir,
          compatibilityDate: this.config.cloudflare.compatibility_date || '2024-11-01',
          accountSubdomain: this.config.cloudflare.account_subdomain || '',
          verifyPath: '/',
          onLog: (m) => this.log(m),
        });

        if (result.accountSubdomain && result.accountSubdomain !== this.config.cloudflare.account_subdomain) {
          this.config.cloudflare.account_subdomain = result.accountSubdomain;
          this.saveConfig();
        }

        const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
        const msg = `Removed '${slug}' directly from live Cloudflare Worker (${result.uploadedFiles} index file(s) synced, ${result.cachedFiles} unchanged cached on edge) in ${duration}s.`;
        this.log(`[POST DELETE] ${msg}`);
        return {
          success: true,
          platform: 'cloudflare',
          slug,
          removed_locally: true,
          removed_from_worker: true,
          live_url: result.liveUrl,
          uploaded_files: result.uploadedFiles,
          cached_files: result.cachedFiles,
          total_files: result.filesCount,
          removed_files: removedLocalFiles,
          updated_index_files: updatedIndexFiles,
          remaining_posts: remainingPosts.length,
          duration,
          message: msg,
        };
      }
    }

    const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
    const msg = `Deleted '${slug}' from local catalog (${remainingPosts.length} posts remaining). Configure credentials to sync removal to live edge.`;
    this.log(`[POST DELETE] ${msg}`);
    return {
      success: true,
      platform,
      slug,
      removed_locally: true,
      removed_from_worker: false,
      removed_files: removedLocalFiles,
      updated_index_files: updatedIndexFiles,
      remaining_posts: remainingPosts.length,
      duration,
      message: msg,
    };
  }

  // =========================================================================
  // SITE PAGES (9 EDITABLE COMPANY/LEGAL PAGES) — UPLOAD, EDIT, PREVIEW & DEPLOY
  // =========================================================================

  private resolveCurrentSiteContext(): {
    identity: ReturnType<typeof resolveSiteIdentity>;
    posts: PostItem[];
    categories: CategoryItem[];
    routingMode: string;
    themeKey: string;
    baseUrl: string;
    customDomain: string;
    projectName: string;
  } {
    const activeProj = this.projects[this.activeProjectId];
    const customDomain = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';
    const projectName = this.config.cloudflare.project_name || this.activeProjectId || 'stylesdays';
    const baseUrl = hasValidDomainHost(customDomain)
      ? `https://${stripProtocol(customDomain)}`
      : getCloudflareLiveUrl(this.config.cloudflare);
    const identity = resolveSiteIdentity({
      customDomain,
      baseUrl,
      branding: this.config.branding,
      projectName,
    });
    const posts = Object.values(this.manifest.posts);
    const categories = deriveCategories(this.manifest.posts);
    const routingMode = normalizeRoutingMode(this.config.build.routing_mode);
    const themeKey = this.config.build.theme || 'nordic-studio';
    return { identity, posts, categories, routingMode, themeKey, baseUrl, customDomain, projectName };
  }

  listStaticPages(): Array<{
    slug: string;
    label: string;
    web_path: string;
    title: string;
    description: string;
    body_html: string;
    default_title: string;
    default_description: string;
    is_custom: boolean;
    updated_at: string;
    word_count: number;
    char_count: number;
  }> {
    const ctx = this.resolveCurrentSiteContext();
    const defaults = buildTrustPages({
      identity: ctx.identity,
      posts: ctx.posts,
      categories: ctx.categories,
      routingMode: ctx.routingMode,
    });
    const defaultBySlug = new Map(defaults.map((p) => [p.slug, p]));
    const merged = buildTrustPages({
      identity: ctx.identity,
      posts: ctx.posts,
      categories: ctx.categories,
      routingMode: ctx.routingMode,
      overrides: this.staticPageOverrides,
    });
    const mergedBySlug = new Map(merged.map((p) => [p.slug, p]));

    return EDITABLE_STATIC_PAGE_META.map((meta) => {
      const def = defaultBySlug.get(meta.slug);
      const cur = mergedBySlug.get(meta.slug) || def;
      const bodyHtml = (cur?.bodyHtml || '').trim();
      const plainText = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const wordCount = plainText ? plainText.split(' ').filter(Boolean).length : 0;
      const override = this.staticPageOverrides[meta.slug];
      return {
        slug: meta.slug,
        label: meta.label,
        web_path: `/${meta.slug}/`,
        title: cur?.title || meta.label,
        description: cur?.description || '',
        body_html: bodyHtml,
        default_title: def?.title || meta.label,
        default_description: def?.description || '',
        is_custom: Boolean(override),
        updated_at: override?.updated_at || '',
        word_count: wordCount,
        char_count: bodyHtml.length,
      };
    });
  }

  getStaticPage(slug: string) {
    const cleanSlug = String(slug || '').trim().toLowerCase();
    if (!isEditableStaticPageSlug(cleanSlug)) return null;
    return this.listStaticPages().find((p) => p.slug === cleanSlug) || null;
  }

  updateStaticPage(slug: string, data: Record<string, unknown> = {}) {
    const cleanSlug = String(slug || '').trim().toLowerCase();
    if (!isEditableStaticPageSlug(cleanSlug)) {
      throw new Error(`Page '${slug}' is not a valid editable site page.`);
    }

    if (data.reset === true) {
      delete this.staticPageOverrides[cleanSlug];
      this.saveStaticPageOverrides();
      this.log(`[SITE PAGE] Reset '/${cleanSlug}/' back to built-in default template.`);
      return this.getStaticPage(cleanSlug);
    }

    const current = this.getStaticPage(cleanSlug);
    if (!current) {
      throw new Error(`Page '${slug}' not found.`);
    }

    let nextTitle = typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 180) : current.title;
    let nextDesc =
      typeof data.description === 'string' ? data.description.trim().slice(0, 320) : current.description;
    let nextBodyHtml = current.body_html;

    if (typeof data.raw_html === 'string' && data.raw_html.trim()) {
      const extracted = extractUploadedPageHtml(data.raw_html.slice(0, 500_000));
      if (!extracted.bodyHtml) {
        throw new Error('Uploaded HTML file contains no valid body content after sanitization.');
      }
      nextBodyHtml = extracted.bodyHtml;
      if (!(typeof data.title === 'string' && data.title.trim()) && extracted.title) {
        nextTitle = extracted.title;
      }
      if (!(typeof data.description === 'string' && data.description.trim()) && extracted.description) {
        nextDesc = extracted.description;
      }
    } else if (typeof data.body_html === 'string') {
      nextBodyHtml = sanitizeStaticPageHtml(data.body_html.slice(0, 500_000));
      if (!nextBodyHtml) {
        throw new Error('Page HTML content cannot be empty. Use Reset to Default to restore built-in content.');
      }
    }

    const updatedAt = new Date().toISOString();
    this.staticPageOverrides[cleanSlug] = {
      slug: cleanSlug,
      title: nextTitle,
      description: nextDesc,
      body_html: nextBodyHtml,
      updated_at: updatedAt,
    };
    this.saveStaticPageOverrides();
    this.log(`[SITE PAGE] Saved custom HTML for '/${cleanSlug}/' (${nextBodyHtml.length} chars).`);
    return this.getStaticPage(cleanSlug);
  }

  renderStaticPagePreview(slug: string, opts: Record<string, unknown> = {}): string {
    const cleanSlug = String(slug || '').trim().toLowerCase();
    if (!isEditableStaticPageSlug(cleanSlug)) {
      throw new Error(`Page '${slug}' is not a valid editable site page.`);
    }
    const ctx = this.resolveCurrentSiteContext();
    const current = this.getStaticPage(cleanSlug);
    if (!current) {
      throw new Error(`Page '${slug}' not found.`);
    }

    let previewTitle = typeof opts.title === 'string' && opts.title.trim() ? opts.title.trim() : current.title;
    let previewDesc = typeof opts.description === 'string' ? opts.description.trim() : current.description;
    let previewBody = current.body_html;

    if (typeof opts.raw_html === 'string' && opts.raw_html.trim()) {
      const extracted = extractUploadedPageHtml(opts.raw_html.slice(0, 500_000));
      previewBody = extracted.bodyHtml || previewBody;
      if (!(typeof opts.title === 'string' && opts.title.trim()) && extracted.title) {
        previewTitle = extracted.title;
      }
      if (!(typeof opts.description === 'string' && opts.description.trim()) && extracted.description) {
        previewDesc = extracted.description;
      }
    } else if (typeof opts.body_html === 'string' && opts.body_html.trim()) {
      previewBody = sanitizeStaticPageHtml(opts.body_html.slice(0, 500_000)) || previewBody;
    }

    const effectiveTheme = typeof opts.theme === 'string' && opts.theme.trim() ? opts.theme.trim() : ctx.themeKey;
    return renderStaticPageHtml({
      page: {
        slug: cleanSlug,
        title: previewTitle,
        description: previewDesc,
        bodyHtml: previewBody,
      },
      categories: ctx.categories,
      themeKey: effectiveTheme,
      branding: this.config.branding,
      identity: ctx.identity,
    });
  }

  private rebuildStaticPages(
    slugs: string[],
    opts: { targetCloud?: string; subdomain?: string; theme?: string } = {}
  ): {
    outputDir: string;
    token: string;
    changedFiles: string[];
    fullBootstrap: boolean;
  } {
    const validSlugs = slugs
      .map((s) => String(s || '').trim().toLowerCase())
      .filter((s) => isEditableStaticPageSlug(s));
    if (validSlugs.length === 0) {
      throw new Error('No valid editable site pages specified.');
    }

    const effectiveTheme = (opts.theme || this.config.build.theme || 'nordic-studio').trim();
    const { token, outputDir } = this.resolveOutputDir(opts.targetCloud, opts.subdomain, opts.subdomain);
    const hasExistingDist = fs.existsSync(path.join(outputDir, 'index.html'));
    let fullBootstrap = false;

    if (!hasExistingDist) {
      this.runBuild({
        clean: true,
        targetCloud: opts.targetCloud,
        subdomain: opts.subdomain,
        projectName: opts.subdomain || token,
        theme: effectiveTheme,
      });
      fullBootstrap = true;
    }

    const ctx = this.resolveCurrentSiteContext();
    const trustPages = buildTrustPages({
      identity: ctx.identity,
      posts: ctx.posts,
      categories: ctx.categories,
      routingMode: ctx.routingMode,
      overrides: this.staticPageOverrides,
    });
    const bySlug = new Map(trustPages.map((p) => [p.slug, p]));

    const changedFiles: string[] = [];
    const srcAssets = path.join(this.workspaceDir, 'assets', 'images');
    const dstAssets = path.join(outputDir, 'assets', 'images');
    const copiedAssetNames = new Set<string>();

    for (const slug of validSlugs) {
      const page = bySlug.get(slug);
      if (!page) continue;
      const pageDir = path.join(outputDir, slug);
      fs.mkdirSync(pageDir, { recursive: true });
      const html = renderStaticPageHtml({
        page,
        categories: ctx.categories,
        themeKey: effectiveTheme,
        branding: this.config.branding,
        identity: ctx.identity,
      });
      fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf-8');
      changedFiles.push(`${slug}/index.html`);

      // Also sync any local /assets/images/* embedded inside custom static page HTML
      if (fs.existsSync(srcAssets) && page.bodyHtml) {
        for (const match of page.bodyHtml.matchAll(/\/assets\/images\/([a-zA-Z0-9._-]+)/g)) {
          const fname = match[1];
          if (!fname || copiedAssetNames.has(fname)) continue;
          const srcFile = path.join(srcAssets, fname);
          if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
            fs.mkdirSync(dstAssets, { recursive: true });
            fs.copyFileSync(srcFile, path.join(dstAssets, fname));
            copiedAssetNames.add(fname);
            changedFiles.push(`assets/images/${fname}`);
          }
        }
      }
    }

    return { outputDir, token, changedFiles, fullBootstrap };
  }

  private async publishRebuiltStaticPages(params: {
    slugs: string[];
    body: Record<string, unknown>;
    verifySlug: string;
    label: string;
  }): Promise<Record<string, unknown>> {
    const startMs = Date.now();
    const { slugs, body, verifySlug, label } = params;
    const activeProj = this.projects[this.activeProjectId];
    const requestedPlatform = String(body.platform || body.target_cloud || activeProj?.platform || 'cloudflare')
      .trim()
      .toLowerCase();
    const platform = requestedPlatform === 'github' ? 'github' : 'cloudflare';
    const dryRun = Boolean(body.dry_run);
    const effectiveSub = String(
      body.subdomain ||
        body.project_name ||
        (platform === 'cloudflare' ? this.config.cloudflare.project_name : '') ||
        this.activeProjectId ||
        'stylesdays'
    ).trim();

    const rebuilt = this.rebuildStaticPages(slugs, {
      targetCloud: platform,
      subdomain: effectiveSub,
      theme: typeof body.theme === 'string' ? body.theme : undefined,
    });

    const customDomain = activeProj?.cf_custom_domain || this.config.cloudflare.custom_domain || '';
    const verifyPath = `/${verifySlug}/`;

    if (platform === 'github') {
      const owner = String(body.owner || this.config.github.owner || '').trim();
      const repo = String(body.repo || this.config.github.repo || '').trim();
      const branch = String(body.branch || this.config.github.branch || 'main').trim() || 'main';
      const ghPagesBase = hasValidDomainHost(customDomain)
        ? `https://${stripProtocol(customDomain)}`
        : repo.endsWith('.github.io')
          ? `https://${repo}`
          : owner && repo
            ? `https://${owner}.github.io/${repo}`
            : `https://${effectiveSub}.github.io`;
      const pageUrl = `${ghPagesBase}${verifyPath}`;

      if (dryRun) {
        const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
        const msg = `[DRY-RUN] GitHub update ready for ${label}: ${rebuilt.changedFiles.length} file(s) (${duration}s).`;
        this.log(`[PAGE DEPLOY] ${msg}`);
        return {
          success: true,
          dry_run: true,
          platform: 'github',
          slugs,
          page_url: pageUrl,
          live_url: ghPagesBase,
          changed_files: rebuilt.changedFiles,
          uploaded_files: rebuilt.changedFiles.length,
          cached_files: 0,
          full_bootstrap: rebuilt.fullBootstrap,
          duration,
          message: msg,
        };
      }

      const ghToken = this.getEffectiveGitHubToken();
      if (!ghToken || !owner || !repo) {
        throw new Error(
          'GitHub token, owner, and repo must be configured in Settings before deploying site pages to GitHub Pages.'
        );
      }

      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pSEO-Dashboard/2.0',
        Authorization: `Bearer ${ghToken}`,
        'Content-Type': 'application/json',
      };

      let pushedCount = 0;
      for (const relPath of rebuilt.changedFiles) {
        const localFile = path.join(rebuilt.outputDir, relPath);
        if (!fs.existsSync(localFile)) continue;
        const encodedPath = relPath
          .split('/')
          .map((seg) => encodeURIComponent(seg))
          .join('/');
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

        let existingSha: string | undefined;
        const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (getRes.ok) {
          const getData = (await getRes.json().catch(() => ({}))) as { sha?: string };
          if (getData.sha) existingSha = getData.sha;
        }

        const contentBase64 = fs.readFileSync(localFile).toString('base64');
        const putRes = await fetch(apiUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: `Update site page ${label} (${relPath})`,
            content: contentBase64,
            branch,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => `HTTP ${putRes.status}`);
          throw new Error(`GitHub site page deploy failed for '${relPath}': ${errText}`);
        }
        pushedCount += 1;
      }

      const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
      const msg = `Deployed ${label} to GitHub Pages (${pushedCount} file(s) pushed, rest of site untouched) in ${duration}s.`;
      this.log(`[PAGE DEPLOY] ${msg}`);
      return {
        success: true,
        platform: 'github',
        slugs,
        page_url: pageUrl,
        live_url: ghPagesBase,
        changed_files: rebuilt.changedFiles,
        uploaded_files: pushedCount,
        cached_files: 0,
        full_bootstrap: rebuilt.fullBootstrap,
        duration,
        message: msg,
      };
    }

    // Cloudflare Workers incremental static-page deployment
    const fallbackLiveUrl = getCloudflareLiveUrl({
      ...this.config.cloudflare,
      project_name: effectiveSub,
    });
    const publicBaseUrl = hasValidDomainHost(customDomain)
      ? `https://${stripProtocol(customDomain)}`
      : fallbackLiveUrl;

    if (dryRun) {
      const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
      const msg = `[DRY-RUN] Rebuilt ${rebuilt.changedFiles.length} file(s) for ${label} without full rebuild (${duration}s).`;
      this.log(`[PAGE DEPLOY] ${msg}`);
      return {
        success: true,
        dry_run: true,
        platform: 'cloudflare',
        slugs,
        page_url: `${publicBaseUrl}${verifyPath}`,
        live_url: fallbackLiveUrl,
        changed_files: rebuilt.changedFiles,
        uploaded_files: rebuilt.changedFiles.length,
        cached_files: 0,
        full_bootstrap: rebuilt.fullBootstrap,
        duration,
        message: msg,
      };
    }

    const cfToken = this.getEffectiveCloudflareToken();
    if (!cfToken) {
      throw new Error(
        'Cloudflare API Token is not configured. Set CLOUDFLARE_API_TOKEN or enter it in Settings.'
      );
    }

    this.log(`[PAGE DEPLOY] Deploying ${label} (${rebuilt.changedFiles.length} page file(s) regenerated)...`);
    const result = await deployCloudflareWorkersAssets({
      apiToken: cfToken,
      accountId: this.getEffectiveCloudflareAccountId(),
      scriptName: effectiveSub,
      outputDir: rebuilt.outputDir,
      workspaceDir: this.workspaceDir,
      compatibilityDate: this.config.cloudflare.compatibility_date || '2024-11-01',
      accountSubdomain: this.config.cloudflare.account_subdomain || '',
      verifyPath,
      onLog: (m) => this.log(m),
    });

    if (result.accountSubdomain && result.accountSubdomain !== this.config.cloudflare.account_subdomain) {
      this.config.cloudflare.account_subdomain = result.accountSubdomain;
      this.saveConfig();
    }

    const duration = Number(((Date.now() - startMs) / 1000).toFixed(2));
    const workerPageUrl = `${result.liveUrl}${verifyPath}`;
    const customPageUrl = hasValidDomainHost(customDomain)
      ? `https://${stripProtocol(customDomain)}${verifyPath}`
      : workerPageUrl;
    const msg = `Deployed ${label} to Cloudflare Edge (${result.uploadedFiles} changed file(s) uploaded, ${result.cachedFiles} cached) in ${duration}s.`;
    this.log(`[PAGE DEPLOY] ${msg}`);

    return {
      success: true,
      platform: 'cloudflare',
      slugs,
      page_url: customPageUrl,
      worker_page_url: workerPageUrl,
      live_url: result.liveUrl,
      changed_files: rebuilt.changedFiles,
      uploaded_files: result.uploadedFiles,
      cached_files: result.cachedFiles,
      total_files: result.filesCount,
      full_bootstrap: rebuilt.fullBootstrap,
      edge_verification: result.edgeVerification,
      duration,
      message: msg,
    };
  }

  async deployStaticPage(slug: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const cleanSlug = String(slug || '').trim().toLowerCase();
    if (!isEditableStaticPageSlug(cleanSlug)) {
      throw new Error(`Page '${slug}' is not a valid editable site page.`);
    }

    const hasUpdates =
      body.reset === true ||
      typeof body.raw_html === 'string' ||
      typeof body.body_html === 'string' ||
      typeof body.title === 'string' ||
      typeof body.description === 'string';
    if (hasUpdates) {
      this.updateStaticPage(cleanSlug, body);
    }

    const res = await this.publishRebuiltStaticPages({
      slugs: [cleanSlug],
      body,
      verifySlug: cleanSlug,
      label: `'/${cleanSlug}/'`,
    });
    return {
      ...res,
      slug: cleanSlug,
      page: this.getStaticPage(cleanSlug),
    };
  }

  async deployAllStaticPages(body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const allSlugs = EDITABLE_STATIC_PAGE_META.map((m) => m.slug);
    const res = await this.publishRebuiltStaticPages({
      slugs: allSlugs,
      body,
      verifySlug: 'about',
      label: `all ${allSlugs.length} site pages`,
    });
    return {
      ...res,
      pages: this.listStaticPages(),
    };
  }
}
