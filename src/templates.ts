import type { BrandingConfig, CategoryItem, PostItem } from './types.ts';
import { resolvePostRoute, slugify } from './types.ts';

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
    bg_body: '#FAF8F5',
    text_body: '#1C1917',
    accent: '#E60023',
    accent_hover: '#C4001D',
    secondary_accent: '#C2410C',
    card_bg: '#FFFFFF',
    card_border: '#E7E2DA',
    checkbox_bg: '#F1EDE6',
    badge_bg: '#15803D',
    font_headline: "'Playfair Display', Georgia, serif",
    font_body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    header_bg: '#FFFFFF',
    muted_text: '#78716C',
    tag_bg: '#F5F5F4',
  },
  'nordic-studio': {
    id: 'nordic-studio',
    name: 'The Nordroom (Scandinavian Minimalist)',
    bg_body: '#FBFBFA',
    text_body: '#1C1C1C',
    accent: '#8C6D53',
    accent_hover: '#6E523B',
    secondary_accent: '#8C6D53',
    card_bg: '#FFFFFF',
    card_border: '#EBEBEA',
    checkbox_bg: '#F4F3F0',
    badge_bg: '#8C6D53',
    font_headline: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    font_body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    header_bg: '#FFFFFF',
    muted_text: '#686866',
    tag_bg: '#F4F3F0',
  },
  'pinterest-mag': {
    id: 'pinterest-mag',
    name: 'Styleire Magazine (Editorial & Trust Suite)',
    bg_body: '#FFFFFF',
    text_body: '#09090B',
    accent: '#09090B',
    accent_hover: '#27272A',
    secondary_accent: '#C2410C',
    card_bg: '#FFFFFF',
    card_border: '#E4E4E7',
    checkbox_bg: '#F4F4F5',
    badge_bg: '#09090B',
    font_headline: "'Playfair Display', Georgia, serif",
    font_body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    header_bg: '#FFFFFF',
    muted_text: '#71717A',
    tag_bg: '#F4F4F5',
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
  <text x="110" y="515" fill="#78716C" font-family="sans-serif" font-size="22">Curated Editorial Guide &amp; Design Specifications</text>
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

function renderBaseStyles(theme: ThemeTokens): string {
  return `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      background: ${theme.bg_body};
      color: ${theme.text_body};
      font-family: ${theme.font_body};
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .site-header {
      background: ${theme.header_bg};
      border-bottom: 1px solid ${theme.card_border};
      padding: 1rem 1.5rem;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .header-inner {
      max-width: 1120px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .brand-link {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      font-family: ${theme.font_headline};
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .brand-emblem {
      width: 34px;
      height: 34px;
      border-radius: 6px;
      background: ${theme.accent};
      color: #FFFFFF;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      font-weight: 700;
    }
    .brand-logo-img {
      height: 36px;
      max-width: 160px;
      object-fit: contain;
    }
    .nav-links {
      display: flex;
      gap: 1.25rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: ${theme.muted_text};
      flex-wrap: wrap;
    }
    .nav-links a:hover { color: ${theme.accent}; }
    .container {
      max-width: 1080px;
      margin: 0 auto;
      padding: 2.25rem 1.5rem 4rem;
    }
    .article-shell {
      max-width: 860px;
      margin: 0 auto;
    }
    .eyebrow {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${theme.accent};
      background: ${theme.tag_bg};
      padding: 0.25rem 0.65rem;
      border-radius: 4px;
      margin-bottom: 0.9rem;
    }
    h1 {
      font-family: ${theme.font_headline};
      font-size: clamp(1.9rem, 4vw, 3rem);
      line-height: 1.15;
      margin: 0 0 1rem;
      font-weight: 700;
    }
    h2 {
      font-family: ${theme.font_headline};
      font-size: 1.55rem;
      margin: 2.2rem 0 0.9rem;
    }
    .excerpt {
      font-size: 1.08rem;
      color: ${theme.muted_text};
      margin: 0 0 1.4rem;
    }
    .meta-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.82rem;
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
      background: ${theme.card_bg};
      margin-bottom: 2rem;
    }
    .hero-frame img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
    }
    .pin-badge {
      position: absolute;
      top: 14px;
      right: 14px;
      background: #E60023;
      color: #FFFFFF;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.45rem 0.85rem;
      border-radius: 999px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .card {
      background: ${theme.card_bg};
      border: 1px solid ${theme.card_border};
      border-radius: 10px;
      padding: 1.35rem 1.5rem;
      margin-bottom: 1.5rem;
    }
    .toc-box {
      background: ${theme.tag_bg};
      border-left: 3px solid ${theme.accent};
    }
    .toc-list {
      margin: 0.5rem 0 0;
      padding-left: 1.15rem;
      font-size: 0.9rem;
    }
    .takeaway-list {
      margin: 0.6rem 0 0;
      padding-left: 1.2rem;
    }
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
    .spec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.85rem;
      margin: 1.5rem 0;
    }
    .spec-tile {
      background: ${theme.card_bg};
      border: 1px solid ${theme.card_border};
      border-radius: 8px;
      padding: 0.9rem 1rem;
    }
    .spec-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${theme.muted_text};
      font-weight: 700;
    }
    .spec-value {
      font-size: 0.96rem;
      font-weight: 700;
      margin-top: 0.25rem;
    }
    .eeat-box {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: ${theme.tag_bg};
      border: 1px solid ${theme.card_border};
      border-radius: 10px;
      padding: 1.2rem;
      margin-top: 2rem;
    }
    .author-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: ${theme.accent};
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ${theme.font_headline};
      font-size: 1.35rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .hub-hero {
      text-align: center;
      max-width: 720px;
      margin: 0 auto 2.5rem;
    }
    .posts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 1.5rem;
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
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06);
    }
    .post-card img {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      display: block;
    }
    .post-card-body {
      padding: 1.15rem 1.25rem 1.35rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
    }
    .post-card-title {
      font-family: ${theme.font_headline};
      font-size: 1.2rem;
      font-weight: 700;
      line-height: 1.3;
      margin: 0;
    }
    .post-card-excerpt {
      font-size: 0.88rem;
      color: ${theme.muted_text};
      margin: 0;
    }
    .site-footer {
      border-top: 1px solid ${theme.card_border};
      padding: 2rem 1.5rem;
      text-align: center;
      font-size: 0.84rem;
      color: ${theme.muted_text};
      background: ${theme.header_bg};
    }
  </style>`;
}

function renderHeader(
  branding: BrandingConfig,
  categories: CategoryItem[],
  theme: ThemeTokens
): string {
  const brandName = escapeHtml(branding.brand_name || 'Atelier Maison');
  const initials = brandName.charAt(0).toUpperCase() || 'A';
  const logoHtml = branding.logo_path
    ? `<img class="brand-logo-img" src="${escapeHtml(branding.logo_path)}" alt="${brandName}" />`
    : `<span class="brand-emblem">${initials}</span>`;

  const navCats = categories.slice(0, 5);
  const navHtml = navCats.length
    ? navCats
        .map(
          (c) =>
            `<a href="/${escapeHtml(c.slug)}/">${escapeHtml(c.name)}</a>`
        )
        .join('')
    : `<a href="/">Home</a><a href="/living-room/">Living Room</a><a href="/bedroom/">Bedroom</a><a href="/architecture/">Architecture</a>`;

  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand-link" href="/">${logoHtml}<span>${brandName}</span></a>
      <nav class="nav-links" aria-label="Primary Navigation">${navHtml}</nav>
    </div>
  </header>`;
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
}): string {
  const { post, allPosts, themeKey, branding, categories, routingMode, baseUrl = '', sourceDomain = 'stylesdays.com' } = params;
  const theme = getThemeTokens(themeKey);
  const route = resolvePostRoute(post, routingMode);
  const canonical = baseUrl ? `${baseUrl.replace(/\/+$/, '')}${route.web_path}` : route.web_path;
  const imgSrc = resolveImageSrc(post, theme.accent);
  const fallbackUri = buildInlineSvgDataUri(post.title, post.category, theme.accent);

  const takeawaysHtml = post.takeaways.length
    ? `<section id="takeaways" class="card">
        <h2 style="margin-top:0;">Key Architectural Takeaways</h2>
        <ul class="takeaway-list">
          ${post.takeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  const checklistHtml = post.checklist.length
    ? `<section id="checklist" class="card">
        <h2 style="margin-top:0;">Room Styling Checklist</h2>
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

  const nordicSpecDrawer =
    theme.id === 'nordic-studio'
      ? `<div class="spec-grid">
          <div class="spec-tile"><div class="spec-label">Lighting Temp</div><div class="spec-value">2700K Warm Neutral</div></div>
          <div class="spec-tile"><div class="spec-label">Primary Material</div><div class="spec-value">White Oak &amp; Belgian Linen</div></div>
          <div class="spec-tile"><div class="spec-label">Routing Pattern</div><div class="spec-value">${escapeHtml(route.web_path)}</div></div>
        </div>`
      : '';

  const pinBadge =
    theme.id === 'pinterest-mag'
      ? `<span class="pin-badge">📌 Save to Pinterest</span>`
      : '';

  const tocHtml = branding.enable_toc
    ? `<nav class="card toc-box" aria-label="Table of Contents">
        <strong>In This Editorial Guide</strong>
        <ol class="toc-list">
          <li><a href="#overview">Design Direction &amp; Spatial Strategy</a></li>
          ${post.takeaways.length ? '<li><a href="#takeaways">Key Architectural Takeaways</a></li>' : ''}
          ${post.checklist.length ? '<li><a href="#checklist">Room Styling Checklist</a></li>' : ''}
          ${branding.enable_faq ? '<li><a href="#faq">Frequently Asked Questions</a></li>' : ''}
        </ol>
      </nav>`
    : '';

  const faqHtml = branding.enable_faq
    ? `<section id="faq" class="card">
        <h2 style="margin-top:0;">Frequently Asked Questions</h2>
        <p><strong>How do I adapt ${escapeHtml(post.title)} for smaller rooms?</strong><br/>Anchor the space with a single cohesive neutral tone, keep vertical sightlines unobstructed, and layer warm 2700K task lighting.</p>
        <p style="margin-bottom:0;"><strong>Which materials pair best with this ${escapeHtml(post.category || 'interior')} aesthetic?</strong><br/>Unbleached linen, matte honed stone, brushed brass, and natural wide-plank timber create lasting tactile contrast.</p>
      </section>`
    : '';

  const eeatHtml = branding.enable_eeat
    ? `<aside class="eeat-box">
        <div class="author-avatar">${escapeHtml((branding.author_name || 'A').charAt(0).toUpperCase())}</div>
        <div>
          <strong>${escapeHtml(branding.author_name || 'Anna Lindqvist')}</strong>
          <div style="font-size:0.86rem;color:${theme.muted_text};">${escapeHtml(branding.author_bio || 'Senior Interior Architect & Stylist')}</div>
        </div>
      </aside>`
    : '';

  const related = allPosts.filter((p) => p.slug !== post.slug).slice(0, 3);
  const relatedHtml = related.length
    ? `<section style="margin-top:2.5rem;">
        <h2>More Curated Guides</h2>
        <div class="posts-grid">
          ${related
            .map((rel) => {
              const relRoute = resolvePostRoute(rel, routingMode);
              const relImg = resolveImageSrc(rel, theme.accent);
              return `<article class="post-card">
                <a href="${escapeHtml(relRoute.web_path)}">
                  <img src="${escapeHtml(relImg)}" alt="${escapeHtml(rel.title)}" onerror="this.onerror=null;this.src='${fallbackUri}';" />
                  <div class="post-card-body">
                    <span class="eyebrow" style="margin-bottom:0.2rem;">${escapeHtml(rel.category)}</span>
                    <h3 class="post-card-title">${escapeHtml(rel.title)}</h3>
                  </div>
                </a>
              </article>`;
            })
            .join('')}
        </div>
      </section>`
    : '';

  const bodyHtml = post.content_html
    ? `<section id="overview" class="card">${post.content_html}</section>`
    : `<section id="overview" class="card">
        <h2 style="margin-top:0;">Design Direction &amp; Spatial Strategy</h2>
        <p>${escapeHtml(post.excerpt || `Discover timeless material pairings, spatial proportions, and curated styling principles for ${post.title}.`)}</p>
        <p style="margin-bottom:0;">Every element is balanced for calm visual rhythm—combining natural textures, functional storage architecture, and intentional warm lighting across the entire room layout.</p>
      </section>`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.modified,
    author: { '@type': 'Person', name: branding.author_name || 'Anna Lindqvist' },
    publisher: { '@type': 'Organization', name: branding.brand_name || 'Atelier Maison' },
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(post.title)} — ${escapeHtml(branding.brand_name || 'Atelier Maison')}</title>
  <meta name="description" content="${escapeHtml(post.excerpt || post.title)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <script type="application/ld+json">${jsonLd}</script>
  ${renderBaseStyles(theme)}
</head>
<body>
  ${renderHeader(branding, categories, theme)}
  <main class="container">
    <article class="article-shell">
      <div style="font-size:0.78rem;color:${theme.muted_text};margin-bottom:0.85rem;">
        ${route.breadcrumbs.map((b) => escapeHtml(b.name)).join(' &rsaquo; ')}
      </div>
      <span class="eyebrow">${escapeHtml(post.category || 'Editorial')} &middot; ${escapeHtml(theme.name)}</span>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="excerpt">${escapeHtml(post.excerpt)}</p>
      <div class="meta-row">
        <span>By <strong>${escapeHtml(branding.author_name || 'Anna Lindqvist')}</strong></span>
        <span>Updated ${escapeHtml(post.modified || post.date || '2026-10-25')}</span>
        <span>Source: ${escapeHtml(sourceDomain)}</span>
      </div>
      <div class="hero-frame">
        ${pinBadge}
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src='${fallbackUri}';" />
      </div>
      ${nordicSpecDrawer}
      ${tocHtml}
      ${bodyHtml}
      ${takeawaysHtml}
      ${checklistHtml}
      ${faqHtml}
      ${eeatHtml}
      ${relatedHtml}
    </article>
  </main>
  <footer class="site-footer">
    &copy; ${new Date().getFullYear()} ${escapeHtml(branding.brand_name || 'Atelier Maison')} &middot; ${escapeHtml(branding.tagline || 'Interior Design & Curated Living')}
  </footer>
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
}): string {
  const { posts, categories, themeKey, branding, routingMode, title, subtitle } = params;
  const theme = getThemeTokens(themeKey);
  const brand = branding.brand_name || 'Atelier Maison';
  const hubTitle = title || `${brand} Editorial Hub`;
  const hubSubtitle = subtitle || branding.tagline || 'Curated Home Organization, Room Checklists, and Architectural Guides.';

  const cardsHtml = posts
    .map((post) => {
      const route = resolvePostRoute(post, routingMode);
      const imgSrc = resolveImageSrc(post, theme.accent);
      const fallbackUri = buildInlineSvgDataUri(post.title, post.category, theme.accent);
      return `<article class="post-card">
        <a href="${escapeHtml(route.web_path)}">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(post.title)}" onerror="this.onerror=null;this.src='${fallbackUri}';" />
          <div class="post-card-body">
            <span class="eyebrow" style="margin-bottom:0.2rem;">${escapeHtml(post.category || 'Guide')}</span>
            <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
            <p class="post-card-excerpt">${escapeHtml(post.excerpt.slice(0, 140))}</p>
          </div>
        </a>
      </article>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(hubTitle)}</title>
  <meta name="description" content="${escapeHtml(hubSubtitle)}" />
  ${renderBaseStyles(theme)}
</head>
<body>
  ${renderHeader(branding, categories, theme)}
  <main class="container">
    <section class="hub-hero">
      <span class="eyebrow">${escapeHtml(theme.name)}</span>
      <h1>${escapeHtml(hubTitle)}</h1>
      <p class="excerpt">${escapeHtml(hubSubtitle)}</p>
    </section>
    <section class="posts-grid">
      ${cardsHtml}
    </section>
  </main>
  <footer class="site-footer">
    &copy; ${new Date().getFullYear()} ${escapeHtml(brand)} &middot; Powered by Multi-Cloud Static Architecture
  </footer>
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
}): string {
  return renderHubHtml({
    posts: params.posts,
    categories: params.categories,
    themeKey: params.themeKey,
    branding: params.branding,
    routingMode: params.routingMode,
    title: `${params.category.name} — ${params.branding.brand_name || 'Atelier Maison'}`,
    subtitle: `Browse curated ${params.category.name.toLowerCase()} guides, checklists, and styling inspiration.`,
  });
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
      slug: '16-coastal-bedroom-decor-essentials-transform-your-space',
      title: '16 Coastal Bedroom Decor Essentials: Transform Your Beach House Space',
      excerpt:
        'A visual pin discovery magazine layout with coastal neutral palettes, natural woven textures, and curated styling checklists.',
      content_html: '',
      category: 'Coastal Decor',
      category_slug: 'coastal-decor',
      parent_slug: 'bedroom-ideas',
      date: '2026-10-16',
      modified: '2026-10-16',
      image_url: '',
      local_image_path: '',
      image_width: 1200,
      image_height: 750,
      custom_edited: false,
      takeaways: [
        'Coastal Palette: Sandy neutrals, seafoam whites, and driftwood greys create effortless serenity.',
        'Natural Fibre Textiles: Jute rugs, washed linen throws, and rattan accents warm the room.',
        'Editorial Layering: Oversized mirrors and textured cushion trios amplify natural light.',
      ],
      checklist: [
        { id: 'step-1', text: 'Anchor the room with a hand-loomed jute or seagrass rug' },
        { id: 'step-2', text: 'Layer linen, cotton slub, and embroidered throw cushions' },
        { id: 'step-3', text: 'Mount an arched mirror opposite the primary window' },
        { id: 'step-4', text: 'Style open shelving with stoneware and whitewashed frames' },
      ],
      domain: 'stylesdays.com',
      raw_meta: {},
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

