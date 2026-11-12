// „Belépés AikaHub-fiókkal" — OAuth 2.0 engedélykód + PKCE (S256), nyilvános kliens, titok nélkül.
// Spec: navtycoon-terv/aikahub-oauth-spec.md; szerveroldal: csiber/aikahub_website server/oauth.js.
//
// Folyamat:
//  1. GET /auth/aikahub/start → state + PKCE-verifier a D1 oauth_pending táblába (10 perc) és a state egy httpOnly
//     sütibe; 302 az AikaHub /oauth/authorize-ra.
//  2. GET /auth/callback → csak szerveroldali 302 (nincs HTML, nincs szkript, Referrer-Policy: no-referrer — így a
//     `code` nem jut el az Umamihoz). state-ellenőrzés (süti === query === D1-sor), kódcsere a verifierrel, userinfo,
//     aud === 'hyperscales', account_links upsert, session.
//
// Tokenek: a profilt (becenév, avatar) csak belépéskor olvassuk, ezért SEMMILYEN tokent nem tárolunk. A userinfo után a
// frissítő tokent azonnal visszavonjuk (/oauth/revoke — a „családot" viszi, a hozzáférési tokent is); az AikaHub-oldali
// engedély (grant) megmarad, így a következő belépés webes címről kattintás nélkül megy. Emiatt nincs rotáció, zárolás,
// és fióktörléskor sincs mit visszavonni. Következmény: ha a tag az AikaHubon leválasztja a játékot, a már meglévő
// Hyperscales-munkamenete (max. 30 nap) nem szűnik meg azonnal — csak újra belépni nem tud vele.
//
// AikaHub-fiókos user a users táblában: e-mail helyett nem kézbesíthető helyőrző (…@aikahub.invalid), a jelszó-hash
// pedig '!' — ez sosem egyezik egy PBKDF2-hash-sel, és a login-végpont külön is elutasítja.

import { randomToken, type D1Like } from './auth';
import { recordHubScope, scopeHasAchievements } from './aikahub-achi';

export const AIKAHUB_ISSUER = 'https://aikahub.com';
export const AIKAHUB_CLIENT_ID = 'hyperscales';
export const AIKAHUB_PROVIDER = 'aikahub';
export const PENDING_TTL_SEC = 600;
/** A kért hatókör (2026-11-12): profil + achievementek. A meglévő tagok a következő belépéskor egyszer újra jóváhagyják. */
export const AIKAHUB_SCOPE = 'profile achievements';
export const STATE_COOKIE = 'hs_aikahub_state';
/** HTTPS-en (éles) __Secure- előtagú, Secure süti; a http://127.0.0.1 helyi teszten (nem biztonságos séma) a sima név. */
export function stateCookieFor(requestUrl: string): { name: string; secure: boolean } {
  return new URL(requestUrl).protocol === 'https:'
    ? { name: `__Secure-${STATE_COOKIE}`, secure: true }
    : { name: STATE_COOKIE, secure: false };
}
export const NO_PASSWORD = '!';
export const NO_PASSWORD_EMAIL_DOMAIN = '@aikahub.invalid';

const PROD_REDIRECT = 'https://hyperscales.app/auth/callback';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

// ── PKCE ───────────────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 7636: 32 véletlen bájt → 43 karakteres verifier. */
export function createVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function s256Challenge(verifier: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(h));
}

// ── redirect_uri ───────────────────────────────────────────────────

/** Éles: https://hyperscales.app/auth/callback. Helyi teszt: http://127.0.0.1:<port>/auth/callback (az AikaHubon
 *  regisztrált loopback, bármely porttal). Más hostról (pl. *.pages.dev előnézet) nem indítunk belépést. */
export function redirectUriFor(requestUrl: string): string | null {
  const u = new URL(requestUrl);
  // www-ről nem: ott a state-süti host-only lenne, a callback pedig az apexre jön (a middleware úgyis 301-gyel átvisz).
  if (u.hostname === 'hyperscales.app') return PROD_REDIRECT;
  if (u.protocol === 'http:' && u.hostname === '127.0.0.1') return `http://127.0.0.1${u.port ? ':' + u.port : ''}/auth/callback`;
  return null;
}

// ── CSRF az összekötéshez ──────────────────────────────────────────

/** A Beállítások „AikaHub összekötése" űrlapjának tokene: SHA-256(munkamenet-token + cél). A munkamenet-süti httpOnly,
 *  így egy idegen oldal nem tudja kiszámolni; titok sem kell hozzá. */
export async function linkCsrfToken(sessionToken: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sessionToken}|aikahub-link`));
  return b64url(new Uint8Array(h));
}

export async function checkLinkCsrf(sessionToken: string | null, submitted: string | null): Promise<boolean> {
  if (!sessionToken || !submitted) return false;
  const want = await linkCsrfToken(sessionToken);
  if (want.length !== submitted.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ submitted.charCodeAt(i);
  return diff === 0;
}

// ── 1. start ───────────────────────────────────────────────────────

export interface StartResult { state: string; authorizeUrl: string }

export async function startFlow(
  db: D1Like,
  opts: { redirectUri: string; linkUserId?: string | null; nextPath?: string | null; now?: number },
): Promise<StartResult> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const state = randomToken(24);
  const verifier = createVerifier();
  // lejárt sorok takarítása (best-effort, kis tábla)
  await db.prepare('DELETE FROM oauth_pending WHERE expires_at < ?').bind(now).run();
  await db.prepare(
    'INSERT INTO oauth_pending (state, verifier, redirect_uri, link_user_id, next_path, created_at, expires_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(state, verifier, opts.redirectUri, opts.linkUserId ?? null, opts.nextPath ?? null, now, now + PENDING_TTL_SEC).run();

  const q = new URLSearchParams({
    response_type: 'code',
    client_id: AIKAHUB_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    code_challenge: await s256Challenge(verifier),
    code_challenge_method: 'S256',
    scope: AIKAHUB_SCOPE,
    state,
  });
  return { state, authorizeUrl: `${AIKAHUB_ISSUER}/oauth/authorize?${q}` };
}

// ── 2. callback ────────────────────────────────────────────────────

export type CallbackError =
  | 'access_denied'     // a tag a „Mégsem"-et választotta
  | 'provider_error'    // AikaHub-oldali hiba (invalid_request, invalid_scope, server_error…)
  | 'state_mismatch'    // hiányzó/eltérő/lejárt state — régi fül, kettős kattintás, vagy login-CSRF
  | 'invalid_grant'     // a kód nem váltható be (lejárt, felhasznált, közben leválasztották)
  | 'bad_profile'       // a userinfo nem nekünk szól (aud) vagy hiányos
  | 'already_linked'    // összekötésnél: ez az AikaHub-fiók már egy másik Hyperscales-fiókhoz tartozik
  | 'link_conflict'     // összekötésnél: ehhez a Hyperscales-fiókhoz már másik AikaHub-fiók tartozik
  | 'signed_in'         // már be van lépve (más fiókkal): fiókváltás helyett az összekötés felé terelünk
  | 'network';          // nem értük el az AikaHubot

export type CallbackResult =
  | {
    ok: true; userId: string; created: boolean; linked: boolean; nextPath: string | null;
    /** A tag megadta-e az `achievements` hatókört (a userinfo `scope` mezője). Ha nem, nem küldünk achievementet. */
    achievementsScope?: boolean;
  }
  | { ok: false; error: CallbackError };

export interface AikahubProfile {
  sub: string;
  nickname: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}

interface PendingRow {
  state: string; verifier: string; redirect_uri: string;
  link_user_id: string | null; next_path: string | null; expires_at: number;
}

export async function handleCallback(
  db: D1Like,
  params: URLSearchParams,
  cookieState: string | null,
  opts: { fetchFn?: FetchFn; now?: number; sessionUserId?: string | null } = {},
): Promise<CallbackResult> {
  const fetchFn = opts.fetchFn ?? ((i, init) => fetch(i, init));
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const state = params.get('state') ?? '';

  // A state-et mindig elfogyasztjuk (egyszer használható), hibás ágon is.
  // Egyetlen atomi lépés (DELETE … RETURNING): két párhuzamos callback közül csak az egyik kapja meg a sort.
  let pending: PendingRow | null = null;
  if (state && state.length <= 200) {
    pending = await db.prepare(
      'DELETE FROM oauth_pending WHERE state = ? ' +
      'RETURNING state, verifier, redirect_uri, link_user_id, next_path, expires_at',
    ).bind(state).first<PendingRow>();
  }
  if (!pending || !cookieState || cookieState !== state || pending.expires_at < now) {
    return { ok: false, error: 'state_mismatch' };
  }

  const err = params.get('error');
  if (err) return { ok: false, error: err === 'access_denied' ? 'access_denied' : 'provider_error' };
  const code = params.get('code');
  if (!code) return { ok: false, error: 'provider_error' };

  // Kódcsere (PKCE: a verifier csak a szerveren volt)
  let tok: { access_token?: string; refresh_token?: string; error?: string };
  try {
    const r = await fetchFn(`${AIKAHUB_ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: AIKAHUB_CLIENT_ID,
        code,
        redirect_uri: pending.redirect_uri,
        code_verifier: pending.verifier,
      }).toString(),
    });
    tok = await r.json() as typeof tok;
    if (!r.ok || !tok.access_token) {
      return { ok: false, error: tok.error === 'invalid_grant' ? 'invalid_grant' : 'provider_error' };
    }
  } catch {
    return { ok: false, error: 'network' };
  }

  let profile: AikahubProfile | null = null;
  let grantedScope: unknown = null;
  try {
    const r = await fetchFn(`${AIKAHUB_ISSUER}/oauth/userinfo`, {
      headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/json' },
    });
    const u = await r.json() as Record<string, unknown>;
    profile = r.ok ? parseProfile(u) : null;
    grantedScope = u.scope;
  } catch {
    profile = null;
  } finally {
    // Nem tárolunk tokent: a frissítőt (és vele a családot) azonnal visszavonjuk. Best-effort.
    if (tok.refresh_token) {
      try {
        await fetchFn(`${AIKAHUB_ISSUER}/oauth/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: AIKAHUB_CLIENT_ID, token: tok.refresh_token }).toString(),
        });
      } catch { /* a token 1 óra / 30 nap múlva magától lejár */ }
    }
  }
  if (!profile) return { ok: false, error: 'bad_profile' };

  const res = await linkOrLogin(db, profile, {
    linkUserId: pending.link_user_id,
    sessionUserId: opts.sessionUserId ?? null,
    nextPath: pending.next_path,
    now,
  });
  if (res.ok) {
    // Hatókör feljegyzése (audit_log): a Hub-továbbítás csak `achievements` engedéllyel küld. Best-effort.
    res.achievementsScope = scopeHasAchievements(grantedScope);
    try {
      await recordHubScope(db, res.userId, res.achievementsScope, now);
    } catch (e) {
      console.warn('aikahub callback: hatókör-feljegyzés sikertelen', (e as Error)?.message);
    }
  }
  return res;
}

/** userinfo → profil; csak ha nekünk szól (aud === client_id) és van stabil sub. */
export function parseProfile(u: Record<string, unknown>): AikahubProfile | null {
  if (u.aud !== AIKAHUB_CLIENT_ID) return null;
  const sub = typeof u.sub === 'string' ? u.sub : '';
  if (!sub || sub.length > 200) return null;
  const nick = typeof u.nickname === 'string' && u.nickname.trim() ? u.nickname.trim().slice(0, 80) : 'AikaHub player';
  const url = (v: unknown) => (typeof v === 'string' && /^https:\/\/aikahub\.com\//.test(v) ? v.slice(0, 300) : null);
  return { sub, nickname: nick, avatarUrl: url(u.avatarUrl), profileUrl: url(u.profileUrl) };
}

/** account_links upsert: meglévő kötés → az ahhoz tartozó user; összekötés → a belépett user; különben új user. */
export async function linkOrLogin(
  db: D1Like,
  p: AikahubProfile,
  o: { linkUserId: string | null; sessionUserId: string | null; nextPath: string | null; now: number },
): Promise<CallbackResult> {
  const existing = await db.prepare(
    'SELECT user_id FROM account_links WHERE provider = ? AND sub = ?',
  ).bind(AIKAHUB_PROVIDER, p.sub).first<{ user_id: string }>();

  if (o.linkUserId) {
    // Összekötés a Beállításokból: csak ugyanabban a munkamenetben, amelyik elindította.
    if (o.sessionUserId !== o.linkUserId) return { ok: false, error: 'state_mismatch' };
    if (existing && existing.user_id !== o.linkUserId) return { ok: false, error: 'already_linked' };
    if (!existing) {
      const other = await db.prepare(
        'SELECT sub FROM account_links WHERE provider = ? AND user_id = ?',
      ).bind(AIKAHUB_PROVIDER, o.linkUserId).first<{ sub: string }>();
      if (other) return { ok: false, error: 'link_conflict' };
      await insertLink(db, p, o.linkUserId, o.now);
    } else {
      await touchLink(db, p, o.now);
    }
    return { ok: true, userId: o.linkUserId, created: false, linked: true, nextPath: '/play/settings' };
  }

  // Már belépett user (nem összekötés): csendes fiókváltás helyett — ha nem pont az ő AikaHub-fiókja — az összekötés felé
  // terelünk; így nem marad árva munkamenet, és nem jön létre véletlenül második fiók.
  if (o.sessionUserId && (!existing || existing.user_id !== o.sessionUserId)) {
    return { ok: false, error: 'signed_in' };
  }

  if (existing) {
    await touchLink(db, p, o.now);
    await db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ? AND password_hash = ?')
      .bind(p.nickname, o.now, existing.user_id, NO_PASSWORD).run();
    return { ok: true, userId: existing.user_id, created: false, linked: false, nextPath: o.nextPath };
  }

  // Új Hyperscales-fiók e-mail és jelszó nélkül.
  const userId = `u_${randomToken(12)}`;
  const placeholder = `aikahub.${randomToken(8)}${NO_PASSWORD_EMAIL_DOMAIN}`;
  await db.prepare(
    'INSERT INTO users (id, email, password_hash, password_salt, display_name, created_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(userId, placeholder, NO_PASSWORD, NO_PASSWORD, p.nickname, o.now, o.now).run();
  try {
    await insertLink(db, p, userId, o.now);
  } catch (e) {
    // Párhuzamos callback ugyanazzal a sub-bal: a másik nyert — a mi userünk felesleges.
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    const won = await db.prepare('SELECT user_id FROM account_links WHERE provider = ? AND sub = ?')
      .bind(AIKAHUB_PROVIDER, p.sub).first<{ user_id: string }>();
    if (!won) throw e;
    return { ok: true, userId: won.user_id, created: false, linked: false, nextPath: o.nextPath };
  }
  return { ok: true, userId, created: true, linked: false, nextPath: o.nextPath };
}

async function insertLink(db: D1Like, p: AikahubProfile, userId: string, now: number): Promise<void> {
  await db.prepare(
    'INSERT INTO account_links (provider, sub, user_id, nickname, avatar_url, profile_url, created_at, last_login_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(AIKAHUB_PROVIDER, p.sub, userId, p.nickname, p.avatarUrl, p.profileUrl, now, now).run();
}

async function touchLink(db: D1Like, p: AikahubProfile, now: number): Promise<void> {
  await db.prepare(
    'UPDATE account_links SET nickname = ?, avatar_url = ?, profile_url = ?, last_login_at = ? WHERE provider = ? AND sub = ?',
  ).bind(p.nickname, p.avatarUrl, p.profileUrl, now, AIKAHUB_PROVIDER, p.sub).run();
}

export async function getAikahubLink(
  db: D1Like, userId: string,
): Promise<{ nickname: string | null; avatar_url: string | null; profile_url: string | null } | null> {
  return db.prepare(
    'SELECT nickname, avatar_url, profile_url FROM account_links WHERE provider = ? AND user_id = ?',
  ).bind(AIKAHUB_PROVIDER, userId).first();
}

