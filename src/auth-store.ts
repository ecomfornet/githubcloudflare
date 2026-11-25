import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'suspended';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  space_id: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
  last_login_at: string;
  created_by: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  space_id: string;
  created_at: string;
  last_login_at: string;
  created_by: string;
}

export interface AuthSystemSettings {
  allow_self_signup: boolean;
}

interface AuthDatabase {
  version: number;
  settings: AuthSystemSettings;
  users: UserRecord[];
}

interface SessionRecord {
  sid: string;
  uid: string;
  role: UserRole;
  exp: number;
}

const SPACE_ID_RE = /^[a-z0-9][a-z0-9_-]{2,47}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function isValidSpaceId(spaceId: string): boolean {
  return SPACE_ID_RE.test(spaceId);
}

export function normalizeUsername(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.');
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    status: user.status,
    space_id: user.space_id,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    created_by: user.created_by,
  };
}

export function hashPasswordScrypt(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: derived.toString('hex') };
}

export function verifyPasswordScrypt(password: string, saltHex: string, expectedHashHex: string): boolean {
  if (!password || !saltHex || !expectedHashHex) return false;
  try {
    const derived = crypto.scryptSync(password, saltHex, 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(expectedHashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateSpaceId(username: string): string {
  const base = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'user';
  const suffix = crypto.randomBytes(4).toString('hex');
  return `sp-${base}-${suffix}`;
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class AuthStore {
  private readonly dbFile: string;
  private readonly signingKey: Buffer;
  private readonly sessions = new Map<string, SessionRecord>();
  private db: AuthDatabase;

  constructor(opts: { rootDir?: string; sessionSecret?: string } = {}) {
    const rootDir = opts.rootDir || process.cwd();
    this.dbFile = path.join(rootDir, 'auth_users.json');
    const envSecret = opts.sessionSecret || process.env.SESSION_SECRET || '';
    this.signingKey = envSecret
      ? crypto.createHash('sha256').update(envSecret).digest()
      : crypto.randomBytes(32);
    this.db = this.loadDatabase();
  }

  private loadDatabase(): AuthDatabase {
    const fallback: AuthDatabase = {
      version: 1,
      settings: { allow_self_signup: true },
      users: [],
    };
    if (!fs.existsSync(this.dbFile)) {
      return fallback;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.dbFile, 'utf-8')) as Partial<AuthDatabase>;
      const users = Array.isArray(raw.users) ? raw.users : [];
      return {
        version: 1,
        settings: {
          allow_self_signup:
            raw.settings && typeof raw.settings.allow_self_signup === 'boolean'
              ? raw.settings.allow_self_signup
              : true,
        },
        users: users.filter((u): u is UserRecord => Boolean(u && typeof u.id === 'string' && typeof u.username === 'string')),
      };
    } catch {
      return fallback;
    }
  }

  private saveDatabase(): void {
    const tmpFile = `${this.dbFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.db, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpFile, this.dbFile);
    try {
      fs.chmodSync(this.dbFile, 0o600);
    } catch {
      // ignore chmod failures on restricted filesystems
    }
  }

  hasAdmin(): boolean {
    return this.db.users.some((u) => u.role === 'admin' && u.status === 'active');
  }

  hasEnvAdminPasscode(): boolean {
    return Boolean((process.env.ADMIN_PASSCODE || '').trim());
  }

  getSettings(): AuthSystemSettings {
    return { ...this.db.settings };
  }

  updateSettings(patch: Partial<AuthSystemSettings>): AuthSystemSettings {
    if (typeof patch.allow_self_signup === 'boolean') {
      this.db.settings.allow_self_signup = patch.allow_self_signup;
    }
    this.saveDatabase();
    return this.getSettings();
  }

  getPublicStatus(): {
    needs_admin_setup: boolean;
    allow_self_signup: boolean;
    total_users: number;
    env_passcode_configured: boolean;
  } {
    return {
      needs_admin_setup: !this.hasAdmin(),
      allow_self_signup: this.db.settings.allow_self_signup,
      total_users: this.db.users.length,
      env_passcode_configured: this.hasEnvAdminPasscode(),
    };
  }

  private validateCredentialsInput(input: {
    username?: string;
    email?: string;
    password?: string;
    display_name?: string;
  }): { username: string; email: string; password: string; display_name: string } {
    const username = normalizeUsername(input.username || '');
    const email = normalizeEmail(input.email || '');
    const password = String(input.password || '');
    const displayName = String(input.display_name || username).trim().slice(0, 60);

    if (!USERNAME_RE.test(username)) {
      throw new AuthError('Username must be 3–32 characters (letters, numbers, dots, hyphens, underscores).', 400);
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
      throw new AuthError('Please enter a valid email address.', 400);
    }
    if (password.length < 8 || password.length > 128) {
      throw new AuthError('Password must be between 8 and 128 characters.', 400);
    }
    if (!displayName) {
      throw new AuthError('Display name is required.', 400);
    }

    const dupUser = this.db.users.find((u) => u.username === username || u.email === email);
    if (dupUser) {
      throw new AuthError(
        dupUser.username === username
          ? `Username '${username}' is already taken.`
          : `Email '${email}' is already registered.`,
        409
      );
    }

    return { username, email, password, display_name: displayName };
  }

  setupFirstAdmin(input: {
    username: string;
    email: string;
    password: string;
    display_name?: string;
  }): { user: PublicUser; token: string } {
    if (this.hasAdmin()) {
      throw new AuthError('System Admin is already configured. Please sign in instead.', 409);
    }

    const clean = this.validateCredentialsInput(input);
    const { salt, hash } = hashPasswordScrypt(clean.password);
    const now = new Date().toISOString();

    const record: UserRecord = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      username: clean.username,
      email: clean.email,
      display_name: clean.display_name,
      role: 'admin',
      status: 'active',
      space_id: generateSpaceId(clean.username),
      password_salt: salt,
      password_hash: hash,
      created_at: now,
      last_login_at: now,
      created_by: 'bootstrap',
    };

    this.db.users.push(record);
    this.saveDatabase();

    const token = this.issueToken(record);
    return { user: toPublicUser(record), token };
  }

  registerUser(input: {
    username: string;
    email: string;
    password: string;
    display_name?: string;
  }): { user: PublicUser; token: string } {
    if (!this.hasAdmin()) {
      throw new AuthError('System Admin setup must be completed before registering new users.', 409);
    }
    if (!this.db.settings.allow_self_signup) {
      throw new AuthError('Public registration is currently disabled by the System Admin.', 403);
    }

    const clean = this.validateCredentialsInput(input);
    const { salt, hash } = hashPasswordScrypt(clean.password);
    const now = new Date().toISOString();

    const record: UserRecord = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      username: clean.username,
      email: clean.email,
      display_name: clean.display_name,
      role: 'user',
      status: 'active',
      space_id: generateSpaceId(clean.username),
      password_salt: salt,
      password_hash: hash,
      created_at: now,
      last_login_at: now,
      created_by: 'self-signup',
    };

    this.db.users.push(record);
    this.saveDatabase();

    const token = this.issueToken(record);
    return { user: toPublicUser(record), token };
  }

  createUserByAdmin(
    actor: PublicUser,
    input: {
      username: string;
      email: string;
      password: string;
      display_name?: string;
      role?: UserRole;
    }
  ): PublicUser {
    if (actor.role !== 'admin') {
      throw new AuthError('Admin privileges required.', 403);
    }
    const clean = this.validateCredentialsInput(input);
    const role: UserRole = input.role === 'admin' ? 'admin' : 'user';
    const { salt, hash } = hashPasswordScrypt(clean.password);
    const now = new Date().toISOString();

    const record: UserRecord = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      username: clean.username,
      email: clean.email,
      display_name: clean.display_name,
      role,
      status: 'active',
      space_id: generateSpaceId(clean.username),
      password_salt: salt,
      password_hash: hash,
      created_at: now,
      last_login_at: '',
      created_by: actor.username,
    };

    this.db.users.push(record);
    this.saveDatabase();
    return toPublicUser(record);
  }

  login(identifier: string, password: string): { user: PublicUser; token: string } {
    const idLower = String(identifier || '').trim().toLowerCase();
    const pwd = String(password || '');
    if (!idLower || !pwd) {
      throw new AuthError('Username/email and password are required.', 400);
    }

    const user = this.db.users.find((u) => u.username === idLower || u.email === idLower);
    if (!user) {
      throw new AuthError('Invalid credentials.', 401);
    }
    if (user.status !== 'active') {
      throw new AuthError('This account has been suspended by the System Admin.', 403);
    }

    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const matchedEnvOverride = user.role === 'admin' && envPasscode.length > 0 && timingSafeStringEqual(pwd, envPasscode);
    const matchedHash = matchedEnvOverride || verifyPasswordScrypt(pwd, user.password_salt, user.password_hash);
    if (!matchedHash) {
      throw new AuthError('Invalid credentials.', 401);
    }

    user.last_login_at = new Date().toISOString();
    this.saveDatabase();

    const token = this.issueToken(user);
    return { user: toPublicUser(user), token };
  }

  private signPayload(payloadB64: string): string {
    return crypto.createHmac('sha256', this.signingKey).update(payloadB64).digest('base64url');
  }

  issueToken(user: UserRecord): string {
    const sid = crypto.randomBytes(18).toString('base64url');
    const now = Date.now();
    const exp = now + SESSION_TTL_MS;
    const payload = { sid, uid: user.id, role: user.role, iat: now, exp };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const sig = this.signPayload(payloadB64);

    this.sessions.set(sid, { sid, uid: user.id, role: user.role, exp });
    return `${payloadB64}.${sig}`;
  }

  verifyToken(rawToken: string): { user: PublicUser; sid: string } | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const parts = rawToken.trim().split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expectedSig = this.signPayload(payloadB64);
    if (!timingSafeStringEqual(sig, expectedSig)) return null;

    let parsed: { sid?: string; uid?: string; exp?: number };
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
        sid?: string;
        uid?: string;
        exp?: number;
      };
    } catch {
      return null;
    }

    if (!parsed.sid || !parsed.uid || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) {
      this.sessions.delete(parsed.sid);
      return null;
    }

    const session = this.sessions.get(parsed.sid);
    if (!session || session.uid !== parsed.uid) return null;

    const user = this.db.users.find((u) => u.id === parsed.uid);
    if (!user || user.status !== 'active') {
      this.sessions.delete(parsed.sid);
      return null;
    }

    return { user: toPublicUser(user), sid: parsed.sid };
  }

  revokeSession(sid: string): void {
    this.sessions.delete(sid);
  }

  revokeUserSessions(uid: string): void {
    for (const [sid, session] of this.sessions.entries()) {
      if (session.uid === uid) {
        this.sessions.delete(sid);
      }
    }
  }

  listUsers(): PublicUser[] {
    return this.db.users
      .slice()
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
        return a.created_at.localeCompare(b.created_at);
      })
      .map(toPublicUser);
  }

  getUserById(id: string): PublicUser | null {
    const found = this.db.users.find((u) => u.id === id);
    return found ? toPublicUser(found) : null;
  }

  getUserBySpaceId(spaceId: string): PublicUser | null {
    const found = this.db.users.find((u) => u.space_id === spaceId);
    return found ? toPublicUser(found) : null;
  }

  private countActiveAdmins(): number {
    return this.db.users.filter((u) => u.role === 'admin' && u.status === 'active').length;
  }

  updateUserByAdmin(
    actor: PublicUser,
    targetId: string,
    patch: {
      role?: UserRole;
      status?: UserStatus;
      display_name?: string;
      password?: string;
    }
  ): PublicUser {
    if (actor.role !== 'admin') {
      throw new AuthError('Admin privileges required.', 403);
    }
    const target = this.db.users.find((u) => u.id === targetId);
    if (!target) {
      throw new AuthError('User not found.', 404);
    }

    const isLastActiveAdmin = target.role === 'admin' && target.status === 'active' && this.countActiveAdmins() <= 1;

    if (patch.role !== undefined) {
      const nextRole: UserRole = patch.role === 'admin' ? 'admin' : 'user';
      if (isLastActiveAdmin && nextRole !== 'admin') {
        throw new AuthError('Cannot demote the last active System Admin.', 400);
      }
      target.role = nextRole;
    }

    if (patch.status !== undefined) {
      const nextStatus: UserStatus = patch.status === 'suspended' ? 'suspended' : 'active';
      if (isLastActiveAdmin && nextStatus !== 'active') {
        throw new AuthError('Cannot suspend the last active System Admin.', 400);
      }
      target.status = nextStatus;
      if (nextStatus === 'suspended') {
        this.revokeUserSessions(target.id);
      }
    }

    if (typeof patch.display_name === 'string' && patch.display_name.trim()) {
      target.display_name = patch.display_name.trim().slice(0, 60);
    }

    if (typeof patch.password === 'string' && patch.password.length > 0) {
      if (patch.password.length < 8 || patch.password.length > 128) {
        throw new AuthError('New password must be between 8 and 128 characters.', 400);
      }
      const { salt, hash } = hashPasswordScrypt(patch.password);
      target.password_salt = salt;
      target.password_hash = hash;
      this.revokeUserSessions(target.id);
    }

    this.saveDatabase();
    return toPublicUser(target);
  }

  deleteUserByAdmin(actor: PublicUser, targetId: string): PublicUser {
    if (actor.role !== 'admin') {
      throw new AuthError('Admin privileges required.', 403);
    }
    const idx = this.db.users.findIndex((u) => u.id === targetId);
    if (idx === -1) {
      throw new AuthError('User not found.', 404);
    }
    const target = this.db.users[idx];
    if (target.id === actor.id) {
      throw new AuthError('You cannot delete your own active admin account.', 400);
    }
    if (target.role === 'admin' && target.status === 'active' && this.countActiveAdmins() <= 1) {
      throw new AuthError('Cannot delete the last active System Admin.', 400);
    }

    this.db.users.splice(idx, 1);
    this.revokeUserSessions(target.id);
    this.saveDatabase();
    return toPublicUser(target);
  }
}
