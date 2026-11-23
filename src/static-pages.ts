import * as cheerio from 'cheerio';
import type { BrandingConfig, CategoryItem, PostItem, StaticPageOverride } from './types.ts';
import { deriveBrandFromDomain, resolvePostRoute, slugify, stripProtocol } from './types.ts';

export interface SiteIdentity {
  siteName: string;
  domain: string;
  rootDomain: string;
  siteUrl: string;
  contactEmail: string;
  tagline: string;
}

export interface StaticPageSpec {
  slug: string;
  title: string;
  description: string;
  bodyHtml: string;
  isCustom?: boolean;
  updatedAt?: string;
}

export interface EditableStaticPageMeta {
  slug: string;
  label: string;
}

export const EDITABLE_STATIC_PAGE_META: readonly EditableStaticPageMeta[] = [
  { slug: 'about', label: 'About Us' },
  { slug: 'contact', label: 'Contact' },
  { slug: 'editorial-policy', label: 'Editorial Policy' },
  { slug: 'fact-checking-policy', label: 'Fact-Checking Policy' },
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'cookie-policy', label: 'Cookie Policy' },
  { slug: 'terms', label: 'Terms & Conditions' },
  { slug: 'disclaimer', label: 'Disclaimer' },
  { slug: 'copyright', label: 'Copyright & Images' },
] as const;

const EDITABLE_SLUG_SET = new Set(EDITABLE_STATIC_PAGE_META.map((m) => m.slug));

export function isEditableStaticPageSlug(slug: string): boolean {
  return EDITABLE_SLUG_SET.has(String(slug || '').trim().toLowerCase());
}

const STATIC_PAGE_ALLOWED_TAGS = new Set([
  'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
  'span', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
  'br', 'hr',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'figure', 'figcaption',
  'img', 'a',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'details', 'summary',
  'form', 'label', 'input', 'textarea', 'select', 'option', 'button',
]);

const STATIC_PAGE_ALLOWED_ATTRS = new Set([
  'class', 'id', 'href', 'src', 'alt', 'title', 'target', 'rel',
  'width', 'height', 'loading', 'decoding',
  'type', 'name', 'placeholder', 'rows', 'cols', 'required', 'for', 'value',
  'colspan', 'rowspan', 'aria-label', 'aria-live', 'role', 'open', 'method', 'action',
]);

function sanitizePageSafeUrl(raw: string, allowMailTel = true): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return '';
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  if (allowMailTel && /^(mailto|tel):/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Sanitizes user-uploaded or user-edited HTML for static company/legal pages.
 * Preserves semantic layout, links (including mailto:/tel:), tables, images, and contact forms,
 * while stripping executable tags (<script>, <iframe>, <object>, <embed>) and inline on* handlers.
 */
export function sanitizeStaticPageHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  const $ = cheerio.load(`<div id="__static_page_root__">${rawHtml}</div>`);
  const root = $('#__static_page_root__');

  root.find('script, style, noscript, iframe, object, embed, applet, base, meta, link').remove();

  // Pass 1: Structural normalization (convert <h1> -> <h2> and unwrap disallowed tags) BEFORE attribute sanitization
  // so that nested children inside <h1> or custom wrapper tags are always visited in Pass 2.
  for (let pass = 0; pass < 8; pass += 1) {
    let mutated = false;
    root.find('*').each((_, node) => {
      const el = $(node);
      const tagName = (
        (node as { tagName?: string; name?: string }).tagName ||
        (node as { name?: string }).name ||
        ''
      ).toLowerCase();
      if (!tagName) return;

      if (tagName === 'h1') {
        el.replaceWith($('<h2></h2>').append(el.contents()));
        mutated = true;
        return;
      }

      if (!STATIC_PAGE_ALLOWED_TAGS.has(tagName)) {
        el.replaceWith(el.contents());
        mutated = true;
      }
    });
    if (!mutated) break;
  }

  // Pass 2: Sanitize attributes and URLs on all surviving allowed elements
  root.find('*').each((_, node) => {
    const el = $(node);
    const tagName = (
      (node as { tagName?: string; name?: string }).tagName ||
      (node as { name?: string }).name ||
      ''
    ).toLowerCase();
    if (!tagName || !STATIC_PAGE_ALLOWED_TAGS.has(tagName)) return;

    const rawAttribs = (node as { attribs?: Record<string, string> }).attribs || {};
    for (const [attrName, attrVal] of Object.entries(rawAttribs)) {
      const lower = attrName.toLowerCase();
      if (lower.startsWith('on') || !STATIC_PAGE_ALLOWED_ATTRS.has(lower)) {
        el.removeAttr(attrName);
        continue;
      }
      if (lower === 'href') {
        const safe = sanitizePageSafeUrl(attrVal, true);
        if (!safe) el.removeAttr(attrName);
        else {
          el.attr('href', safe);
          if (/^https?:\/\//i.test(safe)) {
            el.attr('rel', 'noopener noreferrer');
          }
        }
      } else if (lower === 'src') {
        const safe = sanitizePageSafeUrl(attrVal, false);
        if (!safe) {
          if (tagName === 'img') {
            el.remove();
            return;
          }
          el.removeAttr(attrName);
        } else {
          el.attr('src', safe);
        }
      } else if (lower === 'action') {
        const safe = sanitizePageSafeUrl(attrVal, true);
        if (!safe) el.removeAttr(attrName);
        else el.attr('action', safe);
      }
    }
  });

  return (root.html() || '').trim();
}

/**
 * Extracts body HTML plus optional <title> and <meta name="description"> from
 * either a full uploaded HTML document or an HTML fragment, then sanitizes it safely.
 */
export function extractUploadedPageHtml(rawInput: string): {
  title?: string;
  description?: string;
  bodyHtml: string;
} {
  const raw = String(rawInput || '').trim();
  if (!raw) return { bodyHtml: '' };

  let extractedTitle: string | undefined;
  let extractedDesc: string | undefined;
  let candidateBody = raw;

  const hasFullDoc = /<(?:!doctype|html|head|body)\b/i.test(raw);
  if (hasFullDoc) {
    const $doc = cheerio.load(raw);
    const t = $doc('head title').first().text().trim();
    if (t) extractedTitle = t.slice(0, 160);
    const d = $doc('meta[name="description"]').attr('content')?.trim();
    if (d) extractedDesc = d.slice(0, 300);
    const bodyEl = $doc('body');
    if (bodyEl.length > 0) {
      candidateBody = bodyEl.html() || '';
    }
  }

  return {
    ...(extractedTitle ? { title: extractedTitle } : {}),
    ...(extractedDesc ? { description: extractedDesc } : {}),
    bodyHtml: sanitizeStaticPageHtml(candidateBody),
  };
}

/**
 * Extracts the apex/root domain when a custom domain has a subdomain (e.g. decohome.homeandrecipe.com -> homeandrecipe.com),
 * while keeping standard two-part domains intact (e.g. gardenhomi.com -> gardenhomi.com).
 */
export function extractRootDomain(rawDomain: string): string {
  const clean = stripProtocol(rawDomain).split('/')[0].replace(/^www\./i, '').toLowerCase().trim();
  if (!clean) return '';
  const parts = clean.split('.').filter(Boolean);
  if (parts.length <= 2) return clean;
  // Preserve multi-part public suffixes like .co.uk, .com.au, .workers.dev, .github.io, .pages.dev
  const lastTwo = parts.slice(-2).join('.');
  const multiPartSuffixes = new Set(['co.uk', 'org.uk', 'com.au', 'net.au', 'co.nz', 'com.br', 'workers.dev', 'pages.dev', 'github.io']);
  if (multiPartSuffixes.has(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Derives consistent publication name, domain, URL, and contact email automatically from the custom domain
 * (falling back cleanly to brand_name / project_name when no custom domain is configured).
 */
export function resolveSiteIdentity(params: {
  customDomain?: string;
  baseUrl?: string;
  branding: BrandingConfig;
  projectName?: string;
}): SiteIdentity {
  const rawCustom = stripProtocol(params.customDomain || '').split('/')[0].trim();
  const rawBaseHost = stripProtocol(params.baseUrl || '').split('/')[0].trim();
  const effectiveDomain = rawCustom || rawBaseHost || '';
  const rootDomain = extractRootDomain(rawCustom || rawBaseHost || '');

  // When a custom domain is provided, derive the publication name & email directly from it
  let siteName = '';
  if (rawCustom) {
    siteName = deriveBrandFromDomain(rootDomain || rawCustom, params.projectName || '');
  } else {
    siteName = (params.branding.brand_name || '').trim() || deriveBrandFromDomain(rawBaseHost, params.projectName || 'Editorial');
  }

  const emailDomain = rawCustom
    ? (rootDomain || rawCustom).replace(/^www\./i, '')
    : `${slugify(siteName)}.com`;
  const contactEmail = `contact@${emailDomain}`;
  const siteUrl = rawCustom
    ? `https://${rawCustom}`
    : params.baseUrl
      ? params.baseUrl.replace(/\/+$/, '')
      : `https://${emailDomain}`;

  const tagline =
    (params.branding.tagline || '').trim() ||
    `${siteName} is an independent publication with practical articles, curated ideas, and inspiration for your home.`;

  return {
    siteName,
    domain: effectiveDomain || emailDomain,
    rootDomain: rootDomain || emailDomain,
    siteUrl,
    contactEmail,
    tagline,
  };
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildTrustPages(params: {
  identity: SiteIdentity;
  posts: PostItem[];
  categories: CategoryItem[];
  routingMode: string;
  overrides?: Record<string, StaticPageOverride>;
}): StaticPageSpec[] {
  const { identity, posts, categories, routingMode, overrides } = params;
  const name = esc(identity.siteName);
  const domain = esc(identity.domain);
  const email = esc(identity.contactEmail);
  const today = new Date().toISOString().slice(0, 10);

  const categoryLinksHtml = categories
    .map((c) => {
      const catCount = posts.filter((p) => p.category_slug === c.slug).length;
      return `<li><a href="/${esc(c.slug)}/">${esc(c.name)}</a> <span>(${catCount})</span></li>`;
    })
    .join('');

  const articleLinksHtml = posts
    .map((p) => {
      const route = resolvePostRoute(p, routingMode);
      return `<li><a href="${esc(route.web_path)}">${esc(p.title)}</a></li>`;
    })
    .join('');

  const basePages: StaticPageSpec[] = [
    {
      slug: 'about',
      title: `About ${identity.siteName}`,
      description: `Learn about ${identity.siteName}, our editorial mission, and how we publish practical guides.`,
      bodyHtml: `
        <p><strong>${name}</strong> is an independent home and lifestyle publication dedicated to practical guides, room-by-room inspiration, and clear, honest advice for everyday living spaces.</p>
        <h2>What we cover</h2>
        <p>We publish structured guides covering interior spaces, outdoor living, organization, and design inspiration tailored to real homes—from compact apartments to family residences.</p>
        <h2>How we work</h2>
        <p>Every guide published on <strong>${domain}</strong> is curated and reviewed for clarity, accuracy, and usefulness. We focus on practical ideas that readers can apply directly in their own spaces.</p>
        <h2>Get in touch</h2>
        <p>Have a question, correction, or suggestion? Reach out anytime via our <a href="/contact/">Contact page</a> or email us directly at <a href="mailto:${email}">${email}</a>.</p>
      `,
    },
    {
      slug: 'contact',
      title: 'Get in touch',
      description: `Contact ${identity.siteName} at ${identity.contactEmail} for questions, feedback, or corrections.`,
      bodyHtml: `
        <p>Questions, corrections, or story ideas — we read every message. You can also email us directly at <a href="mailto:${email}"><strong>${email}</strong></a>.</p>
        <form class="trust-contact-form" data-feedback="Thank you — your message has been noted. For direct inquiries, email ${email}." onsubmit="event.preventDefault(); this.querySelector('.form-feedback').textContent=this.dataset.feedback; this.reset();">
          <div class="form-row">
            <label for="contactName">Your name</label>
            <input id="contactName" type="text" required placeholder="Full name" />
          </div>
          <div class="form-row">
            <label for="contactEmail">Email</label>
            <input id="contactEmail" type="email" required placeholder="you@example.com" />
          </div>
          <div class="form-row">
            <label for="contactSubject">Subject</label>
            <input id="contactSubject" type="text" required placeholder="Question, correction, or feedback" />
          </div>
          <div class="form-row">
            <label for="contactMessage">Message</label>
            <textarea id="contactMessage" rows="5" required placeholder="Write your message here..."></textarea>
          </div>
          <button type="submit" class="btn-solid">Send Message</button>
          <p class="form-feedback" aria-live="polite"></p>
        </form>
      `,
    },
    {
      slug: 'editorial-policy',
      title: 'Editorial Policy',
      description: `How ${identity.siteName} creates, reviews, and updates published articles.`,
      bodyHtml: `
        <p><strong>${name}</strong> exists to give readers practical, clear, and trustworthy guidance. This editorial policy explains how our content is created and maintained on <strong>${domain}</strong>.</p>
        <h2>Independence</h2>
        <p>Our editorial coverage is independent. Advertisers, sponsors, and external partners have no editorial control over the topics we cover or the conclusions we publish.</p>
        <h2>Review &amp; Standards</h2>
        <p>Articles are reviewed for readability, factual accuracy, and helpful structure before publication. Guides involving materials, outdoor builds, or home maintenance are checked against reliable manufacturer and industry references.</p>
        <h2>Updates &amp; Corrections</h2>
        <p>We periodically review and update articles as better information becomes available. If you spot an error, please let us know at <a href="mailto:${email}">${email}</a>.</p>
      `,
    },
    {
      slug: 'fact-checking-policy',
      title: 'Fact-Checking Policy',
      description: `Our commitment to accuracy and verification on ${identity.siteName}.`,
      bodyHtml: `
        <p>Accuracy matters on <strong>${name}</strong>. We take care to verify dimensions, material guidance, care recommendations, and practical claims before publishing on <strong>${domain}</strong>.</p>
        <h2>Verification Process</h2>
        <ul>
          <li>Checking measurements, sizing recommendations, and material specifications against reliable primary documentation.</li>
          <li>Reviewing seasonal and maintenance guidance to ensure safe, practical recommendations.</li>
          <li>Updating published pages promptly when new standards or corrections are identified.</li>
        </ul>
        <h2>Report a Correction</h2>
        <p>If you notice an inaccuracy anywhere on ${name}, email <a href="mailto:${email}">${email}</a> with the page URL and details so our team can review and correct it promptly.</p>
      `,
    },
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      description: `Privacy Policy for ${identity.siteName} (${identity.domain}).`,
      bodyHtml: `
        <p><em>Last updated: ${today}</em></p>
        <p>This Privacy Policy describes how <strong>${name}</strong> (&ldquo;we&rdquo;, &ldquo;our&rdquo;) collects, uses, and protects information when you visit <strong>${domain}</strong>. By using this site, you agree to the practices described below.</p>
        <h2>Information We Collect</h2>
        <p>We collect information you provide directly (for example, when contacting us by email at <a href="mailto:${email}">${email}</a>) and standard technical logs collected automatically by web infrastructure (such as browser type, referring page, and pages viewed).</p>
        <h2>How We Use Information</h2>
        <ul>
          <li>To operate, maintain, and improve ${name} and its published content.</li>
          <li>To respond to reader questions, corrections, and requests.</li>
          <li>To measure aggregate readership and protect the site against abuse.</li>
        </ul>
        <h2>Third-Party Services &amp; Advertising</h2>
        <p>${name} may display advertising or use privacy-respecting analytics partners that rely on cookies or similar technologies. You can control cookies at any time through your browser settings or review our <a href="/cookie-policy/">Cookie Policy</a>.</p>
        <h2>Contact</h2>
        <p>For privacy requests or questions, please email <a href="mailto:${email}">${email}</a>.</p>
      `,
    },
    {
      slug: 'cookie-policy',
      title: 'Cookie Policy',
      description: `How cookies are used on ${identity.siteName} (${identity.domain}).`,
      bodyHtml: `
        <p><em>Last updated: ${today}</em></p>
        <p>This Cookie Policy explains how <strong>${name}</strong> uses cookies and similar browser technologies on <strong>${domain}</strong>.</p>
        <h2>What Are Cookies?</h2>
        <p>Cookies are small text files stored on your device when you browse websites. They help sites remember preferences, measure aggregate traffic, and deliver relevant content.</p>
        <h2>Types of Cookies We May Use</h2>
        <ul>
          <li><strong>Essential cookies</strong> required for reliable page delivery and security.</li>
          <li><strong>Analytics cookies</strong> used to understand which guides are most useful to readers.</li>
          <li><strong>Advertising cookies</strong> used by third-party ad networks if display ads are active on the site.</li>
        </ul>
        <h2>Managing Cookies</h2>
        <p>You can block or delete cookies in your browser settings at any time. Questions? Contact us at <a href="mailto:${email}">${email}</a>.</p>
      `,
    },
    {
      slug: 'terms',
      title: 'Terms & Conditions',
      description: `Terms and Conditions governing use of ${identity.siteName} (${identity.domain}).`,
      bodyHtml: `
        <p><em>Last updated: ${today}</em></p>
        <p>By accessing <strong>${domain}</strong>, you agree to these Terms &amp; Conditions for <strong>${name}</strong>.</p>
        <h2>Use of Content</h2>
        <p>Content published on ${name} is provided for personal, non-commercial informational and inspiration purposes. You may share links to our pages, but automated scraping, republishing full articles, or commercial redistribution without permission is prohibited.</p>
        <h2>No Professional Warranty</h2>
        <p>All home, decor, and project information is provided &ldquo;as is&rdquo; without warranties of any kind. Always verify measurements, electrical/structural safety, and local building requirements with qualified professionals before undertaking renovations.</p>
        <h2>Contact</h2>
        <p>Questions about these terms may be sent to <a href="mailto:${email}">${email}</a>.</p>
      `,
    },
    {
      slug: 'disclaimer',
      title: 'Disclaimer',
      description: `Editorial and informational disclaimer for ${identity.siteName}.`,
      bodyHtml: `
        <p>The information published on <strong>${name}</strong> (<strong>${domain}</strong>) is intended for general informational and design inspiration purposes only.</p>
        <h2>DIY, Construction &amp; Safety</h2>
        <p>Home improvement, outdoor fire features, structural installations, and electrical work carry inherent safety risks. Always follow manufacturer instructions, local codes, and consult licensed professionals whenever required.</p>
        <h2>External Links &amp; Affiliates</h2>
        <p>Pages on ${name} may link to third-party websites or products. We are not responsible for external site content, pricing, or availability. For questions, contact <a href="mailto:${email}">${email}</a>.</p>
      `,
    },
    {
      slug: 'copyright',
      title: 'Copyright & Images',
      description: `Copyright notice and image attribution policy for ${identity.siteName}.`,
      bodyHtml: `
        <p><strong>${name}</strong> respects the intellectual property rights of creators, photographers, designers, and publishers.</p>
        <h2>Copyright &amp; Attribution</h2>
        <p>All original text, layout, and curation on <strong>${domain}</strong> are protected by applicable copyright laws. Images displayed on our pages are optimized for web delivery and intended to illustrate editorial concepts.</p>
        <h2>Removal or Attribution Requests</h2>
        <p>If you are a copyright holder and believe any image or material on ${name} requires attribution, credit update, or immediate removal, please email <a href="mailto:${email}"><strong>${email}</strong></a> with the exact URL and proof of ownership. We respond promptly to all valid notices.</p>
      `,
    },
    {
      slug: 'sitemap',
      title: 'Sitemap',
      description: `Complete directory of categories, articles, and pages on ${identity.siteName}.`,
      bodyHtml: `
        <p>Browse the complete directory of categories, published articles, and company pages on <strong>${name}</strong>.</p>
        <h2>Categories (${categories.length})</h2>
        <ul class="sitemap-list">${categoryLinksHtml || '<li><a href="/">Home</a></li>'}</ul>
        <h2>Published Articles (${posts.length})</h2>
        <ul class="sitemap-list">${articleLinksHtml || '<li>No articles published yet.</li>'}</ul>
        <h2>Company &amp; Policies</h2>
        <ul class="sitemap-list">
          <li><a href="/about/">About Us</a></li>
          <li><a href="/contact/">Contact</a></li>
          <li><a href="/editorial-policy/">Editorial Policy</a></li>
          <li><a href="/fact-checking-policy/">Fact-Checking Policy</a></li>
          <li><a href="/privacy-policy/">Privacy Policy</a></li>
          <li><a href="/cookie-policy/">Cookie Policy</a></li>
          <li><a href="/terms/">Terms &amp; Conditions</a></li>
          <li><a href="/disclaimer/">Disclaimer</a></li>
          <li><a href="/copyright/">Copyright &amp; Images</a></li>
        </ul>
      `,
    },
  ];

  const defaults: StaticPageSpec[] = basePages;
  if (!overrides || Object.keys(overrides).length === 0) {
    return defaults;
  }

  return defaults.map((page) => {
    const custom = overrides[page.slug];
    if (!custom || !isEditableStaticPageSlug(page.slug)) {
      return page;
    }
    return {
      slug: page.slug,
      title: (custom.title || '').trim() || page.title,
      description: (custom.description || '').trim() || page.description,
      bodyHtml: (custom.body_html || '').trim() || page.bodyHtml,
      isCustom: true,
      updatedAt: custom.updated_at || '',
    };
  });
}
