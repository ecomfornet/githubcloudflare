import type { BrandingConfig, CategoryItem, PostItem } from './types.ts';
import { resolvePostRoute } from './types.ts';
import type { SiteIdentity, StaticPageSpec } from './static-pages.ts';
import { resolveSiteIdentity } from './static-pages.ts';

export interface ThemeTokens {
  id: string;
  name: string;
  bg_body: string;
  text_body: string;
  accent: string;
  accent_hover: string;
  secondary_accent: string;
  card_bg: string;
  card_border: string;
  checkbox_bg: string;
  badge_bg: string;
  font_headline: string;
  font_body: string;
  header_bg: string;
  muted_text: string;
  tag_bg: string;
}

export const THEMES: Record<string, ThemeTokens> = {
  'editorial-warm': {
    id: 'editorial-warm',
    name: 'Editorial Warm (Kinfolk Journal)',
    bg_body: '#FFFFFF',
    text_body: '#1C1917',
    accent: '#C2410C',
    accent_hover: '#9A3412',
    secondary_accent: '#E60023',
    card_bg: '#FFFFFF',
    card_border: '#E7E2DA',
    checkbox_bg: '#F8F5F0',
    badge_bg: '#15803D',
    font_headline: "'Playfair Display', 'Playfair Fallback', Georgia, serif",
    font_body: "'Plus Jakarta Sans', 'Jakarta Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    header_bg: '#FFFFFF',
    muted_text: '#57534E',
    tag_bg: '#FAF8F5',
  },
  'nordic-studio': {
    id: 'nordic-studio',
    name: 'The Nordroom (Scandinavian Minimalist)',
    bg_body: '#FFFFFF',
    text_body: '#1C1C1C',
    accent: '#8C6D53',
    accent_hover: '#6E523B',
    secondary_accent: '#8C6D53',
    card_bg: '#FFFFFF',
    card_border: '#E9E7E2',
    checkbox_bg: '#F7F5F2',
    badge_bg: '#8C6D53',
    font_headline: "'Cormorant Garamond', 'Cormorant Fallback', Georgia, serif",
    font_body: "'Plus Jakarta Sans', 'Jakarta Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    header_bg: '#FFFFFF',
    muted_text: '#62615E',
    tag_bg: '#FBFBFA',
  },
  'pinterest-mag': {
    id: 'pinterest-mag',
    name: 'Botanical Atelier (Forest & Gold Magazine)',
    bg_body: '#F3F5F1',
    text_body: '#13221D',
    accent: '#1B4D3E',
    accent_hover: '#0F2A22',
    secondary_accent: '#C89B54',
    card_bg: '#FFFFFF',
    card_border: '#D8E0D8',
    checkbox_bg: '#EAEFE9',
    badge_bg: '#0F2A22',
    font_headline: "'Fraunces', 'Fraunces Fallback', Georgia, serif",
    font_body: "'DM Sans', 'DMSans Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    header_bg: '#0F2A22',
    muted_text: '#475851',
    tag_bg: '#EAEFE9',
  },
};

export function getThemeTokens(themeKey = 'editorial-warm'): ThemeTokens {
  if (themeKey === 'styleire') return THEMES['pinterest-mag'];
  return THEMES[themeKey] || THEMES['editorial-warm'];
}

export function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateSvgFallback(title: string, category: string, accent = '#8C6D53'): string {
  const words = String(title || 'Editorial Guide').trim().split(/\s+/);
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= 32) {
      line1 = (line1 + ' ' + w).trim();
    } else if ((line2 + ' ' + w).trim().length <= 32) {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  const safeLine1 = escapeHtml(line1 || 'Editorial Guide');
  const safeLine2 = escapeHtml(line2);
  const safeCat = escapeHtml(category || 'INTERIOR DESIGN').toUpperCase().slice(0, 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" width="1200" height="750">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F6F3EE"/>
      <stop offset="100%" stop-color="#E7E0D5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="750" fill="url(#bg)"/>
  <rect x="64" y="64" width="1072" height="622" fill="none" stroke="${escapeHtml(accent)}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="110" y="160" fill="${escapeHtml(accent)}" font-family="Georgia, serif" font-size="22" letter-spacing="6">${safeCat}</text>
  <text x="110" y="340" fill="#1C1917" font-family="Georgia, serif" font-size="42" font-weight="700">${safeLine1}</text>
  ${safeLine2 ? `<text x="110" y="398" fill="#1C1917" font-family="Georgia, serif" font-size="42" font-weight="700">${safeLine2}</text>` : ''}
  <line x1="110" y1="450" x2="260" y2="450" stroke="${escapeHtml(accent)}" stroke-width="4"/>
  <text x="110" y="515" fill="#78716C" font-family="sans-serif" font-size="22">Curated Editorial Guide &amp; Design Inspiration</text>
</svg>`;
}

function buildInlineSvgDataUri(title: string, category: string, accent: string): string {
  const svg = generateSvgFallback(title, category, accent);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveImageSrc(post: PostItem, accent: string): string {
  const raw = (post.local_image_path || post.image_url || '').trim();
  if (!raw) return buildInlineSvgDataUri(post.title, post.category, accent);
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

const SOCIAL_PLATFORMS: Array<{ key: string; label: string; svg: string }> = [
  {
    key: 'pinterest',
    label: 'Pinterest',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.017 2C6.486 2 2 6.486 2 12.017c0 4.24 2.636 7.865 6.357 9.323-.088-.792-.167-2.008.035-2.872.182-.78 1.175-4.978 1.175-4.978s-.3-.6-.3-1.487c0-1.393.808-2.433 1.813-2.433.855 0 1.268.642 1.268 1.412 0 .86-.548 2.146-.831 3.338-.236.998.5 1.812 1.484 1.812 1.782 0 3.151-1.878 3.151-4.588 0-2.399-1.724-4.076-4.186-4.076-2.851 0-4.525 2.139-4.525 4.35 0 .861.331 1.785.746 2.287.082.099.094.186.07.287-.076.316-.245.998-.278 1.138-.044.183-.146.222-.337.134-1.258-.586-2.044-2.423-2.044-3.9 0-3.175 2.307-6.091 6.652-6.091 3.492 0 6.206 2.488 6.206 5.814 0 3.47-2.187 6.262-5.223 6.262-1.02 0-1.979-.53-2.308-1.156l-.628 2.393c-.227.875-.842 1.972-1.253 2.641.944.292 1.945.45 2.984.45 5.531 0 10.017-4.486 10.017-10.017C22.034 6.486 17.548 2 12.017 2z"/></svg>',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.325C24 .593 23.407 0 22.675 0z"/></svg>',
  },
  {
    key: 'twitter',
    label: 'X / Twitter',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  },
];

function sanitizeSocialHref(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function getActiveSocialLinks(socialLinks?: Record<string, string>): Array<{ key: string; label: string; href: string; svg: string }> {
  if (!socialLinks || typeof socialLinks !== 'object') return [];
  const active: Array<{ key: string; label: string; href: string; svg: string }> = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const href = sanitizeSocialHref(socialLinks[platform.key] || '');
    if (!href) continue;
    active.push({ key: platform.key, label: platform.label, href, svg: platform.svg });
  }
  return active;
}

function renderTopSocialLinksHtml(socialLinks?: Record<string, string>): string {
  const active = getActiveSocialLinks(socialLinks);
  if (active.length === 0) return '';
  const items = active
    .map(
      (p) =>
        `<a class="social-link" href="${escapeHtml(p.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(p.label)}" title="${escapeHtml(p.label)}">${p.svg}</a>`
    )
    .join('');
  return `<div class="social-links" aria-label="Social Media">${items}</div>`;
}

function renderFooterSocialLinksHtml(socialLinks?: Record<string, string>): string {
  const active = getActiveSocialLinks(socialLinks);
  if (active.length === 0) return '';
  const items = active
    .map(
      (p) =>
        `<a class="footer-social-link" href="${escapeHtml(p.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(p.label)}">${p.svg}<span>${escapeHtml(p.label)}</span></a>`
    )
    .join('');
  return `<div class="footer-socials" aria-label="Follow Us">${items}</div>`;
}

function getThemeFontStylesheetUrl(theme: ThemeTokens): string {
  if (theme.id === 'pinterest-mag') {
    return 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap';
  }
  const headlineFamily =
    theme.id === 'nordic-studio'
      ? 'Cormorant+Garamond:wght@600;700'
      : 'Playfair+Display:wght@600;700';
  return `https://fonts.googleapis.com/css2?family=${headlineFamily}&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap`;
}

/**
 * Extracts real H2/H3 section headings from article HTML and injects stable anchor IDs
 * so the Model 3 sticky "In This Guide" sidebar links accurately to real sections.
 */
export function extractArticleTocAndAnchors(contentHtml: string): {
  html: string;
  headings: Array<{ id: string; text: string; num: string }>;
} {
  const headings: Array<{ id: string; text: string; num: string }> = [];
  let idx = 0;
  const html = String(contentHtml || '').replace(
    /<(h2|h3)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (fullMatch, tag: string, attrs: string, inner: string) => {
      const plainText = inner
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!plainText || plainText.length < 3 || headings.length >= 8) {
        return fullMatch;
      }
      idx += 1;
      const num = String(idx).padStart(2, '0');
      const existingIdMatch = attrs.match(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
      const id = existingIdMatch ? (existingIdMatch[1] || existingIdMatch[2]) : `guide-section-${idx}`;
      headings.push({ id, text: plainText.slice(0, 72), num });
      if (existingIdMatch) return fullMatch;
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    }
  );
  return { html, headings };
}

/**
 * Formats site-owner custom <head> code (Google Analytics, verification meta tags, etc.)
 * safely for injection inside <head>...</head>, preventing premature </head> or <body> breakout.
 */
export function renderCustomHeadCode(rawCode?: string): string {
  const trimmed = String(rawCode || '').trim();
  if (!trimmed) return '';
  const safe = trimmed
    .replace(/<\/head\s*>/gi, '')
    .replace(/<body\b[^>]*>/gi, '')
    .replace(/<\/body\s*>/gi, '')
    .replace(/<\/html\s*>/gi, '')
    .trim();
  if (!safe) return '';
  const indented = safe
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
  return `\n  <!-- Custom Header Code -->\n${indented}\n  <!-- /Custom Header Code -->`;
}

function renderLcpPreloadLink(imgSrc: string): string {
  const clean = String(imgSrc || '').trim();
  if (!clean || clean.startsWith('data:')) return '';
  return `<link rel="preload" as="image" href="${escapeHtml(clean)}" fetchpriority="high" />`;
}

/**
 * When an article's featured image is embedded directly inside content_html (no separate hero-frame),
 * promotes the very first inline <img> to an eager, high-priority LCP image and returns its src for <link rel="preload">.
 */
export function promoteFirstBodyImageToLcp(contentHtml: string): { html: string; lcpSrc: string } {
  let lcpSrc = '';
  let promoted = false;
  const html = String(contentHtml || '').replace(/<img\b([^>]*)>/i, (fullMatch, rawAttrs: string) => {
    if (promoted) return fullMatch;
    promoted = true;
    const srcMatch = rawAttrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (srcMatch) lcpSrc = (srcMatch[1] || srcMatch[2] || '').trim();
    let attrs = rawAttrs
      .replace(/\s*\bloading\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*\bfetchpriority\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*\bdecoding\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s*\/\s*$/, '')
      .trim();
    return `<img ${attrs} fetchpriority="high" decoding="async" />`;
  });
  return { html, lcpSrc };
}

function renderBaseStyles(theme: ThemeTokens, lcpPreloadSrc = ''): string {
  const fontUrl = getThemeFontStylesheetUrl(theme);
  const preloadTag = renderLcpPreloadLink(lcpPreloadSrc);
  const fontFallbackCss =
    theme.id === 'pinterest-mag'
      ? `    @font-face {
      font-family: 'Fraunces Fallback';
      src: local('Georgia'), local('Times New Roman');
      ascent-override: 95%;
      descent-override: 24%;
      line-gap-override: 0%;
      size-adjust: 104%;
    }
    @font-face {
      font-family: 'DMSans Fallback';
      src: local('Arial'), local('Helvetica Neue'), local('Roboto');
      ascent-override: 95%;
      descent-override: 24%;
      line-gap-override: 0%;
      size-adjust: 100%;
    }`
      : theme.id === 'nordic-studio'
        ? `    @font-face {
      font-family: 'Cormorant Fallback';
      src: local('Georgia'), local('Times New Roman');
      ascent-override: 94%;
      descent-override: 24%;
      line-gap-override: 0%;
      size-adjust: 100%;
    }
    @font-face {
      font-family: 'Jakarta Fallback';
      src: local('Arial'), local('Helvetica Neue'), local('Roboto');
      ascent-override: 96%;
      descent-override: 25%;
      line-gap-override: 0%;
      size-adjust: 101%;
    }`
        : `    @font-face {
      font-family: 'Playfair Fallback';
      src: local('Georgia'), local('Times New Roman');
      ascent-override: 96%;
      descent-override: 24%;
      line-gap-override: 0%;
      size-adjust: 105%;
    }
    @font-face {
      font-family: 'Jakarta Fallback';
      src: local('Arial'), local('Helvetica Neue'), local('Roboto');
      ascent-override: 96%;
      descent-override: 25%;
      line-gap-override: 0%;
      size-adjust: 101%;
    }`;
  return `
  ${preloadTag}
  <link rel="stylesheet" href="${fontUrl}" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="${fontUrl}" /></noscript>
  <style>
${fontFallbackCss}
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: ${theme.bg_body};
      color: ${theme.text_body};
      font-family: ${theme.font_body};
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; height: auto; }

    /* ---- Two-Tier Editorial Header (decohome.homeandrecipe.com architecture) ---- */
    .site-header {
      background: ${theme.header_bg};
      border-bottom: 1px solid ${theme.card_border};
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .header-top-bar {
      background: ${theme.tag_bg};
      border-bottom: 1px solid ${theme.card_border};
      font-size: 0.78rem;
      color: ${theme.muted_text};
    }
    .header-top-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0.42rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.9rem;
    }
    .top-bar-contact {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 500;
      color: ${theme.muted_text};
      transition: color 0.16s ease;
    }
    .top-bar-contact:hover { color: ${theme.accent}; }
    .top-bar-contact svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
    }
    .social-links {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding-right: 0.9rem;
      border-right: 1px solid ${theme.card_border};
    }
    .social-link {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: ${theme.muted_text};
      background: ${theme.header_bg};
      border: 1px solid ${theme.card_border};
      transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease;
    }
    .social-link:hover {
      color: #FFFFFF;
      background: ${theme.accent};
      border-color: ${theme.accent};
    }
    .social-link svg {
      width: 13px;
      height: 13px;
      display: block;
      fill: currentColor;
    }

    .header-main-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0.95rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
    }
    .brand-link {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-family: ${theme.font_headline};
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: ${theme.text_body};
      flex-shrink: 0;
    }
    .brand-logo-img {
      height: 38px;
      max-width: 190px;
      object-fit: contain;
      display: block;
    }
    .nav-links {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.65rem;
      font-size: 0.88rem;
      font-weight: 500;
      color: ${theme.muted_text};
      flex: 1;
      flex-wrap: wrap;
    }
    .nav-links a {
      padding: 0.2rem 0;
      transition: color 0.16s ease;
      white-space: nowrap;
    }
    .nav-links a:hover { color: ${theme.text_body}; }
    .header-about-link {
      font-size: 0.86rem;
      font-weight: 500;
      color: ${theme.muted_text};
      flex-shrink: 0;
      transition: color 0.16s ease;
    }
    .header-about-link:hover { color: ${theme.accent}; }

    .mobile-cat-strip {
      display: none;
      border-top: 1px solid ${theme.card_border};
      padding: 0.55rem 1.25rem;
      overflow-x: auto;
      gap: 1.1rem;
      white-space: nowrap;
      scrollbar-width: none;
      background: ${theme.header_bg};
    }
    .mobile-cat-strip::-webkit-scrollbar { display: none; }
    .mobile-cat-strip a {
      font-size: 0.82rem;
      font-weight: 500;
      color: ${theme.muted_text};
      flex-shrink: 0;
    }
    .mobile-cat-strip a:hover { color: ${theme.accent}; }

    @media (max-width: 820px) {
      .nav-links { display: none; }
      .mobile-cat-strip { display: flex; }
    }

    /* ---- Shared Layout Wrappers ---- */
    .shell {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }
    .section-band-soft {
      background: ${theme.tag_bg};
      border-top: 1px solid ${theme.card_border};
      border-bottom: 1px solid ${theme.card_border};
    }
    .section-band-plain {
      background: ${theme.bg_body};
    }
    .section-pad {
      padding: 3.5rem 0;
    }
    .section-header-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .section-title {
      font-family: ${theme.font_headline};
      font-size: clamp(1.6rem, 2.8vw, 2.15rem);
      font-weight: 700;
      line-height: 1.18;
      letter-spacing: -0.015em;
      margin: 0 0 0.35rem;
      color: ${theme.text_body};
    }
    .section-subtitle {
      font-size: 0.94rem;
      color: ${theme.muted_text};
      margin: 0;
    }
    .section-meta-link {
      font-size: 0.86rem;
      font-weight: 600;
      color: ${theme.accent};
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      white-space: nowrap;
    }
    .section-meta-link:hover { color: ${theme.accent_hover}; }

    /* ---- Home Section 1: Featured Story Hero Split ---- */
    .hero-split-band {
      background: ${theme.tag_bg};
      border-bottom: 1px solid ${theme.card_border};
      padding: 2.75rem 0 3.25rem;
    }
    .hero-split-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr);
      gap: 2.75rem;
      align-items: center;
    }
    .hero-split-media {
      display: block;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid ${theme.card_border};
      background: ${theme.checkbox_bg};
      aspect-ratio: 16 / 10;
    }
    .hero-split-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.4s ease;
    }
    .hero-split-media:hover img { transform: scale(1.025); }
    .kicker {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${theme.accent};
      margin-bottom: 0.7rem;
    }
    .hero-split-title {
      font-family: ${theme.font_headline};
      font-size: clamp(1.9rem, 3.6vw, 2.85rem);
      font-weight: 700;
      line-height: 1.14;
      letter-spacing: -0.02em;
      margin: 0 0 1rem;
      color: ${theme.text_body};
    }
    .hero-split-title a:hover { color: ${theme.accent}; }
    .hero-split-excerpt {
      font-size: 1.02rem;
      line-height: 1.65;
      color: ${theme.muted_text};
      margin: 0 0 1.25rem;
    }
    .hero-split-meta {
      font-size: 0.82rem;
      color: ${theme.muted_text};
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .hero-read-cta {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 1.25rem;
      font-size: 0.88rem;
      font-weight: 600;
      color: ${theme.accent};
    }
    .hero-read-cta:hover { color: ${theme.accent_hover}; }

    @media (max-width: 860px) {
      .hero-split-grid {
        grid-template-columns: 1fr;
        gap: 1.65rem;
      }
    }

    /* ---- Home Section 2: All Categories Grid ---- */
    .categories-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.35rem;
    }
    @media (max-width: 900px) {
      .categories-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 600px) {
      .categories-grid { grid-template-columns: 1fr; }
    }
    .category-card {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 158px;
      padding: 1.5rem 1.5rem 1.2rem;
      background: ${theme.card_bg};
      border: 1px solid ${theme.card_border};
      border-top: 3px solid ${theme.accent};
      border-radius: 10px;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .category-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 26px rgba(15, 23, 42, 0.06);
      border-color: ${theme.accent};
    }
    .category-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    .category-card-title {
      font-family: ${theme.font_headline};
      font-size: 1.32rem;
      font-weight: 700;
      line-height: 1.25;
      margin: 0;
      color: ${theme.text_body};
    }
    .category-arrow-circle {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      background: ${theme.checkbox_bg};
      color: ${theme.accent};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 0.95rem;
      transition: background 0.18s ease, color 0.18s ease;
    }
    .category-card:hover .category-arrow-circle {
      background: ${theme.accent};
      color: #FFFFFF;
    }
    .category-card-foot {
      margin-top: 1.5rem;
      padding-top: 0.85rem;
      border-top: 1px solid ${theme.card_border};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.82rem;
      font-weight: 600;
      color: ${theme.muted_text};
    }
    .category-card:hover .category-card-foot { color: ${theme.accent}; }

    /* ---- Home Section 3 & Related: 3-Column Editorial Article Grid ---- */
    .posts-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.65rem;
    }
    @media (max-width: 960px) {
      .posts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) {
      .posts-grid { grid-template-columns: 1fr; }
    }
    .post-card {
      background: ${theme.card_bg};
      border: 1px solid ${theme.card_border};
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .post-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 14px 28px rgba(15, 23, 42, 0.07);
    }
    .post-card-link {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .post-card-media {
      aspect-ratio: 3 / 2;
      overflow: hidden;
      background: ${theme.checkbox_bg};
    }
    .post-card-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.35s ease;
    }
    .post-card:hover .post-card-media img { transform: scale(1.03); }
    .post-card-body {
      padding: 1.2rem 1.3rem 1.35rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      flex: 1;
    }
    .post-card-kicker {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.11em;
      color: ${theme.accent};
    }
    .post-card-title {
      font-family: ${theme.font_headline};
      font-size: 1.22rem;
      font-weight: 700;
      line-height: 1.3;
      margin: 0;
      color: ${theme.text_body};
    }
    .post-card-excerpt {
      font-size: 0.88rem;
      line-height: 1.55;
      color: ${theme.muted_text};
      margin: 0.15rem 0 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .post-card-read-strip {
      margin-top: auto;
      padding: 0.85rem 1.3rem;
      border-top: 1px solid ${theme.card_border};
      font-size: 0.82rem;
      font-weight: 600;
      color: ${theme.accent};
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* ---- Home Section 4: Editorial Newsletter Band ---- */
    .newsletter-band {
      background: ${theme.bg_body};
      padding: 3.75rem 0;
    }
    .newsletter-box {
      max-width: 640px;
      margin: 0 auto;
      text-align: center;
    }
    .newsletter-title {
      font-family: ${theme.font_headline};
      font-size: clamp(1.55rem, 2.8vw, 2.05rem);
      font-weight: 700;
      line-height: 1.2;
      margin: 0 0 0.6rem;
    }
    .newsletter-copy {
      font-size: 0.96rem;
      color: ${theme.muted_text};
      margin: 0 0 1.5rem;
    }
    .newsletter-form {
      display: flex;
      gap: 0.65rem;
      max-width: 460px;
      margin: 0 auto;
    }
    @media (max-width: 520px) {
      .newsletter-form { flex-direction: column; }
    }
    .newsletter-form input[type="email"] {
      flex: 1;
      padding: 0.78rem 1rem;
      border-radius: 8px;
      border: 1px solid ${theme.card_border};
      background: ${theme.tag_bg};
      color: ${theme.text_body};
      font-size: 0.92rem;
      font-family: inherit;
      outline: none;
    }
    .newsletter-form input[type="email"]:focus {
      border-color: ${theme.accent};
      background: #FFFFFF;
    }
    .btn-solid {
      padding: 0.78rem 1.4rem;
      border-radius: 8px;
      border: none;
      background: ${theme.accent};
      color: #FFFFFF;
      font-size: 0.88rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.16s ease;
      white-space: nowrap;
    }
    .btn-solid:hover { background: ${theme.accent_hover}; }
    .form-feedback {
      margin: 0.75rem 0 0;
      font-size: 0.86rem;
      font-weight: 500;
      color: ${theme.accent};
      min-height: 1.2em;
    }

    /* ---- Article & Static Page Typography ---- */
    .article-container {
      max-width: 780px;
      margin: 0 auto;
      padding: 2.25rem 1.5rem 3.5rem;
    }
    .related-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem 4rem;
    }
    .breadcrumbs {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.45rem;
      font-size: 0.8rem;
      color: ${theme.muted_text};
      margin-bottom: 1.15rem;
    }
    .breadcrumbs a:hover { color: ${theme.accent}; }
    .breadcrumbs-sep { opacity: 0.55; }
    h1 {
      font-family: ${theme.font_headline};
      font-size: clamp(1.95rem, 4vw, 2.9rem);
      line-height: 1.15;
      letter-spacing: -0.02em;
      margin: 0 0 1rem;
      font-weight: 700;
    }
    .excerpt {
      font-size: 1.08rem;
      color: ${theme.muted_text};
      margin: 0 0 1.35rem;
      line-height: 1.65;
    }
    .meta-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.83rem;
      color: ${theme.muted_text};
      padding-bottom: 1.25rem;
      border-bottom: 1px solid ${theme.card_border};
      margin-bottom: 1.75rem;
      flex-wrap: wrap;
    }
    .hero-frame {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid ${theme.card_border};
      background: ${theme.checkbox_bg};
      margin-bottom: 2rem;
    }
    .hero-frame img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 620px;
      object-fit: cover;
    }
    .pin-save-btn {
      position: absolute;
      top: 14px;
      right: 14px;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.48rem 0.9rem;
      border-radius: 999px;
      background: #E60023;
      color: #FFFFFF;
      font-size: 0.8rem;
      font-weight: 700;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
      transition: transform 0.16s ease, background 0.16s ease;
    }
    .pin-save-btn:hover {
      background: #C4001D;
      transform: translateY(-1px);
    }
    .pin-save-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .article-body {
      font-size: 1.04rem;
      line-height: 1.82;
      color: ${theme.text_body};
      word-wrap: break-word;
    }
    .article-body h2, .article-body h3, .article-body h4 {
      font-family: ${theme.font_headline};
      line-height: 1.25;
      margin: 2.1rem 0 0.85rem;
      color: ${theme.text_body};
    }
    .article-body h2 { font-size: 1.55rem; }
    .article-body h3 { font-size: 1.28rem; }
    .article-body p { margin: 0 0 1.25rem; }
    .article-body img {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 10px;
      margin: 1.6rem auto;
      border: 1px solid ${theme.card_border};
    }
    .article-body figure { margin: 1.75rem 0; }
    .article-body figcaption {
      text-align: center;
      font-size: 0.84rem;
      color: ${theme.muted_text};
      margin-top: 0.5rem;
    }
    .article-body ul, .article-body ol {
      padding-left: 1.4rem;
      margin: 0 0 1.3rem;
    }
    .article-body li { margin-bottom: 0.5rem; }
    .article-body blockquote {
      margin: 1.5rem 0;
      padding: 0.95rem 1.25rem;
      border-left: 3px solid ${theme.accent};
      background: ${theme.tag_bg};
      border-radius: 0 8px 8px 0;
    }
    .article-body a {
      color: ${theme.accent};
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .article-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.92rem;
    }
    .article-body th, .article-body td {
      border: 1px solid ${theme.card_border};
      padding: 0.65rem 0.85rem;
      text-align: left;
    }
    .card {
      background: ${theme.card_bg};
      border: 1px solid ${theme.card_border};
      border-radius: 10px;
      padding: 1.35rem 1.5rem;
      margin: 1.75rem 0;
    }
    .takeaway-list { margin: 0.6rem 0 0; padding-left: 1.2rem; }
    .takeaway-list li { margin-bottom: 0.55rem; }
    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 0.7rem;
      padding: 0.6rem 0.75rem;
      background: ${theme.checkbox_bg};
      border-radius: 8px;
      margin-bottom: 0.55rem;
      font-size: 0.94rem;
      cursor: pointer;
    }
    .checklist-item input { margin-top: 0.25rem; accent-color: ${theme.accent}; }

    /* ---- Contact & Trust Page Form Styles ---- */
    .trust-contact-form {
      margin-top: 1.75rem;
      padding: 1.75rem;
      border-radius: 12px;
      border: 1px solid ${theme.card_border};
      background: ${theme.tag_bg};
    }
    .trust-contact-form .form-row {
      margin-bottom: 1.1rem;
    }
    .trust-contact-form label {
      display: block;
      font-size: 0.84rem;
      font-weight: 600;
      margin-bottom: 0.35rem;
      color: ${theme.text_body};
    }
    .trust-contact-form input,
    .trust-contact-form textarea {
      width: 100%;
      padding: 0.72rem 0.9rem;
      border-radius: 8px;
      border: 1px solid ${theme.card_border};
      background: #FFFFFF;
      color: ${theme.text_body};
      font-size: 0.94rem;
      font-family: inherit;
    }
    .trust-contact-form input:focus,
    .trust-contact-form textarea:focus {
      outline: none;
      border-color: ${theme.accent};
    }
    .sitemap-list {
      columns: 2;
      column-gap: 2rem;
    }
    @media (max-width: 640px) {
      .sitemap-list { columns: 1; }
    }

    /* ---- Category Archive Header ---- */
    .archive-header {
      background: ${theme.tag_bg};
      border-bottom: 1px solid ${theme.card_border};
      padding: 2.75rem 0 2.4rem;
    }

    /* ---- 3-Column Editorial Footer (decohome.homeandrecipe.com architecture) ---- */
    .site-footer {
      background: ${theme.tag_bg};
      border-top: 1px solid ${theme.card_border};
      color: ${theme.muted_text};
      padding: 3.5rem 0 2rem;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
      gap: 2.75rem;
      padding-bottom: 2.5rem;
      border-bottom: 1px solid ${theme.card_border};
    }
    @media (max-width: 820px) {
      .footer-grid {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
    }
    .footer-brand-name {
      display: inline-block;
      font-family: ${theme.font_headline};
      font-size: 1.5rem;
      font-weight: 700;
      color: ${theme.text_body};
      margin-bottom: 0.75rem;
    }
    .footer-brand-desc {
      font-size: 0.9rem;
      line-height: 1.65;
      max-width: 400px;
      margin: 0 0 1.25rem;
    }
    .footer-socials {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
    }
    .footer-social-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.75rem;
      border-radius: 999px;
      border: 1px solid ${theme.card_border};
      background: ${theme.header_bg};
      font-size: 0.8rem;
      font-weight: 600;
      color: ${theme.text_body};
      transition: border-color 0.16s ease, color 0.16s ease;
    }
    .footer-social-link:hover {
      border-color: ${theme.accent};
      color: ${theme.accent};
    }
    .footer-social-link svg {
      width: 13px;
      height: 13px;
      fill: currentColor;
    }
    .footer-col-title {
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${theme.text_body};
      margin: 0 0 1rem;
    }
    .footer-link-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.52rem;
      font-size: 0.88rem;
    }
    .footer-link-list a:hover { color: ${theme.accent}; }
    .footer-bottom {
      padding-top: 1.4rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.82rem;
    }
    .footer-bottom a:hover { color: ${theme.accent}; }${
      theme.id === 'pinterest-mag'
        ? `

    /* =====================================================================
       MODEL 3 — BOTANICAL ATELIER MAGAZINE (DEEP FOREST & CHAMPAGNE GOLD)
       ===================================================================== */
    body.theme-pinterest-mag {
      background: #F3F5F1;
      color: #13221D;
    }
    body.theme-pinterest-mag .site-header {
      background: #0F2A22;
      border-bottom: 1px solid rgba(200, 155, 84, 0.24);
    }
    body.theme-pinterest-mag .header-top-bar {
      background: #0A1E18;
      border-bottom: 1px solid rgba(246, 243, 236, 0.08);
      color: rgba(246, 243, 236, 0.78);
    }
    body.theme-pinterest-mag .top-bar-contact {
      color: rgba(246, 243, 236, 0.82);
    }
    body.theme-pinterest-mag .top-bar-contact:hover {
      color: #C89B54;
    }
    body.theme-pinterest-mag .social-links {
      border-right-color: rgba(246, 243, 236, 0.14);
    }
    body.theme-pinterest-mag .social-link {
      background: rgba(246, 243, 236, 0.07);
      border-color: rgba(246, 243, 236, 0.16);
      color: #F6F3EC;
    }
    body.theme-pinterest-mag .social-link:hover {
      background: #C89B54;
      border-color: #C89B54;
      color: #0F2A22;
    }
    body.theme-pinterest-mag .header-main-inner {
      padding: 1.05rem 1.5rem;
    }
    body.theme-pinterest-mag .brand-link {
      color: #F6F3EC;
      font-size: 1.62rem;
      letter-spacing: -0.015em;
    }
    body.theme-pinterest-mag .nav-links {
      color: rgba(246, 243, 236, 0.84);
      gap: 1.85rem;
    }
    body.theme-pinterest-mag .nav-links a {
      position: relative;
      padding: 0.25rem 0;
    }
    body.theme-pinterest-mag .nav-links a::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -2px;
      height: 1.5px;
      background: #C89B54;
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 0.18s ease;
    }
    body.theme-pinterest-mag .nav-links a:hover {
      color: #F6F3EC;
    }
    body.theme-pinterest-mag .nav-links a:hover::after {
      transform: scaleX(1);
    }
    body.theme-pinterest-mag .header-about-link {
      background: #C89B54;
      color: #0F2A22;
      font-weight: 700;
      font-size: 0.82rem;
      padding: 0.52rem 1.15rem;
      border-radius: 4px;
      letter-spacing: 0.01em;
      transition: background 0.16s ease, transform 0.16s ease;
    }
    body.theme-pinterest-mag .header-about-link:hover {
      background: #D9B06C;
      color: #0F2A22;
      transform: translateY(-1px);
    }
    body.theme-pinterest-mag .mobile-cat-strip {
      background: #0A1E18;
      border-top-color: rgba(246, 243, 236, 0.1);
    }
    body.theme-pinterest-mag .mobile-cat-strip a {
      color: rgba(246, 243, 236, 0.85);
    }
    body.theme-pinterest-mag .mobile-cat-strip a:hover {
      color: #C89B54;
    }

    /* Split Dark-Forest Magazine Cover Hero */
    body.theme-pinterest-mag .hero-split-band {
      background: #0F2A22;
      border-bottom: 1px solid rgba(200, 155, 84, 0.25);
      padding: 3.25rem 0 3.75rem;
    }
    body.theme-pinterest-mag .hero-split-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr);
      gap: 3rem;
      align-items: stretch;
    }
    body.theme-pinterest-mag .hero-split-media {
      order: 2;
      border-radius: 4px;
      border: 1px solid rgba(200, 155, 84, 0.28);
      background: #17382E;
      aspect-ratio: 16 / 11;
      height: 100%;
    }
    body.theme-pinterest-mag .hero-split-grid > div {
      order: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    body.theme-pinterest-mag .hero-split-band .kicker {
      color: #C89B54;
      letter-spacing: 0.16em;
      margin-bottom: 0.85rem;
    }
    body.theme-pinterest-mag .hero-split-title {
      color: #F6F3EC;
      font-size: clamp(2.05rem, 3.8vw, 3.1rem);
      line-height: 1.1;
      text-wrap: balance;
      margin-bottom: 1.1rem;
    }
    body.theme-pinterest-mag .hero-split-title a:hover {
      color: #E2BE7F;
    }
    body.theme-pinterest-mag .hero-split-excerpt {
      color: rgba(246, 243, 236, 0.82);
      font-size: 1rem;
      max-width: 50ch;
    }
    body.theme-pinterest-mag .hero-split-meta {
      color: rgba(246, 243, 236, 0.72);
    }
    body.theme-pinterest-mag .hero-read-cta {
      align-self: flex-start;
      background: #C89B54;
      color: #0F2A22;
      padding: 0.78rem 1.45rem;
      border-radius: 4px;
      font-weight: 700;
      margin-top: 1.5rem;
      transition: background 0.16s ease, transform 0.16s ease;
    }
    body.theme-pinterest-mag .hero-read-cta:hover {
      background: #D9B06C;
      color: #0F2A22;
      transform: translateY(-1px);
    }

    /* Editorial Category & Story Cards */
    body.theme-pinterest-mag .section-title {
      text-wrap: balance;
    }
    body.theme-pinterest-mag .category-card {
      border-radius: 4px;
      border: 1px solid #D8E0D8;
      border-top: 2px solid #0F2A22;
      background: #FFFFFF;
    }
    body.theme-pinterest-mag .category-card:hover {
      border-color: #1B4D3E;
      border-top-color: #C89B54;
      box-shadow: 0 14px 28px rgba(15, 42, 34, 0.08);
    }
    body.theme-pinterest-mag .category-arrow-circle {
      border-radius: 4px;
      background: #EAEFE9;
      color: #0F2A22;
    }
    body.theme-pinterest-mag .category-card:hover .category-arrow-circle {
      background: #0F2A22;
      color: #C89B54;
    }
    body.theme-pinterest-mag .post-card {
      border-radius: 4px;
      border: 1px solid #D8E0D8;
      background: #FFFFFF;
    }
    body.theme-pinterest-mag .post-card:hover {
      border-color: #1B4D3E;
      box-shadow: 0 16px 32px rgba(15, 42, 34, 0.09);
    }
    body.theme-pinterest-mag .post-card-media {
      aspect-ratio: 4 / 3;
    }
    body.theme-pinterest-mag .post-card-kicker {
      color: #8E6526;
      letter-spacing: 0.14em;
    }
    body.theme-pinterest-mag .post-card-read-strip {
      border-top-color: #E3E9E2;
      color: #0F2A22;
    }
    body.theme-pinterest-mag .post-card:hover .post-card-read-strip {
      color: #1B4D3E;
    }

    /* Category Archive Deep-Forest Header */
    body.theme-pinterest-mag .archive-header {
      background: #0F2A22;
      border-bottom: 1px solid rgba(200, 155, 84, 0.25);
      color: #F6F3EC;
      padding: 3.1rem 0 2.75rem;
    }
    body.theme-pinterest-mag .archive-header .breadcrumbs {
      color: rgba(246, 243, 236, 0.72);
    }
    body.theme-pinterest-mag .archive-header .breadcrumbs a:hover {
      color: #C89B54;
    }
    body.theme-pinterest-mag .archive-header .kicker {
      color: #C89B54;
      letter-spacing: 0.16em;
    }
    body.theme-pinterest-mag .archive-header h1 {
      color: #F6F3EC;
      text-wrap: balance;
    }
    body.theme-pinterest-mag .archive-header .excerpt {
      color: rgba(246, 243, 236, 0.82);
    }

    /* Article Deep-Forest Title Banner & Asymmetric 2-Column Reading Canvas */
    body.theme-pinterest-mag .atelier-article-banner {
      background: #0F2A22;
      border-bottom: 1px solid rgba(200, 155, 84, 0.25);
      padding: 3rem 0 2.75rem;
      color: #F6F3EC;
    }
    body.theme-pinterest-mag .atelier-banner-inner {
      max-width: 920px;
      margin: 0 auto;
      padding: 0 1.5rem;
      text-align: center;
    }
    body.theme-pinterest-mag .atelier-article-banner .breadcrumbs {
      justify-content: center;
      color: rgba(246, 243, 236, 0.76);
      margin-bottom: 1rem;
    }
    body.theme-pinterest-mag .atelier-article-banner .breadcrumbs a {
      color: #C89B54;
    }
    body.theme-pinterest-mag .atelier-article-banner .breadcrumbs a:hover {
      color: #E2BE7F;
    }
    body.theme-pinterest-mag .atelier-article-banner h1 {
      color: #F6F3EC;
      font-size: clamp(2rem, 4.1vw, 3.15rem);
      line-height: 1.13;
      text-wrap: balance;
      margin: 0 0 1.15rem;
    }
    body.theme-pinterest-mag .atelier-article-banner .meta-row {
      justify-content: center;
      color: rgba(246, 243, 236, 0.82);
      border-bottom: none;
      padding-bottom: 0;
      margin-bottom: 0;
    }
    body.theme-pinterest-mag .atelier-article-wrap {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2.75rem 1.5rem 3.5rem;
    }
    body.theme-pinterest-mag .atelier-article-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 310px;
      gap: 2.5rem;
      align-items: start;
    }
    body.theme-pinterest-mag .atelier-main-column {
      background: #FFFFFF;
      border: 1px solid #D8E0D8;
      border-radius: 4px;
      padding: 2.25rem 2.5rem;
    }
    body.theme-pinterest-mag .atelier-main-column .hero-frame {
      border-radius: 4px;
      border-color: #D8E0D8;
      margin-bottom: 2rem;
    }
    body.theme-pinterest-mag .atelier-main-column .article-body > p:first-of-type::first-letter {
      font-family: ${theme.font_headline};
      float: left;
      font-size: 3.45rem;
      line-height: 0.85;
      padding: 0.25rem 0.65rem 0.1rem 0;
      font-weight: 700;
      color: #0F2A22;
    }
    body.theme-pinterest-mag .article-body blockquote {
      border-left: none;
      border-top: 1px solid #C89B54;
      border-bottom: 1px solid #C89B54;
      background: #F7F9F6;
      border-radius: 0;
      padding: 1.25rem 1.5rem;
      font-family: ${theme.font_headline};
      font-size: 1.16rem;
      font-style: italic;
      color: #0F2A22;
    }
    body.theme-pinterest-mag .atelier-sidebar {
      position: sticky;
      top: 96px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    body.theme-pinterest-mag .atelier-side-panel {
      background: #FFFFFF;
      border: 1px solid #D8E0D8;
      border-radius: 4px;
      padding: 1.4rem 1.5rem;
    }
    body.theme-pinterest-mag .atelier-side-heading {
      font-family: ${theme.font_headline};
      font-size: 1.2rem;
      font-weight: 700;
      color: #0F2A22;
      margin: 0 0 1rem;
      padding-bottom: 0.65rem;
      border-bottom: 1px solid #E3E9E2;
    }
    body.theme-pinterest-mag .atelier-toc-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    body.theme-pinterest-mag .atelier-toc-list li {
      border-bottom: 1px solid #EDF1EC;
    }
    body.theme-pinterest-mag .atelier-toc-list li:last-child {
      border-bottom: none;
    }
    body.theme-pinterest-mag .atelier-toc-link {
      display: flex;
      align-items: baseline;
      gap: 0.65rem;
      padding: 0.62rem 0;
      font-size: 0.88rem;
      line-height: 1.4;
      color: #13221D;
      transition: color 0.16s ease;
    }
    body.theme-pinterest-mag .atelier-toc-link:hover {
      color: #1B4D3E;
    }
    body.theme-pinterest-mag .atelier-toc-num {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: #9A6F2B;
      flex-shrink: 0;
    }
    body.theme-pinterest-mag .atelier-mini-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    body.theme-pinterest-mag .atelier-mini-card {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      gap: 0.85rem;
      align-items: center;
    }
    body.theme-pinterest-mag .atelier-mini-thumb {
      width: 76px;
      height: 60px;
      border-radius: 3px;
      overflow: hidden;
      background: #EAEFE9;
      border: 1px solid #D8E0D8;
    }
    body.theme-pinterest-mag .atelier-mini-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    body.theme-pinterest-mag .atelier-mini-title {
      font-family: ${theme.font_headline};
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.3;
      color: #13221D;
      margin: 0;
    }
    body.theme-pinterest-mag .atelier-mini-card:hover .atelier-mini-title {
      color: #1B4D3E;
    }
    @media (max-width: 980px) {
      body.theme-pinterest-mag .atelier-article-grid {
        grid-template-columns: 1fr;
      }
      body.theme-pinterest-mag .atelier-sidebar {
        position: static;
      }
      body.theme-pinterest-mag .atelier-main-column {
        padding: 1.5rem;
      }
      body.theme-pinterest-mag .hero-split-grid {
        grid-template-columns: 1fr;
      }
      body.theme-pinterest-mag .hero-split-media {
        order: 1;
      }
      body.theme-pinterest-mag .hero-split-grid > div {
        order: 2;
      }
    }

    /* Dark-Forest Editorial Newsletter Card */
    body.theme-pinterest-mag .newsletter-band {
      background: #EAEFE9;
      border-top: 1px solid #D8E0D8;
      padding: 3.75rem 0;
    }
    body.theme-pinterest-mag .newsletter-box {
      max-width: 760px;
      background: #0F2A22;
      color: #F6F3EC;
      padding: 2.75rem 2.25rem;
      border-radius: 4px;
      border: 1px solid rgba(200, 155, 84, 0.3);
    }
    body.theme-pinterest-mag .newsletter-box .kicker {
      color: #C89B54;
      letter-spacing: 0.16em;
    }
    body.theme-pinterest-mag .newsletter-title {
      color: #F6F3EC;
    }
    body.theme-pinterest-mag .newsletter-copy {
      color: rgba(246, 243, 236, 0.82);
    }
    body.theme-pinterest-mag .newsletter-form input[type="email"] {
      background: #FFFFFF;
      border-color: rgba(246, 243, 236, 0.25);
      border-radius: 4px;
      color: #13221D;
    }
    body.theme-pinterest-mag .newsletter-form .btn-solid {
      background: #C89B54;
      color: #0F2A22;
      border-radius: 4px;
      font-weight: 700;
    }
    body.theme-pinterest-mag .newsletter-form .btn-solid:hover {
      background: #D9B06C;
    }
    body.theme-pinterest-mag .newsletter-box .form-feedback {
      color: #E2BE7F;
    }

    /* Deep-Forest Editorial Footer */
    body.theme-pinterest-mag .site-footer {
      background: #0F2A22;
      border-top: 1px solid rgba(200, 155, 84, 0.25);
      color: rgba(246, 243, 236, 0.78);
    }
    body.theme-pinterest-mag .footer-grid {
      border-bottom-color: rgba(246, 243, 236, 0.14);
    }
    body.theme-pinterest-mag .footer-brand-name {
      color: #F6F3EC;
    }
    body.theme-pinterest-mag .footer-col-title {
      color: #C89B54;
    }
    body.theme-pinterest-mag .footer-link-list a {
      color: rgba(246, 243, 236, 0.84);
    }
    body.theme-pinterest-mag .footer-link-list a:hover {
      color: #C89B54;
    }
    body.theme-pinterest-mag .footer-social-link {
      background: rgba(246, 243, 236, 0.08);
      border-color: rgba(246, 243, 236, 0.18);
      color: #F6F3EC;
      border-radius: 4px;
    }
    body.theme-pinterest-mag .footer-social-link:hover {
      border-color: #C89B54;
      color: #C89B54;
    }
    body.theme-pinterest-mag .footer-bottom a:hover {
      color: #C89B54;
    }`
        : ''
    }
  </style>`;
}

const MAIL_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

const PINTEREST_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.017 2C6.486 2 2 6.486 2 12.017c0 4.24 2.636 7.865 6.357 9.323-.088-.792-.167-2.008.035-2.872.182-.78 1.175-4.978 1.175-4.978s-.3-.6-.3-1.487c0-1.393.808-2.433 1.813-2.433.855 0 1.268.642 1.268 1.412 0 .86-.548 2.146-.831 3.338-.236.998.5 1.812 1.484 1.812 1.782 0 3.151-1.878 3.151-4.588 0-2.399-1.724-4.076-4.186-4.076-2.851 0-4.525 2.139-4.525 4.35 0 .861.331 1.785.746 2.287.082.099.094.186.07.287-.076.316-.245.998-.278 1.138-.044.183-.146.222-.337.134-1.258-.586-2.044-2.423-2.044-3.9 0-3.175 2.307-6.091 6.652-6.091 3.492 0 6.206 2.488 6.206 5.814 0 3.47-2.187 6.262-5.223 6.262-1.02 0-1.979-.53-2.308-1.156l-.628 2.393c-.227.875-.842 1.972-1.253 2.641.944.292 1.945.45 2.984.45 5.531 0 10.017-4.486 10.017-10.017C22.034 6.486 17.548 2 12.017 2z"/></svg>';

function renderHeader(
  branding: BrandingConfig,
  categories: CategoryItem[],
  identity: SiteIdentity
): string {
  const safeSiteName = escapeHtml(identity.siteName);
  const hasCustomLogo = Boolean(branding.logo_path && branding.logo_path.trim());
  const brandHtml = hasCustomLogo
    ? `<img class="brand-logo-img" src="${escapeHtml(branding.logo_path.trim())}" alt="${safeSiteName}" width="190" height="38" decoding="async" />`
    : `<span class="brand-wordmark">${safeSiteName}</span>`;

  const navCats = categories.slice(0, 6);
  const navHtml = navCats.length
    ? navCats.map((c) => `<a href="/${escapeHtml(c.slug)}/">${escapeHtml(c.name)}</a>`).join('')
    : `<a href="/">Home</a>`;

  const mobileStripHtml = navCats.length
    ? `<nav class="mobile-cat-strip" aria-label="Categories">${navHtml}</nav>`
    : '';

  const socialHtml = renderTopSocialLinksHtml(branding.social_links);

  return `<header class="site-header">
    <div class="header-top-bar">
      <div class="header-top-inner">
        ${socialHtml}
        <a class="top-bar-contact" href="/contact/">${MAIL_ICON_SVG}<span>Contact</span></a>
      </div>
    </div>
    <div class="header-main-inner">
      <a class="brand-link" href="/" aria-label="${safeSiteName}">${brandHtml}</a>
      <nav class="nav-links" aria-label="Primary Navigation">${navHtml}</nav>
      <a class="header-about-link" href="/about/">About</a>
    </div>
    ${mobileStripHtml}
  </header>`;
}

function renderFooter(
  branding: BrandingConfig,
  categories: CategoryItem[],
  identity: SiteIdentity
): string {
  const safeSiteName = escapeHtml(identity.siteName);
  const hasCustomLogo = Boolean(branding.logo_path && branding.logo_path.trim());
  const footerBrandHtml = hasCustomLogo
    ? `<a href="/" aria-label="${safeSiteName}" style="display:inline-block;margin-bottom:0.8rem;"><img class="brand-logo-img" src="${escapeHtml(branding.logo_path.trim())}" alt="${safeSiteName}" width="190" height="38" loading="lazy" decoding="async" /></a>`
    : `<a class="footer-brand-name" href="/">${safeSiteName}</a>`;

  const exploreItems = categories.length
    ? categories
        .slice(0, 8)
        .map((c) => `<li><a href="/${escapeHtml(c.slug)}/">${escapeHtml(c.name)}</a></li>`)
        .join('')
    : `<li><a href="/">Home</a></li><li><a href="/sitemap/">All Articles</a></li>`;

  const footerSocials = renderFooterSocialLinksHtml(branding.social_links);

  return `<footer class="site-footer">
    <div class="shell">
      <div class="footer-grid">
        <div>
          ${footerBrandHtml}
          <p class="footer-brand-desc">${escapeHtml(identity.tagline)}</p>
          ${footerSocials}
        </div>
        <div>
          <h3 class="footer-col-title">Explore</h3>
          <ul class="footer-link-list">${exploreItems}</ul>
        </div>
        <div>
          <h3 class="footer-col-title">Company</h3>
          <ul class="footer-link-list">
            <li><a href="/about/">About Us</a></li>
            <li><a href="/contact/">Contact</a></li>
            <li><a href="/editorial-policy/">Editorial Policy</a></li>
            <li><a href="/fact-checking-policy/">Fact-Checking Policy</a></li>
            <li><a href="/privacy-policy/">Privacy Policy</a></li>
            <li><a href="/cookie-policy/">Cookie Policy</a></li>
            <li><a href="/terms/">Terms &amp; Conditions</a></li>
            <li><a href="/disclaimer/">Disclaimer</a></li>
            <li><a href="/copyright/">Copyright &amp; Images</a></li>
            <li><a href="/sitemap/">Sitemap</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} ${safeSiteName}. All rights reserved.</span>
        <a href="mailto:${escapeHtml(identity.contactEmail)}">${escapeHtml(identity.contactEmail)}</a>
      </div>
    </div>
  </footer>`;
}

export function renderPostHtml(params: {
  post: PostItem;
  allPosts: PostItem[];
  themeKey: string;
  branding: BrandingConfig;
  categories: CategoryItem[];
  routingMode: string;
  baseUrl?: string;
  sourceDomain?: string;
  customDomain?: string;
  projectName?: string;
}): string {
  const {
    post,
    allPosts,
    themeKey,
    branding,
    categories,
    routingMode,
    baseUrl = '',
    customDomain = '',
    projectName = '',
  } = params;
  const theme = getThemeTokens(themeKey);
  const identity = resolveSiteIdentity({ customDomain, baseUrl, branding, projectName });
  const route = resolvePostRoute(post, routingMode);
  const canonical = `${identity.siteUrl.replace(/\/+$/, '')}${route.web_path}`;
  const hasRealImage = Boolean((post.local_image_path || post.image_url || '').trim());
  const imgSrc = hasRealImage ? resolveImageSrc(post, theme.accent) : '';

  const absImgUrl =
    imgSrc && imgSrc.startsWith('/') ? `${identity.siteUrl.replace(/\/+$/, '')}${imgSrc}` : imgSrc;
  const pinShareHref = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(canonical)}&media=${encodeURIComponent(absImgUrl || '')}&description=${encodeURIComponent(post.title)}`;

  // Avoid duplicating the featured image if it is already embedded inside the scraped article body
  const heroAlreadyInBody = Boolean(
    imgSrc &&
      post.content_html &&
      (post.content_html.includes(imgSrc) || (post.image_url && post.content_html.includes(post.image_url)))
  );

  const renderSeparateHero = hasRealImage && !heroAlreadyInBody;
  const heroHtml = renderSeparateHero
    ? `<div class="hero-frame">
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(post.title)}" width="${post.image_width || 1200}" height="${post.image_height || 750}" fetchpriority="high" decoding="async" />
        <a class="pin-save-btn" href="${escapeHtml(pinShareHref)}" target="_blank" rel="noopener noreferrer" aria-label="Save to Pinterest">${PINTEREST_ICON_SVG}<span>Save</span></a>
      </div>`
    : '';

  // Render strictly user-edited takeaways/checklists ONLY when explicitly present (never fabricate)
  const takeawaysHtml = post.takeaways.length
    ? `<section id="takeaways" class="card">
        <h2 style="margin-top:0;">Key Takeaways</h2>
        <ul class="takeaway-list">
          ${post.takeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  const checklistHtml = post.checklist.length
    ? `<section id="checklist" class="card">
        <h2 style="margin-top:0;">Checklist</h2>
        ${post.checklist
          .map(
            (item) => `<label class="checklist-item">
              <input type="checkbox" />
              <span>${escapeHtml(item.text)}</span>
            </label>`
          )
          .join('')}
      </section>`
    : '';

  const sourceAuthor = String((post.raw_meta && post.raw_meta.author) || '').trim();
  const metaParts: string[] = [];
  if (sourceAuthor) metaParts.push(`<span>By <strong>${escapeHtml(sourceAuthor)}</strong></span>`);
  if (post.modified || post.date) {
    metaParts.push(
      `<time datetime="${escapeHtml(post.modified || post.date)}">${escapeHtml(post.modified || post.date)}</time>`
    );
  }
  const metaRowHtml = metaParts.length ? `<div class="meta-row">${metaParts.join('')}</div>` : '';

  // Exact source content only — no invented filler text
  // If there is no separate hero-frame, promote the first inline image to eager LCP (fetchpriority="high")
  let finalContentHtml = post.content_html || '';
  let lcpPreloadSrc = renderSeparateHero ? imgSrc : '';
  if (!renderSeparateHero && finalContentHtml) {
    const promoted = promoteFirstBodyImageToLcp(finalContentHtml);
    finalContentHtml = promoted.html;
    lcpPreloadSrc = promoted.lcpSrc || imgSrc;
  }

  const isAtelier = theme.id === 'pinterest-mag';
  let tocHeadings: Array<{ id: string; text: string; num: string }> = [];
  if (isAtelier && finalContentHtml) {
    const tocRes = extractArticleTocAndAnchors(finalContentHtml);
    finalContentHtml = tocRes.html;
    tocHeadings = tocRes.headings;
  }

  const bodyHtml = finalContentHtml
    ? `<section class="article-body">${finalContentHtml}</section>`
    : post.excerpt
      ? `<section class="article-body"><p>${escapeHtml(post.excerpt)}</p></section>`
      : '';

  // Prefer same-category related posts first, then fill with latest posts
  const others = allPosts.filter((p) => p.slug !== post.slug);
  const sameCat = others.filter((p) => p.category_slug && p.category_slug === post.category_slug);
  const otherCat = others.filter((p) => !p.category_slug || p.category_slug !== post.category_slug);
  const related = [...sameCat, ...otherCat].slice(0, 3);

  const relatedHtml = related.length
    ? `<section class="related-container" aria-label="Related Articles">
        <div class="section-header-row" style="border-top:1px solid ${theme.card_border};padding-top:2.75rem;">
          <div>
            <h2 class="section-title">Related Articles</h2>
            <p class="section-subtitle">Continue exploring guides from ${escapeHtml(identity.siteName)}.</p>
          </div>
          <a class="section-meta-link" href="/sitemap/">Browse All Articles &rarr;</a>
        </div>
        <div class="posts-grid">
          ${related
            .map((rel) => {
              const relRoute = resolvePostRoute(rel, routingMode);
              const relHasImg = Boolean((rel.local_image_path || rel.image_url || '').trim());
              const relImg = relHasImg ? resolveImageSrc(rel, theme.accent) : '';
              return `<article class="post-card">
                <a class="post-card-link" href="${escapeHtml(relRoute.web_path)}">
                  ${relImg ? `<div class="post-card-media"><img src="${escapeHtml(relImg)}" alt="${escapeHtml(rel.title)}" width="600" height="400" loading="lazy" decoding="async" /></div>` : ''}
                  <div class="post-card-body">
                    ${rel.category ? `<span class="post-card-kicker">${escapeHtml(rel.category)}</span>` : ''}
                    <h3 class="post-card-title">${escapeHtml(rel.title)}</h3>
                    ${rel.excerpt ? `<p class="post-card-excerpt">${escapeHtml(rel.excerpt.slice(0, 150))}</p>` : ''}
                  </div>
                  <div class="post-card-read-strip"><span>Read Article</span><span>&rarr;</span></div>
                </a>
              </article>`;
            })
            .join('')}
        </div>
      </section>`
    : '';

  const breadcrumbItems: string[] = [`<a href="/">Home</a>`];
  if (post.category && post.category_slug) {
    breadcrumbItems.push(
      `<span class="breadcrumbs-sep">${isAtelier ? '&middot;' : '/'}</span><a href="/${escapeHtml(post.category_slug)}/">${escapeHtml(post.category)}</a>`
    );
  }
  breadcrumbItems.push(`<span class="breadcrumbs-sep">${isAtelier ? '&middot;' : '/'}</span><span>${escapeHtml(post.title)}</span>`);

  // Estimate reading time cleanly for Botanical Atelier banner
  const wordCount = (finalContentHtml || post.excerpt || '')
    .replace(/<[^>]+>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const readMins = Math.max(2, Math.round(wordCount / 220));

  const atelierSidebarTocItems =
    tocHeadings.length > 0
      ? tocHeadings
          .map(
            (h) =>
              `<li><a class="atelier-toc-link" href="#${escapeHtml(h.id)}"><span class="atelier-toc-num">${h.num}.</span><span>${escapeHtml(h.text)}</span></a></li>`
          )
          .join('')
      : [
          ...(post.takeaways.length ? ['<li><a class="atelier-toc-link" href="#takeaways"><span class="atelier-toc-num">01.</span><span>Key Takeaways</span></a></li>'] : []),
          ...(post.checklist.length ? [`<li><a class="atelier-toc-link" href="#checklist"><span class="atelier-toc-num">${post.takeaways.length ? '02.' : '01.'}</span><span>Design Checklist</span></a></li>`] : []),
          `<li><a class="atelier-toc-link" href="/${escapeHtml(post.category_slug || '')}/"><span class="atelier-toc-num">&rarr;</span><span>More in ${escapeHtml(post.category || 'Journal')}</span></a></li>`,
        ].join('');

  const atelierSidebarRelated = related.length
    ? `<div class="atelier-side-panel">
        <h2 class="atelier-side-heading">Curated Reading</h2>
        <div class="atelier-mini-list">
          ${related
            .slice(0, 3)
            .map((rel) => {
              const relRoute = resolvePostRoute(rel, routingMode);
              const relHasImg = Boolean((rel.local_image_path || rel.image_url || '').trim());
              const relImg = relHasImg ? resolveImageSrc(rel, theme.accent) : '';
              return `<a class="atelier-mini-card" href="${escapeHtml(relRoute.web_path)}">
                ${relImg ? `<div class="atelier-mini-thumb"><img src="${escapeHtml(relImg)}" alt="${escapeHtml(rel.title)}" width="152" height="120" loading="lazy" decoding="async" /></div>` : '<div class="atelier-mini-thumb"></div>'}
                <h3 class="atelier-mini-title">${escapeHtml(rel.title)}</h3>
              </a>`;
            })
            .join('')}
        </div>
      </div>`
    : '';

  const atelierMetaParts = [...metaParts, `<span>${readMins} min read</span>`];

  const mainArticleMarkup = isAtelier
    ? `<section class="atelier-article-banner">
        <div class="atelier-banner-inner">
          <nav class="breadcrumbs" aria-label="Breadcrumb">${breadcrumbItems.join('')}</nav>
          <h1>${escapeHtml(post.title)}</h1>
          <div class="meta-row">${atelierMetaParts.join(' &middot; ')}</div>
        </div>
      </section>
      <div class="atelier-article-wrap">
        <div class="atelier-article-grid">
          <article class="atelier-main-column">
            ${heroHtml}
            ${bodyHtml}
            ${takeawaysHtml}
            ${checklistHtml}
          </article>
          <aside class="atelier-sidebar" aria-label="Article Navigation">
            <div class="atelier-side-panel">
              <h2 class="atelier-side-heading">In This Guide</h2>
              <ol class="atelier-toc-list">${atelierSidebarTocItems}</ol>
            </div>
            ${atelierSidebarRelated}
          </aside>
        </div>
      </div>`
    : `<article class="article-container">
        <nav class="breadcrumbs" aria-label="Breadcrumb">${breadcrumbItems.join('')}</nav>
        ${post.category ? `<span class="kicker">${escapeHtml(post.category)}</span>` : ''}
        <h1>${escapeHtml(post.title)}</h1>
        ${metaRowHtml}
        ${heroHtml}
        ${bodyHtml}
        ${takeawaysHtml}
        ${checklistHtml}
      </article>`;

  const jsonLdObj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt || post.title,
    datePublished: post.date,
    dateModified: post.modified,
    publisher: { '@type': 'Organization', name: identity.siteName },
  };
  if (sourceAuthor) {
    jsonLdObj.author = { '@type': 'Person', name: sourceAuthor };
  }
  if (absImgUrl) {
    jsonLdObj.image = absImgUrl;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(post.title)} &mdash; ${escapeHtml(identity.siteName)}</title>
  <meta name="description" content="${escapeHtml(post.excerpt || post.title)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />${renderCustomHeadCode(branding.custom_head_code)}
  <script type="application/ld+json">${JSON.stringify(jsonLdObj).replace(/</g, '\\u003c')}</script>
  ${renderBaseStyles(theme, lcpPreloadSrc)}
</head>
<body class="theme-${escapeHtml(theme.id)}">
  ${renderHeader(branding, categories, identity)}
  <main>
    ${mainArticleMarkup}
    ${relatedHtml}
  </main>
  ${renderFooter(branding, categories, identity)}
</body>
</html>`;
}

export function renderHubHtml(params: {
  posts: PostItem[];
  categories: CategoryItem[];
  themeKey: string;
  branding: BrandingConfig;
  routingMode: string;
  title?: string;
  subtitle?: string;
  baseUrl?: string;
  customDomain?: string;
  projectName?: string;
  isCategoryPage?: boolean;
  categoryName?: string;
}): string {
  const {
    posts,
    categories,
    themeKey,
    branding,
    routingMode,
    title,
    subtitle,
    baseUrl = '',
    customDomain = '',
    projectName = '',
    isCategoryPage = false,
    categoryName = '',
  } = params;

  const theme = getThemeTokens(themeKey);
  const identity = resolveSiteIdentity({ customDomain, baseUrl, branding, projectName });
  const pageTitle = title || `${identity.siteName} — Home & Design Guides`;
  const pageDesc = subtitle || identity.tagline;

  // Category archive page layout
  if (isCategoryPage) {
    let firstCardImg = '';
    const cardsHtml = posts
      .map((post, idx) => {
        const route = resolvePostRoute(post, routingMode);
        const hasImg = Boolean((post.local_image_path || post.image_url || '').trim());
        const imgSrc = hasImg ? resolveImageSrc(post, theme.accent) : '';
        if (idx === 0 && imgSrc) firstCardImg = imgSrc;
        const imgPriorityAttrs =
          idx === 0 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
        return `<article class="post-card">
          <a class="post-card-link" href="${escapeHtml(route.web_path)}">
            ${imgSrc ? `<div class="post-card-media"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(post.title)}" width="600" height="400" ${imgPriorityAttrs} /></div>` : ''}
            <div class="post-card-body">
              ${post.category ? `<span class="post-card-kicker">${escapeHtml(post.category)}</span>` : ''}
              <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
              ${post.excerpt ? `<p class="post-card-excerpt">${escapeHtml(post.excerpt.slice(0, 160))}</p>` : ''}
            </div>
            <div class="post-card-read-strip"><span>Read Article</span><span>&rarr;</span></div>
          </a>
        </article>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDesc)}" />${renderCustomHeadCode(branding.custom_head_code)}
  ${renderBaseStyles(theme, firstCardImg)}
</head>
<body class="theme-${escapeHtml(theme.id)}">
  ${renderHeader(branding, categories, identity)}
  <main>
    <section class="archive-header">
      <div class="shell">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span class="breadcrumbs-sep">/</span>
          <span>${escapeHtml(categoryName || pageTitle)}</span>
        </nav>
        <span class="kicker">Category Archive</span>
        <h1>${escapeHtml(categoryName || pageTitle)}</h1>
        ${pageDesc ? `<p class="excerpt" style="max-width:680px;margin-bottom:0;">${escapeHtml(pageDesc)}</p>` : ''}
      </div>
    </section>
    <section class="section-band-plain section-pad">
      <div class="shell">
        <div class="posts-grid">${cardsHtml || '<p>No articles published in this category yet.</p>'}</div>
      </div>
    </section>
  </main>
  ${renderFooter(branding, categories, identity)}
</body>
</html>`;
  }

  // Homepage layout matching decohome.homeandrecipe.com:
  // 1. Featured Story Hero Split
  // 2. All Categories Grid (3 cols)
  // 3. Latest Published Articles Grid (3 cols)
  // 4. Editorial Newsletter Band
  const leadPost = posts[0] || null;
  const leadRoute = leadPost ? resolvePostRoute(leadPost, routingMode) : null;
  const leadImg = leadPost ? resolveImageSrc(leadPost, theme.accent) : '';
  const leadAuthor = leadPost ? String((leadPost.raw_meta && leadPost.raw_meta.author) || '').trim() : '';
  const leadMetaParts: string[] = [];
  if (leadAuthor) leadMetaParts.push(`<span>By <strong>${escapeHtml(leadAuthor)}</strong></span>`);
  if (leadPost && (leadPost.modified || leadPost.date)) {
    leadMetaParts.push(
      `<time datetime="${escapeHtml(leadPost.modified || leadPost.date)}">${escapeHtml(leadPost.modified || leadPost.date)}</time>`
    );
  }

  const heroSectionHtml = leadPost && leadRoute
    ? `<section class="hero-split-band" aria-label="Featured Story">
        <div class="shell">
          <div class="hero-split-grid">
            <a class="hero-split-media" href="${escapeHtml(leadRoute.web_path)}">
              <img src="${escapeHtml(leadImg)}" alt="${escapeHtml(leadPost.title)}" width="${leadPost.image_width || 1200}" height="${leadPost.image_height || 750}" fetchpriority="high" decoding="async" />
            </a>
            <div>
              ${leadPost.category ? `<span class="kicker">${escapeHtml(leadPost.category)}</span>` : '<span class="kicker">Featured Story</span>'}
              <h1 class="hero-split-title"><a href="${escapeHtml(leadRoute.web_path)}">${escapeHtml(leadPost.title)}</a></h1>
              ${leadPost.excerpt ? `<p class="hero-split-excerpt">${escapeHtml(leadPost.excerpt.slice(0, 220))}</p>` : ''}
              ${leadMetaParts.length ? `<div class="hero-split-meta">${leadMetaParts.join(' &middot; ')}</div>` : ''}
              <a class="hero-read-cta" href="${escapeHtml(leadRoute.web_path)}">Read Full Article &rarr;</a>
            </div>
          </div>
        </div>
      </section>`
    : `<section class="hero-split-band">
        <div class="shell" style="text-align:center;max-width:700px;">
          <h1>${escapeHtml(identity.siteName)}</h1>
          <p class="excerpt">${escapeHtml(identity.tagline)}</p>
        </div>
      </section>`;

  const categoriesSectionHtml = categories.length
    ? `<section class="section-band-plain section-pad" aria-label="All Categories">
        <div class="shell">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">All Categories</h2>
              <p class="section-subtitle">Explore our categories.</p>
            </div>
            <span class="section-subtitle">${categories.length} ${categories.length === 1 ? 'Category' : 'Categories'}</span>
          </div>
          <div class="categories-grid">
            ${categories
              .map((cat) => {
                const catCount = posts.filter((p) => p.category_slug === cat.slug).length;
                return `<a class="category-card" href="/${escapeHtml(cat.slug)}/">
                  <div class="category-card-top">
                    <h3 class="category-card-title">${escapeHtml(cat.name)}</h3>
                    <span class="category-arrow-circle" aria-hidden="true">&rarr;</span>
                  </div>
                  <div class="category-card-foot">
                    <span>Explore articles</span>
                    <span>${catCount} ${catCount === 1 ? 'guide' : 'guides'} &rarr;</span>
                  </div>
                </a>`;
              })
              .join('')}
          </div>
        </div>
      </section>`
    : '';

  const latestPosts = posts.length > 1 ? posts.slice(1, 13) : posts.slice(0, 12);
  const latestCardsHtml = latestPosts
    .map((post) => {
      const route = resolvePostRoute(post, routingMode);
      const hasImg = Boolean((post.local_image_path || post.image_url || '').trim());
      const imgSrc = hasImg ? resolveImageSrc(post, theme.accent) : '';
      return `<article class="post-card">
        <a class="post-card-link" href="${escapeHtml(route.web_path)}">
          ${imgSrc ? `<div class="post-card-media"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(post.title)}" width="600" height="400" loading="lazy" decoding="async" /></div>` : ''}
          <div class="post-card-body">
            ${post.category ? `<span class="post-card-kicker">${escapeHtml(post.category)}</span>` : ''}
            <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
            ${post.excerpt ? `<p class="post-card-excerpt">${escapeHtml(post.excerpt.slice(0, 150))}</p>` : ''}
          </div>
        </a>
      </article>`;
    })
    .join('');

  const latestSectionHtml = `<section class="section-band-soft section-pad" aria-label="Latest Published Articles">
    <div class="shell">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">Latest Published Articles</h2>
          <p class="section-subtitle">Fresh inspiration and practical guides from ${escapeHtml(identity.siteName)}.</p>
        </div>
        <a class="section-meta-link" href="/sitemap/">View Complete Directory &rarr;</a>
      </div>
      <div class="posts-grid">${latestCardsHtml}</div>
    </div>
  </section>`;

  const newsletterSectionHtml = `<section class="newsletter-band" aria-label="Newsletter Signup">
    <div class="shell">
      <div class="newsletter-box">
        <span class="kicker">Newsletter</span>
        <h2 class="newsletter-title">Practical design advice, straight to your inbox</h2>
        <p class="newsletter-copy">Get new guides, room ideas, and curated inspiration from ${escapeHtml(identity.siteName)} &mdash; no spam, unsubscribe anytime.</p>
        <form class="newsletter-form" data-feedback="Thanks for subscribing to ${escapeHtml(identity.siteName)}!" onsubmit="event.preventDefault(); this.nextElementSibling.textContent=this.dataset.feedback; this.reset();">
          <input type="email" required placeholder="Enter your email address" aria-label="Email address" />
          <button type="submit" class="btn-solid">Subscribe</button>
        </form>
        <p class="form-feedback" aria-live="polite"></p>
      </div>
    </div>
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDesc)}" />
  <link rel="canonical" href="${escapeHtml(identity.siteUrl)}/" />${renderCustomHeadCode(branding.custom_head_code)}
  ${renderBaseStyles(theme, leadImg)}
</head>
<body class="theme-${escapeHtml(theme.id)}">
  ${renderHeader(branding, categories, identity)}
  <main>
    ${heroSectionHtml}
    ${categoriesSectionHtml}
    ${latestSectionHtml}
    ${newsletterSectionHtml}
  </main>
  ${renderFooter(branding, categories, identity)}
</body>
</html>`;
}

export function renderCategoryIndexHtml(params: {
  category: CategoryItem;
  posts: PostItem[];
  categories: CategoryItem[];
  themeKey: string;
  branding: BrandingConfig;
  routingMode: string;
  baseUrl?: string;
  customDomain?: string;
  projectName?: string;
}): string {
  const identity = resolveSiteIdentity({
    customDomain: params.customDomain,
    baseUrl: params.baseUrl,
    branding: params.branding,
    projectName: params.projectName,
  });
  return renderHubHtml({
    posts: params.posts,
    categories: params.categories,
    themeKey: params.themeKey,
    branding: params.branding,
    routingMode: params.routingMode,
    baseUrl: params.baseUrl,
    customDomain: params.customDomain,
    projectName: params.projectName,
    isCategoryPage: true,
    categoryName: params.category.name,
    title: `${params.category.name} — ${identity.siteName}`,
    subtitle: `Browse curated ${params.category.name.toLowerCase()} guides and inspiration on ${identity.siteName}.`,
  });
}

export function renderStaticPageHtml(params: {
  page: StaticPageSpec;
  categories: CategoryItem[];
  themeKey: string;
  branding: BrandingConfig;
  identity: SiteIdentity;
}): string {
  const { page, categories, themeKey, branding, identity } = params;
  const theme = getThemeTokens(themeKey);
  const canonical = `${identity.siteUrl.replace(/\/+$/, '')}/${page.slug}/`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title)} &mdash; ${escapeHtml(identity.siteName)}</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />${renderCustomHeadCode(branding.custom_head_code)}
  ${renderBaseStyles(theme)}
</head>
<body class="theme-${escapeHtml(theme.id)}">
  ${renderHeader(branding, categories, identity)}
  <main>
    <article class="article-container">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span class="breadcrumbs-sep">/</span>
        <span>${escapeHtml(page.title)}</span>
      </nav>
      <h1>${escapeHtml(page.title)}</h1>
      <div class="article-body">
        ${page.bodyHtml}
      </div>
    </article>
  </main>
  ${renderFooter(branding, categories, identity)}
</body>
</html>`;
}

export function getSamplePostForTheme(themeKey: string): PostItem {
  if (themeKey === 'nordic-studio') {
    return {
      slug: '20-modern-bedroom-ideas-transform-your-space-with-style',
      title: '20 Modern Bedroom Ideas: Transform Your Space with Architectural Style',
      excerpt:
        'An asymmetric architectural studio layout featuring technical room specifications, 2700K lighting plans, and White Oak herringbone flooring.',
      content_html: '',
      category: 'Modern Architecture',
      category_slug: 'modern-architecture',
      parent_slug: 'bedroom-ideas',
      date: '2026-10-20',
      modified: '2026-10-20',
      image_url: '',
      local_image_path: '',
      image_width: 1200,
      image_height: 750,
      custom_edited: false,
      takeaways: [
        "Room Dimensions First: Start with a measured floor plan — 14' x 16' is the ideal studio bedroom proportion.",
        'Lighting Specification: 2700K warm neutral ceiling and task lights create calm architectural depth.',
        'White Oak Herringbone: Wide-plank parquet adds tactile geometric rhythm without visual noise.',
      ],
      checklist: [
        { id: 'step-1', text: 'Draft a scaled floor plan with clear circulation paths' },
        { id: 'step-2', text: 'Compare White Oak herringbone flooring samples in daylight' },
        { id: 'step-3', text: 'Install 2700K warm neutral ceiling and bedside task fixtures' },
        { id: 'step-4', text: 'Finish wardrobe and drawer pulls in matte brushed hardware' },
      ],
      domain: 'stylesdays.com',
      raw_meta: {},
    };
  }
  if (themeKey === 'pinterest-mag' || themeKey === 'styleire') {
    return {
      slug: '12-botanical-sanctuary-interiors-sunlit-spaces',
      title: '12 Botanical Sanctuary Interiors & Sunlit Coffee Bar Ideas',
      excerpt:
        'A distinctive deep-forest and champagne-gold editorial magazine theme pairing Fraunces display typography, a split magazine cover hero, and an asymmetric reading layout with a sticky guide index.',
      content_html:
        '<p>Transforming an everyday room into a calm botanical sanctuary starts with grounded architectural tones, tactile oak cabinetry, and generous daylight balanced by warm brass fixtures.</p>' +
        '<h2>Optimize Vertical Shelving with Olive &amp; Brass</h2>' +
        '<p>Deep olive-green millwork paired with honed marble counters and unlacquered brass pulls instantly elevates compact kitchen nooks without crowding the floor plan.</p>' +
        '<h2>Layer Natural Linen &amp; Architectural Foliage</h2>' +
        '<p>Anchor sunlit seating areas with sculptural indoor ficus trees, woven wool rugs, and soft sage-alabaster walls that gently diffuse afternoon glare.</p>' +
        '<h2>Balance Warm 2700K Lighting Across Zones</h2>' +
        '<p>Combine recessed overhead task lights with dimmable brass wall sconces so evening spaces transition effortlessly from functional prep zones to serene retreats.</p>',
      category: 'Botanical Living',
      category_slug: 'botanical-living',
      parent_slug: 'home-decor',
      date: '2026-10-16',
      modified: '2026-10-16',
      image_url: '',
      local_image_path: '',
      image_width: 1200,
      image_height: 750,
      custom_edited: false,
      takeaways: [
        'Deep Forest & Brass Contrast: Pairing #0F2A22 millwork with warm champagne brass creates timeless architectural depth.',
        'Soft Mist Alabaster Walls: Subtle sage-tinted neutrals keep rooms airy while harmonizing with natural foliage.',
        'Structured Editorial Rhythm: Generous whitespace and numbered section anchors make long-form guides effortless to scan.',
      ],
      checklist: [
        { id: 'step-1', text: 'Sample deep forest or olive paint swatches in both morning and evening light' },
        { id: 'step-2', text: 'Pair honed stone counters with brushed champagne-brass cabinet pulls' },
        { id: 'step-3', text: 'Add two tall sculptural indoor plants near primary natural light sources' },
        { id: 'step-4', text: 'Install dimmable 2700K warm sconces for soft evening ambiance' },
      ],
      domain: 'stylesdays.com',
      raw_meta: { author: 'Olivia Sterling' },
    };
  }
  return {
    slug: '15-home-bedroom-refresh-ideas-transform-your-oasis',
    title: '15 Bedroom Refresh Ideas: Transform Your Oasis with Linen & Warmth',
    excerpt:
      'A warm editorial-styled bedroom sanctuary using Belgian linen bedding, boucle accents, and Playfair serif typography.',
    content_html: '',
    category: 'Bedroom Refresh',
    category_slug: 'bedroom-refresh',
    parent_slug: 'bedroom-ideas',
    date: '2026-10-15',
    modified: '2026-10-15',
    image_url: '',
    local_image_path: '',
    image_width: 1200,
    image_height: 750,
    custom_edited: false,
    takeaways: [
      'Belgian Linen Bedding: Natural flax weave in oat or fog colourways softens every corner.',
      'Warm Amber Lighting: Dimmable 2700K pendants eliminate harsh shadows after dusk.',
      'Tactile Accents: Merino wool throws and dried botanicals bring calm editorial warmth.',
    ],
    checklist: [
      { id: 'step-1', text: 'Pre-wash linen bedding for a relaxed editorial drape' },
      { id: 'step-2', text: 'Layer duvet, woven throw, and textured lumbar pillow' },
      { id: 'step-3', text: 'Install warm 2700K bedside lighting with dimmers' },
      { id: 'step-4', text: 'Add dried botanicals in matte ceramic vessels' },
    ],
    domain: 'stylesdays.com',
    raw_meta: {},
  };
}

export function getSeedPosts(): PostItem[] {
  const seeds: Array<[string, string, string, string]> = [
    ['best-ikea-pax-wardrobe-hacks', '15 Best IKEA PAX Wardrobe Hacks for Luxury Closets', 'IKEA Hacks', 'ikea-hacks'],
    ['small-walk-in-closet-ideas', 'Small Walk-In Closet Ideas for Maximum Storage', 'Closet Storage', 'closet-storage'],
    ['ikea-kallax-nursery-storage', 'IKEA Kallax Nursery Storage Transformations', 'IKEA Hacks', 'ikea-hacks'],
    ['minimalist-bedroom-styling', 'Minimalist Scandinavian Bedroom Styling Tips', 'Bedroom Ideas', 'bedroom-design'],
    ['cozy-living-room-layout', 'Cozy Living Room Layouts with Layered Lighting', 'Living Room Styling', 'living-room'],
  ];
  return seeds.map(([slug, title, category, catSlug]) => ({
    slug,
    title,
    excerpt: `Explore our comprehensive ${title.toLowerCase()} with step-by-step room prep instructions and material specifications.`,
    content_html: '',
    category,
    category_slug: catSlug,
    parent_slug: catSlug,
    date: '2026-10-25',
    modified: '2026-10-25',
    image_url: '',
    local_image_path: `/assets/images/${slug}.svg`,
    image_width: 1200,
    image_height: 750,
    custom_edited: false,
    takeaways: [
      `Plan measurements carefully before starting your ${category.toLowerCase()} layout.`,
      'Combine concealed storage with warm natural textures for a cohesive finish.',
    ],
    checklist: [
      { id: `${slug}-1`, text: 'Measure room dimensions and wall clearances' },
      { id: `${slug}-2`, text: 'Select cohesive neutral palette and hardware finishes' },
      { id: `${slug}-3`, text: 'Install ambient 2700K lighting to highlight architectural lines' },
    ],
    domain: 'stylesdays.com',
    raw_meta: {},
  }));
}
