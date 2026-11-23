# Master Task Board — Node.js Migration Log

| File Path | Key Exports | Verification Status |
|---|---|---|
| `package.json` | `dev`, `build`, `lint`, `start`, `test` scripts | Verified (`npm run build`, `npm run lint`, `npm test`) |
| `tsconfig.json` | Strict TypeScript config (NodeNext + `allowImportingTsExtensions`) | Verified (`tsc --noEmit`) |
| `metadata.json` | App name & description | Synced with `public/index.html` |
| `src/types.ts` | Domain types, `maskToken`, `slugify`, `deriveBrandFromDomain`, `resolvePostRoute` | Verified (unit tests passing) |
| `src/templates.ts` | `THEMES`, `renderPostHtml`, `renderHubHtml`, `renderCategoryIndexHtml`, `generateSvgFallback` | Verified (unit tests & browser preview) |
| `src/store.ts` | `DashboardStore` (projects, config, posts, ingestion, static build, Cloudflare & GitHub APIs) | Verified (unit tests & browser E2E) |
| `src/store.test.ts` | `node:test` unit suite | 3/3 passing |
| `server.ts` | Express REST API & static SPA server on `0.0.0.0:3000` | Verified live in Chromium |
| `public/` | Preserved SPA frontend (`index.html`, `style.css`, `app.js`, `cropper.js`) | Verified live in Chromium (0 console errors) |

## Dead-Code Minimization Log

| Target | Before → After | Changes | Verification Status |
|---|---|---|---|
| Root legacy files + `my-worker/` | 694 lines → 0 (deleted) | Deleted `bun.lock`, `walkthrough.md`, `mcp_config.example.json`, `my-worker/` | Removed |
| `server.ts` | 484 → 412 lines | Pruned 8 uncalled routes/aliases | `tsc --noEmit` + live check |
| `src/store.ts` & `src/templates.ts` | 2,432 → 2,400 lines | Removed `deleteProject`, `resetAllProjects`, `normalizeSlug`, `distooso` checks | 3/3 `node:test` passing |
| `public/index.html` | 1,491 → 1,406 lines | Removed 7 dead hidden backward-compatibility stub blocks | Verified in Chromium |
| `public/app.js` | 5,143 → 2,881 lines | Removed dead DOM refs, split/dual/tab/subtab/duplicate GitHub handlers & excess blank lines | `node --check` + Chromium E2E |
| `public/style.css` | 2,655 → 1,463 lines | Pruned 166 unused CSS rule blocks | Balanced braces + visual check |
| **Total** | **13,953 → 9,616 lines (-31.1%)** | **-4,337 lines removed** | **Verified** |

## 03 Catalog — Site Pages Manager (9 Legal/Company Pages) Log

| File Path | Key Exports / Changes | Verification Status |
|---|---|---|
| `plans/architecture-spec.md` | Section 5 blueprint for Site Pages (9) upload, edit, preview, and 2-option deploy | Approved |
| `src/types.ts` | `StaticPageOverride` interface | Verified (`tsc --noEmit`) |
| `src/static-pages.ts` | `EDITABLE_STATIC_PAGE_META`, `isEditableStaticPageSlug`, `sanitizeStaticPageHtml`, `extractUploadedPageHtml`, override merge in `buildTrustPages` | Verified (17/17 unit tests) |
| `src/store.ts` | Per-project `static_pages.json` persistence, `listStaticPages`, `getStaticPage`, `updateStaticPage`, `renderStaticPagePreview`, `deployStaticPage`, `deployAllStaticPages` | Verified (17/17 unit tests) |
| `server.ts` | REST endpoints `/api/pages`, `/api/pages/deploy-all`, `/api/pages/:slug`, `/api/pages/:slug/preview`, `/api/pages/:slug/deploy` | Verified live in Chromium |
| `public/index.html`, `public/style.css`, `public/app.js` | Segmented sub-tab `Site Pages (9)`, per-page HTML upload, Visual/HTML/Live Preview modal, direct Cloudflare & GitHub single + bulk deploy | Verified live in Chromium (0 console errors) |
| `src/store.test.ts` | Test #17 covering all 9 pages, HTML extraction/XSS stripping, persistence, project isolation, CF & GH incremental/bulk deploy | 17/17 passing |

## Full-Project Audit & End-to-End Testing Log

| File Path | Key Exports / Changes | Verification Status |
|---|---|---|
| `src/types.ts` | Added full `pseo_nested_silo` support (`/blog/<slug>/` + `/category/<cat>/` breadcrumb) in `normalizeRoutingMode` & `resolvePostRoute` | Verified (18/18 unit tests) |
| `src/static-pages.ts` & `src/scraper.ts` | Hardened `sanitizeStaticPageHtml`, `sanitizeEditedHtml`, and `sanitizeArticleHtml` with multi-pass DOM tag normalization before attribute sanitization | Verified (18/18 unit tests) |
| `src/store.ts` | Fixed `clearActiveProjectData` invalid-project guard (preventing fallback wipe of active project), added `pseo_nested_silo` to status, synced local `/assets/images/*` referenced in custom Site Pages during full & incremental builds | Verified (18/18 unit tests + 25 live API checks) |
| `server.ts` | Wrapped synchronous POST routes (`/api/config`, `/api/preview`, `/api/sitemap/scan`, `/api/ingest`, `/api/projects/clear`, `/api/build`, `/api/cloudflare/deploy`, `/api/deploy`) with JSON `try/catch` guards | Verified (25 live API checks) |
| `public/app.js`, `public/index.html`, `public/style.css` | Fixed `api()` JSON body forwarding on `DELETE`/`PATCH`, validated URL schemes & escaped GitHub preview inputs, added `pseo_nested_silo` option/label, awaited async theme modal saves, and fixed mobile `390x844` horizontal overflow containment | Verified (`node --check` + Desktop & Mobile Chromium E2E, 0 console/page/network errors) |
| `src/store.test.ts` | Added Test #18 covering `pseo_nested_silo`, nested sanitization across all 3 sanitizers, static-page local image build sync, and `clearActiveProjectData` invalid-ID guard | 18/18 passing |

## Theme Preview Live Visual Customizer (Titles, Image + Text Blocks, Footer) Log

| File Path | Key Exports / Changes | Verification Status |
|---|---|---|
| `plans/architecture-spec.md` | Section 6 blueprint for Theme Preview Live Visual Customizer | Approved |
| `src/types.ts` | `ThemeContentBlock`, `ThemeCustomizations`, `normalizeThemeCustomizations` | Verified (`tsc --noEmit` + 19/19 tests) |
| `src/templates.ts` | `.custom-media-band` responsive split layout CSS (all 3 themes), `renderCustomContentBlocks`, title & footer overrides in `renderHubHtml` & `renderFooter` | Verified (19/19 tests) |
| `src/store.ts` | Per-project `theme_customizations` isolation, draft `renderPreview`, `uploadThemeBlockImage` (Sharp WebP + sanitized SVG), build asset sync | Verified (19/19 tests) |
| `server.ts` | `POST /api/upload-block-image` and `theme_customizations` forwarding in `POST /api/preview` | Verified live |
| `public/index.html`, `public/style.css`, `public/app.js` | Split-pane collapsible Customize sidebar inside `#templatePreviewModal` (`Titles`, `Image & Text`, `Footer`), live debounced preview, image upload, reorder/delete, Reset Edits, Save & Apply | Verified (`node --check` + live Chromium E2E) |
| `src/store.test.ts` | Added Test #19 covering normalization, Image+Text upload/build sync, draft preview, all 3 themes, and per-project isolation | 19/19 passing |




