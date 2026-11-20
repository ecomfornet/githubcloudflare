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
      const hubHtml = store.renderPreview({ theme, viewMode: 'hub' });
      assert.match(hubHtml, /Editorial Hub/);
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
