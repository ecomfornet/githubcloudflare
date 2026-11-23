export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  is_org: boolean;
  base_path: string;
}

export interface CloudflareConfig {
  api_token: string;
  account_id: string;
  account_subdomain: string;
  project_name: string;
  deployment_type: string;
  custom_domain: string;
  compatibility_date: string;
  worker_dir: string;
}

export interface IngestionConfig {
  sitemap_url: string;
  wp_api_url: string;
  max_posts: number;
  download_images: boolean;
}

export interface BuildConfig {
  theme: string;
  routing_mode: string;
  output_dir: string;
}

export interface DashboardConfig {
  host: string;
  port: number;
}

export interface ThemeContentBlock {
  id: string;
  eyebrow?: string;
  title: string;
  body: string;
  image_url: string;
  image_alt?: string;
  layout: 'image-left' | 'image-right';
  position: 'after-hero' | 'before-newsletter' | 'before-footer';
  cta_label?: string;
  cta_url?: string;
}

export interface ThemeCustomizations {
  hero_title?: string;
  hero_subtitle?: string;
  categories_title?: string;
  latest_title?: string;
  newsletter_title?: string;
  newsletter_copy?: string;
  footer_description?: string;
  footer_copyright?: string;
  footer_email?: string;
  content_blocks?: ThemeContentBlock[];
}

export interface BrandingConfig {
  brand_name: string;
  tagline: string;
  logo_path: string;
  author_name: string;
  author_bio: string;
  enable_toc: boolean;
  enable_faq: boolean;
  enable_eeat: boolean;
  social_links: Record<string, string>;
  custom_head_code?: string;
  theme_customizations?: ThemeCustomizations;
}

export interface ProjectItem {
  id: string;
  name: string;
  created_at: string;
  platform: string;
  cf_project_name: string;
  cf_custom_domain: string;
  gh_owner: string;
  gh_repo: string;
  gh_branch: string;
  gh_is_org: boolean;
  gh_base_path: string;
  sitemap_url: string;
  theme: string;
  routing_mode: string;
  manifest_path: string;
  output_dir: string;
  max_posts: number;
  download_images: boolean;
  custom_head_code?: string;
  theme_customizations?: ThemeCustomizations;
}

export interface AppConfig {
  github: GitHubConfig;
  cloudflare: CloudflareConfig;
  ingestion: IngestionConfig;
  build: BuildConfig;
  dashboard: DashboardConfig;
  branding: BrandingConfig;
  active_project: string;
  projects: Record<string, ProjectItem>;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked?: boolean;
}

export interface PostItem {
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  category: string;
  category_slug: string;
  parent_slug: string;
  date: string;
  modified: string;
  image_url: string;
  local_image_path: string;
  image_width: number;
  image_height: number;
  custom_edited: boolean;
  checklist: ChecklistItem[];
  takeaways: string[];
  domain: string;
  raw_meta: Record<string, unknown>;
}

export interface CategoryItem {
  name: string;
  slug: string;
}

export interface StaticPageOverride {
  slug: string;
  title: string;
  description: string;
  body_html: string;
  updated_at: string;
}

export interface Manifest {
  version: string;
  updated_at: string;
  posts: Record<string, PostItem>;
  categories: CategoryItem[];
}

export interface RouteBreadcrumb {
  name: string;
  url: string;
}

export interface RouteResult {
  web_path: string;
  file_path: string;
  depth: number;
  breadcrumbs: RouteBreadcrumb[];
}

export interface DiffCounts {
  new: number;
  updated: number;
  synced: number;
  unchanged?: number;
  total: number;
}

export interface DiffSummary {
  new_posts: PostItem[];
  updated_posts: PostItem[];
  synced_posts: PostItem[];
  unchanged_posts: PostItem[];
  counts: DiffCounts;
}

export interface IngestJob {
  status: 'idle' | 'running' | 'success' | 'error' | 'stopped';
  started_at: string;
  completed_at: string;
  current_post: string;
  processed_count: number;
  total_count: number;
  message: string;
  counts: DiffCounts;
  error: string;
  new_posts: PostItem[];
  updated_posts: PostItem[];
  synced_posts: PostItem[];
}

export interface DeployJob {
  status: 'idle' | 'running' | 'in_progress' | 'success' | 'error' | 'failed';
  stage: string;
  percent: number;
  message: string;
  target: string;
  subdomain: string;
  live_url: string;
  duration: number;
  files_count: number;
  total_files: number;
  deployed_files: number;
  commit_sha: string;
  error: string;
  errors: string[];
  started_at: string;
  completed_at: string;
  edge_verification: Record<string, unknown>;
  output: string;
}

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

export function stripProtocol(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim();
}

export function deriveBrandFromDomain(domain: string, workerName = ''): string {
  const clean = stripProtocol(domain).split('/')[0] || '';
  const host = clean.replace(/^www\./i, '');
  const primary = (host.split('.')[0] || workerName || 'Atelier Maison').trim();
  if (!primary) return 'Atelier Maison';
  return primary
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getCloudflareLiveUrl(cf: CloudflareConfig): string {
  const proj = (cf.project_name || 'worker').trim().toLowerCase();
  if (cf.deployment_type === 'pages') {
    return `https://${proj}.pages.dev`;
  }
  if (cf.account_subdomain) {
    return `https://${proj}.${cf.account_subdomain.trim().toLowerCase()}.workers.dev`;
  }
  return `https://${proj}.workers.dev`;
}

export function normalizeRoutingMode(
  mode?: string
): 'single' | 'category_slug' | 'parent_slug' | 'silo_nested' | 'pseo_nested_silo' {
  const m = String(mode || 'single').trim().toLowerCase();
  if (m === 'category_slug' || m === 'category') return 'category_slug';
  if (m === 'parent_slug' || m === 'parent') return 'parent_slug';
  if (m === 'silo_nested' || m === 'silo') return 'silo_nested';
  if (m === 'pseo_nested_silo' || m === 'pseo_silo' || m === 'blog_slug') return 'pseo_nested_silo';
  return 'single';
}

function sanitizeSafeBlockUrl(raw: unknown, allowRelative = true): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^(javascript|vbscript|data):/i.test(s)) return '';
  if (allowRelative && (s.startsWith('/') || s.startsWith('#'))) {
    if (s.startsWith('//')) return '';
    return s.slice(0, 600);
  }
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString().slice(0, 600);
    } catch {
      return '';
    }
  }
  return '';
}

export function normalizeThemeCustomizations(raw?: unknown): ThemeCustomizations {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const cleanStr = (v: unknown, maxLen: number): string =>
    typeof v === 'string' ? v.trim().slice(0, maxLen) : '';

  const out: ThemeCustomizations = {};
  const heroTitle = cleanStr(obj.hero_title, 220);
  const heroSubtitle = cleanStr(obj.hero_subtitle, 600);
  const categoriesTitle = cleanStr(obj.categories_title, 120);
  const latestTitle = cleanStr(obj.latest_title, 120);
  const newsletterTitle = cleanStr(obj.newsletter_title, 180);
  const newsletterCopy = cleanStr(obj.newsletter_copy, 420);
  const footerDescription = cleanStr(obj.footer_description, 500);
  const footerCopyright = cleanStr(obj.footer_copyright, 220);
  const footerEmail = cleanStr(obj.footer_email, 160);

  if (heroTitle) out.hero_title = heroTitle;
  if (heroSubtitle) out.hero_subtitle = heroSubtitle;
  if (categoriesTitle) out.categories_title = categoriesTitle;
  if (latestTitle) out.latest_title = latestTitle;
  if (newsletterTitle) out.newsletter_title = newsletterTitle;
  if (newsletterCopy) out.newsletter_copy = newsletterCopy;
  if (footerDescription) out.footer_description = footerDescription;
  if (footerCopyright) out.footer_copyright = footerCopyright;
  if (footerEmail) out.footer_email = footerEmail;

  if (Array.isArray(obj.content_blocks)) {
    const blocks: ThemeContentBlock[] = [];
    for (let i = 0; i < Math.min(obj.content_blocks.length, 12); i += 1) {
      const item = obj.content_blocks[i];
      if (!item || typeof item !== 'object') continue;
      const b = item as Record<string, unknown>;
      const title = cleanStr(b.title, 200);
      const body = cleanStr(b.body, 2500);
      const imageUrl = sanitizeSafeBlockUrl(b.image_url, true);
      if (!title && !body && !imageUrl) continue;

      const rawId = cleanStr(b.id, 64).replace(/[^a-zA-Z0-9_-]/g, '');
      const layout = b.layout === 'image-right' ? 'image-right' : 'image-left';
      const posRaw = String(b.position || 'after-hero').trim();
      const position: ThemeContentBlock['position'] =
        posRaw === 'before-newsletter' || posRaw === 'before-footer' ? posRaw : 'after-hero';
      const eyebrow = cleanStr(b.eyebrow, 80);
      const imageAlt = cleanStr(b.image_alt, 180);
      const ctaLabel = cleanStr(b.cta_label, 80);
      const ctaUrl = sanitizeSafeBlockUrl(b.cta_url, true);

      blocks.push({
        id: rawId || `block-${i + 1}`,
        ...(eyebrow ? { eyebrow } : {}),
        title,
        body,
        image_url: imageUrl,
        ...(imageAlt ? { image_alt: imageAlt } : {}),
        layout,
        position,
        ...(ctaLabel ? { cta_label: ctaLabel } : {}),
        ...(ctaUrl ? { cta_url: ctaUrl } : {}),
      });
    }
    if (blocks.length > 0) {
      out.content_blocks = blocks;
    }
  }

  return out;
}

export function resolvePostRoute(
  post: Pick<PostItem, 'slug' | 'title' | 'category' | 'category_slug' | 'parent_slug'>,
  routingMode = 'single',
  basePath = ''
): RouteResult {
  const mode = normalizeRoutingMode(routingMode);
  const prefix = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';
  const slug = slugify(post.slug || post.title || 'guide');
  const catSlug = slugify(post.category_slug || post.category || 'guides');
  const parentSlug = slugify(post.parent_slug || catSlug || 'guides');

  const breadcrumbs: RouteBreadcrumb[] = [{ name: 'Home', url: `${prefix}/` }];
  let segments: string[];

  if (mode === 'category_slug') {
    segments = [catSlug, slug];
    breadcrumbs.push({ name: post.category || catSlug, url: `${prefix}/${catSlug}/` });
  } else if (mode === 'parent_slug') {
    segments = [parentSlug, slug];
    breadcrumbs.push({ name: post.category || parentSlug, url: `${prefix}/${parentSlug}/` });
  } else if (mode === 'silo_nested') {
    segments = ['guides', catSlug, slug];
    breadcrumbs.push({ name: 'Guides', url: `${prefix}/guides/` });
    breadcrumbs.push({ name: post.category || catSlug, url: `${prefix}/guides/${catSlug}/` });
  } else if (mode === 'pseo_nested_silo') {
    segments = ['blog', slug];
    breadcrumbs.push({ name: post.category || catSlug, url: `${prefix}/category/${catSlug}/` });
  } else {
    segments = [slug];
  }

  const relPath = segments.join('/');
  const webPath = `${prefix}/${relPath}/`;
  breadcrumbs.push({ name: post.title || slug, url: webPath });

  return {
    web_path: webPath,
    file_path: `${relPath}/index.html`,
    depth: segments.length,
    breadcrumbs,
  };
}

export function deriveCategories(posts: Record<string, PostItem>): CategoryItem[] {
  const seen = new Set<string>();
  const list: CategoryItem[] = [];
  for (const post of Object.values(posts)) {
    const name = (post.category || '').trim();
    const slug = (post.category_slug || slugify(name)).trim();
    if (name && slug && !seen.has(slug)) {
      seen.add(slug);
      list.push({ name, slug });
    }
  }
  return list;
}

export function createDefaultConfig(): AppConfig {
  return {
    github: {
      token: process.env.GITHUB_TOKEN || '',
      owner: process.env.GITHUB_OWNER || process.env.GITHUB_ORG || '',
      repo: process.env.GITHUB_REPO || '',
      branch: process.env.GITHUB_BRANCH || 'main',
      is_org: (process.env.GITHUB_IS_ORG || 'true').toLowerCase() !== 'false',
      base_path: process.env.GITHUB_BASE_PATH || '',
    },
    cloudflare: {
      api_token: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '',
      account_id: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '',
      account_subdomain: process.env.CLOUDFLARE_ACCOUNT_SUBDOMAIN || process.env.CLOUDFLARE_SUBDOMAIN || '',
      project_name: process.env.CLOUDFLARE_PROJECT_NAME || process.env.CF_PROJECT_NAME || 'stylesdays',
      deployment_type: process.env.CLOUDFLARE_DEPLOYMENT_TYPE || 'workers_assets',
      custom_domain: process.env.CLOUDFLARE_CUSTOM_DOMAIN || '',
      compatibility_date: '2024-11-01',
      worker_dir: 'my-worker',
    },
    ingestion: {
      sitemap_url: process.env.SITEMAP_URL || '',
      wp_api_url: process.env.WP_API_URL || process.env.WP_DOMAIN || '',
      max_posts: Number(process.env.MAX_POSTS || 100) || 100,
      download_images: (process.env.DOWNLOAD_IMAGES || 'true').toLowerCase() !== 'false',
    },
    build: {
      theme: process.env.THEME || 'nordic-studio',
      routing_mode: process.env.ROUTING_MODE || 'single',
      output_dir: process.env.OUTPUT_DIR || 'dist',
    },
    dashboard: {
      host: process.env.HOST || '0.0.0.0',
      port: Number(process.env.PORT || 3000) || 3000,
    },
    branding: {
      brand_name: process.env.BRAND_NAME || 'Atelier Maison',
      tagline: process.env.BRAND_TAGLINE || 'Interior Design & Curated Living',
      logo_path: process.env.BRAND_LOGO_PATH || '',
      author_name: 'Anna Lindqvist',
      author_bio: 'Senior Interior Architect & Kinfolk Stylist',
      enable_toc: true,
      enable_faq: true,
      enable_eeat: true,
      social_links: {
        pinterest: '',
        facebook: '',
        instagram: '',
        twitter: '',
        tiktok: '',
        youtube: '',
      },
      custom_head_code: '',
    },
    active_project: 'stylesdays',
    projects: {},
  };
}

export function normalizePost(data: Partial<PostItem> & Record<string, unknown>, fallbackSlug = ''): PostItem {
  const title = String(data.title || '').trim();
  const slug = String(data.slug || fallbackSlug || slugify(title)).trim();
  const category = String(data.category || 'Home Decor').trim();
  const categorySlug = String(data.category_slug || slugify(category)).trim();
  const today = new Date().toISOString().slice(0, 10);
  const rawChecklist = Array.isArray(data.checklist) ? data.checklist : [];
  const checklist: ChecklistItem[] = rawChecklist.map((item, idx) => {
    if (typeof item === 'string') {
      return { id: `${slug}-step-${idx + 1}`, text: item };
    }
    const rec = item as unknown as Record<string, unknown>;
    return {
      id: String(rec.id || `${slug}-step-${idx + 1}`),
      text: String(rec.text || ''),
      checked: Boolean(rec.checked),
    };
  }).filter((c) => c.text);

  const rawTakeaways = Array.isArray(data.takeaways) ? data.takeaways : [];
  const takeaways = rawTakeaways.map((t) => String(t).trim()).filter(Boolean);

  return {
    slug,
    title: title || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    excerpt: String(data.excerpt || data.description || '').trim(),
    content_html: String(data.content_html || data.content || '').trim(),
    category,
    category_slug: categorySlug,
    parent_slug: String(data.parent_slug || categorySlug).trim(),
    date: String(data.date || data.published || today),
    modified: String(data.modified || data.lastmod || data.date || today),
    image_url: String(data.image_url || data.image || data.featured_image || '').trim(),
    local_image_path: String(data.local_image_path || data.local_image || '').trim(),
    image_width: Number(data.image_width || data.width || 1200) || 1200,
    image_height: Number(data.image_height || data.height || 750) || 750,
    custom_edited: Boolean(data.custom_edited),
    checklist,
    takeaways,
    domain: String(data.domain || '').trim(),
    raw_meta: (data.raw_meta && typeof data.raw_meta === 'object' ? (data.raw_meta as Record<string, unknown>) : {}),
  };
}
