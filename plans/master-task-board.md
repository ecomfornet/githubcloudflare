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


