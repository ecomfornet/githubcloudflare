import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface CloudflareDeployOptions {
  apiToken: string;
  accountId: string;
  scriptName: string;
  outputDir: string;
  workspaceDir: string;
  compatibilityDate?: string;
  accountSubdomain?: string;
  verifyPath?: string;
  onProgress?: (update: { stage: string; percent: number; message: string; deployedFiles?: number }) => void;
  onLog?: (msg: string) => void;
}

export interface CloudflareDeployResult {
  scriptName: string;
  accountSubdomain: string;
  liveUrl: string;
  filesCount: number;
  uploadedFiles: number;
  cachedFiles: number;
  edgeVerification: {
    url: string;
    status: number;
    ok: boolean;
    checked_at: string;
  };
}

interface CfEnvelope<T = unknown> {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

interface AssetEntry {
  webPath: string;
  hash: string;
  size: number;
  base64: string;
  mimeType: string;
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const MAX_SINGLE_ASSET_BYTES = 25 * 1024 * 1024; // Cloudflare Workers static asset limit (25 MiB)

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  avif: 'image/avif',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  pdf: 'application/pdf',
};

export function sanitizeWorkerScriptName(raw: string): string {
  const clean = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  if (!clean || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(clean)) {
    throw new Error(`Invalid Cloudflare Worker name '${raw}'. Use lowercase letters, numbers, and hyphens.`);
  }
  return clean;
}

export function getMimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function collectStaticAssets(outputDir: string, workspaceDir: string): AssetEntry[] {
  const resolvedRoot = path.resolve(workspaceDir);
  const resolvedOut = path.resolve(outputDir);
  if (resolvedOut !== resolvedRoot && !resolvedOut.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Build output directory must reside inside workspace.');
  }
  if (!fs.existsSync(resolvedOut)) {
    throw new Error(`Build output directory not found: ${resolvedOut}`);
  }

  const assets: AssetEntry[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_SINGLE_ASSET_BYTES) continue;
        const rel = path.relative(resolvedOut, fullPath).split(path.sep).join('/');
        const webPath = `/${rel}`;
        const buf = fs.readFileSync(fullPath);
        const base64 = buf.toString('base64');
        const ext = path.extname(fullPath).slice(1).toLowerCase();
        // 32-char hex digest combining content + extension prevents cross-MIME hash collisions
        const hash = crypto.createHash('sha256').update(base64 + ext).digest('hex').slice(0, 32);
        assets.push({
          webPath,
          hash,
          size: buf.length,
          base64,
          mimeType: getMimeTypeForFile(fullPath),
        });
      }
    }
  };
  walk(resolvedOut);
  return assets;
}

function formatCfError(data: CfEnvelope, status: number, fallback: string): string {
  const detail = data?.errors
    ?.map((e) => (e.code ? `[${e.code}] ${e.message || ''}` : e.message || ''))
    .filter(Boolean)
    .join('; ');
  return detail || `${fallback} (HTTP ${status})`;
}

export async function deployCloudflareWorkersAssets(
  opts: CloudflareDeployOptions
): Promise<CloudflareDeployResult> {
  const apiToken = String(opts.apiToken || '').trim();
  if (!apiToken) {
    throw new Error('Cloudflare API Token is missing. Set CLOUDFLARE_API_TOKEN or configure it in Settings.');
  }
  const scriptName = sanitizeWorkerScriptName(opts.scriptName);
  const authHeaders = { Authorization: `Bearer ${apiToken}` };
  const log = (m: string) => opts.onLog?.(m);
  const progress = (stage: string, percent: number, message: string, deployedFiles?: number) =>
    opts.onProgress?.({ stage, percent, message, deployedFiles });

  // 1. Resolve Account ID if not explicitly supplied
  let accountId = String(opts.accountId || '').trim();
  if (!accountId) {
    const accRes = await fetch(`${CF_API_BASE}/accounts?per_page=1`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });
    const accData = (await accRes.json().catch(() => ({}))) as CfEnvelope<Array<{ id?: string }>>;
    if (accRes.ok && accData.success && Array.isArray(accData.result) && accData.result[0]?.id) {
      accountId = accData.result[0].id;
    }
  }
  if (!accountId) {
    throw new Error('Cloudflare Account ID is missing. Set CLOUDFLARE_ACCOUNT_ID or configure it in Settings.');
  }

  // 2. Collect static build assets
  progress('hashing', 35, `Scanning static assets for '${scriptName}'...`);
  const assets = collectStaticAssets(opts.outputDir, opts.workspaceDir);
  if (assets.length === 0) {
    throw new Error('Build output directory contains no static files to deploy.');
  }

  const manifest: Record<string, { hash: string; size: number }> = {};
  const byHash = new Map<string, AssetEntry>();
  for (const a of assets) {
    manifest[a.webPath] = { hash: a.hash, size: a.size };
    byHash.set(a.hash, a);
  }
  log(`[CLOUDFLARE] Prepared ${assets.length} static assets for Worker '${scriptName}'.`);

  // 3. Start Cloudflare Static Assets Upload Session
  progress('session', 45, `Opening Cloudflare asset upload session (${assets.length} files)...`);
  const encAcc = encodeURIComponent(accountId);
  const encScript = encodeURIComponent(scriptName);
  const sessionUrl = `${CF_API_BASE}/accounts/${encAcc}/workers/scripts/${encScript}/assets-upload-session`;
  const sessionRes = await fetch(sessionUrl, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ manifest }),
    signal: AbortSignal.timeout(30000),
  });
  const sessionData = (await sessionRes.json().catch(() => ({}))) as CfEnvelope<{
    jwt?: string;
    buckets?: string[][];
  }>;
  if (!sessionRes.ok || !sessionData.success || !sessionData.result?.jwt) {
    throw new Error(
      `Cloudflare assets-upload-session failed: ${formatCfError(sessionData, sessionRes.status, 'Upload session rejected')}`
    );
  }

  const sessionJwt = sessionData.result.jwt;
  const buckets = Array.isArray(sessionData.result.buckets) ? sessionData.result.buckets : [];
  const totalToUpload = buckets.reduce((acc, b) => acc + b.length, 0);
  const cachedFiles = Math.max(0, byHash.size - totalToUpload);

  // 4. Upload missing asset buckets
  let completionJwt = sessionJwt;
  let uploadedCount = 0;

  if (buckets.length > 0) {
    log(
      `[CLOUDFLARE] Uploading ${totalToUpload} new/changed asset(s) across ${buckets.length} bucket(s) (${cachedFiles} already cached on edge)...`
    );
    const uploadUrl = `${CF_API_BASE}/accounts/${encAcc}/workers/assets/upload?base64=true`;
    for (let idx = 0; idx < buckets.length; idx++) {
      const bucket = buckets[idx];
      const form = new FormData();
      for (const hash of bucket) {
        const entry = byHash.get(hash);
        if (!entry) continue;
        form.append(hash, new File([entry.base64], hash, { type: entry.mimeType }));
      }

      const upRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: form,
        signal: AbortSignal.timeout(60000),
      });
      const upData = (await upRes.json().catch(() => ({}))) as CfEnvelope<{ jwt?: string }>;
      if (!upRes.ok || !upData.success) {
        throw new Error(
          `Cloudflare asset upload failed (bucket ${idx + 1}/${buckets.length}): ${formatCfError(upData, upRes.status, 'Bucket upload error')}`
        );
      }
      if (upData.result?.jwt) {
        completionJwt = upData.result.jwt;
      }
      uploadedCount += bucket.length;
      const pct = 45 + Math.round(((idx + 1) / buckets.length) * 30);
      progress(
        'uploading',
        pct,
        `Uploaded bucket ${idx + 1}/${buckets.length} (${uploadedCount}/${totalToUpload} files)...`,
        uploadedCount + cachedFiles
      );
    }
  } else {
    log(`[CLOUDFLARE] All ${assets.length} static assets already cached on Cloudflare edge.`);
  }

  // 5. Publish Worker Script + Bind Static Assets (with immutable asset caching + security headers)
  progress('publishing', 80, `Publishing Worker '${scriptName}' to Cloudflare Edge...`, assets.length);
  const workerScriptSource = [
    'export default {',
    '  async fetch(request, env) {',
    '    const response = await env.ASSETS.fetch(request);',
    '    const headers = new Headers(response.headers);',
    '    const url = new URL(request.url);',
    '    const contentType = headers.get("content-type") || "";',
    '    if (url.pathname.startsWith("/assets/")) {',
    '      headers.set("Cache-Control", "public, max-age=31536000, immutable");',
    '    } else if (contentType.includes("text/html")) {',
    '      headers.set("Cache-Control", "public, max-age=0, must-revalidate");',
    '    }',
    '    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");',
    '    headers.set("X-Content-Type-Options", "nosniff");',
    '    headers.set("X-Frame-Options", "SAMEORIGIN");',
    '    headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");',
    '    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");',
    '    return new Response(response.body, {',
    '      status: response.status,',
    '      statusText: response.statusText,',
    '      headers,',
    '    });',
    '  },',
    '};',
    '',
  ].join('\n');

  const metadata = {
    main_module: 'index.js',
    compatibility_date: opts.compatibilityDate || '2024-11-01',
    bindings: [{ type: 'assets', name: 'ASSETS' }],
    assets: {
      jwt: completionJwt,
      config: {
        html_handling: 'auto-trailing-slash',
        not_found_handling: manifest['/404.html'] ? '404-page' : 'none',
      },
    },
  };

  const deployForm = new FormData();
  deployForm.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  deployForm.append(
    'index.js',
    new File([workerScriptSource], 'index.js', { type: 'application/javascript+module' })
  );

  const scriptUrl = `${CF_API_BASE}/accounts/${encAcc}/workers/scripts/${encScript}`;
  const deployRes = await fetch(scriptUrl, {
    method: 'PUT',
    headers: authHeaders,
    body: deployForm,
    signal: AbortSignal.timeout(45000),
  });
  const deployData = (await deployRes.json().catch(() => ({}))) as CfEnvelope;
  if (!deployRes.ok || !deployData.success) {
    throw new Error(
      `Cloudflare Worker publish failed: ${formatCfError(deployData, deployRes.status, 'Worker script upload rejected')}`
    );
  }
  log(`[CLOUDFLARE] Worker script '${scriptName}' published with ${assets.length} bound static assets.`);

  // 6. Enable workers.dev subdomain route for this Worker (critical so workers.dev does not show "There is nothing here yet")
  progress('routing', 90, `Enabling workers.dev route for '${scriptName}'...`, assets.length);
  const subEnableRes = await fetch(`${scriptUrl}/subdomain`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: true }),
    signal: AbortSignal.timeout(15000),
  });
  const subEnableData = (await subEnableRes.json().catch(() => ({}))) as CfEnvelope;
  if (!subEnableRes.ok || !subEnableData.success) {
    log(
      `[CLOUDFLARE WARN] Could not auto-enable workers.dev route: ${formatCfError(subEnableData, subEnableRes.status, 'Subdomain enable warning')}`
    );
  } else {
    log(`[CLOUDFLARE] Enabled workers.dev public route for '${scriptName}'.`);
  }

  // 7. Resolve account workers.dev subdomain
  let accountSubdomain = String(opts.accountSubdomain || '').trim().toLowerCase();
  if (!accountSubdomain) {
    try {
      const subRes = await fetch(`${CF_API_BASE}/accounts/${encAcc}/workers/subdomain`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(10000),
      });
      const subData = (await subRes.json().catch(() => ({}))) as CfEnvelope<{ subdomain?: string }>;
      if (subRes.ok && subData.result?.subdomain) {
        accountSubdomain = subData.result.subdomain.trim().toLowerCase();
      }
    } catch {
      // Optional subdomain lookup
    }
  }

  const liveUrl = accountSubdomain
    ? `https://${scriptName}.${accountSubdomain}.workers.dev`
    : `https://${scriptName}.workers.dev`;

  const rawVerifyPath = String(opts.verifyPath || '/').trim();
  const normalizedVerifyPath = rawVerifyPath.startsWith('/') ? rawVerifyPath : `/${rawVerifyPath}`;
  const verifyTargetUrl = `${liveUrl}${normalizedVerifyPath}`;

  // 8. Live edge verification (brief retry for fresh Workers DNS/edge propagation)
  progress('verifying', 95, `Verifying live edge response at ${verifyTargetUrl}...`, assets.length);
  let edgeStatus = 0;
  let edgeOk = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const checkRes = await fetch(verifyTargetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      edgeStatus = checkRes.status;
      edgeOk = checkRes.ok;
      if (edgeOk) break;
    } catch {
      // Wait briefly before retry
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return {
    scriptName,
    accountSubdomain,
    liveUrl,
    filesCount: assets.length,
    uploadedFiles: uploadedCount,
    cachedFiles,
    edgeVerification: {
      url: verifyTargetUrl,
      status: edgeStatus,
      ok: edgeOk,
      checked_at: new Date().toISOString(),
    },
  };
}
