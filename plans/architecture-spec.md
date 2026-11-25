# Architecture Specification — stylesdays pSEO Multi-Cloud Hub (Node.js Migration)

## 1. Runtime & Entry Point
- **Runtime**: Node.js 22 (ESM + TypeScript), npm only.
- **Entry Point**: `server.ts` listening on `0.0.0.0:3000` (`npm run dev` via `tsx server.ts`, `npm run start` via `node server.ts`).
- **Static Frontend**: Existing SPA assets preserved verbatim under `public/` (`index.html`, `style.css`, `app.js`, `cropper.js`) with zero visual restyling.

## 2. Backend Module Layout
- `src/types.ts`: Domain interfaces (`AppConfig`, `PostItem`, `Manifest`, `ProjectItem`, `IngestJob`, `DeployJob`, `RouteResult`, `DiffSummary`) and pure utilities (`maskToken`, `slugify`, `deriveBrandFromDomain`, `normalizeRoutingMode`, `resolvePostRoute`).
- `src/templates.ts`: Pure HTML/CSS renderer for all 3 editorial themes (`editorial-warm`, `nordic-studio`, `pinterest-mag`), hub pages, category indexes, and SVG fallback artwork.
- `src/store.ts`: `DashboardStore` managing configuration (`pseo_config.json`), isolated project manifests (`scraped_data/<pid>/manifest.json`), posts CRUD, XML sitemap scanning, asynchronous content ingestion with diff preservation of `custom_edited` posts, static site compilation (`dist/<project>/` + `sitemap.xml` + `robots.txt`), asset sync/optimization, and Cloudflare / GitHub integration endpoints.
- `src/store.test.ts`: `node:test` unit test suite covering pure utilities, project isolation, ingestion diffing, static build generation, and theme rendering.
- `server.ts`: Express REST API router and static file server for `public/` and `assets/`.

## 3. REST API Contract (Minimized Active Surface)
- Projects: `GET /api/projects`, `POST /api/projects`, `POST /api/projects/update`, `POST /api/projects/switch`
- System & Config: `GET /api/status`, `GET /api/config`, `POST /api/config`, `POST /api/upload-logo`
- Posts: `GET /api/posts`, `GET /api/posts/:slug`, `PUT /api/posts/:slug`, `POST /api/posts/:slug/deploy` (incremental single-post update), `DELETE /api/posts/:slug` (removes post locally and directly from live Cloudflare Worker / GitHub without full rebuild)
- Preview: `POST /api/preview`
- Ingestion: `POST /api/sitemap/scan`, `POST /api/ingest`, `POST /api/ingest/stop`, `GET /api/ingest/status`
- Projects Clear: `POST /api/projects/clear`
- Build & Assets: `POST /api/build`, `POST /api/assets/sync`, `POST /api/images/optimize`
- Cloudflare: `POST /api/cloudflare/verify`, `POST /api/cloudflare/deploy`, `POST /api/cloudflare/fetch-posts` (fetches all live articles published on the deployed Cloudflare Worker into the catalog)
- GitHub & Deploy: `POST /api/github/orgs`, `POST /api/github/check-org`, `POST /api/github/create-repo`, `POST /api/deploy`, `GET /api/deploy/status`, `GET /api/deploy/logs`

## 4. Dead-Code Minimization Scope
- Remove unused root legacy artifacts (`bun.lock`, `walkthrough.md`, `mcp_config.example.json`) and unused `my-worker/` scaffold.
- Prune uncalled backend endpoints and unused methods (`deleteProject`, `resetAllProjects`, `normalizeSlug`, legacy `distooso` checks).
- Prune dead `display: none` compatibility stubs from `public/index.html`, dead DOM/split/dual/legacy-tab code and excessive blank lines from `public/app.js`, and unused CSS rule blocks from `public/style.css` while preserving 100% of active UI styling and behavior.

## 5. Step 3 Site Pages Manager (HTML Upload, Inline Editor & Direct 2-Option Deploy)
- **Editable Allowlist (9 Pages)**: `about`, `contact`, `editorial-policy`, `fact-checking-policy`, `privacy-policy`, `cookie-policy`, `terms`, `disclaimer`, `copyright`.
- **Storage**: Per-project JSON overrides persisted at `scraped_data/<pid>/static_pages.json` (isolated per project, merged cleanly into `buildTrustPages()` across full builds, previews, and incremental deploys).
- **Sanitization & HTML Extraction**: `extractUploadedPageHtml()` & `sanitizeStaticPageHtml()` in `src/static-pages.ts` extract `<body>` + optional `<title>`/`<meta name="description">` from full `.html` documents or fragments, preserve semantic markup + safe contact forms, and strip executable tags (`script`, `iframe`, `object`, `embed`) and `on*` handlers.
- **API Surface**: `GET /api/pages`, `GET /api/pages/:slug`, `PUT /api/pages/:slug` (save, upload HTML, or reset to default), `POST /api/pages/:slug/preview`, `POST /api/pages/:slug/deploy` (`platform: 'cloudflare' | 'github'`), `POST /api/pages/deploy-all`.
- **UI**: Sub-tab inside **03 Catalog** (`Articles & Posts` / `Site Pages (9)`) with per-row `Upload HTML`, `View`, `Edit`, `Deploy` controls, bulk 2-option deploy buttons, and a full Page Editor Modal with Visual / HTML / Live Preview tabs + explicit Cloudflare & GitHub direct deploy options.

## 6. Theme Preview Live Visual Customizer (Titles, Footer Text & Image + Text Blocks)
- **Data Model (`src/types.ts`)**: `ThemeContentBlock` (`id`, `eyebrow`, `title`, `body`, `image_url`, `image_alt`, `layout: 'image-left' | 'image-right'`, `position: 'after-hero' | 'before-newsletter' | 'before-footer'`, `cta_label`, `cta_url`) and `ThemeCustomizations` (`hero_title`, `hero_subtitle`, `categories_title`, `latest_title`, `newsletter_title`, `newsletter_copy`, `footer_description`, `footer_copyright`, `footer_email`, `content_blocks`) stored per project on `BrandingConfig.theme_customizations` and `ProjectItem.theme_customizations`, normalized via `normalizeThemeCustomizations()`.
- **Template Rendering (`src/templates.ts`)**: Applies title/copy overrides and renders responsive `.custom-media-band` Image + Text blocks in `renderHubHtml()` across all 3 themes (`editorial-warm`, `nordic-studio`, `pinterest-mag`) and applies footer overrides in `renderFooter()` globally (Homepage, Articles, Categories, Static Pages).
- **API & Persistence (`src/store.ts`, `server.ts`)**:
  - `POST /api/preview` accepts optional draft `theme_customizations` for instant non-destructive live previewing.
  - `POST /api/config` persists `branding.theme_customizations` per active project; `runBuild()` copies local `/assets/images/*` referenced by custom blocks into `dist/<project>/assets/images/`.
  - `POST /api/upload-block-image` validates and saves uploaded block images (converting raster uploads to WebP via `sharp` or sanitizing SVG) into `/assets/images/` and returns `{ success: true, image_url }`.
- **UI (`public/index.html`, `public/style.css`, `public/app.js`)**: Side-by-side collapsible editor drawer inside `#templatePreviewModal` with 3 tabs (**Titles**, **Image & Text**, **Footer**), live debounced iframe re-rendering, image file upload + URL input, reorder/delete block controls, **Reset Edits**, and **Save & Apply** persistence.

## 7. Complete Per-Project Settings & Asset Isolation
- **Data Model (`src/types.ts`)**: Extend `ProjectItem` to persist EVERY project-specific configuration field: full `branding: BrandingConfig` (`brand_name`, `tagline`, `logo_path`, `author_name`, `author_bio`, `enable_toc`, `enable_faq`, `enable_eeat`, `social_links`, `custom_head_code`, `theme_customizations`), `theme`, `routing_mode`, `output_dir`, `platform`, `cf_project_name`, `cf_custom_domain`, `cf_deployment_type`, `cf_compatibility_date`, `gh_owner`, `gh_repo`, `gh_branch`, `gh_is_org`, `gh_base_path`, `sitemap_url`, `wp_api_url`, `max_posts`, and `download_images`. Account-level API credentials (`cloudflare.api_token`, `cloudflare.account_id`, `cloudflare.account_subdomain`, `github.token`) remain shared across projects so users don't re-enter tokens when switching projects.
- **Project-Scoped Logo Assets (`src/store.ts`)**: `uploadLogo()` writes to `/assets/images/custom-logo-<projectId>.<ext>` (never overwriting another project's logo) and deletes only the active project's logo on replace/reset; `clearActiveProjectData()` protects all sibling projects' logos and theme block images.
- **Bidirectional Snapshot/Hydration (`src/store.ts`)**:
  - `snapshotActiveProjectFromConfig()` snapshots all active project-scoped config fields onto `projects[activeProjectId]` on every `updateConfig()`, `uploadLogo()`, `updateProject()`, and prior to switching away in `switchProject()` / `createProject()`.
  - `hydrateConfigFromProject(item)` restores all project-scoped fields cleanly into `this.config` on `initProjects()`, `createProject()`, and `switchProject()` (zero leakage from previous projects).
- **Frontend Sync (`public/app.js`)**: On project switch or creation, immediately synchronize platform view (`cf`/`gh`), all Step 1–4 inputs (fixing `gh_owner`/`gh_repo` field mapping), logo preview (`updateLogoPreview`), theme cards, routing cards, custom `<head>` code, Theme Customizer draft, posts catalog, Site Pages (9) (`refreshStaticPages`), and live preview iframe (`triggerPreview`).

## 8. End-to-End Hardening & Atomic GitHub Git Data API Deployment
- **Real Atomic GitHub Deployment (`src/store.ts`)**: Replace the live stub in `startGitHubDeploy()` with real GitHub Git Data API orchestration: collect all compiled files under `outputDir`, resolve `git/ref/heads/<branch>` and base commit/tree (with empty-repo bootstrap fallback via `/contents/`), create blobs concurrently, construct a single Git tree, create a single atomic commit, and fast-forward the branch ref while streaming progress (`percent`, `stage`, `message`, `commit_sha`, `live_url`) to `deployJob`.
- **Platform-Accurate Build URLs & Filtering (`src/store.ts`, `server.ts`)**:
  - `runBuild()` computes GitHub Pages `baseUrl` (`https://<repo>` for `*.github.io` repos, else `https://<owner>.github.io/<repo>`) when building for `github` without a custom domain, ensuring `sitemap.xml`, `robots.txt`, and canonicals match the target platform.
  - `GET /api/posts` and `listPosts()` support `status=SYNCED|CUSTOM` alongside `custom_only` so the Catalog status filter works accurately for both `CUSTOM` and `SYNCED` posts.
  - `startIngestJob()` persists `wp_api_url` on the active project when ingesting via `wp_api`.
- **SPA Reliability & UX Fixes (`public/index.html`, `public/app.js`)**:
  - Preserve active platform when clicking Step 3 -> Step 4 navigation buttons.
  - Dedicated GitHub build progress container (`#ghBuildProgressBarContainer`) and live GitHub deploy polling progress/error handling (`status === 'error' || status === 'failed'`).
  - Unified terminal log buffer (`cachedLogs`) and fixed filter matching (`cloudflare`/`cf`, `github`/`gh`, `build`).
  - Accurate `is_org` detection on Step 1 GitHub repo creation, dynamic `wp_api` source label/placeholder, stale-slug guard in `populatePreviewSelect()`, 404-free Catalog thumbnails, deduplicated Step 1 auto-save listeners, `#ghStatusFeedback` inline status box, and modal Escape/backdrop + file-input reset polish.
