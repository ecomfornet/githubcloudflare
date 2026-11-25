import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server.ts';
import { AuthStore, hashPasswordScrypt, isValidSpaceId, verifyPasswordScrypt } from './auth-store.ts';
import { rewritePreviewAssetsForSpace, WorkspacePool } from './workspace-pool.ts';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function startTestServer(workspaceDir: string): Promise<{ server: http.Server; baseUrl: string }> {
  const app = createApp({ workspaceDir });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function jsonReq(
  baseUrl: string,
  route: string,
  opts: { method?: string; token?: string; spaceId?: string; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.spaceId) headers['X-Space-Id'] = opts.spaceId;
  const res = await fetch(`${baseUrl}${route}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }
  return { status: res.status, body: parsed };
}

test('AuthStore: scrypt salted password hashing & timing-safe verification', () => {
  const h1 = hashPasswordScrypt('MySecurePass123!');
  const h2 = hashPasswordScrypt('MySecurePass123!');
  assert.notEqual(h1.salt, h2.salt, 'Random per-password salt must differ');
  assert.notEqual(h1.hash, h2.hash, 'Random per-password salt must produce distinct hashes');
  assert.equal(verifyPasswordScrypt('MySecurePass123!', h1.salt, h1.hash), true);
  assert.equal(verifyPasswordScrypt('WrongPass123!', h1.salt, h1.hash), false);
  assert.equal(verifyPasswordScrypt('MySecurePass123!', h1.salt, 'malformed-hash'), false);
});

test('WorkspacePool: rejects traversal space IDs and rewrites preview asset URLs', () => {
  const tmp = makeTempDir('pseo-pool-');
  try {
    const pool = new WorkspacePool(tmp);
    assert.equal(isValidSpaceId('sp_1234567890abcdef'), true);
    assert.equal(isValidSpaceId('../escape'), false);
    assert.equal(isValidSpaceId('sp_bad/slash'), false);
    assert.throws(() => pool.resolveSpaceDir('../escape'));

    const html = '<img src="/assets/images/hero.webp"><link href="/assets/logo.png">';
    const rewritten = rewritePreviewAssetsForSpace(html, 'sp_1234567890abcdef');
    assert.ok(rewritten.includes('/spaces/sp_1234567890abcdef/assets/images/hero.webp'));
    assert.ok(rewritten.includes('/spaces/sp_1234567890abcdef/assets/logo.png'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AuthStore: enforces one-time admin claim and protects last active admin', () => {
  const tmp = makeTempDir('pseo-authstore-');
  try {
    const store = new AuthStore({ rootDir: tmp });
    assert.equal(store.hasAdmin(), false);

    const claimed = store.setupFirstAdmin({
      username: 'rootadmin',
      email: 'root@example.com',
      password: 'AdminPassword123',
      display_name: 'Root Admin',
    });
    assert.equal(claimed.user.role, 'admin');
    assert.equal(store.hasAdmin(), true);

    assert.throws(
      () =>
        store.setupFirstAdmin({
          username: 'hacker',
          email: 'hacker@example.com',
          password: 'HackerPassword123',
        }),
      /already configured/i
    );

    assert.throws(
      () => store.updateUserByAdmin(claimed.user, claimed.user.id, { role: 'user' }),
      /last active System Admin/i
    );
    assert.throws(
      () => store.deleteUserByAdmin(claimed.user, claimed.user.id),
      /cannot delete your own/i
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('HTTP E2E: full multi-user auth, separated spaces, admin inspection, suspension & purge', async () => {
  const tmp = makeTempDir('pseo-http-e2e-');
  const { server, baseUrl } = await startTestServer(tmp);

  try {
    // 1. Unauthenticated access to workspace APIs is blocked (401)
    const unauthProjects = await jsonReq(baseUrl, '/api/projects');
    assert.equal(unauthProjects.status, 401);

    // 2. Auth status reports first-run admin setup needed
    const statusBefore = await jsonReq(baseUrl, '/api/auth/status');
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.body.needs_admin_setup, true);

    // 3. Claim first System Admin
    const adminClaim = await jsonReq(baseUrl, '/api/auth/setup-admin', {
      method: 'POST',
      body: {
        username: 'sysadmin',
        email: 'admin@stylesdays.test',
        password: 'SuperAdminPassword1',
        display_name: 'System Admin',
      },
    });
    assert.equal(adminClaim.status, 201);
    assert.equal(adminClaim.body.user.role, 'admin');
    const adminToken = adminClaim.body.token;
    const adminSpaceId = adminClaim.body.user.space_id;
    assert.ok(adminToken && adminSpaceId);

    // Second setup-admin attempt must fail with 409
    const duplicateClaim = await jsonReq(baseUrl, '/api/auth/setup-admin', {
      method: 'POST',
      body: {
        username: 'secondadmin',
        email: 'second@stylesdays.test',
        password: 'SuperAdminPassword2',
      },
    });
    assert.equal(duplicateClaim.status, 409);

    // 4. Admin creates a project in Admin's space
    const adminProjRes = await jsonReq(baseUrl, '/api/projects', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Admin Secret Hub', platform: 'cloudflare' },
    });
    assert.equal(adminProjRes.status, 200);
    assert.equal(adminProjRes.body.success, true);

    // 5. Public user registers and receives a 100% separated space
    const aliceReg = await jsonReq(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: {
        username: 'alice',
        email: 'alice@stylesdays.test',
        password: 'AlicePassword123',
        display_name: 'Alice Studio',
      },
    });
    assert.equal(aliceReg.status, 201);
    assert.equal(aliceReg.body.user.role, 'user');
    const aliceToken = aliceReg.body.token;
    const aliceId = aliceReg.body.user.id;
    const aliceSpaceId = aliceReg.body.user.space_id;
    assert.notEqual(aliceSpaceId, adminSpaceId);

    // Alice creates her own project in her isolated space
    const aliceCreateProj = await jsonReq(baseUrl, '/api/projects', {
      method: 'POST',
      token: aliceToken,
      body: { name: 'Alice Decor Blog', platform: 'github' },
    });
    assert.equal(aliceCreateProj.status, 200);

    // Verify complete space isolation: Alice must NOT see Admin's project
    const aliceProjects = await jsonReq(baseUrl, '/api/projects', { token: aliceToken });
    assert.equal(aliceProjects.status, 200);
    const aliceProjectNames = aliceProjects.body.projects.map((p: any) => p.name);
    assert.ok(aliceProjectNames.includes('Alice Decor Blog'));
    assert.ok(!aliceProjectNames.includes('Admin Secret Hub'));

    // Verify Admin's own space does NOT contain Alice's project
    const adminProjects = await jsonReq(baseUrl, '/api/projects', { token: adminToken });
    const adminProjectNames = adminProjects.body.projects.map((p: any) => p.name);
    assert.ok(adminProjectNames.includes('Admin Secret Hub'));
    assert.ok(!adminProjectNames.includes('Alice Decor Blog'));

    // 6. Security boundary: Alice cannot access Admin's space via X-Space-Id (403)
    const crossSpaceAttempt = await jsonReq(baseUrl, '/api/projects', {
      token: aliceToken,
      spaceId: adminSpaceId,
    });
    assert.equal(crossSpaceAttempt.status, 403);

    // Security boundary: Alice cannot access Admin endpoints (403)
    const nonAdminCall = await jsonReq(baseUrl, '/api/admin/users', { token: aliceToken });
    assert.equal(nonAdminCall.status, 403);

    // 7. System Admin CAN inspect Alice's separated space via X-Space-Id
    const adminInspectAlice = await jsonReq(baseUrl, '/api/projects', {
      token: adminToken,
      spaceId: aliceSpaceId,
    });
    assert.equal(adminInspectAlice.status, 200);
    assert.equal(adminInspectAlice.body.space_id, aliceSpaceId);
    assert.ok(adminInspectAlice.body.projects.some((p: any) => p.name === 'Alice Decor Blog'));

    // 8. Isolated per-space asset serving & traversal protection
    const aliceAssetDir = path.join(tmp, 'workspaces', aliceSpaceId, 'assets', 'images');
    fs.mkdirSync(aliceAssetDir, { recursive: true });
    fs.writeFileSync(path.join(aliceAssetDir, 'alice-test.txt'), 'alice-only-asset', 'utf-8');

    const assetOk = await fetch(`${baseUrl}/spaces/${aliceSpaceId}/assets/images/alice-test.txt`);
    assert.equal(assetOk.status, 200);
    assert.equal(await assetOk.text(), 'alice-only-asset');

    const assetOtherSpace = await fetch(`${baseUrl}/spaces/${adminSpaceId}/assets/images/alice-test.txt`);
    assert.equal(assetOtherSpace.status, 404);

    const traversalRes = await fetch(`${baseUrl}/spaces/${aliceSpaceId}/assets/%2e%2e/pseo_config.json`);
    assert.ok(traversalRes.status === 400 || traversalRes.status === 403 || traversalRes.status === 404);

    // 9. Admin suspends Alice -> her active Bearer token is revoked immediately
    const suspendRes = await jsonReq(baseUrl, `/api/admin/users/${aliceId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'suspended' },
    });
    assert.equal(suspendRes.status, 200);
    assert.equal(suspendRes.body.user.status, 'suspended');

    const aliceAfterSuspend = await jsonReq(baseUrl, '/api/projects', { token: aliceToken });
    assert.equal(aliceAfterSuspend.status, 401);

    const aliceReloginSuspended = await jsonReq(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'alice', password: 'AlicePassword123' },
    });
    assert.equal(aliceReloginSuspended.status, 403);

    // 10. Admin disables public self-signup -> public /register returns 403, admin /admin/users still works
    const disableSignup = await jsonReq(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token: adminToken,
      body: { allow_self_signup: false },
    });
    assert.equal(disableSignup.status, 200);
    assert.equal(disableSignup.body.settings.allow_self_signup, false);

    const blockedReg = await jsonReq(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { username: 'bob', email: 'bob@stylesdays.test', password: 'BobPassword123' },
    });
    assert.equal(blockedReg.status, 403);

    const adminProvisionBob = await jsonReq(baseUrl, '/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: { username: 'bob', email: 'bob@stylesdays.test', password: 'BobPassword123', role: 'user' },
    });
    assert.equal(adminProvisionBob.status, 201);

    // 11. Admin deletes Alice and purges her separated space directory
    const aliceDirPath = path.join(tmp, 'workspaces', aliceSpaceId);
    assert.equal(fs.existsSync(aliceDirPath), true);

    const deleteAlice = await jsonReq(baseUrl, `/api/admin/users/${aliceId}`, {
      method: 'DELETE',
      token: adminToken,
      body: { purge_space: true },
    });
    assert.equal(deleteAlice.status, 200);
    assert.equal(deleteAlice.body.space_purged, true);
    assert.equal(fs.existsSync(aliceDirPath), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
