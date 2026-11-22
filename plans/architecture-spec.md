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

