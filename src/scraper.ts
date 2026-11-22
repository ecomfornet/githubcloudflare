import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import type { PostItem } from './types.ts';
import { normalizePost, slugify } from './types.ts';

export interface DiscoveredUrl {
  url: string;
  lastmod?: string;
  imageUrl?: string;
}

export interface OptimizedImageResult {
  localPath: string;
  absPath: string;
  width: number;
  height: number;
  originalBytes: number;
  webpBytes: number;
}

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; StylesdaysBot/2.0; +https://stylesdays.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const DEFAULT_WEBP_QUALITY = 82;
const DEFAULT_MAX_WIDTH = 1200;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (
    norm === '::1' ||
    norm === '::' ||
    norm.startsWith('fc') ||
    norm.startsWith('fd') ||
    norm.startsWith('fe80:')
  ) {
    return true;
  }
  // Dotted-decimal IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const dottedMatch = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMatch) {
    return isPrivateIpv4(dottedMatch[1]);
  }
  // Hex IPv4-mapped IPv6 normalized by Node URL parser (e.g. ::ffff:7f00:1)
  const hexMatch = norm.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(ipv4);
  }
  return false;
}

export function assertSafePublicUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol '${parsed.protocol}'`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error(`Blocked non-public host: ${host}`);
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) {
    throw new Error(`Blocked private IPv4 host: ${host}`);
  }
  if (ipVersion === 6 && isPrivateIpv6(host)) {
    throw new Error(`Blocked private IPv6 host: ${host}`);
  }
  return parsed;
}

function resolveAbsoluteUrl(candidate: string, baseUrl: string): string {
  const trimmed = String(candidate || '').trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed.startsWith('#')) {
    return '';
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
    return resolved.toString();
  } catch {
    return '';
  }
}

function pickBestUrlFromSrcset(srcset: string): string {
  if (!srcset) return '';
  let bestUrl = '';
  let bestScore = -1;
  for (const part of srcset.split(',')) {
    const tokens = part.trim().split(/\s+/);
    const url = tokens[0];
    if (!url || url.startsWith('data:')) continue;
    const desc = tokens[1] || '';
    const num = parseFloat(desc) || 1;
    const score = desc.endsWith('w') ? num : num * 1000;
    if (score >= bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function extractImageUrlFromImgEl(el: cheerio.Cheerio<any>, baseUrl: string): string {
  const candidates = [
    el.attr('data-large-file'),
    el.attr('data-orig-file'),
    el.attr('data-lazy-src'),
    el.attr('data-src'),
    el.attr('data-original'),
    el.attr('data-url'),
    pickBestUrlFromSrcset(el.attr('data-lazy-srcset') || el.attr('data-srcset') || el.attr('srcset') || ''),
    el.attr('src'),
  ];
  for (const c of candidates) {
    const abs = resolveAbsoluteUrl(String(c || ''), baseUrl);
    if (abs) return abs;
  }
  return '';
}

const MEDIA_ASSET_URL_RE = /\.(?:jpe?g|png|webp|gif|svg|avif|bmp|ico|pdf|mp4|webm|zip)(\?.*)?$/i;

function composeTimeoutSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!parent) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parent, timeoutSignal]);
  }
  return parent.aborted ? parent : timeoutSignal;
}

export async function fetchPublicSafe(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = assertSafePublicUrl(rawUrl).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      if (hop === maxRedirects) {
        throw new Error(`Too many redirects fetching ${rawUrl}`);
      }
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = assertSafePublicUrl(nextUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error(`Redirect resolution failed for ${rawUrl}`);
}

function isLikelyPostUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.xml(\?.*)?$/i.test(url)) return false;
  if (MEDIA_ASSET_URL_RE.test(url)) return false;
  if (/\/wp-content\/uploads\//i.test(url)) return false;
  return true;
}

export function parseXmlSitemapEntries(xml: string): { childSitemaps: string[]; entries: DiscoveredUrl[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const childSitemaps: string[] = [];
  const entries: DiscoveredUrl[] = [];

  $('sitemap').each((_, el) => {
    const loc = $(el).children('loc').first().text().trim() || $(el).find('loc').first().text().trim();
    if (loc) childSitemaps.push(loc);
  });

  $('url').each((_, el) => {
    // Strictly read direct <loc> child of <url> so <image:loc> can never be confused for a post URL
    const loc = $(el).children('loc').first().text().trim();
    if (!loc || !isLikelyPostUrl(loc)) return;
    const lastmod = $(el).children('lastmod').first().text().trim() || undefined;
    const imageLoc =
      $(el)
        .find('*')
        .filter((__, node) => {
          const tag = (node as { tagName?: string; name?: string }).tagName || (node as { name?: string }).name || '';
          return tag.toLowerCase() === 'image:loc';
        })
        .first()
        .text()
        .trim() || undefined;
    entries.push({ url: loc, lastmod, imageUrl: imageLoc });
  });

  // Fallback regex extraction only if cheerio found nothing; strictly ignore <image:loc>
  if (childSitemaps.length === 0 && entries.length === 0) {
    for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      const loc = match[1].trim();
      if (/\.xml(\?.*)?$/i.test(loc)) {
        childSitemaps.push(loc);
      } else if (isLikelyPostUrl(loc)) {
        entries.push({ url: loc });
      }
    }
  }

  return { childSitemaps, entries };
}

export async function discoverUrlsFromSource(
  sourceType: string,
  urlOrList: string,
  maxPosts = 0,
  signal?: AbortSignal
): Promise<DiscoveredUrl[]> {
  const limit = Number.isFinite(maxPosts) && maxPosts > 0 ? Math.floor(maxPosts) : 5000;

  if (sourceType === 'url_list') {
    const seen = new Set<string>();
    const results: DiscoveredUrl[] = [];
    for (const line of String(urlOrList || '').split(/\r?\n/)) {
      if (signal?.aborted) break;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      try {
        const safe = assertSafePublicUrl(trimmed).toString();
        if (!seen.has(safe)) {
          seen.add(safe);
          results.push({ url: safe });
          if (results.length >= limit) break;
        }
      } catch {
        // Ignore invalid/unsafe line
      }
    }
    return results;
  }

  const trimmedUrl = String(urlOrList || '').trim();
  if (!trimmedUrl) return [];

  const seenUrls = new Set<string>();
  const seenSitemaps = new Set<string>();
  const discovered: DiscoveredUrl[] = [];

  const crawlSitemap = async (sitemapUrl: string, depth: number): Promise<void> => {
    if (signal?.aborted || depth > 2 || discovered.length >= limit || seenSitemaps.has(sitemapUrl)) return;
    seenSitemaps.add(sitemapUrl);

    const safe = assertSafePublicUrl(sitemapUrl).toString();
    const res = await fetchPublicSafe(safe, {
      headers: REQUEST_HEADERS,
      signal: composeTimeoutSignal(15000, signal),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch sitemap ${safe} (HTTP ${res.status})`);
    }
    const xml = await res.text();
    const { childSitemaps, entries } = parseXmlSitemapEntries(xml);

    for (const entry of entries) {
      if (signal?.aborted || discovered.length >= limit) break;
      if (!isLikelyPostUrl(entry.url)) continue;
      try {
        const cleanUrl = assertSafePublicUrl(entry.url).toString();
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl);
          discovered.push({
            url: cleanUrl,
            lastmod: entry.lastmod,
            imageUrl: entry.imageUrl ? resolveAbsoluteUrl(entry.imageUrl, cleanUrl) : undefined,
          });
        }
      } catch {
        // Skip invalid entry
      }
    }

    // When a sitemap index lists post-sitemap*.xml alongside taxonomy/page sitemaps, prioritize post sitemaps
    const postChildren = childSitemaps.filter((c) => /post[-_]?sitemap/i.test(c));
    const orderedChildren = postChildren.length > 0 ? postChildren : childSitemaps;

    for (const child of orderedChildren) {
      if (signal?.aborted || discovered.length >= limit) break;
      try {
        await crawlSitemap(child, depth + 1);
      } catch {
        if (signal?.aborted) break;
        // Continue remaining child sitemaps
      }
    }
  };

  await crawlSitemap(trimmedUrl, 0);
  return discovered.slice(0, limit);
}

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'svg',
  'nav',
  'header',
  'footer',
  'aside',
  '.sharedaddy',
  '.jp-relatedposts',
  '.related-posts',
  '.yarpp-related',
  '.post-navigation',
  '.nav-links',
  '.comments-area',
  '#comments',
  '.author-box',
  '.post-author',
  '.newsletter',
  '.subscribe',
  '.optin',
  '.social-share',
  '.share-buttons',
  '.share-links',
  '.ad',
  '.ads',
  '.advertisement',
  '.adsbygoogle',
  '.code-block',
  '.wp-block-embed',
  '.toc_container',
  '#ez-toc-container',
  '.ez-toc-v2_0',
].join(', ');

const ALLOWED_TAGS = new Set([
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'figure',
  'figcaption',
  'img',
  'blockquote',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'hr',
  'br',
  'pre',
  'code',
  'div',
  'section',
  'span',
  'picture',
]);

export function sanitizeArticleHtml(rawHtml: string, baseUrl: string, pageTitle = ''): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  const $ = cheerio.load(`<div id="__root__">${rawHtml}</div>`);
  const root = $('#__root__');

  root.find(REMOVE_SELECTORS).remove();

  // Remove duplicate leading H1 if it duplicates the article title
  const firstH1 = root.find('h1').first();
  if (firstH1.length) {
    const h1Text = firstH1.text().trim().toLowerCase();
    if (!pageTitle || h1Text === pageTitle.trim().toLowerCase()) {
      firstH1.remove();
    } else {
      firstH1.replaceWith(`<h2>${firstH1.html() || ''}</h2>`);
    }
  }

  // Unwrap <picture> into its <img> so image rewriting works uniformly
  root.find('picture').each((_, el) => {
    const img = $(el).find('img').first();
    if (img.length) {
      $(el).replaceWith(img);
    } else {
      $(el).remove();
    }
  });

  // Resolve and clean every element
  root.find('*').each((_, node) => {
    const el = $(node);
    const tagName = ((node as { tagName?: string; name?: string }).tagName || (node as { name?: string }).name || '').toLowerCase();
    if (!tagName) return;

    if (!ALLOWED_TAGS.has(tagName)) {
      el.replaceWith(el.contents());
      return;
    }

    if (tagName === 'img') {
      const imgUrl = extractImageUrlFromImgEl(el, baseUrl);
      if (!imgUrl) {
        el.remove();
        return;
      }
      const alt = (el.attr('alt') || '').trim();
      const width = el.attr('width') || '';
      const height = el.attr('height') || '';
      const rawAttribs = (node as { attribs?: Record<string, string> }).attribs || {};
      for (const attrName of Object.keys(rawAttribs)) {
        el.removeAttr(attrName);
      }
      el.attr('src', imgUrl);
      if (alt) el.attr('alt', alt);
      if (/^\d+$/.test(width)) el.attr('width', width);
      if (/^\d+$/.test(height)) el.attr('height', height);
      el.attr('loading', 'lazy');
      return;
    }

    if (tagName === 'a') {
      const href = resolveAbsoluteUrl(el.attr('href') || '', baseUrl);
      const title = (el.attr('title') || '').trim();
      const rawAttribs = (node as { attribs?: Record<string, string> }).attribs || {};
      for (const attrName of Object.keys(rawAttribs)) {
        el.removeAttr(attrName);
      }
      if (!href) {
        el.replaceWith(el.contents());
        return;
      }
      el.attr('href', href);
      if (title) el.attr('title', title);
      el.attr('rel', 'noopener noreferrer');
      return;
    }

    // Strip all attributes from other allowed tags (eliminates on* handlers, bloat classes, inline styles)
    const rawAttribs = (node as { attribs?: Record<string, string> }).attribs || {};
    for (const attrName of Object.keys(rawAttribs)) {
      el.removeAttr(attrName);
    }
  });

  // Remove empty wrapper paragraphs/divs with no text and no media
  root.find('p, div, section, span, figure').each((_, node) => {
    const el = $(node);
    if (!el.text().trim() && el.find('img, hr, br, table').length === 0) {
      el.remove();
    }
  });

  return (root.html() || '').trim();
}

function resolveEditorSafeUrl(candidate: string): string {
  const trimmed = String(candidate || '').trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  // Preserve safe root-relative paths like /assets/images/foo.webp or /about/
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Sanitizes user-edited HTML from the dashboard rich text editor.
 * Preserves semantic formatting and local /assets/ images while stripping scripts, iframes, and event handlers.
 */
export function sanitizeEditedHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  const $ = cheerio.load(`<div id="__edit_root__">${rawHtml}</div>`);
  const root = $('#__edit_root__');

  root
    .find('script, style, noscript, iframe, object, embed, form, input, button, select, textarea, svg')
    .remove();

  root.find('*').each((_, node) => {
    const el = $(node);
    const tagName = (
      (node as { tagName?: string; name?: string }).tagName ||
      (node as { name?: string }).name ||
      ''
    ).toLowerCase();
    if (!tagName) return;

    if (tagName === 'h1') {
      el.replaceWith(`<h2>${el.html() || ''}</h2>`);
      return;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      el.replaceWith(el.contents());
      return;
    }

    const rawAttribs = (node as { attribs?: Record<string, string> }).attribs || {};

    if (tagName === 'img') {
      const safeSrc = resolveEditorSafeUrl(el.attr('src') || '');
      if (!safeSrc) {
        el.remove();
        return;
      }
      const alt = (el.attr('alt') || '').trim();
      const width = el.attr('width') || '';
      const height = el.attr('height') || '';
      for (const attrName of Object.keys(rawAttribs)) {
        el.removeAttr(attrName);
      }
      el.attr('src', safeSrc);
      if (alt) el.attr('alt', alt);
      if (/^\d+$/.test(width)) el.attr('width', width);
      if (/^\d+$/.test(height)) el.attr('height', height);
      el.attr('loading', 'lazy');
      return;
    }

    if (tagName === 'a') {
      const safeHref = resolveEditorSafeUrl(el.attr('href') || '');
      const title = (el.attr('title') || '').trim();
      for (const attrName of Object.keys(rawAttribs)) {
        el.removeAttr(attrName);
      }
      if (!safeHref) {
        el.replaceWith(el.contents());
        return;
      }
      el.attr('href', safeHref);
      if (title) el.attr('title', title);
      if (/^https?:\/\//i.test(safeHref)) {
        el.attr('rel', 'noopener noreferrer');
      }
      return;
    }

    for (const attrName of Object.keys(rawAttribs)) {
      el.removeAttr(attrName);
    }
  });

  return (root.html() || '').trim();
}

function extractJsonLdMetadata($: cheerio.CheerioAPI): {
  title?: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  category?: string;
  image?: string;
} {
  const result: {
    title?: string;
    description?: string;
    datePublished?: string;
    dateModified?: string;
    author?: string;
    category?: string;
    image?: string;
  } = {};

  const inspectNode = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) inspectNode(item);
      return;
    }
    const rec = obj as Record<string, unknown>;
    if (Array.isArray(rec['@graph'])) {
      inspectNode(rec['@graph']);
    }
    const rawType = rec['@type'];
    const types = Array.isArray(rawType) ? rawType.map(String) : [String(rawType || '')];
    const isArticle = types.some((t) => /article|blogposting|newsarticle|webpage/i.test(t));
    if (isArticle) {
      if (!result.title && typeof rec.headline === 'string') result.title = rec.headline.trim();
      if (!result.description && typeof rec.description === 'string') result.description = rec.description.trim();
      if (!result.datePublished && typeof rec.datePublished === 'string') result.datePublished = rec.datePublished.slice(0, 10);
      if (!result.dateModified && typeof rec.dateModified === 'string') result.dateModified = rec.dateModified.slice(0, 10);
      if (!result.category) {
        if (typeof rec.articleSection === 'string') result.category = rec.articleSection.trim();
        else if (Array.isArray(rec.articleSection) && typeof rec.articleSection[0] === 'string') {
          result.category = rec.articleSection[0].trim();
        }
      }
      if (!result.author && rec.author) {
        if (typeof rec.author === 'string') result.author = rec.author.trim();
        else if (typeof (rec.author as Record<string, unknown>).name === 'string') {
          result.author = String((rec.author as Record<string, unknown>).name).trim();
        }
      }
      if (!result.image && rec.image) {
        if (typeof rec.image === 'string') result.image = rec.image.trim();
        else if (Array.isArray(rec.image) && typeof rec.image[0] === 'string') result.image = rec.image[0].trim();
        else if (typeof (rec.image as Record<string, unknown>).url === 'string') {
          result.image = String((rec.image as Record<string, unknown>).url).trim();
        }
      }
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      inspectNode(parsed);
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  return result;
}

export async function scrapeArticleFromUrl(entry: DiscoveredUrl, signal?: AbortSignal): Promise<PostItem> {
  const safeUrl = assertSafePublicUrl(entry.url);
  const urlStr = safeUrl.toString();

  const res = await fetchPublicSafe(urlStr, {
    headers: REQUEST_HEADERS,
    signal: composeTimeoutSignal(20000, signal),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${urlStr}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const ld = extractJsonLdMetadata($);

  const pathSegments = safeUrl.pathname.split('/').filter(Boolean);
  const slug = slugify(pathSegments[pathSegments.length - 1] || safeUrl.hostname);

  const title =
    $('h1.entry-title, h1.post-title, article h1, main h1, h1').first().text().trim() ||
    ld.title ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    slug.replace(/-/g, ' ');

  const contentSelectors = [
    '.entry-content',
    '.post-content',
    '.article-content',
    '.td-post-content',
    '.single-content',
    '[itemprop="articleBody"]',
    '.post-body',
    'article .content',
    'main article',
    'article',
    'main',
  ];
  let rawContentHtml = '';
  for (const sel of contentSelectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 40) {
      rawContentHtml = el.html() || '';
      break;
    }
  }
  if (!rawContentHtml) {
    rawContentHtml = $('body').html() || '';
  }

  const cleanContentHtml = sanitizeArticleHtml(rawContentHtml, urlStr, title);

  // Extract excerpt strictly from source metadata or first real paragraph (never fabricated)
  const metaDesc =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    ld.description ||
    '';
  const firstParagraphText = cheerio.load(cleanContentHtml)('p').first().text().trim();
  const excerpt = (metaDesc || firstParagraphText).slice(0, 320);

  // Extract featured image strictly from source
  const ogImg =
    $('meta[property="og:image"]').attr('content')?.trim() ||
    $('meta[name="twitter:image"]').attr('content')?.trim() ||
    ld.image ||
    '';
  const wpFeaturedImg = extractImageUrlFromImgEl(
    $('img.wp-post-image, .post-thumbnail img, .featured-image img, article img').first(),
    urlStr
  );
  const firstBodyImg = cheerio.load(cleanContentHtml)('img').first().attr('src') || '';
  const imageUrl =
    resolveAbsoluteUrl(ogImg, urlStr) ||
    resolveAbsoluteUrl(entry.imageUrl || '', urlStr) ||
    wpFeaturedImg ||
    resolveAbsoluteUrl(firstBodyImg, urlStr) ||
    '';

  // Extract real source category (or clean URL section if nested)
  const category =
    $('meta[property="article:section"]').attr('content')?.trim() ||
    ld.category ||
    $('.cat-links a, .entry-categories a, .post-categories a, a[rel="category tag"]').first().text().trim() ||
    (pathSegments.length > 1
      ? pathSegments[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : '');

  const datePublished = (
    $('meta[property="article:published_time"]').attr('content') ||
    ld.datePublished ||
    $('time[datetime]').first().attr('datetime') ||
    entry.lastmod ||
    ''
  ).slice(0, 10);

  const dateModified = (
    $('meta[property="article:modified_time"]').attr('content') ||
    ld.dateModified ||
    entry.lastmod ||
    datePublished ||
    ''
  ).slice(0, 10);

  const author =
    $('meta[name="author"]').attr('content')?.trim() ||
    ld.author ||
    $('.author-name, .entry-author-name, a[rel="author"]').first().text().trim() ||
    '';

  return normalizePost({
    slug,
    title,
    excerpt,
    content_html: cleanContentHtml,
    category: category || 'Articles',
    category_slug: slugify(category || 'articles'),
    parent_slug: slugify(category || 'articles'),
    date: datePublished || new Date().toISOString().slice(0, 10),
    modified: dateModified || datePublished || new Date().toISOString().slice(0, 10),
    image_url: imageUrl,
    local_image_path: '',
    custom_edited: false,
    checklist: [],
    takeaways: [],
    domain: safeUrl.hostname,
    raw_meta: {
      source_url: urlStr,
      author,
      scraped_at: new Date().toISOString(),
    },
  });
}

export async function fetchWpApiPosts(baseUrl: string, maxPosts = 100, signal?: AbortSignal): Promise<PostItem[]> {
  const safeBase = assertSafePublicUrl(baseUrl).toString().replace(/\/+$/, '');
  const limit = Number.isFinite(maxPosts) && maxPosts > 0 ? Math.floor(maxPosts) : 1000;
  const posts: PostItem[] = [];
  let page = 1;
  const perPage = Math.min(limit, 50);

  while (posts.length < limit && !signal?.aborted) {
    const apiUrl = `${safeBase}/wp-json/wp/v2/posts?_embed=1&per_page=${perPage}&page=${page}`;
    const res = await fetchPublicSafe(apiUrl, {
      headers: REQUEST_HEADERS,
      signal: composeTimeoutSignal(15000, signal),
    });
    if (!res.ok) {
      if (page === 1) throw new Error(`WordPress REST API error (HTTP ${res.status})`);
      break;
    }
    const items = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(items) || items.length === 0) break;

    for (const wp of items) {
      if (posts.length >= limit || signal?.aborted) break;
      const link = String(wp.link || safeBase);
      const titleHtml = String((wp.title as Record<string, string> | undefined)?.rendered || '');
      const excerptHtml = String((wp.excerpt as Record<string, string> | undefined)?.rendered || '');
      const contentRaw = String((wp.content as Record<string, string> | undefined)?.rendered || '');
      const title = cheerio.load(titleHtml).text().trim() || String(wp.slug || 'post');
      const excerpt = cheerio.load(excerptHtml).text().trim().slice(0, 320);
      const contentHtml = sanitizeArticleHtml(contentRaw, link, title);

      const embedded = (wp._embedded || {}) as Record<string, unknown>;
      const featuredArr = Array.isArray(embedded['wp:featuredmedia'])
        ? (embedded['wp:featuredmedia'] as Array<Record<string, unknown>>)
        : [];
      const featuredUrl = String(featuredArr[0]?.source_url || '');

      const termGroups = Array.isArray(embedded['wp:term'])
        ? (embedded['wp:term'] as Array<Array<Record<string, unknown>>>)
        : [];
      const firstCat = termGroups[0]?.[0];
      const category = String(firstCat?.name || 'Articles').trim();

      const authors = Array.isArray(embedded.author)
        ? (embedded.author as Array<Record<string, unknown>>)
        : [];
      const author = String(authors[0]?.name || '').trim();

      let hostname = '';
      try {
        hostname = new URL(link).hostname;
      } catch {
        hostname = '';
      }

      posts.push(
        normalizePost({
          slug: String(wp.slug || slugify(title)),
          title,
          excerpt,
          content_html: contentHtml,
          category,
          category_slug: slugify(category),
          parent_slug: slugify(category),
          date: String(wp.date || '').slice(0, 10),
          modified: String(wp.modified || wp.date || '').slice(0, 10),
          image_url: featuredUrl || cheerio.load(contentHtml)('img').first().attr('src') || '',
          local_image_path: '',
          custom_edited: false,
          checklist: [],
          takeaways: [],
          domain: hostname,
          raw_meta: {
            source_url: link,
            author,
            scraped_at: new Date().toISOString(),
          },
        })
      );
    }

    if (items.length < perPage) break;
    page += 1;
  }

  return posts;
}

export async function downloadAndOptimizeImageToWebp(params: {
  imageUrl: string;
  assetsDir: string;
  filenameStem: string;
  quality?: number;
  maxWidth?: number;
  signal?: AbortSignal;
}): Promise<OptimizedImageResult> {
  const safeUrl = assertSafePublicUrl(params.imageUrl).toString();
  const quality = Math.min(100, Math.max(40, params.quality ?? DEFAULT_WEBP_QUALITY));
  const maxWidth = params.maxWidth ?? DEFAULT_MAX_WIDTH;

  const resolvedAssetsDir = path.resolve(params.assetsDir);
  fs.mkdirSync(resolvedAssetsDir, { recursive: true });

  const safeStem = slugify(params.filenameStem).slice(0, 90) || 'image';
  const targetFilename = `${safeStem}.webp`;
  const targetAbsPath = path.resolve(resolvedAssetsDir, targetFilename);
  if (!targetAbsPath.startsWith(resolvedAssetsDir + path.sep)) {
    throw new Error('Image target path escapes assets directory.');
  }

  const res = await fetchPublicSafe(safeUrl, {
    headers: {
      ...REQUEST_HEADERS,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    signal: composeTimeoutSignal(20000, params.signal),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading image ${safeUrl}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
    throw new Error(`Non-image response (${contentType}) for ${safeUrl}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const inputBuf = Buffer.from(arrayBuf);
  if (inputBuf.length === 0 || inputBuf.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image size out of bounds (${inputBuf.length} bytes)`);
  }

  const { data: webpBuf, info } = await sharp(inputBuf, { failOn: 'none' })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  fs.writeFileSync(targetAbsPath, webpBuf);

  return {
    localPath: `/assets/images/${targetFilename}`,
    absPath: targetAbsPath,
    width: info.width || 1200,
    height: info.height || 750,
    originalBytes: inputBuf.length,
    webpBytes: webpBuf.length,
  };
}

export async function localizeAndConvertPostImages(params: {
  post: PostItem;
  assetsDir: string;
  quality?: number;
  maxWidth?: number;
  signal?: AbortSignal;
  onLog?: (msg: string) => void;
}): Promise<{ downloaded: number; originalBytes: number; webpBytes: number }> {
  const { post, assetsDir, quality = DEFAULT_WEBP_QUALITY, maxWidth = DEFAULT_MAX_WIDTH, signal } = params;
  let downloaded = 0;
  let originalBytes = 0;
  let webpBytes = 0;

  const urlCache = new Map<string, OptimizedImageResult>();

  const fetchOrReuse = async (remoteUrl: string, stem: string): Promise<OptimizedImageResult | null> => {
    if (signal?.aborted) return null;
    const clean = String(remoteUrl || '').trim();
    if (!clean || !/^https?:\/\//i.test(clean)) return null;
    if (urlCache.has(clean)) return urlCache.get(clean)!;
    try {
      const res = await downloadAndOptimizeImageToWebp({
        imageUrl: clean,
        assetsDir,
        filenameStem: stem,
        quality,
        maxWidth,
        signal,
      });
      urlCache.set(clean, res);
      downloaded += 1;
      originalBytes += res.originalBytes;
      webpBytes += res.webpBytes;
      return res;
    } catch {
      return null;
    }
  };

  // 1. Featured image → /assets/images/<slug>.webp
  if (!signal?.aborted && post.image_url && /^https?:\/\//i.test(post.image_url)) {
    const feat = await fetchOrReuse(post.image_url, post.slug);
    if (feat) {
      post.local_image_path = feat.localPath;
      post.image_width = feat.width;
      post.image_height = feat.height;
    }
  }

  // 2. All in-body images inside content_html → /assets/images/<slug>-img-<n>.webp
  if (!signal?.aborted && post.content_html) {
    const $ = cheerio.load(`<div id="__body__">${post.content_html}</div>`);
    const imgs = $('#__body__ img').toArray();
    let imgIndex = 1;
    for (const node of imgs) {
      if (signal?.aborted) break;
      const el = $(node);
      const src = (el.attr('src') || '').trim();
      if (!src || !/^https?:\/\//i.test(src)) continue;
      const hashSuffix = crypto.createHash('sha1').update(src).digest('hex').slice(0, 6);
      const stem = `${post.slug}-img-${imgIndex}-${hashSuffix}`;
      imgIndex += 1;
      const opt = await fetchOrReuse(src, stem);
      if (opt) {
        el.attr('src', opt.localPath);
        el.attr('width', String(opt.width));
        el.attr('height', String(opt.height));
        el.attr('loading', 'lazy');
        if (!post.local_image_path) {
          post.local_image_path = opt.localPath;
          post.image_width = opt.width;
          post.image_height = opt.height;
        }
      }
    }
    post.content_html = ($('#__body__').html() || '').trim();
  }

  return { downloaded, originalBytes, webpBytes };
}

export async function optimizeDirectoryToWebp(params: {
  assetsDir: string;
  quality?: number;
  maxWidth?: number;
}): Promise<{
  converted: number;
  reoptimized: number;
  originalBytes: number;
  optimizedBytes: number;
  renamedMap: Map<string, string>;
}> {
  const resolvedDir = path.resolve(params.assetsDir);
  const quality = Math.min(100, Math.max(40, params.quality ?? DEFAULT_WEBP_QUALITY));
  const maxWidth = params.maxWidth ?? DEFAULT_MAX_WIDTH;
  const renamedMap = new Map<string, string>();

  let converted = 0;
  let reoptimized = 0;
  let originalBytes = 0;
  let optimizedBytes = 0;

  if (!fs.existsSync(resolvedDir)) {
    return { converted, reoptimized, originalBytes, optimizedBytes, renamedMap };
  }

  const rasterExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.avif']);
  const files = fs.readdirSync(resolvedDir);

  for (const filename of files) {
    const absPath = path.join(resolvedDir, filename);
    const stat = fs.lstatSync(absPath);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.svg') continue; // Preserve vector logos/icons if any

    if (rasterExts.has(ext)) {
      const stem = path.basename(filename, ext);
      const targetName = `${stem}.webp`;
      const targetAbs = path.join(resolvedDir, targetName);
      const inputBuf = fs.readFileSync(absPath);
      originalBytes += inputBuf.length;

      try {
        const webpBuf = await sharp(inputBuf, { failOn: 'none' })
          .rotate()
          .resize({ width: maxWidth, withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .toBuffer();
        fs.writeFileSync(targetAbs, webpBuf);
        if (targetAbs !== absPath) fs.unlinkSync(absPath);
        optimizedBytes += webpBuf.length;
        converted += 1;
        renamedMap.set(`/assets/images/${filename}`, `/assets/images/${targetName}`);
      } catch {
        optimizedBytes += inputBuf.length;
      }
    } else if (ext === '.webp') {
      const inputBuf = fs.readFileSync(absPath);
      originalBytes += inputBuf.length;
      try {
        const webpBuf = await sharp(inputBuf, { failOn: 'none' })
          .rotate()
          .resize({ width: maxWidth, withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .toBuffer();
        if (webpBuf.length < inputBuf.length) {
          fs.writeFileSync(absPath, webpBuf);
          optimizedBytes += webpBuf.length;
        } else {
          optimizedBytes += inputBuf.length;
        }
        reoptimized += 1;
      } catch {
        optimizedBytes += inputBuf.length;
      }
    }
  }

  return { converted, reoptimized, originalBytes, optimizedBytes, renamedMap };
}
