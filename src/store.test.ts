import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveBrandFromDomain,
  maskToken,
  normalizeRoutingMode,
  normalizeThemeCustomizations,
  resolvePostRoute,
  slugify,
} from './types.ts';
import { DashboardStore } from './store.ts';
import { assertSafePublicUrl } from './scraper.ts';
import { extractArticleTocAndAnchors, getThemeTokens, renderCustomHeadCode } from './templates.ts';

test('pure helpers: maskToken, slugify, deriveBrandFromDomain', () => {
  assert.equal(maskToken(''), '');
  assert.equal(maskToken('short'), '****');
  assert.equal(maskToken('ghp_1234567890abcd'), 'ghp_****abcd');

  assert.equal(slugify('Cozy Living Room! 2026'), 'cozy-living-room-2026');
  assert.equal(deriveBrandFromDomain('https://www.nordic-atelier.com/'), 'Nordic Atelier');
  assert.equal(normalizeRoutingMode('silo_nested'), 'silo_nested');
  assert.equal(normalizeRoutingMode('unknown'), 'single');
});

test('resolvePostRoute supports all 4 routing modes', () => {
  const sample = {
    slug: 'minimalist-bedroom',
    title: 'Minimalist Bedroom',
    category: 'Bedroom Ideas',
    category_slug: 'bedroom-ideas',
    parent_slug: 'rooms',
  };

  assert.equal(resolvePostRoute(sample, 'single').web_path, '/minimalist-bedroom/');
  assert.equal(resolvePostRoute(sample, 'category_slug').web_path, '/bedroom-ideas/minimalist-bedroom/');
  assert.equal(resolvePostRoute(sample, 'parent_slug').web_path, '/rooms/minimalist-bedroom/');
  assert.equal(resolvePostRoute(sample, 'silo_nested').web_path, '/guides/bedroom-ideas/minimalist-bedroom/');
});

test('DashboardStore: project isolation, ingestion diffing, custom edit preservation, build & preview', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-hub-test-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });

    // Create isolated project
    const created = store.createProject({ name: 'Nordic Loft', platform: 'cloudflare' });
    assert.equal(created.success, true);
    assert.equal(created.active_project, 'nordic-loft');
    assert.equal(store.listPosts().length, 0);

    // Run deterministic seed ingestion
    const diff1 = await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    assert.equal(diff1.counts.new, 5);
    assert.equal(store.listPosts().length, 5);

    // Edit a post and confirm custom_edited is preserved on re-ingestion
    const firstSlug = store.listPosts()[0].slug;
    const edited = store.updatePost(firstSlug, { title: 'Custom Curated Title' });
    assert.ok(edited);
    assert.equal(edited.custom_edited, true);

    const diff2 = await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    assert.equal(diff2.counts.new, 0);
    assert.equal(store.getPost(firstSlug)?.title, 'Custom Curated Title');

    // Render all 3 themes in article & hub modes
    for (const theme of ['editorial-warm', 'nordic-studio', 'pinterest-mag']) {
      const articleHtml = store.renderPreview({ slug: firstSlug, theme });
      assert.match(articleHtml, /Custom Curated Title/);
      assert.match(articleHtml, /Related Articles/);
      const hubHtml = store.renderPreview({ theme, viewMode: 'hub' });
      assert.match(hubHtml, /All Categories/);
      assert.match(hubHtml, /Latest Published Articles/);
      assert.match(hubHtml, /Practical design advice, straight to your inbox/);
    }

    // Run static build and confirm output files
    const build = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'nordic-studio' });
    assert.equal(build.success, true);
    const outDir = String(build.output_dir);
    assert.equal(fs.existsSync(path.join(outDir, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'sitemap.xml')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'robots.txt')), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Cloudflare env credentials survive empty pseo_config.json and verify supports Account API tokens', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-cf-env-test-'));
  const origToken = process.env.CLOUDFLARE_API_TOKEN;
  const origAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const origFetch = globalThis.fetch;

  try {
    // Write a pseo_config.json with empty strings (exact bug scenario)
    fs.writeFileSync(
      path.join(tmpDir, 'pseo_config.json'),
      JSON.stringify({
        cloudflare: { api_token: '', account_id: '', project_name: 'demo-worker' },
      }),
      'utf-8'
    );

    process.env.CLOUDFLARE_API_TOKEN = 'Bearer cf_test_account_token_123456';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_9876543210';

    const store = new DashboardStore({ workspaceDir: tmpDir });
    const masked = store.getConfigMasked() as { cloudflare: { has_token: boolean; account_id: string } };
    assert.equal(masked.cloudflare.has_token, true);
    assert.equal(masked.cloudflare.account_id, 'acct_9876543210');

    // Simulate Account API Token: /user/tokens/verify fails (401), /accounts/{id}/tokens/verify succeeds
    const calledUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calledUrls.push(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      assert.equal(auth, 'Bearer cf_test_account_token_123456');

      if (url.endsWith('/user/tokens/verify')) {
        return new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'Invalid API Token' }] }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/accounts/acct_9876543210/tokens/verify')) {
        return new Response(JSON.stringify({ success: true, result: { status: 'active' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/accounts/acct_9876543210/workers/subdomain')) {
        return new Response(JSON.stringify({ success: true, result: { subdomain: 'demo-edge' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const verifyRes = await store.verifyCloudflareCredentials('', '');
    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.verified, true);
    assert.equal(verifyRes.account_id, 'acct_9876543210');
    assert.equal(verifyRes.subdomain, 'demo-edge');
    assert.equal(calledUrls.some((u) => u.includes('/accounts/acct_9876543210/tokens/verify')), true);

    // Missing token returns explicit error field (not generic undefined)
    delete process.env.CLOUDFLARE_API_TOKEN;
    const emptyStore = new DashboardStore({ workspaceDir: tmpDir });
    const missingRes = await emptyStore.verifyCloudflareCredentials('', '');
    assert.equal(missingRes.success, false);
    assert.match(String(missingRes.error || ''), /CLOUDFLARE_API_TOKEN/);
  } finally {
    if (origToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = origToken;
    if (origAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = origAccount;
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('deployCloudflareWorkersAssets uploads static assets, binds Worker, enables workers.dev, and verifies live edge', async () => {
  const { deployCloudflareWorkersAssets, sanitizeWorkerScriptName } = await import('./cloudflare-deployer.ts');
  assert.equal(sanitizeWorkerScriptName('Garden_Homi!'), 'garden-homi');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-cf-deploy-test-'));
  const outDir = path.join(tmpDir, 'dist', 'gardenhomi');
  fs.mkdirSync(path.join(outDir, 'assets', 'images'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><h1>GardenHomi Live</h1>', 'utf-8');
  fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf-8');
  fs.writeFileSync(path.join(outDir, 'assets', 'images', 'hero.svg'), '<svg></svg>', 'utf-8');

  const origFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string }> = [];

  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      calls.push({ method, url });

      if (url.endsWith('/workers/scripts/gardenhomi/assets-upload-session')) {
        const parsed = JSON.parse(String(init?.body || '{}')) as { manifest: Record<string, { hash: string }> };
        const hashes = Object.values(parsed.manifest).map((m) => m.hash);
        assert.equal(hashes.length, 3);
        return new Response(
          JSON.stringify({ success: true, result: { jwt: 'session_jwt_1', buckets: [hashes] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/workers/assets/upload?base64=true')) {
        const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
        assert.equal(auth, 'Bearer session_jwt_1');
        return new Response(
          JSON.stringify({ success: true, result: { jwt: 'completion_jwt_2' } }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (method === 'PUT' && url.endsWith('/workers/scripts/gardenhomi')) {
        return new Response(JSON.stringify({ success: true, result: { id: 'gardenhomi' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'POST' && url.endsWith('/workers/scripts/gardenhomi/subdomain')) {
        const parsed = JSON.parse(String(init?.body || '{}')) as { enabled: boolean };
        assert.equal(parsed.enabled, true);
        return new Response(JSON.stringify({ success: true, result: { enabled: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === 'https://gardenhomi.demoedge.workers.dev/') {
        return new Response('<!doctype html><h1>GardenHomi Live</h1>', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const res = await deployCloudflareWorkersAssets({
      apiToken: 'cfat_test_token',
      accountId: '7dc0e6c5b46881fec4f36bad5ac438a4',
      scriptName: 'gardenhomi',
      outputDir: outDir,
      workspaceDir: tmpDir,
      accountSubdomain: 'demoedge',
    });

    assert.equal(res.filesCount, 3);
    assert.equal(res.uploadedFiles, 3);
    assert.equal(res.liveUrl, 'https://gardenhomi.demoedge.workers.dev');
    assert.equal(res.edgeVerification.ok, true);
    assert.equal(res.edgeVerification.status, 200);
    assert.equal(calls.some((c) => c.method === 'PUT' && c.url.endsWith('/workers/scripts/gardenhomi')), true);
    assert.equal(calls.some((c) => c.method === 'POST' && c.url.endsWith('/workers/scripts/gardenhomi/subdomain')), true);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scraper extracts exact source post, converts images to WebP via sharp, blocks private hosts, and renders without extra filler', async () => {
  const sharp = (await import('sharp')).default;
  const { assertSafePublicUrl } = await import('./scraper.ts');

  // SSRF protection checks
  assert.throws(() => assertSafePublicUrl('http://127.0.0.1/secret'), /Blocked private IPv4/);
  assert.throws(() => assertSafePublicUrl('http://169.254.169.254/latest/meta-data/'), /Blocked private IPv4/);
  assert.throws(() => assertSafePublicUrl('http://localhost:3000/api/config'), /Blocked non-public host/);
  assert.throws(() => assertSafePublicUrl('file:///etc/passwd'), /Unsupported URL protocol/);

  // Create a real PNG buffer using sharp
  const samplePng = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: { r: 120, g: 160, b: 140 } },
  })
    .png()
    .toBuffer();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-scrape-webp-test-'));
  const origFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://example-source.org/post-sitemap.xml') {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
           <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
             <url>
               <loc>https://example-source.org/small-patio-ideas/</loc>
               <lastmod>2026-11-10</lastmod>
             </url>
           </urlset>`,
          { status: 200, headers: { 'Content-Type': 'application/xml' } }
        );
      }
      if (url === 'https://example-source.org/small-patio-ideas/') {
        return new Response(
          `<!doctype html><html><head>
            <title>10 Small Patio Ideas — ExampleSource</title>
            <meta name="description" content="Exact source patio summary." />
            <meta property="og:image" content="https://example-source.org/uploads/patio-hero.png" />
            <meta property="article:section" content="Outdoor Living" />
          </head><body>
            <article>
              <h1 class="entry-title">10 Small Patio Ideas</h1>
              <div class="entry-content">
                <p>Exact original paragraph from source post.</p>
                <script>alert('xss')</script>
                <img data-src="https://example-source.org/uploads/patio-inline.png" alt="Patio seating" />
              </div>
            </article>
          </body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      if (url.endsWith('.png')) {
        return new Response(new Uint8Array(samplePng), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const store = new DashboardStore({ workspaceDir: tmpDir });
    const diff = await store.executeIngestion({
      sourceType: 'sitemap',
      urlOrList: 'https://example-source.org/post-sitemap.xml',
      maxPosts: 10,
      downloadImages: true,
    });

    assert.equal(diff.counts.new, 1);
    const post = store.getPost('small-patio-ideas');
    assert.ok(post);
    assert.equal(post.title, '10 Small Patio Ideas');
    assert.equal(post.category, 'Outdoor Living');
    assert.match(post.content_html, /Exact original paragraph from source post\./);
    assert.equal(post.content_html.includes('<script'), false);

    // Featured image converted to WebP and resized down to <= 1200px wide
    assert.equal(post.local_image_path, '/assets/images/small-patio-ideas.webp');
    assert.equal(post.image_width, 1200);
    const featPath = path.join(tmpDir, 'assets', 'images', 'small-patio-ideas.webp');
    assert.equal(fs.existsSync(featPath), true);
    const headerBytes = fs.readFileSync(featPath).subarray(0, 12).toString('ascii');
    assert.equal(headerBytes.startsWith('RIFF') && headerBytes.includes('WEBP'), true);

    // Inline body image also downloaded, converted to WebP, and rewritten in content_html
    assert.match(post.content_html, /\/assets\/images\/small-patio-ideas-img-1-[a-f0-9]+\.webp/);

    // Rendered HTML contains exact source content and ZERO fabricated sections
    const rendered = store.renderPreview({ slug: 'small-patio-ideas', theme: 'nordic-studio' });
    assert.match(rendered, /Exact original paragraph from source post\./);
    assert.equal(rendered.includes('Frequently Asked Questions'), false);
    assert.equal(rendered.includes('Anna Lindqvist'), false);
    assert.equal(rendered.includes('2700K Warm Neutral'), false);
    assert.equal(rendered.includes('Design Direction &amp; Spatial Strategy'), false);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('header hides brand title when custom logo is set and renders only inserted social links across all models', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-header-branding-test-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    store.updateConfig({
      branding: {
        brand_name: 'GardenHomi Studio',
        logo_path: '/assets/images/custom-logo.png',
        social_links: {
          pinterest: 'https://www.pinterest.com/gardenhomi/',
          instagram: 'instagram.com/gardenhomi',
          facebook: '',
          twitter: 'javascript:alert(1)',
          tiktok: '',
          youtube: '',
        },
      },
    });

    for (const theme of ['editorial-warm', 'nordic-studio', 'pinterest-mag']) {
      const html = store.renderPreview({ theme, viewMode: 'hub' });
      // Custom logo image is shown, wordmark text inside brand-link is removed
      assert.match(html, /<a class="brand-link"[^>]*><img class="brand-logo-img" src="\/assets\/images\/custom-logo\.png"/);
      assert.equal(html.includes('<span class="brand-wordmark">'), false);

      // Only valid inserted social links (Pinterest & Instagram) appear in top bar & footer
      assert.match(html, /class="social-links"/);
      assert.match(html, /aria-label="Pinterest"/);
      assert.match(html, /href="https:\/\/instagram\.com\/gardenhomi"/);
      assert.equal(html.includes('aria-label="Facebook"'), false);
      assert.equal(html.includes('aria-label="X / Twitter"'), false);
      assert.equal(html.includes('aria-label="TikTok"'), false);
      assert.equal(html.includes('aria-label="YouTube"'), false);
      assert.equal(html.includes('javascript:alert'), false);
    }

    // Without custom logo, editorial serif wordmark renders cleanly
    store.updateConfig({ branding: { logo_path: '' } });
    const noLogoHtml = store.renderPreview({ theme: 'nordic-studio', viewMode: 'hub' });
    assert.match(noLogoHtml, /<span class="brand-wordmark">GardenHomi Studio<\/span>/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('custom domain dynamically updates brand name, contact email, 3-col footer, and builds all 10 trust pages across all 3 models', async () => {
  const { resolveSiteIdentity } = await import('./static-pages.ts');

  const idSub = resolveSiteIdentity({
    customDomain: 'decohome.homeandrecipe.com',
    branding: {
      brand_name: 'Old Name',
      tagline: '',
      logo_path: '',
      author_name: '',
      author_bio: '',
      enable_toc: false,
      enable_faq: false,
      enable_eeat: false,
      social_links: {},
    },
  });
  assert.equal(idSub.siteName, 'Homeandrecipe');
  assert.equal(idSub.contactEmail, 'contact@homeandrecipe.com');
  assert.equal(idSub.siteUrl, 'https://decohome.homeandrecipe.com');

  const idRoot = resolveSiteIdentity({
    customDomain: 'https://www.gardenhomi.com/',
    branding: {
      brand_name: '',
      tagline: '',
      logo_path: '',
      author_name: '',
      author_bio: '',
      enable_toc: false,
      enable_faq: false,
      enable_eeat: false,
      social_links: {},
    },
  });
  assert.equal(idRoot.siteName, 'Gardenhomi');
  assert.equal(idRoot.contactEmail, 'contact@gardenhomi.com');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-decohome-build-test-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    store.updateConfig({
      cloudflare: {
        custom_domain: 'deco.gardenhomi.com',
        project_name: 'gardenhomi',
      },
      branding: {
        social_links: {
          pinterest: 'https://pinterest.com/gardenhomi',
        },
      },
    });

    const expectedTrustSlugs = [
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
    ];

    for (const theme of ['editorial-warm', 'nordic-studio', 'pinterest-mag']) {
      const build = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme });
      assert.equal(build.success, true);
      assert.equal(build.static_pages_generated, 10);
      const outDir = String(build.output_dir);

      const homeHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
      assert.match(homeHtml, /hero-split-band/);
      assert.match(homeHtml, /All Categories/);
      assert.match(homeHtml, /Latest Published Articles/);
      assert.match(homeHtml, /Practical design advice, straight to your inbox/);
      assert.match(homeHtml, /contact@gardenhomi\.com/);
      assert.match(homeHtml, /Gardenhomi/);
      assert.match(homeHtml, /\/editorial-policy\//);
      assert.match(homeHtml, /\/fact-checking-policy\//);
      assert.match(homeHtml, /\/copyright\//);

      const sitemapXml = fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf-8');
      for (const slug of expectedTrustSlugs) {
        const pagePath = path.join(outDir, slug, 'index.html');
        assert.equal(fs.existsSync(pagePath), true, `Missing ${slug}/index.html for ${theme}`);
        assert.equal(sitemapXml.includes(`/${slug}/`), true, `Missing /${slug}/ in sitemap.xml`);
      }

      const contactHtml = fs.readFileSync(path.join(outDir, 'contact', 'index.html'), 'utf-8');
      assert.match(contactHtml, /mailto:contact@gardenhomi\.com/);
      assert.match(contactHtml, /trust-contact-form/);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('rich text editor sanitizeEditedHtml & store.updatePost persist formatted content, strip XSS, keep local WebP images, and render in preview/build', async () => {
  const { sanitizeEditedHtml } = await import('./scraper.ts');

  const dirtyHtml = `
    <h1>Converted Subheading</h1>
    <p>Updated <strong>editorial text</strong> with <a href="https://example.com/guide" onclick="evil()">a safe link</a> and <a href="javascript:alert(1)">bad link</a>.</p>
    <ul><li>Item One</li><li>Item Two</li></ul>
    <blockquote>Warm minimalism note.</blockquote>
    <img src="/assets/images/sample.webp" alt="Cozy room" onerror="alert(2)" />
    <script>window.pwned = true;</script>
    <iframe src="https://evil.example/embed"></iframe>
  `;

  const clean = sanitizeEditedHtml(dirtyHtml);
  assert.match(clean, /<h2>Converted Subheading<\/h2>/);
  assert.match(clean, /<strong>editorial text<\/strong>/);
  assert.match(clean, /href="https:\/\/example\.com\/guide"/);
  assert.match(clean, /src="\/assets\/images\/sample\.webp"/);
  assert.match(clean, /<ul><li>Item One<\/li><li>Item Two<\/li><\/ul>/);
  assert.match(clean, /<blockquote>Warm minimalism note\.<\/blockquote>/);
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('<iframe'), false);
  assert.equal(clean.includes('onclick='), false);
  assert.equal(clean.includes('onerror='), false);
  assert.equal(clean.includes('javascript:'), false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-rte-edit-test-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    const slug = store.listPosts()[0].slug;

    const updated = store.updatePost(slug, {
      title: 'Refined Living Room Sanctuary',
      excerpt: 'Hand-edited editorial excerpt.',
      category: 'Living Room Decor',
      content_html: dirtyHtml,
    });
    assert.ok(updated);
    assert.equal(updated.custom_edited, true);
    assert.equal(updated.category_slug, 'living-room-decor');
    assert.equal(updated.excerpt, 'Hand-edited editorial excerpt.');
    assert.match(updated.content_html, /<h2>Converted Subheading<\/h2>/);
    assert.equal(updated.content_html.includes('<script'), false);

    // Reload store from disk to verify persistence
    const reloaded = new DashboardStore({ workspaceDir: tmpDir });
    const persisted = reloaded.getPost(slug);
    assert.ok(persisted);
    assert.equal(persisted.title, 'Refined Living Room Sanctuary');
    assert.equal(persisted.category, 'Living Room Decor');
    assert.equal(persisted.category_slug, 'living-room-decor');
    assert.match(persisted.content_html, /<strong>editorial text<\/strong>/);

    // Verify rendered preview & static build include the edited rich text
    const previewHtml = reloaded.renderPreview({ slug, theme: 'editorial-warm' });
    assert.match(previewHtml, /Converted Subheading/);
    assert.match(previewHtml, /Warm minimalism note\./);
    assert.equal(previewHtml.includes('window.pwned'), false);

    const build = reloaded.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'editorial-warm' });
    assert.equal(build.success, true);
    const builtPostPath = path.join(String(build.output_dir), slug, 'index.html');
    const builtHtml = fs.readFileSync(builtPostPath, 'utf-8');
    assert.match(builtHtml, /Converted Subheading/);
    assert.match(builtHtml, /<strong>editorial text<\/strong>/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('sitemap scan & ingest count exact 76 post URLs (ignoring image:loc), stopIngestJob cancels cleanly, and clearActiveProjectData wipes project data', async () => {
  const { parseXmlSitemapEntries } = await import('./scraper.ts');

  // Build a Rank Math-style XML sitemap with exactly 76 <url> entries and 10 <image:loc> each (760 image tags)
  const urlBlocks = Array.from({ length: 76 }, (_, i) => {
    const n = i + 1;
    const imgs = Array.from(
      { length: 10 },
      (__, j) => `<image:image><image:loc>https://example-decor.org/wp-content/uploads/2026/09/post-${n}-img-${j + 1}.jpg</image:loc></image:image>`
    ).join('');
    return `<url><loc>https://example-decor.org/ikea-hack-${n}/</loc><lastmod>2026-09-02T00:00:00+00:00</lastmod>${imgs}</url>`;
  }).join('\n');
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urlBlocks}</urlset>`;

  const parsed = parseXmlSitemapEntries(sitemapXml);
  assert.equal(parsed.entries.length, 76);
  assert.equal(parsed.entries.every((e) => !e.url.includes('/wp-content/uploads/')), true);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-sitemap-stop-clear-test-'));
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://example-decor.org/post-sitemap8.xml') {
        return new Response(sitemapXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }
      if (url.startsWith('https://example-decor.org/slow-')) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 2500);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
      return new Response(
        `<!doctype html><html><head><title>IKEA Hack</title></head><body><article><h1>IKEA Hack</h1><div class="entry-content"><p>Exact content.</p></div></article></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    }) as typeof fetch;

    const store = new DashboardStore({ workspaceDir: tmpDir });
    // Even if max_posts is 35, scanSitemap reports the EXACT 76 URLs in the sitemap!
    const scanRes = await store.scanSitemap('https://example-decor.org/post-sitemap8.xml', 'sitemap', 35);
    assert.equal(scanRes.success, true);
    assert.equal(scanRes.discovered_count, 76);
    assert.equal(scanRes.will_ingest_count, 35);

    // With max_posts = 100, scan reports 76 and will_ingest_count = 76 (never 100!)
    const scanRes100 = await store.scanSitemap('https://example-decor.org/post-sitemap8.xml', 'sitemap', 100);
    assert.equal(scanRes100.discovered_count, 76);
    assert.equal(scanRes100.will_ingest_count, 76);

    // Create isolated project and confirm it does NOT inherit previous project's sitemap_url
    store.updateConfig({ ingestion: { sitemap_url: 'https://example-decor.org/sitemap_index.xml' } });
    store.createProject({ name: 'Fresh Patio', platform: 'cloudflare' });
    assert.equal(store.config.ingestion.sitemap_url, '');

    // Test Stop Ingest cancels a running background job cleanly
    const started = store.startIngestJob({
      source_type: 'url_list',
      url_or_list: 'https://example-decor.org/slow-1/\nhttps://example-decor.org/slow-2/',
      max_posts: 10,
      download_images: false,
    });
    assert.equal(started.success, true);
    assert.equal(store.ingestJob.status, 'running');
    const stopped = store.stopIngestJob();
    assert.equal(stopped.success, true);
    assert.equal(store.ingestJob.status, 'stopped');

    // Ingest seed posts, create assets + build output, then Clear Project removes ALL project data
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    assert.equal(store.listPosts().length, 5);
    const buildRes = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'editorial-warm' });
    assert.equal(buildRes.success, true);
    const outDir = String(buildRes.output_dir);
    assert.equal(fs.existsSync(outDir), true);

    const cleared = store.clearActiveProjectData();
    assert.equal(cleared.success, true);
    assert.equal(cleared.removed_posts, 5);
    assert.equal(store.listPosts().length, 0);
    assert.equal(store.manifest.categories.length, 0);
    assert.equal(fs.existsSync(outDir), false);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('deploySinglePost saves edited post, rebuilds ONLY affected files (leaving sibling posts untouched), and deploys incrementally to Cloudflare & GitHub', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-single-post-deploy-test-'));
  const origFetch = globalThis.fetch;
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    store.updateConfig({
      cloudflare: {
        api_token: 'cf_test_token_123456',
        account_id: 'acct_test_999',
        project_name: 'singleposttest',
        account_subdomain: 'demoacct',
      },
      github: {
        token: 'ghp_test_token_123456',
        owner: 'demo-org',
        repo: 'demo-site',
        branch: 'main',
      },
    });

    const posts = store.listPosts();
    assert.ok(posts.length >= 2);
    const targetSlug = posts[0].slug;
    const siblingSlug = posts[1].slug;

    // 1. Initial full build so outputDir has all posts & assets
    const initialBuild = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'editorial-warm' });
    assert.equal(initialBuild.success, true);
    const outDir = String(initialBuild.output_dir);
    const siblingFile = path.join(outDir, siblingSlug, 'index.html');
    assert.equal(fs.existsSync(siblingFile), true);

    // Backdate sibling mtime by 10 seconds to deterministically prove it is NOT rewritten
    const pastTime = new Date(Date.now() - 10_000);
    fs.utimesSync(siblingFile, pastTime, pastTime);
    const siblingMtimeBefore = fs.statSync(siblingFile).mtimeMs;

    // 2. Mock Cloudflare API: return ONLY the target post HTML hash in upload buckets (all other assets cached!)
    const cfCalledUrls: string[] = [];
    let verifiedEdgeUrl = '';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      cfCalledUrls.push(url);
      if (url.includes('/assets-upload-session')) {
        const body = JSON.parse(String(init?.body || '{}')) as { manifest?: Record<string, { hash: string }> };
        const manifest = body.manifest || {};
        const postHash = manifest[`/${targetSlug}/index.html`]?.hash;
        const hubHash = manifest['/index.html']?.hash;
        const changedHashes = [postHash, hubHash].filter((h): h is string => Boolean(h));
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              jwt: 'session-jwt-abc',
              buckets: changedHashes.length > 0 ? [changedHashes] : [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/workers/assets/upload')) {
        return new Response(
          JSON.stringify({ success: true, result: { jwt: 'completion-jwt-xyz' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/workers/scripts/singleposttest/subdomain')) {
        return new Response(JSON.stringify({ success: true, result: { enabled: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/workers/scripts/singleposttest')) {
        return new Response(JSON.stringify({ success: true, result: { id: 'singleposttest' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.startsWith('https://singleposttest.demoacct.workers.dev/')) {
        verifiedEdgeUrl = url;
        return new Response('<html><body>Live single post</body></html>', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    const cfRes = await store.deploySinglePost(targetSlug, {
      title: 'Edited Single Post Headline',
      excerpt: 'Freshly updated excerpt.',
      content_html: '<h2>Updated Section</h2><p>Deployed independently without full rebuild.</p>',
      platform: 'cloudflare',
    });

    assert.equal(cfRes.success, true);
    assert.equal(cfRes.platform, 'cloudflare');
    assert.equal(cfRes.full_bootstrap, false);
    assert.equal(cfRes.uploaded_files, 2);
    assert.ok(Number(cfRes.cached_files) > 0);
    assert.equal(verifiedEdgeUrl, `https://singleposttest.demoacct.workers.dev/${targetSlug}/`);
    assert.equal(cfRes.post_url, `https://singleposttest.demoacct.workers.dev/${targetSlug}/`);

    // Verify sibling post HTML file was NOT touched at all!
    const siblingMtimeAfter = fs.statSync(siblingFile).mtimeMs;
    assert.equal(siblingMtimeAfter, siblingMtimeBefore);

    // Verify edited post HTML was updated and persisted as custom_edited
    const editedHtml = fs.readFileSync(path.join(outDir, targetSlug, 'index.html'), 'utf-8');
    assert.match(editedHtml, /Edited Single Post Headline/);
    assert.match(editedHtml, /Deployed independently without full rebuild\./);
    assert.equal(store.getPost(targetSlug)?.custom_edited, true);

    // 3. Test GitHub incremental single-post deploy pushes ONLY changedFiles (never sibling posts!)
    const ghBuild = store.runBuild({ clean: true, targetCloud: 'github', projectName: 'singleposttest' });
    assert.equal(ghBuild.success, true);

    const ghPutPaths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PUT' && url.includes('/repos/demo-org/demo-site/contents/')) {
        ghPutPaths.push(url.split('/contents/')[1]);
        return new Response(JSON.stringify({ content: { sha: 'newsha123' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/repos/demo-org/demo-site/contents/')) {
        return new Response(JSON.stringify({ sha: 'oldsha123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const ghRes = await store.deploySinglePost(targetSlug, {
      title: 'GitHub Single Post Headline',
      content_html: '<p>Pushed only this post to GitHub Pages.</p>',
      platform: 'github',
    });

    assert.equal(ghRes.success, true);
    assert.equal(ghRes.platform, 'github');
    assert.equal(ghRes.full_bootstrap, false);
    assert.equal(ghPutPaths.includes(`${targetSlug}/index.html`), true);
    assert.equal(ghPutPaths.includes('index.html'), true);
    assert.equal(ghPutPaths.some((p) => p.startsWith(`${siblingSlug}/`)), false);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PageSpeed optimizations: zero render-blocking stylesheets, LCP preload + fetchpriority=high on all templates, body-LCP promotion, and Worker cache/security headers', async () => {
  const { renderPostHtml, renderHubHtml, renderCategoryIndexHtml, promoteFirstBodyImageToLcp } = await import(
    './templates.ts'
  );
  const { deployCloudflareWorkersAssets } = await import('./cloudflare-deployer.ts');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-pagespeed-test-'));
  const origFetch = globalThis.fetch;
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    const posts = store.listPosts();
    const categories = store.manifest.categories;
    const post = {
      ...posts[0],
      local_image_path: '/assets/images/coffee-bar-hero.webp',
      image_width: 600,
      image_height: 900,
      content_html:
        '<p>Intro paragraph.</p><img src="/assets/images/step-1.webp" alt="Step 1" loading="lazy" /><p>More text.</p>',
    };

    for (const themeKey of ['editorial-warm', 'nordic-studio', 'pinterest-mag']) {
      const postHtml = renderPostHtml({
        post,
        allPosts: posts,
        themeKey,
        branding: store.config.branding,
        categories,
        routingMode: 'single',
        baseUrl: 'https://gardenhome.demo.workers.dev',
      });

      // 1. ZERO render-blocking Google Fonts stylesheets (must use media="print" onload="this.media='all'")
      assert.match(postHtml, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" media="print" onload="this\.media='all'" \/>/);
      assert.equal(
        /<link\b(?![^>]*media="print")[^>]*fonts\.googleapis\.com[^>]*rel="stylesheet"/.test(
          postHtml.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
        ),
        false,
        `Found render-blocking stylesheet in ${themeKey}`
      );
      // Only load the theme's required font family (zero unused font payloads)
      if (themeKey === 'nordic-studio') {
        assert.match(postHtml, /Cormorant\+Garamond/);
        assert.equal(postHtml.includes('Playfair+Display'), false);
        assert.equal(postHtml.includes('Fraunces'), false);
      } else if (themeKey === 'pinterest-mag') {
        assert.match(postHtml, /Fraunces/);
        assert.match(postHtml, /DM\+Sans/);
        assert.equal(postHtml.includes('Playfair+Display'), false);
        assert.equal(postHtml.includes('Cormorant+Garamond'), false);
      } else {
        assert.match(postHtml, /Playfair\+Display/);
        assert.equal(postHtml.includes('Cormorant+Garamond'), false);
        assert.equal(postHtml.includes('Fraunces'), false);
      }

      // 2. LCP Hero Image has <link rel="preload" as="image" fetchpriority="high"> AND fetchpriority="high" without loading="lazy"
      assert.match(
        postHtml,
        /<link rel="preload" as="image" href="\/assets\/images\/coffee-bar-hero\.webp" fetchpriority="high" \/>/
      );
      const heroImgMatch = postHtml.match(/<div class="hero-frame">[\s\S]*?<img ([^>]+)>/);
      assert.ok(heroImgMatch, 'Missing hero-frame img');
      assert.match(heroImgMatch[1], /fetchpriority="high"/);
      assert.equal(heroImgMatch[1].includes('loading="lazy"'), false);

      // 3. Zero-CLS metric-matched font fallback overrides present
      assert.match(postHtml, /ascent-override:/);
      assert.match(postHtml, /size-adjust:/);

      // 4. Below-the-fold related card images stay lazy + async with explicit width/height
      assert.match(postHtml, /<div class="post-card-media"><img[^>]+width="600" height="400" loading="lazy" decoding="async"/);

      // 5. Hub homepage preloads & prioritizes lead hero image
      const hubHtml = renderHubHtml({
        posts: [post, ...posts.slice(1)],
        categories,
        themeKey,
        branding: store.config.branding,
        routingMode: 'single',
        baseUrl: 'https://gardenhome.demo.workers.dev',
      });
      assert.match(
        hubHtml,
        /<link rel="preload" as="image" href="\/assets\/images\/coffee-bar-hero\.webp" fetchpriority="high" \/>/
      );
      assert.match(hubHtml, /<a class="hero-split-media"[\s\S]*?<img[^>]+fetchpriority="high"/);

      // 6. Category page prioritizes card 0 and lazy-loads subsequent cards
      const catHtml = renderCategoryIndexHtml({
        category: categories[0],
        posts: [post, ...posts.slice(1)],
        categories,
        themeKey,
        branding: store.config.branding,
        routingMode: 'single',
        baseUrl: 'https://gardenhome.demo.workers.dev',
      });
      assert.match(
        catHtml,
        /<link rel="preload" as="image" href="\/assets\/images\/coffee-bar-hero\.webp" fetchpriority="high" \/>/
      );
      assert.match(catHtml, /<div class="post-card-media"><img[^>]+fetchpriority="high" decoding="async"/);
    }

    // 7. When featured image is already embedded inside body HTML, promoteFirstBodyImageToLcp strips loading=lazy & adds fetchpriority=high
    const promoted = promoteFirstBodyImageToLcp(
      '<p>Lead</p><img src="/assets/images/in-body.webp" alt="First" loading="lazy" /><img src="/assets/images/second.webp" alt="Second" loading="lazy" />'
    );
    assert.equal(promoted.lcpSrc, '/assets/images/in-body.webp');
    assert.match(promoted.html, /<img src="\/assets\/images\/in-body\.webp" alt="First" fetchpriority="high" decoding="async" \/>/);
    assert.match(promoted.html, /<img src="\/assets\/images\/second\.webp" alt="Second" loading="lazy" \/>/);

    // 8. Deployed Cloudflare Worker script attaches immutable /assets/ caching + HSTS/COOP/XFO security headers
    const outDir = path.join(tmpDir, 'dist', 'speedtest');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><html><body>OK</body></html>', 'utf-8');

    let uploadedWorkerSource = '';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assets-upload-session')) {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'j1', buckets: [] } }), { status: 200 });
      }
      if (url.endsWith('/workers/scripts/speedtest') && init?.method === 'PUT') {
        const fd = init.body as FormData;
        const scriptFile = fd.get('index.js') as File | null;
        if (scriptFile) uploadedWorkerSource = await scriptFile.text();
        return new Response(JSON.stringify({ success: true, result: { id: 'speedtest' } }), { status: 200 });
      }
      if (url.includes('/subdomain')) {
        return new Response(JSON.stringify({ success: true, result: { enabled: true } }), { status: 200 });
      }
      return new Response('<html>OK</html>', { status: 200 });
    }) as typeof fetch;

    await deployCloudflareWorkersAssets({
      apiToken: 'cf_tok',
      accountId: 'acc_1',
      scriptName: 'speedtest',
      outputDir: outDir,
      workspaceDir: tmpDir,
      accountSubdomain: 'demoacct',
    });

    assert.match(uploadedWorkerSource, /public, max-age=31536000, immutable/);
    assert.match(uploadedWorkerSource, /Strict-Transport-Security/);
    assert.match(uploadedWorkerSource, /Cross-Origin-Opener-Policy/);
    assert.match(uploadedWorkerSource, /X-Content-Type-Options/);
    assert.match(uploadedWorkerSource, /X-Frame-Options/);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetchLiveWorkerPosts imports all live posts from deployed Cloudflare Worker and deletePost removes a single post directly without full redeploy', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-worker-fetch-delete-test-'));
  const origFetch = globalThis.fetch;
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    store.updateConfig({
      cloudflare: {
        api_token: 'cf_test_token_fetch_del',
        account_id: 'acct_fd_123',
        project_name: 'gardenhome',
        account_subdomain: 'demoacct',
      },
      github: {
        token: 'ghp_test_fd_123',
        owner: 'demo-org',
        repo: 'demo-site',
        branch: 'main',
      },
    });

    // Seed 1 local custom-edited post (must NOT be overwritten when fetching live Worker posts!)
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    const existingPosts = store.listPosts();
    const keepLocalSlug = existingPosts[0].slug;
    const siblingSlug = existingPosts[1].slug;
    store.updatePost(keepLocalSlug, {
      title: 'My Custom Edited Local Headline',
      content_html: '<p>Protected local custom content.</p>',
    });

    // Build initial dist so we can verify deletePost leaves sibling HTML untouched
    const initBuild = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'editorial-warm' });
    assert.equal(initBuild.success, true);
    const outDir = String(initBuild.output_dir);

    // 1. Mock live Cloudflare Worker serving /sitemap/, /sitemap.xml, and 2 extra live posts NOT in local manifest
    const liveWorkerBase = 'https://gardenhome.demoacct.workers.dev';
    const extraSlug1 = 'live-worker-patio-ideas';
    const extraSlug2 = 'live-worker-kitchen-island';

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === `${liveWorkerBase}/sitemap/`) {
        return new Response(
          `<!doctype html><html><body>
            <h2>Categories (2)</h2>
            <ul class="sitemap-list"><li><a href="/patio-decor/">Patio Decor</a></li><li><a href="/ikea-kitchen/">IKEA Kitchen</a></li></ul>
            <h2>Published Articles (3)</h2>
            <ul class="sitemap-list">
              <li><a href="/${keepLocalSlug}/">Older Live Title</a></li>
              <li><a href="/${extraSlug1}/">15 Backyard Patio Ideas</a></li>
              <li><a href="/${extraSlug2}/">10 Smart Kitchen Island Hacks</a></li>
            </ul>
            <h2>Company &amp; Policies</h2>
            <ul class="sitemap-list"><li><a href="/about/">About</a></li></ul>
          </body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      if (url === `${liveWorkerBase}/sitemap.xml`) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset>
            <url><loc>${liveWorkerBase}/</loc></url>
            <url><loc>${liveWorkerBase}/patio-decor/</loc></url>
            <url><loc>${liveWorkerBase}/${extraSlug1}/</loc></url>
            <url><loc>${liveWorkerBase}/${extraSlug2}/</loc></url>
            <url><loc>${liveWorkerBase}/about/</loc></url>
          </urlset>`,
          { status: 200, headers: { 'Content-Type': 'application/xml' } }
        );
      }
      if (url === `${liveWorkerBase}/${extraSlug1}/`) {
        return new Response(
          `<!doctype html><html><head><title>15 Backyard Patio Ideas — Gardenhome</title><meta name="description" content="Cozy outdoor patio ideas." /></head>
           <body><article class="article-container">
             <nav class="breadcrumbs"><a href="/">Home</a><span>/</span><a href="/patio-decor/">Patio Decor</a></nav>
             <span class="kicker">Patio Decor</span>
             <h1>15 Backyard Patio Ideas</h1>
             <div class="meta-row"><time datetime="2026-09-10">2026-09-10</time></div>
             <div class="hero-frame"><img src="/assets/images/${extraSlug1}.webp" width="600" height="900" alt="Patio" /></div>
             <section class="article-body"><p>Exact live worker content for patio.</p></section>
           </article></body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      if (url === `${liveWorkerBase}/${extraSlug2}/`) {
        return new Response(
          `<!doctype html><html><head><title>10 Smart Kitchen Island Hacks — Gardenhome</title><meta name="description" content="Kitchen island upgrades." /></head>
           <body><article class="article-container">
             <nav class="breadcrumbs"><a href="/">Home</a><span>/</span><a href="/ikea-kitchen/">IKEA Kitchen</a></nav>
             <span class="kicker">IKEA Kitchen</span>
             <h1>10 Smart Kitchen Island Hacks</h1>
             <section class="article-body"><p>Exact live worker content for kitchen island.</p></section>
           </article></body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      if (url === `${liveWorkerBase}/assets/images/${extraSlug1}.webp`) {
        return new Response(Buffer.from('RIFF....WEBP'), { status: 200, headers: { 'Content-Type': 'image/webp' } });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    const fetchRes = await store.fetchLiveWorkerPosts();
    assert.equal(fetchRes.success, true);
    assert.equal(fetchRes.total_live_posts, 3);
    assert.equal(fetchRes.newly_imported, 2);
    assert.equal(fetchRes.already_local, 1);

    // Imported posts exist in catalog with exact scraped details & category
    const imported1 = store.getPost(extraSlug1);
    assert.ok(imported1);
    assert.equal(imported1.title, '15 Backyard Patio Ideas');
    assert.equal(imported1.category, 'Patio Decor');
    assert.equal(imported1.category_slug, 'patio-decor');
    assert.match(imported1.content_html, /Exact live worker content for patio\./);
    // Protected custom-edited local post was NOT overwritten!
    assert.equal(store.getPost(keepLocalSlug)?.title, 'My Custom Edited Local Headline');

    // 2. Delete one post directly from Cloudflare Worker WITHOUT full rebuild
    const siblingFile = path.join(outDir, siblingSlug, 'index.html');
    assert.equal(fs.existsSync(siblingFile), true);
    const pastTime = new Date(Date.now() - 10_000);
    fs.utimesSync(siblingFile, pastTime, pastTime);
    const siblingMtimeBefore = fs.statSync(siblingFile).mtimeMs;

    let uploadedManifestPaths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assets-upload-session')) {
        const parsedBody = JSON.parse(String(init?.body || '{}')) as { manifest?: Record<string, { hash: string }> };
        const manifest = parsedBody.manifest || {};
        uploadedManifestPaths = Object.keys(manifest);
        const changedHashes = ['/index.html', '/sitemap.xml']
          .map((k) => manifest[k]?.hash)
          .filter((h): h is string => Boolean(h));
        return new Response(
          JSON.stringify({ success: true, result: { jwt: 's-jwt', buckets: [changedHashes] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/workers/assets/upload')) {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'c-jwt' } }), { status: 200 });
      }
      if (url.includes('/subdomain') || url.endsWith('/workers/scripts/gardenhome')) {
        return new Response(JSON.stringify({ success: true, result: { enabled: true } }), { status: 200 });
      }
      return new Response('<html>OK</html>', { status: 200 });
    }) as typeof fetch;

    const delRes = await store.deletePost(extraSlug1, { platform: 'cloudflare' });
    assert.equal(delRes.success, true);
    assert.equal(delRes.removed_locally, true);
    assert.equal(delRes.removed_from_worker, true);
    assert.equal(store.getPost(extraSlug1), null);
    assert.equal(fs.existsSync(path.join(outDir, extraSlug1, 'index.html')), false);

    // Sibling post HTML file was NOT rewritten (proves zero full rebuild!)
    assert.equal(fs.statSync(siblingFile).mtimeMs, siblingMtimeBefore);

    // Cloudflare Worker manifest NO LONGER contains deleted post, while keeping sibling post!
    assert.equal(uploadedManifestPaths.includes(`/${extraSlug1}/index.html`), false);
    assert.equal(uploadedManifestPaths.includes(`/${siblingSlug}/index.html`), true);
    const updatedXml = fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf-8');
    assert.equal(updatedXml.includes(`/${extraSlug1}/`), false);

    // 3. Delete another post directly via GitHub Contents API (DELETE on post file, PUT only on index files)
    const ghBuild = store.runBuild({ clean: true, targetCloud: 'github', projectName: 'gardenhome' });
    assert.equal(ghBuild.success, true);

    const ghDeletedPaths: string[] = [];
    const ghPutPaths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'DELETE' && url.includes('/contents/')) {
        ghDeletedPaths.push(url.split('/contents/')[1]);
        return new Response(JSON.stringify({ commit: { sha: 'delsha' } }), { status: 200 });
      }
      if (init?.method === 'PUT' && url.includes('/contents/')) {
        ghPutPaths.push(url.split('/contents/')[1]);
        return new Response(JSON.stringify({ content: { sha: 'putsha' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ sha: 'existing-sha-1' }), { status: 200 });
    }) as typeof fetch;

    const ghDelRes = await store.deletePost(extraSlug2, { platform: 'github' });
    assert.equal(ghDelRes.success, true);
    assert.equal(ghDelRes.removed_from_worker, true);
    assert.equal(ghDeletedPaths.includes(`${extraSlug2}/index.html`), true);
    assert.equal(ghPutPaths.includes('index.html'), true);
    assert.equal(ghPutPaths.some((p) => p.startsWith(`${siblingSlug}/`)), false);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('security & stability audit: blocks IPv4-mapped IPv6 & private worker URLs, sanitizes SVG logos, escapes JSON-LD, confines clearProject, and handles bare custom domains', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-audit-hardening-test-'));
  try {
    // 1. Hex IPv4-mapped IPv6 normalized by Node URL parser must be blocked
    assert.throws(() => assertSafePublicUrl('http://[::ffff:127.0.0.1]/admin'), /Blocked/);
    assert.throws(() => assertSafePublicUrl('http://[::ffff:169.254.169.254]/latest/meta-data/'), /Blocked/);

    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });

    // 2. fetchLiveWorkerPosts blocks private/internal worker URL overrides
    await assert.rejects(
      () => store.fetchLiveWorkerPosts({ workerUrl: 'http://127.0.0.1:8080' }),
      /Blocked/
    );

    // 3. uploadLogo rejects unsupported MIME types and strips <script>/onload from SVG uploads
    assert.throws(
      () => store.uploadLogo({ data: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' }),
      /Unsupported logo image format/
    );
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>';
    const svgRes = store.uploadLogo({
      data: `data:image/svg+xml;base64,${Buffer.from(maliciousSvg).toString('base64')}`,
    });
    assert.equal(svgRes.success, true);
    const savedSvg = fs.readFileSync(path.join(tmpDir, 'assets', 'images', 'custom-logo.svg'), 'utf-8');
    assert.equal(/<script/i.test(savedSvg), false);
    assert.equal(/onload=/i.test(savedSvg), false);
    assert.match(savedSvg, /<rect/);

    // 4. JSON-LD escapes </script> and newsletter form handles apostrophes safely via data-feedback
    store.updateConfig({
      branding: { brand_name: "O'Connor Home & Garden" },
      cloudflare: { project_name: 'gardenhome', custom_domain: 'gardenhome', account_subdomain: 'demoacct' },
    });
    const firstSlug = store.listPosts()[0].slug;
    store.updatePost(firstSlug, {
      title: 'Test Title </script><script>alert(1)</script>',
      content_html: '<p>Safe body.</p>',
    });
    const postHtml = store.renderPreview({ slug: firstSlug, theme: 'editorial-warm' });
    assert.equal(postHtml.includes('</script><script>alert(1)'), false);
    assert.match(postHtml, /\\u003c\/script>/);

    // 5. Bare custom domain without TLD ('gardenhome') falls back to valid workers.dev URL in sitemap.xml
    const buildRes = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'editorial-warm' });
    assert.equal(buildRes.success, true);
    const outDir = String(buildRes.output_dir);
    const sitemapXml = fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf-8');
    assert.match(sitemapXml, /https:\/\/gardenhome\.demoacct\.workers\.dev\//);
    assert.equal(sitemapXml.includes('https://gardenhome/'), false);
    const hubHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    assert.match(hubHtml, /data-feedback="Thanks for subscribing to/);
    assert.match(hubHtml, /this\.dataset\.feedback/);

    // 6. clearActiveProjectData rejects invalid/traversal project IDs and never touches files outside scraped_data
    const outsideMarker = path.join(tmpDir, 'do-not-delete.txt');
    fs.writeFileSync(outsideMarker, 'keep', 'utf-8');
    assert.throws(() => store.clearActiveProjectData('../../outside'), /not found/);
    assert.equal(fs.existsSync(outsideMarker), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Model 3 Botanical Atelier renders distinct Forest & Gold design, Fraunces/DM Sans fonts, and sticky TOC sidebar without affecting Models 1-2', async () => {
  // 1. Verify theme tokens and alias
  const tokens = getThemeTokens('pinterest-mag');
  assert.equal(tokens.header_bg, '#0F2A22');
  assert.equal(tokens.secondary_accent, '#C89B54');
  assert.equal(tokens.bg_body, '#F3F5F1');
  assert.match(tokens.font_headline, /Fraunces/);
  assert.match(tokens.font_body, /DM Sans/);
  assert.equal(getThemeTokens('styleire').id, 'pinterest-mag');

  // 2. Verify pure heading extraction & anchor injection
  const sampleHtml = '<p>Intro.</p><h2>Vertical Shelving</h2><p>Details.</p><h3 id="custom-id">Warm Lighting</h3>';
  const toc = extractArticleTocAndAnchors(sampleHtml);
  assert.equal(toc.headings.length, 2);
  assert.deepEqual(toc.headings[0], { id: 'guide-section-1', text: 'Vertical Shelving', num: '01' });
  assert.deepEqual(toc.headings[1], { id: 'custom-id', text: 'Warm Lighting', num: '02' });
  assert.match(toc.html, /<h2 id="guide-section-1">Vertical Shelving<\/h2>/);
  assert.match(toc.html, /<h3 id="custom-id">Warm Lighting<\/h3>/);

  // 3. Render Model 3 homepage & article and ensure Model 1 stays isolated
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-model3-atelier-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    const slug = store.listPosts()[0].slug;
    store.updatePost(slug, {
      content_html:
        '<p>Opening paragraph with drop-cap support.</p>' +
        '<h2>Olive Cabinetry &amp; Brass Hardware</h2><p>Section one details.</p>' +
        '<h2>Layered Daylight &amp; Foliage</h2><p>Section two details.</p>',
    });

    const m3Home = store.renderPreview({ theme: 'pinterest-mag', viewMode: 'hub' });
    assert.match(m3Home, /class="theme-pinterest-mag"/);
    assert.match(m3Home, /family=Fraunces:/);
    assert.match(m3Home, /family=DM\+Sans:/);
    assert.match(m3Home, /body\.theme-pinterest-mag \.hero-split-band/);

    const m3Post = store.renderPreview({ slug, theme: 'pinterest-mag', viewMode: 'post' });
    assert.match(m3Post, /class="atelier-article-banner"/);
    assert.match(m3Post, /class="atelier-article-grid"/);
    assert.match(m3Post, /In This Guide/);
    assert.match(m3Post, /href="#guide-section-1"/);
    assert.match(m3Post, /<h2 id="guide-section-1">Olive Cabinetry &amp; Brass Hardware<\/h2>/);

    // Ensure Model 1 remains completely untouched
    const m1Post = store.renderPreview({ slug, theme: 'editorial-warm', viewMode: 'post' });
    assert.match(m1Post, /class="theme-editorial-warm"/);
    assert.equal(m1Post.includes('atelier-article-banner'), false);
    assert.equal(m1Post.includes('body.theme-pinterest-mag'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('custom <head> code saves per project, strips breakout tags, and injects at top of <head> (before <style>) across Home, Posts, Categories, and Static pages', async () => {
  // 1. Pure helper strips premature </head> / <body> breakout tags and handles empty-after-sanitization
  const cleaned = renderCustomHeadCode('<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST1234"></script></head><body>');
  assert.match(cleaned, /G-TEST1234/);
  assert.equal(/<\/head>/i.test(cleaned), false);
  assert.equal(/<body>/i.test(cleaned), false);
  assert.equal(renderCustomHeadCode('   '), '');
  assert.equal(renderCustomHeadCode('</head><body></body></html>'), '');

  // 2. Persist in store, build full site, verify injection at TOP of <head> (before <style>) on every page type
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-head-code-test-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });

    const gaSnippet =
      '<meta name="google-site-verification" content="abc-verify-999" />\n' +
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-999TEST888"></script>';
    store.updateConfig({ branding: { custom_head_code: gaSnippet } });

    const buildRes = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'pinterest-mag' });
    assert.equal(buildRes.success, true);
    const outDir = String(buildRes.output_dir);

    const firstPost = store.listPosts()[0];
    const filesToCheck = [
      path.join(outDir, 'index.html'),
      path.join(outDir, firstPost.slug, 'index.html'),
      path.join(outDir, firstPost.category_slug, 'index.html'),
      path.join(outDir, 'about', 'index.html'),
    ];

    for (const filePath of filesToCheck) {
      const html = fs.readFileSync(filePath, 'utf-8');
      const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
      assert.ok(headMatch, `Missing <head> in ${filePath}`);
      const headContent = headMatch[1];
      assert.match(headContent, /abc-verify-999/, `Missing verification meta inside <head> of ${filePath}`);
      assert.match(headContent, /G-999TEST888/, `Missing GA4 script inside <head> of ${filePath}`);
      const customIdx = headContent.indexOf('<!-- Custom Header Code -->');
      const styleIdx = headContent.indexOf('<style>');
      assert.ok(customIdx >= 0 && styleIdx > customIdx, `Custom <head> code must appear before <style> in ${filePath}`);
    }

    // 3. Survives DashboardStore reload from disk
    const reloadedStore = new DashboardStore({ workspaceDir: tmpDir });
    assert.match(reloadedStore.config.branding.custom_head_code || '', /G-999TEST888/);

    // 4. Per-project isolation: newly created project starts clean (no GA4 leak), switching restores each project's code
    reloadedStore.createProject({ name: 'Second Site', cf_project_name: 'secondsite' });
    assert.equal(reloadedStore.config.branding.custom_head_code, '');
    reloadedStore.updateConfig({ branding: { custom_head_code: '<script>window.__SECOND_SITE__=1;</script>' } });
    reloadedStore.switchProject('stylesdays');
    assert.match(reloadedStore.config.branding.custom_head_code || '', /G-999TEST888/);
    reloadedStore.switchProject('second-site');
    assert.match(reloadedStore.config.branding.custom_head_code || '', /__SECOND_SITE__/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Site Pages Manager (9 legal/company pages): HTML upload extraction & sanitization, view/preview, edit/reset, project isolation, and direct Cloudflare + GitHub deploy', async () => {
  const { EDITABLE_STATIC_PAGE_META, extractUploadedPageHtml, isEditableStaticPageSlug } = await import(
    './static-pages.ts'
  );

  // 1. Strict 9-page allowlist blocks traversal & unknown slugs
  assert.equal(EDITABLE_STATIC_PAGE_META.length, 9);
  for (const slug of [
    'about',
    'contact',
    'editorial-policy',
    'fact-checking-policy',
    'privacy-policy',
    'cookie-policy',
    'terms',
    'disclaimer',
    'copyright',
  ]) {
    assert.equal(isEditableStaticPageSlug(slug), true);
  }
  assert.equal(isEditableStaticPageSlug('../etc/passwd'), false);
  assert.equal(isEditableStaticPageSlug('sitemap'), false);
  assert.equal(isEditableStaticPageSlug('unknown-page'), false);

  // 2. HTML file extraction parses <title>, <meta name="description">, safe <body> and strips XSS
  const uploadedDoc = `<!DOCTYPE html>
  <html>
    <head>
      <title>Custom About Atelier</title>
      <meta name="description" content="Our handcrafted botanical home studio story." />
    </head>
    <body>
      <h1>Welcome Home</h1>
      <section class="story"><p>Email <a href="mailto:hello@atelier.test" onclick="alert(1)">hello@atelier.test</a></p></section>
      <script>alert('xss')</script>
      <iframe src="https://evil.test"></iframe>
      <img src="javascript:alert(1)" onerror="alert(2)" />
    </body>
  </html>`;
  const extracted = extractUploadedPageHtml(uploadedDoc);
  assert.equal(extracted.title, 'Custom About Atelier');
  assert.equal(extracted.description, 'Our handcrafted botanical home studio story.');
  assert.match(extracted.bodyHtml, /<h2>Welcome Home<\/h2>/);
  assert.match(extracted.bodyHtml, /mailto:hello@atelier\.test/);
  assert.equal(/<script|alert\(|<iframe|onclick=|onerror=/i.test(extracted.bodyHtml), false);

  // 3. End-to-end store persistence, preview, incremental Cloudflare & GitHub deploys, reset & project isolation
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-static-pages-test-'));
  const origFetch = globalThis.fetch;
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });
    store.updateConfig({
      cloudflare: {
        api_token: 'cf_test_token_pages',
        account_id: 'acct_pages_123',
        project_name: 'pagesdemo',
        account_subdomain: 'demoacct',
      },
      github: {
        token: 'ghp_test_token_pages',
        owner: 'demo-org',
        repo: 'pages-repo',
        branch: 'main',
      },
    });

    const pages = store.listStaticPages();
    assert.equal(pages.length, 9);
    assert.equal(pages.every((p) => !p.is_custom), true);

    // Option 1: Upload full .html file into /about/
    const updatedAbout = store.updateStaticPage('about', { raw_html: uploadedDoc });
    assert.ok(updatedAbout);
    assert.equal(updatedAbout.is_custom, true);
    assert.equal(updatedAbout.title, 'Custom About Atelier');
    assert.match(updatedAbout.body_html, /Welcome Home/);

    // Verify persistence across full store reload
    const reloaded = new DashboardStore({ workspaceDir: tmpDir });
    assert.equal(reloaded.getStaticPage('about')?.is_custom, true);
    assert.equal(reloaded.getStaticPage('about')?.title, 'Custom About Atelier');

    // Verify Live Preview renders active theme + custom uploaded content
    const previewHtml = reloaded.renderStaticPagePreview('about', { theme: 'pinterest-mag' });
    assert.match(previewHtml, /class="theme-pinterest-mag"/);
    assert.match(previewHtml, /Custom About Atelier/);
    assert.match(previewHtml, /Welcome Home/);

    // Initial full build, backdate sibling post to prove single-page deploy leaves sibling posts untouched
    const initialBuild = reloaded.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'nordic-studio' });
    assert.equal(initialBuild.success, true);
    const outDir = String(initialBuild.output_dir);
    const postSlug = reloaded.listPosts()[0].slug;
    const siblingPostFile = path.join(outDir, postSlug, 'index.html');
    const pastTime = new Date(Date.now() - 10_000);
    fs.utimesSync(siblingPostFile, pastTime, pastTime);
    const postMtimeBefore = fs.statSync(siblingPostFile).mtimeMs;

    // Direct Deploy Option 1: Cloudflare Edge for /about/
    let verifiedUrl = '';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assets-upload-session')) {
        const body = JSON.parse(String(init?.body || '{}')) as { manifest?: Record<string, { hash: string }> };
        const aboutHash = body.manifest?.['/about/index.html']?.hash;
        return new Response(
          JSON.stringify({ success: true, result: { jwt: 'jwt-1', buckets: aboutHash ? [[aboutHash]] : [] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/workers/assets/upload')) {
        return new Response(JSON.stringify({ success: true, result: { jwt: 'jwt-done' } }), { status: 200 });
      }
      if (url.includes('/subdomain')) {
        return new Response(JSON.stringify({ success: true, result: { enabled: true } }), { status: 200 });
      }
      if (url.endsWith('/workers/scripts/pagesdemo')) {
        return new Response(JSON.stringify({ success: true, result: { id: 'pagesdemo' } }), { status: 200 });
      }
      if (url.startsWith('https://pagesdemo.demoacct.workers.dev/')) {
        verifiedUrl = url;
        return new Response('<html><body>About Live</body></html>', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    const cfDeploy = await reloaded.deployStaticPage('about', { platform: 'cloudflare' });
    assert.equal(cfDeploy.success, true);
    assert.equal(cfDeploy.platform, 'cloudflare');
    assert.equal(cfDeploy.uploaded_files, 1);
    assert.equal(verifiedUrl, 'https://pagesdemo.demoacct.workers.dev/about/');
    assert.equal(fs.statSync(siblingPostFile).mtimeMs, postMtimeBefore);
    assert.match(fs.readFileSync(path.join(outDir, 'about', 'index.html'), 'utf-8'), /Custom About Atelier/);

    // Direct Deploy Option 2: GitHub Pages for /privacy-policy/
    reloaded.runBuild({ clean: true, targetCloud: 'github', projectName: 'pagesdemo' });
    const ghPushed: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PUT' && url.includes('/contents/')) {
        ghPushed.push(url.split('/contents/')[1]);
        return new Response(JSON.stringify({ content: { sha: 'sha-new' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ sha: 'sha-old' }), { status: 200 });
    }) as typeof fetch;

    const ghDeploy = await reloaded.deployStaticPage('privacy-policy', {
      platform: 'github',
      title: 'Updated Privacy Policy',
      body_html: '<h2>Your Privacy Matters</h2><p>Custom legal HTML pushed directly to GitHub.</p>',
    });
    assert.equal(ghDeploy.success, true);
    assert.equal(ghDeploy.platform, 'github');
    assert.deepEqual(ghPushed, ['privacy-policy/index.html']);

    // Bulk deploy all 9 pages (dry-run)
    const allRes = await reloaded.deployAllStaticPages({ platform: 'cloudflare', dry_run: true });
    assert.equal(allRes.success, true);
    assert.equal((allRes.changed_files as string[]).length, 9);

    // Reset to default restores built-in template
    const resetRes = reloaded.updateStaticPage('about', { reset: true });
    assert.equal(resetRes?.is_custom, false);

    // Project isolation: new project starts with 0 custom pages
    reloaded.createProject({ name: 'Isolated Legal Site', cf_project_name: 'isolatedlegal' });
    assert.equal(reloaded.listStaticPages().every((p) => !p.is_custom), true);
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('full-project audit regressions: pseo_nested_silo routing, nested XSS stripping inside H1/custom tags across all sanitizers, and static-page local image build sync', async () => {
  const { sanitizeStaticPageHtml } = await import('./static-pages.ts');
  const { sanitizeEditedHtml, sanitizeArticleHtml } = await import('./scraper.ts');

  // 1. pseo_nested_silo routing mode
  assert.equal(normalizeRoutingMode('pseo_nested_silo'), 'pseo_nested_silo');
  const route = resolvePostRoute(
    {
      slug: 'sunlit-coffee-bar',
      title: 'Sunlit Coffee Bar',
      category: 'Kitchen Ideas',
      category_slug: 'kitchen-ideas',
      parent_slug: 'kitchen',
    },
    'pseo_nested_silo'
  );
  assert.equal(route.web_path, '/blog/sunlit-coffee-bar/');
  assert.equal(route.file_path, 'blog/sunlit-coffee-bar/index.html');
  assert.equal(route.breadcrumbs[1]?.url, '/category/kitchen-ideas/');

  // 2. Nested dangerous attributes inside <h1> and disallowed wrapper tags must be stripped in ALL 3 sanitizers
  const nestedAttack = `
    <h1><img src="/assets/images/logo.webp" onerror="alert('h1')" alt="ok" /><a href="javascript:alert('h1link')">Heading Link</a></h1>
    <custom-wrapper><inner-tag><a href="javascript:alert('nested')" onclick="evil()">Bad</a><img src="https://example.com/a.webp" onload="evil2()" alt="safe" /></inner-tag></custom-wrapper>
  `;

  const cleanStatic = sanitizeStaticPageHtml(nestedAttack);
  assert.match(cleanStatic, /<h2>/);
  assert.equal(cleanStatic.includes('onerror='), false);
  assert.equal(cleanStatic.includes('onload='), false);
  assert.equal(cleanStatic.includes('onclick='), false);
  assert.equal(cleanStatic.includes('javascript:'), false);
  assert.equal(cleanStatic.includes('<custom-wrapper'), false);

  const cleanEditor = sanitizeEditedHtml(nestedAttack);
  assert.match(cleanEditor, /<h2>/);
  assert.equal(cleanEditor.includes('onerror='), false);
  assert.equal(cleanEditor.includes('onload='), false);
  assert.equal(cleanEditor.includes('onclick='), false);
  assert.equal(cleanEditor.includes('javascript:'), false);
  assert.equal(cleanEditor.includes('<custom-wrapper'), false);

  const cleanArticle = sanitizeArticleHtml(nestedAttack, 'https://example.com/post/', 'Different Title');
  assert.equal(cleanArticle.includes('onerror='), false);
  assert.equal(cleanArticle.includes('onload='), false);
  assert.equal(cleanArticle.includes('onclick='), false);
  assert.equal(cleanArticle.includes('javascript:'), false);
  assert.equal(cleanArticle.includes('<custom-wrapper'), false);

  // 3. Store status exposes pseo_nested_silo, builds /blog/<slug>/index.html, and copies local images embedded in custom Site Pages
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-audit-regressions-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    const status = store.getStatus() as { available_routing_modes: string[] };
    assert.equal(status.available_routing_modes.includes('pseo_nested_silo'), true);

    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });

    // Place a local image referenced ONLY by a custom About Us page
    const assetsDir = path.join(tmpDir, 'assets', 'images');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'team-portrait.webp'), 'RIFF....WEBP', 'utf-8');

    store.updateStaticPage('about', {
      title: 'About Our Studio',
      body_html: '<h2>Meet the Team</h2><p><img src="/assets/images/team-portrait.webp" alt="Studio Team" /></p>',
    });

    const build = store.runBuild({
      clean: true,
      targetCloud: 'cloudflare',
      theme: 'pinterest-mag',
      routingMode: 'pseo_nested_silo',
    });
    assert.equal(build.success, true);
    const outDir = String(build.output_dir);
    const firstSlug = store.listPosts()[0].slug;
    assert.equal(fs.existsSync(path.join(outDir, 'blog', firstSlug, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'assets', 'images', 'team-portrait.webp')), true);

    // Single static page dry-run deploy also includes the referenced local image
    const pageDeploy = await store.deployStaticPage('about', { platform: 'cloudflare', dry_run: true });
    assert.equal(pageDeploy.success, true);
    assert.equal((pageDeploy.changed_files as string[]).includes('assets/images/team-portrait.webp'), true);

    // 4. clearActiveProjectData MUST reject unknown project IDs without wiping active project posts
    const countBefore = store.listPosts().length;
    assert.throws(() => store.clearActiveProjectData('__nonexistent_project__'), /not found/);
    assert.equal(store.listPosts().length, countBefore);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Theme Preview Live Customizer: titles, Image+Text blocks, footer text, image upload, build asset copy, and per-project isolation', async () => {
  const { renderHubHtml, renderPostHtml } = await import('./templates.ts');

  // 1. Normalization strips unsafe URL schemes and keeps safe assets/URLs
  const normalized = normalizeThemeCustomizations({
    hero_title: '  Warm Botanical Living  ',
    footer_copyright: '© 2026 Atelier Press',
    content_blocks: [
      {
        id: 'b1',
        eyebrow: 'Studio Note',
        title: 'Natural Light First',
        body: 'Paragraph one.\n\nParagraph two.',
        image_url: 'javascript:alert(1)',
        cta_label: 'Bad Link',
        cta_url: 'javascript:evil()',
        layout: 'image-right',
        position: 'after-hero',
      },
      {
        id: 'b2',
        title: 'Handcrafted Wood',
        body: 'Oak and walnut joinery.',
        image_url: '/assets/images/safe-block.webp',
        cta_label: 'About Us',
        cta_url: '/about/',
        layout: 'image-left',
        position: 'before-footer',
      },
    ],
  });
  assert.equal(normalized.hero_title, 'Warm Botanical Living');
  assert.equal(normalized.content_blocks?.length, 2);
  assert.equal(normalized.content_blocks?.[0].image_url || '', '');
  assert.equal(normalized.content_blocks?.[0].cta_url || '', '');
  assert.equal(normalized.content_blocks?.[0].layout, 'image-right');
  assert.equal(normalized.content_blocks?.[1].image_url, '/assets/images/safe-block.webp');
  assert.equal(normalized.content_blocks?.[1].cta_url, '/about/');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseo-theme-customizer-'));
  try {
    const store = new DashboardStore({ workspaceDir: tmpDir });
    await store.executeIngestion({ sourceType: 'sitemap', urlOrList: '' });

    // 2. Upload a real 1x1 PNG to uploadThemeBlockImage -> converts to WebP in /assets/images/
    const tinyPngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2dIAAAAASUVORK5CYII=';
    const uploaded = await store.uploadThemeBlockImage({
      image_base64: tinyPngBase64,
      filename: 'studio-feature.png',
    });
    assert.equal(uploaded.success, true);
    const uploadedUrl = String(uploaded.image_url || '');
    assert.match(uploadedUrl, /^\/assets\/images\/theme-block-.*\.webp$/);
    const uploadedFilename = path.basename(uploadedUrl);
    assert.equal(fs.existsSync(path.join(tmpDir, 'assets', 'images', uploadedFilename)), true);

    const customDraft = {
      hero_title: 'Bespoke Nordic Sanctuary',
      hero_subtitle: 'Curated calm spaces for every season.',
      categories_title: 'Browse Rooms',
      latest_title: 'Fresh Dispatches',
      newsletter_title: 'Sunday Journal',
      newsletter_copy: 'One thoughtful letter every week.',
      footer_description: 'Independent editorial studio crafting calm interiors.',
      footer_copyright: '© 2026 Bespoke Sanctuary Media.',
      footer_email: 'studio@sanctuary.example',
      content_blocks: [
        {
          id: 'blk-1',
          eyebrow: 'Design Philosophy',
          title: 'Materials That Age Gracefully',
          body: 'Raw oak, limewash walls, and unbleached linen bring lasting warmth.',
          image_url: uploadedUrl,
          image_alt: 'Oak and linen interior',
          layout: 'image-right' as const,
          position: 'after-hero' as const,
          cta_label: 'Read Our Story',
          cta_url: '/about/',
        },
      ],
    };

    // 3. Draft renderPreview renders all overrides WITHOUT mutating saved config
    const draftHtml = store.renderPreview({
      theme: 'pinterest-mag',
      viewMode: 'hub',
      themeCustomizations: customDraft,
    });
    assert.match(draftHtml, /Bespoke Nordic Sanctuary/);
    assert.match(draftHtml, /Browse Rooms/);
    assert.match(draftHtml, /Fresh Dispatches/);
    assert.match(draftHtml, /Sunday Journal/);
    assert.match(draftHtml, /Materials That Age Gracefully/);
    assert.match(draftHtml, /layout-image-right/);
    assert.match(draftHtml, /Independent editorial studio crafting calm interiors\./);
    assert.match(draftHtml, /© 2026 Bespoke Sanctuary Media\./);
    assert.match(draftHtml, /studio@sanctuary\.example/);
    assert.equal(store.config.branding.theme_customizations?.hero_title, undefined);

    // 4. All 3 themes render custom titles, Image+Text blocks, and custom footer cleanly
    const posts = store.listPosts();
    const categories = store.manifest.categories;
    const brandingWithCustom = { ...store.config.branding, theme_customizations: customDraft };
    for (const themeKey of ['editorial-warm', 'nordic-studio', 'pinterest-mag'] as const) {
      const hubHtml = renderHubHtml({
        posts,
        categories,
        themeKey,
        branding: brandingWithCustom,
        routingMode: 'single',
        baseUrl: 'https://sanctuary.example',
      });
      assert.match(hubHtml, /Bespoke Nordic Sanctuary/, `Missing hero title in ${themeKey}`);
      assert.match(hubHtml, /custom-media-band/, `Missing custom media block in ${themeKey}`);
      assert.match(hubHtml, /© 2026 Bespoke Sanctuary Media\./, `Missing footer copyright in ${themeKey}`);

      const postHtml = renderPostHtml({
        post: posts[0],
        allPosts: posts,
        categories,
        themeKey,
        branding: brandingWithCustom,
        routingMode: 'single',
        baseUrl: 'https://sanctuary.example',
      });
      assert.match(postHtml, /Independent editorial studio crafting calm interiors\./, `Missing footer desc on article in ${themeKey}`);
      assert.match(postHtml, /studio@sanctuary\.example/, `Missing footer email on article in ${themeKey}`);
    }

    // 5. Save config, run build -> dist includes uploaded block image + customized index.html
    store.updateConfig({
      build: { theme: 'nordic-studio' },
      branding: { theme_customizations: customDraft },
    });
    const build = store.runBuild({ clean: true, targetCloud: 'cloudflare', theme: 'nordic-studio' });
    assert.equal(build.success, true);
    const outDir = String(build.output_dir);
    assert.equal(fs.existsSync(path.join(outDir, 'assets', 'images', uploadedFilename)), true);
    const builtHome = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    assert.match(builtHome, /Bespoke Nordic Sanctuary/);
    assert.match(builtHome, /Materials That Age Gracefully/);
    assert.match(builtHome, /© 2026 Bespoke Sanctuary Media\./);

    // 6. Per-project isolation: creating a second project starts clean, switching back restores customizations
    const origProjectId = store.config.active_project;
    store.createProject({ name: 'Second Studio', platform: 'cloudflare' });
    assert.equal(store.config.branding.theme_customizations?.hero_title, undefined);
    assert.equal(store.config.branding.theme_customizations?.content_blocks?.length || 0, 0);

    store.switchProject(origProjectId);
    assert.equal(store.config.branding.theme_customizations?.hero_title, 'Bespoke Nordic Sanctuary');
    assert.equal(store.config.branding.theme_customizations?.content_blocks?.length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});




