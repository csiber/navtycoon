// Hyperscaler auth-réteg — cross-brand SSO PromNET-tel.
//
// FONTOS: Hyperscaler nincs saját users/sessions táblája. A user-fiókok a
// PromNET shared `users` táblájában élnek (PROMNET_DB binding), így ugyanazzal
// a fiókkal lehet PromNET-en, NavBot-on és Hyperscaler-en is bejelentkezni.
//
// Cookie-stratégia:
//   - PromNET cookie: `pn_session` (domain: .promnet.hu)
//   - Hyperscaler cookie: `navtycoon_session` (domain: .hyperscaler.game)
//   - A cookie ÉRTÉKE ugyanaz a session-token (PROMNET_DB sessions.token).
//   - Cross-domain cookie nincs, ezért a session-átadás ?_sso= handoff-tokennel
//     történik (lásd: src/pages/api/auth/promnet-callback.ts).
//
// Hash-algoritmus: PBKDF2-SHA256 100k iter, 16-byte salt, 32-byte hash —
// EZ A PROMNET ALGORITMUSA, BIT-RE EGYEZIK (lásd /home/aika/promnet/src/lib/auth.ts).
// MÁS algoritmus = a felhasználó nem tud cross-brand bejelentkezni.

import type { APIContext } from 'astro';

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 30;
const SESSION_COOKIE = 'navtycoon_session';

// ── Types ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  display_name: string | null;
}

interface DBRow { [key: string]: unknown }
export interface D1Like {
  prepare(query: string): D1Stmt;
}
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = DBRow>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
  all<T = DBRow>(): Promise<{ results: T[] }>;
}

// ── DB binding helpers ─────────────────────────────────────────────

/** Local navtycoon D1 (game-state). */
export function getDB(context: APIContext): D1Like | null {
  const env = context.locals.runtime?.env as
    | { DB?: D1Like }
    | undefined;
  return env?.DB ?? null;
}

/** PromNET shared D1 (users + sessions). */
export function getPromnetDB(context: APIContext): D1Like | null {
  const env = context.locals.runtime?.env as
    | { PROMNET_DB?: D1Like }
    | undefined;
  return env?.PROMNET_DB ?? null;
}

// ── Crypto helpers (BIT-EGYEZŐ a PromNET-tel) ──────────────────────

function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function randomToken(byteLen = 32): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

/** PBKDF2-SHA256 — UGYANAZ az algoritmus mint PromNET-en. */
export async function hashPassword(
  password: string, saltHex?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256,
  );
  return { hash: bytesToHex(bits), salt: saltHex ?? bytesToHex(salt) };
}

export async function verifyPassword(
  password: string, hash: string, salt: string,
): Promise<boolean> {
  const { hash: computed } = await hashPassword(password, salt);
  if (computed.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

// ── PromNET users / sessions műveletek ─────────────────────────────

/** Minimális SELECT a PromNET users táblából — csak a Hyperscaler-nek
 *  szükséges oszlopok. (Az új PromNET-mezők itt nem kellenek; minimal-
 *  contract elv: kevesebb oszlop = kevesebb migration-coupling.) */
async function findUserByEmail(
  pdb: D1Like, email: string,
): Promise<
  | { id: string; email: string; display_name: string | null;
      password_hash: string; password_salt: string }
  | null
> {
  return pdb.prepare(
    'SELECT id, email, display_name, password_hash, password_salt ' +
    'FROM users WHERE email = ? LIMIT 1',
  ).bind(email.toLowerCase().trim()).first();
}

async function findUserById(
  pdb: D1Like, id: string,
): Promise<User | null> {
  return pdb.prepare(
    'SELECT id, email, display_name FROM users WHERE id = ? LIMIT 1',
  ).bind(id).first<User>();
}

/** Új user beillesztése a PromNET users táblába.
 *  A PromNET createUser pont ezeket az oszlopokat tölti — egyezzünk vele. */
export async function createPromnetUser(
  pdb: D1Like,
  email: string,
  password: string,
  displayName: string | null,
): Promise<{ id: string; email: string; display_name: string | null }> {
  const id = `u_${randomToken(12)}`;
  const { hash, salt } = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  await pdb.prepare(
    'INSERT INTO users (id, email, password_hash, password_salt, display_name, ' +
    'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    id, email.toLowerCase().trim(), hash, salt, displayName, now, now,
  ).run();
  return { id, email: email.toLowerCase().trim(), display_name: displayName };
}

export async function isEmailTaken(
  pdb: D1Like, email: string,
): Promise<boolean> {
  const row = await pdb.prepare(
    'SELECT 1 AS x FROM users WHERE email = ? LIMIT 1',
  ).bind(email.toLowerCase().trim()).first<{ x: number }>();
  return row !== null;
}

/** Új session a PromNET sessions táblában. Visszaadja a token-t —
 *  ugyanaz a token kerül a `navtycoon_session` cookie-ba is. */
export async function createPromnetSession(
  pdb: D1Like, userId: string,
  ipAddress?: string | null, userAgent?: string | null,
): Promise<string> {
  const token = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  const expires = now + SESSION_DAYS * 24 * 3600;
  await pdb.prepare(
    'INSERT INTO sessions (token, user_id, ip_address, user_agent, created_at, expires_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(token, userId, ipAddress ?? null, userAgent ?? null, now, expires).run();
  await pdb.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .bind(now, userId).run();
  return token;
}

/** Session-token validálás a PromNET sessions ellen, lejárat-ellenőrzéssel.
 *  Visszaadja a User-t ha érvényes, null ha lejárt vagy nem létezik. */
export async function getUserBySessionToken(
  pdb: D1Like, token: string,
): Promise<User | null> {
  const row = await pdb.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ? LIMIT 1',
  ).bind(token).first<{ user_id: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    // Lejárt — clean-up best-effort, hibát elnyeljük
    try {
      await pdb.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    } catch { /* ignore */ }
    return null;
  }
  return findUserById(pdb, row.user_id);
}

export async function deletePromnetSession(
  pdb: D1Like, token: string,
): Promise<void> {
  await pdb.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

// ── Cookie helpers ─────────────────────────────────────────────────

export function setSessionCookie(
  context: APIContext, token: string, maxAgeSec?: number,
): void {
  context.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec ?? SESSION_DAYS * 24 * 3600,
  });
}

export function getSessionCookie(context: APIContext): string | null {
  return context.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export function clearSessionCookie(context: APIContext): void {
  context.cookies.delete(SESSION_COOKIE, { path: '/' });
}

// ── Magas-szintű helper ────────────────────────────────────────────

/** A jelenlegi user — `navtycoon_session` cookie alapján, PROMNET_DB
 *  sessions ellen validálva. Ha nincs cookie / lejárt / DB nincs → null. */
export async function getCurrentUser(context: APIContext): Promise<User | null> {
  const pdb = getPromnetDB(context);
  if (!pdb) return null;
  const token = getSessionCookie(context);
  if (!token) return null;
  return getUserBySessionToken(pdb, token);
}

// ── Validátorok ────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 255;
}

export function passwordIssue(password: string): string | null {
  if (password.length < 8) return 'A jelszó legalább 8 karakter legyen.';
  if (password.length > 128) return 'A jelszó max. 128 karakter lehet.';
  return null;
}

export function companyNameIssue(name: string): string | null {
  if (name.length < 2) return 'A cégnév legalább 2 karakter legyen.';
  if (name.length > 80) return 'A cégnév max. 80 karakter lehet.';
  return null;
}
