import fs from 'node:fs';
import path from 'node:path';
import { isValidSpaceId } from './auth-store.ts';
import { DashboardStore } from './store.ts';

export interface SpaceStats {
  space_id: string;
  projects_count: number;
  posts_count: number;
  active_project: string;
  active_theme: string;
  platform: string;
}

export class WorkspacePool {
  private readonly rootDir: string;
  private readonly workspacesRoot: string;
  private readonly stores = new Map<string, DashboardStore>();

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.workspacesRoot = path.resolve(this.rootDir, 'workspaces');
    fs.mkdirSync(this.workspacesRoot, { recursive: true });
  }

  resolveSpaceDir(spaceId: string): string {
    const clean = String(spaceId || '').trim();
    if (!isValidSpaceId(clean)) {
      throw new Error(`Invalid space identifier '${clean}'.`);
    }
    const resolved = path.resolve(this.workspacesRoot, clean);
    if (!resolved.startsWith(this.workspacesRoot + path.sep)) {
      throw new Error('Blocked path traversal outside workspaces directory.');
    }
    return resolved;
  }

  resolveSpaceAssetsDir(spaceId: string): string {
    const spaceDir = this.resolveSpaceDir(spaceId);
    const assetsDir = path.resolve(spaceDir, 'assets');
    if (!assetsDir.startsWith(spaceDir + path.sep)) {
      throw new Error('Blocked invalid assets directory path.');
    }
    return assetsDir;
  }

  seedFirstAdminSpaceFromLegacyRoot(spaceId: string): void {
    const spaceDir = this.resolveSpaceDir(spaceId);
    fs.mkdirSync(spaceDir, { recursive: true });

    const targetConfig = path.join(spaceDir, 'pseo_config.json');
    if (fs.existsSync(targetConfig)) return;

    const legacyConfig = path.join(this.rootDir, 'pseo_config.json');
    if (fs.existsSync(legacyConfig)) {
      try {
        fs.copyFileSync(legacyConfig, targetConfig);
      } catch {
        // ignore copy errors and start fresh
      }
    }

    const legacyScraped = path.join(this.rootDir, 'scraped_data');
    const targetScraped = path.join(spaceDir, 'scraped_data');
    if (fs.existsSync(legacyScraped) && !fs.existsSync(targetScraped)) {
      try {
        fs.cpSync(legacyScraped, targetScraped, { recursive: true });
      } catch {
        // ignore copy errors
      }
    }

    const legacyImages = path.join(this.rootDir, 'assets', 'images');
    const targetImages = path.join(spaceDir, 'assets', 'images');
    if (fs.existsSync(legacyImages) && !fs.existsSync(targetImages)) {
      try {
        fs.mkdirSync(path.dirname(targetImages), { recursive: true });
        fs.cpSync(legacyImages, targetImages, { recursive: true });
      } catch {
        // ignore copy errors
      }
    }
  }

  getStore(spaceId: string): DashboardStore {
    const clean = String(spaceId || '').trim();
    const existing = this.stores.get(clean);
    if (existing) return existing;

    const spaceDir = this.resolveSpaceDir(clean);
    fs.mkdirSync(spaceDir, { recursive: true });
    const store = new DashboardStore({ workspaceDir: spaceDir });
    this.stores.set(clean, store);
    return store;
  }

  getSpaceStats(spaceId: string): SpaceStats {
    const store = this.getStore(spaceId);
    const projects = Object.values(store.projects);
    let totalPosts = Object.keys(store.manifest.posts || {}).length;
    if (projects.length > 1) {
      totalPosts = 0;
      for (const proj of projects) {
        const mf = path.join(store.workspaceDir, 'scraped_data', proj.id, 'manifest.json');
        if (proj.id === store.activeProjectId) {
          totalPosts += Object.keys(store.manifest.posts || {}).length;
        } else if (fs.existsSync(mf)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(mf, 'utf-8')) as { posts?: Record<string, unknown> };
            totalPosts += Object.keys(parsed.posts || {}).length;
          } catch {
            // ignore unreadable manifest
          }
        }
      }
    }
    const activeProj = store.projects[store.activeProjectId];
    return {
      space_id: spaceId,
      projects_count: projects.length,
      posts_count: totalPosts,
      active_project: store.activeProjectId,
      active_theme: store.config.build.theme || 'nordic-studio',
      platform: activeProj?.platform || 'cloudflare',
    };
  }

  deleteSpace(spaceId: string): void {
    const clean = String(spaceId || '').trim();
    this.stores.delete(clean);
    const spaceDir = this.resolveSpaceDir(clean);
    if (fs.existsSync(spaceDir)) {
      fs.rmSync(spaceDir, { recursive: true, force: true });
    }
  }
}

/**
 * Rewrites /assets/images/ references inside live-preview HTML to the
 * authenticated user's isolated /spaces/<spaceId>/assets/images/ endpoint
 * without affecting static builds written to dist/.
 */
export function rewritePreviewAssetsForSpace(html: string, spaceId: string): string {
  if (!html || !isValidSpaceId(spaceId)) return html;
  return html.replace(/(["'(])\/assets\//g, `$1/spaces/${spaceId}/assets/`);
}
