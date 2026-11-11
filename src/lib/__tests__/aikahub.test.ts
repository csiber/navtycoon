import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startFlow, handleCallback, s256Challenge, createVerifier, parseProfile, redirectUriFor,
  NO_PASSWORD, STATE_COOKIE, type FetchFn,
} from '../aikahub';
import type { D1Like } from '../auth';
import { createTestDb } from '../../../test-utils/d1-mock';
import { GET as callbackGET } from '../../pages/auth/callback';

const REDIRECT = 'http://127.0.0.1:8788/auth/callback';

/** Ál-AikaHub: a /oauth/token úgy ellenőrzi a PKCE-t, mint az igazi (S256(verifier) === challenge). */
function fakeAikahub(opts: {
  challenge: () => string;
  sub?: string; nickname?: string; aud?: string;
  tokenError?: string;
}) {
  const calls: { url: string; body: string; auth?: string }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body, auth: (init?.headers as Record<string, string> | undefined)?.authorization });
    if (url.endsWith('/oauth/token')) {
      const p = new URLSearchParams(body);
      if (opts.tokenError) return Response.json({ error: opts.tokenError }, { status: 400 });
      if (p.get('client_id') !== 'hyperscales' || p.get('redirect_uri') !== REDIRECT || p.get('code') !== 'good-code') {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      if (await s256Challenge(p.get('code_verifier') ?? '') !== opts.challenge()) {
        return Response.json({ error: 'invalid_grant', error_description: 'Hibás code_verifier.' }, { status: 400 });
      }
      return Response.json({ access_token: 'at-1', refresh_token: 'rt-1', token_type: 'Bearer', expires_in: 3600 });
    }
    if (url.endsWith('/oauth/userinfo')) {
      return Response.json({
        sub: opts.sub ?? 'pairwise-sub-1', aud: opts.aud ?? 'hyperscales', client_id: opts.aud ?? 'hyperscales',
        scope: 'profile', nickname: opts.nickname ?? 'Rókafül', avatar: 'chill',
        avatarUrl: 'https://aikahub.com/stickers/chill.webp', profileUrl: 'https://aikahub.com/u/R%C3%B3kaf%C3%BCl',
      });
    }
    if (url.endsWith('/oauth/revoke')) return Response.json({});
    return new Response('not found', { status: 404 });
  };
  return { fetchFn, calls };
}

async function begin(d: D1Like, linkUserId: string | null = null) {
  const r = await startFlow(d, { redirectUri: REDIRECT, linkUserId });
  const u = new URL(r.authorizeUrl);
  return { state: r.state, challenge: u.searchParams.get('code_challenge')!, url: u };
}

const cbParams = (state: string, extra: Record<string, string> = { code: 'good-code' }) =>
  new URLSearchParams({ ...extra, state });

describe('PKCE + authorize URL', () => {
  it('S256 challenge = base64url(SHA-256(verifier)) without padding (value cross-checked with Python hashlib)', async () => {
    expect(await s256Challenge('dBjftJeZ4CVP-mJ92K9DCOIfDTTVJF8eXHYXGRHMsk0'))
      .toBe('U0a5aYNU3IrB7OQ14MVjMCk9mkD5qejJMzekLANKV-w');
    expect(createVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('authorize URL carries client, exact redirect, S256 challenge, profile scope and state; verifier stays server-side', async () => {
    const d = (await createTestDb()) as unknown as D1Like;
    const { state, url } = await begin(d);
    expect(url.origin + url.pathname).toBe('https://aikahub.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code', client_id: 'hyperscales', redirect_uri: REDIRECT,
      code_challenge_method: 'S256', scope: 'profile', state,
    });
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await d.prepare('SELECT verifier FROM oauth_pending WHERE state = ?').bind(state).first<{ verifier: string }>();
    expect(await s256Challenge(row!.verifier)).toBe(url.searchParams.get('code_challenge'));
    expect(url.toString()).not.toContain(row!.verifier);
  });

  it('redirect_uri: prod host and loopback only', () => {
    expect(redirectUriFor('https://hyperscales.app/auth/aikahub/start')).toBe('https://hyperscales.app/auth/callback');
    expect(redirectUriFor('http://127.0.0.1:8788/auth/aikahub/start')).toBe(REDIRECT);
    expect(redirectUriFor('https://evil.pages.dev/auth/aikahub/start')).toBeNull();
  });
});

describe('handleCallback', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('happy path: new user without email/password, link row, tokens revoked, nothing stored', async () => {
    const f = await begin(d);
    const hub = fakeAikahub({ challenge: () => f.challenge });
    const r = await handleCallback(d, cbParams(f.state), f.state, { fetchFn: hub.fetchFn });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    const u = await d.prepare('SELECT email, password_hash, display_name FROM users WHERE id = ?').bind(r.userId)
      .first<{ email: string; password_hash: string; display_name: string }>();
    expect(u?.display_name).toBe('Rókafül');
    expect(u?.password_hash).toBe(NO_PASSWORD);
    expect(u?.email).toMatch(/@aikahub\.invalid$/);
    expect(hub.calls.map((c) => new URL(c.url).pathname)).toEqual(['/oauth/token', '/oauth/userinfo', '/oauth/revoke']);
    expect(new URLSearchParams(hub.calls[2].body).get('token')).toBe('rt-1');
    // a state egyszer használható
    expect(await d.prepare('SELECT COUNT(*) AS n FROM oauth_pending').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('state mismatch: cookie differs from query → rejected, no token call', async () => {
    const f = await begin(d);
    const hub = fakeAikahub({ challenge: () => f.challenge });
    const r = await handleCallback(d, cbParams(f.state), 'other-state', { fetchFn: hub.fetchFn });
    expect(r).toEqual({ ok: false, error: 'state_mismatch' });
    expect(hub.calls).toHaveLength(0);
  });

  it('state mismatch: unknown, missing cookie, expired, or replayed state', async () => {
    const hub = fakeAikahub({ challenge: () => '' });
    expect(await handleCallback(d, cbParams('nope'), 'nope', { fetchFn: hub.fetchFn })).toEqual({ ok: false, error: 'state_mismatch' });
    const f = await begin(d);
    expect(await handleCallback(d, cbParams(f.state), null, { fetchFn: hub.fetchFn })).toEqual({ ok: false, error: 'state_mismatch' });
    // a fenti hívás elfogyasztotta → visszajátszás is elutasítva
    expect(await handleCallback(d, cbParams(f.state), f.state, { fetchFn: hub.fetchFn })).toEqual({ ok: false, error: 'state_mismatch' });
    const g = await begin(d);
    const late = Math.floor(Date.now() / 1000) + 601;
    expect(await handleCallback(d, cbParams(g.state), g.state, { fetchFn: hub.fetchFn, now: late })).toEqual({ ok: false, error: 'state_mismatch' });
    expect(hub.calls).toHaveLength(0);
  });

  it('PKCE: a verifier that does not match the challenge is refused by the token endpoint', async () => {
    const f = await begin(d);
    await d.prepare('UPDATE oauth_pending SET verifier = ? WHERE state = ?').bind(createVerifier(), f.state).run();
    const hub = fakeAikahub({ challenge: () => f.challenge });
    expect(await handleCallback(d, cbParams(f.state), f.state, { fetchFn: hub.fetchFn })).toEqual({ ok: false, error: 'invalid_grant' });
  });

  it('invalid_grant from the token endpoint (expired / reused / unlinked) → friendly error, no user', async () => {
    const f = await begin(d);
    const hub = fakeAikahub({ challenge: () => f.challenge, tokenError: 'invalid_grant' });
    expect(await handleCallback(d, cbParams(f.state), f.state, { fetchFn: hub.fetchFn })).toEqual({ ok: false, error: 'invalid_grant' });
    expect(await d.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('aud mismatch: a token issued to another game cannot create or log into an account', async () => {
    const f = await begin(d);
    const hub = fakeAikahub({ challenge: () => f.challenge, aud: 'longlight' });
    expect(await handleCallback(d, cbParams(f.state), f.state, { fetchFn: hub.fetchFn })).toEqual({ ok: false, error: 'bad_profile' });
    expect(await d.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 0 });
    // a tokent ekkor is visszavonjuk
    expect(hub.calls.some((c) => c.url.endsWith('/oauth/revoke'))).toBe(true);
  });

  it('error=access_denied and other provider errors', async () => {
    const f = await begin(d);
    expect(await handleCallback(d, cbParams(f.state, { error: 'access_denied' }), f.state)).toEqual({ ok: false, error: 'access_denied' });
    const g = await begin(d);
    expect(await handleCallback(d, cbParams(g.state, { error: 'invalid_scope' }), g.state)).toEqual({ ok: false, error: 'provider_error' });
  });

  it('link upsert: same sub logs into the same user and refreshes the nickname; no duplicates', async () => {
    const f1 = await begin(d);
    const r1 = await handleCallback(d, cbParams(f1.state), f1.state, { fetchFn: fakeAikahub({ challenge: () => f1.challenge }).fetchFn });
    const f2 = await begin(d);
    const r2 = await handleCallback(d, cbParams(f2.state), f2.state, { fetchFn: fakeAikahub({ challenge: () => f2.challenge, nickname: 'Új Név' }).fetchFn });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r2.userId).toBe(r1.userId);
    expect(r2.created).toBe(false);
    const links = await d.prepare('SELECT user_id, nickname FROM account_links').all<{ user_id: string; nickname: string }>();
    expect(links.results).toEqual([{ user_id: r1.userId, nickname: 'Új Név' }]);
    expect(await d.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 1 });
  });

  it('linking from Settings attaches the sub to the logged-in email user; a sub owned by someone else is refused', async () => {
    await d.prepare("INSERT INTO users (id, email, password_hash, password_salt, display_name, created_at, updated_at) VALUES ('u_mail', 'a@b.hu', 'h', 's', 'Mail', 1, 1)").run();
    const f = await begin(d, 'u_mail');
    const r = await handleCallback(d, cbParams(f.state), f.state, { fetchFn: fakeAikahub({ challenge: () => f.challenge }).fetchFn, sessionUserId: 'u_mail' });
    expect(r).toMatchObject({ ok: true, userId: 'u_mail', linked: true });

    await d.prepare("INSERT INTO users (id, email, password_hash, password_salt, display_name, created_at, updated_at) VALUES ('u_two', 'c@d.hu', 'h', 's', 'Two', 1, 1)").run();
    const g = await begin(d, 'u_two');
    const r2 = await handleCallback(d, cbParams(g.state), g.state, { fetchFn: fakeAikahub({ challenge: () => g.challenge }).fetchFn, sessionUserId: 'u_two' });
    expect(r2).toEqual({ ok: false, error: 'already_linked' });

    // összekötés csak abból a munkamenetből, amelyik elindította
    const h = await begin(d, 'u_two');
    const r3 = await handleCallback(d, cbParams(h.state), h.state, { fetchFn: fakeAikahub({ challenge: () => h.challenge, sub: 'other' }).fetchFn, sessionUserId: null });
    expect(r3).toEqual({ ok: false, error: 'state_mismatch' });
  });

  it('parseProfile ignores non-AikaHub avatar/profile URLs', () => {
    expect(parseProfile({ sub: 's', aud: 'hyperscales', nickname: 'x', avatarUrl: 'javascript:alert(1)', profileUrl: 'https://evil.com/' }))
      .toEqual({ sub: 's', nickname: 'x', avatarUrl: null, profileUrl: null });
    expect(parseProfile({ sub: '', aud: 'hyperscales' })).toBeNull();
  });
});

describe('GET /auth/callback route', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });
  afterEach(() => { vi.unstubAllGlobals(); });

  function ctx(url: string, cookies: Record<string, string>) {
    const set: Record<string, string> = {};
    return {
      set,
      context: {
        request: new Request(url),
        locals: { runtime: { env: { DB: d } } },
        cookies: {
          get: (k: string) => (cookies[k] !== undefined ? { value: cookies[k] } : undefined),
          set: (k: string, v: string) => { set[k] = v; },
          delete: (k: string) => { set[k] = '<deleted>'; },
        },
      } as unknown as Parameters<typeof callbackGET>[0],
    };
  }

  it('success: bodyless 302 to /play, no-referrer, session cookie, player created', async () => {
    const f = await begin(d);
    vi.stubGlobal('fetch', fakeAikahub({ challenge: () => f.challenge }).fetchFn);
    const { context, set } = ctx(`${REDIRECT}?code=good-code&state=${f.state}`, { [STATE_COOKIE]: f.state });
    const res = await callbackGET(context);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/play');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-type')).toBeNull();
    expect(await res.text()).toBe('');
    expect(set.navtycoon_session).toMatch(/^[0-9a-f]{64}$/);
    expect(set[STATE_COOKIE]).toBe('<deleted>');
    const p = await d.prepare('SELECT company_name FROM players').first<{ company_name: string }>();
    expect(p?.company_name).toBe('Rókafül');
  });

  it('error: access_denied → bodyless 302 to /login with the friendly error code', async () => {
    const f = await begin(d);
    const { context, set } = ctx(`${REDIRECT}?error=access_denied&state=${f.state}`, { [STATE_COOKIE]: f.state });
    const res = await callbackGET(context);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?aikahub_error=access_denied');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await res.text()).toBe('');
    expect(set.navtycoon_session).toBeUndefined();
  });
});
