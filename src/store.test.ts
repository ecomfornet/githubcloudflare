import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveBrandFromDomain,
  maskToken,
  normalizeRoutingMode,
  resolvePostRoute,
  slugify,
} from './types.ts';
import { DashboardStore } from './store.ts';

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
      // Only load the theme's required serif family (editorial-warm / pinterest-mag must NOT load Cormorant Garamond)
      if (themeKey === 'nordic-studio') {
        assert.match(postHtml, /Cormorant\+Garamond/);
        assert.equal(postHtml.includes('Playfair+Display'), false);
      } else {
        assert.match(postHtml, /Playfair\+Display/);
        assert.equal(postHtml.includes('Cormorant+Garamond'), false);
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

    // 6. clearActiveProjectData cannot traverse outside scraped_data even if passed '..'
    const outsideMarker = path.join(tmpDir, 'do-not-delete.txt');
    fs.writeFileSync(outsideMarker, 'keep', 'utf-8');
    const clearRes = store.clearActiveProjectData('../../outside');
    assert.equal(clearRes.success, true);
    assert.equal(fs.existsSync(outsideMarker), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});





