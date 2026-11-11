// claude-3 review (2026-11-11) javításainak tesztjei: www → apex, összekötés POST+CSRF, signed_in, link_conflict,
// párhuzamos új-user verseny, `next` a végpontokon át, '!'-hash és a helyőrző-domain a login/signup-ban, __Secure- süti.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startFlow, handleCallback, linkOrLogin, s256Challenge, redirectUriFor, linkCsrfToken, stateCookieFor,
  NO_PASSWORD, type FetchFn, type AikahubProfile,
} from '../aikahub';
import { createSession, type D1Like } from '../auth';
import { createTestDb } from '../../../test-utils/d1-mock';
import { onRequest, wwwRedirectTarget } from '../../middleware';
import { GET as startGET } from '../../pages/auth/aikahub/start';
import { POST as linkPOST } from '../../pages/auth/aikahub/link';
import { GET as callbackGET } from '../../pages/auth/callback';
import { POST as loginPOST } from '../../pages/api/auth/login';
import { POST as signupPOST } from '../../pages/api/auth/signup';

const LOOP = 'http://127.0.0.1:8788';
const REDIRECT = `${LOOP}/auth/callback`;

function hub(challenge: () => string, opts: { sub?: string; nickname?: string } = {}): FetchFn {
  return async (url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    if (url.endsWith('/oauth/token')) {
      const p = new URLSearchParams(body);
      if (await s256Challenge(p.get('code_verifier') ?? '') !== challenge()) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'at', refresh_token: 'rt' });
    }
    if (url.endsWith('/oauth/userinfo')) {
      return Response.json({ sub: opts.sub ?? 'sub-1', aud: 'hyperscales', nickname: opts.nickname ?? 'Rókafül' });
    }
    return Response.json({});
  };
}

/** Minimális APIContext: kérés, D1, sütik (a beállítottakat `set`-be gyűjti). */
function mkCtx(d: D1Like, url: string, cookies: Record<string, string> = {}, init?: RequestInit) {
  const set: Record<string, string> = {};
  const context = {
    request: new Request(url, init),
    locals: { runtime: { env: { DB: d } } },
    cookies: {
      get: (k: string) => (cookies[k] !== undefined ? { value: cookies[k] } : undefined),
      set: (k: string, v: string) => { set[k] = v; },
      delete: (k: string) => { set[k] = '<deleted>'; },
    },
  };
  return { set, context: context as unknown as Parameters<typeof startGET>[0] };
}

async function addMailUser(d: D1Like, id: string, email: string): Promise<string> {
  await d.prepare(
    "INSERT INTO users (id, email, password_hash, password_salt, display_name, created_at, updated_at) VALUES (?, ?, 'h', 's', 'Mail', 1, 1)",
  ).bind(id, email).run();
  return createSession(d, id);
}

const profile = (sub: string, nickname = 'Rókafül'): AikahubProfile => ({ sub, nickname, avatarUrl: null, profileUrl: null });

describe('www → apex (MUST 1)', () => {
  it('301 to the apex with the same path and query; other hosts pass through', async () => {
    expect(wwwRedirectTarget('https://www.hyperscales.app/play/settings?aikahub_error=x')).toBe('https://hyperscales.app/play/settings?aikahub_error=x');
    expect(wwwRedirectTarget('https://hyperscales.app/play')).toBeNull();
    expect(wwwRedirectTarget('http://127.0.0.1:8788/login')).toBeNull();

    const next = vi.fn(async () => new Response('page'));
    const res = await onRequest({ request: new Request('https://www.hyperscales.app/auth/aikahub/start?next=%2Fplay') } as never, next as never) as Response;
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://hyperscales.app/auth/aikahub/start?next=%2Fplay');
    expect(next).not.toHaveBeenCalled();

    await onRequest({ request: new Request('https://hyperscales.app/login') } as never, next as never);
    expect(next).toHaveBeenCalledOnce();
  });

  it('no login flow is ever started on www (state cookie would be host-only there)', () => {
    expect(redirectUriFor('https://www.hyperscales.app/auth/aikahub/start')).toBeNull();
  });
});

describe('state cookie naming (7)', () => {
  it('__Secure- prefix + Secure on https, plain name on the loopback dev server', () => {
    expect(stateCookieFor('https://hyperscales.app/auth/callback')).toEqual({ name: '__Secure-hs_aikahub_state', secure: true });
    expect(stateCookieFor(`${REDIRECT}`)).toEqual({ name: 'hs_aikahub_state', secure: false });
  });
});

describe('linking: POST + CSRF (3), link_conflict, other session (8)', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('GET start no longer links: a signed-in user is steered to Settings (6), nothing pending', async () => {
    const tok = await addMailUser(d, 'u_mail', 'a@b.hu');
    const { context } = mkCtx(d, `${LOOP}/auth/aikahub/start?link=1`, { navtycoon_session: tok });
    const res = await startGET(context);
    expect(res.headers.get('location')).toBe('/play/settings?aikahub_error=signed_in#aikahub-link');
    expect(await d.prepare('SELECT COUNT(*) AS n FROM oauth_pending').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('POST /auth/aikahub/link: missing/wrong CSRF → 403; right token → 303 to authorize, pending bound to the user', async () => {
    const tok = await addMailUser(d, 'u_mail', 'a@b.hu');
    const form = (csrf: string) => ({ method: 'POST', body: new URLSearchParams({ csrf }) });

    expect((await linkPOST(mkCtx(d, `${LOOP}/auth/aikahub/link`, { navtycoon_session: tok }, form('')).context)).status).toBe(403);
    expect((await linkPOST(mkCtx(d, `${LOOP}/auth/aikahub/link`, { navtycoon_session: tok }, form(await linkCsrfToken('other-session'))).context)).status).toBe(403);

    const ok = mkCtx(d, `${LOOP}/auth/aikahub/link`, { navtycoon_session: tok }, form(await linkCsrfToken(tok)));
    const res = await linkPOST(ok.context);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^https:\/\/aikahub\.com\/oauth\/authorize\?/);
    expect(ok.set.hs_aikahub_state).toMatch(/^[0-9a-f]{48}$/);
    const row = await d.prepare('SELECT link_user_id FROM oauth_pending WHERE state = ?').bind(ok.set.hs_aikahub_state).first<{ link_user_id: string }>();
    expect(row?.link_user_id).toBe('u_mail');
  });

  it('link_conflict: the user already has a different AikaHub account linked', async () => {
    await addMailUser(d, 'u_mail', 'a@b.hu');
    await linkOrLogin(d, profile('sub-A'), { linkUserId: 'u_mail', sessionUserId: 'u_mail', nextPath: null, now: 1 });
    const r = await linkOrLogin(d, profile('sub-B'), { linkUserId: 'u_mail', sessionUserId: 'u_mail', nextPath: null, now: 2 });
    expect(r).toEqual({ ok: false, error: 'link_conflict' });
  });

  it('a link flow finished in a different session (other user) is refused', async () => {
    await addMailUser(d, 'u_mail', 'a@b.hu');
    const r = await linkOrLogin(d, profile('sub-A'), { linkUserId: 'u_mail', sessionUserId: 'u_other', nextPath: null, now: 1 });
    expect(r).toEqual({ ok: false, error: 'state_mismatch' });
    expect(await d.prepare('SELECT COUNT(*) AS n FROM account_links').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('signed-in user + plain login with an unlinked sub → signed_in, no second account (6)', async () => {
    await addMailUser(d, 'u_mail', 'a@b.hu');
    const r = await linkOrLogin(d, profile('sub-new'), { linkUserId: null, sessionUserId: 'u_mail', nextPath: null, now: 1 });
    expect(r).toEqual({ ok: false, error: 'signed_in' });
    expect(await d.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 1 });
    // a saját, már összekötött AikaHub-fiókjával viszont rendben van
    await linkOrLogin(d, profile('sub-mine'), { linkUserId: 'u_mail', sessionUserId: 'u_mail', nextPath: null, now: 2 });
    expect(await linkOrLogin(d, profile('sub-mine'), { linkUserId: null, sessionUserId: 'u_mail', nextPath: null, now: 3 }))
      .toMatchObject({ ok: true, userId: 'u_mail' });
  });
});

describe('races (5, 8)', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });

  it('parallel first logins with the same sub end up in ONE user (the loser removes its own row)', async () => {
    // A versenyt determinisztikusan idézzük elő: az első account_links-SELECT után „a másik callback" beszúrja a kötést.
    let injected = false;
    const racy: D1Like = {
      batch: d.batch.bind(d),
      prepare(q: string) {
        const st = d.prepare(q);
        if (!injected && q.startsWith('SELECT user_id FROM account_links')) {
          const origFirst = st.bind.bind(st);
          return {
            bind: (...a: unknown[]) => {
              const b = origFirst(...a);
              return {
                ...b,
                first: async () => {
                  const r = await b.first();
                  injected = true;
                  await d.prepare("INSERT INTO users (id, email, password_hash, password_salt, display_name, created_at, updated_at) VALUES ('u_winner', 'w@aikahub.invalid', '!', '!', 'W', 1, 1)").run();
                  await d.prepare("INSERT INTO account_links (provider, sub, user_id, created_at, last_login_at) VALUES ('aikahub', 'sub-race', 'u_winner', 1, 1)").run();
                  return r;
                },
              };
            },
          } as unknown as ReturnType<D1Like['prepare']>;
        }
        return st;
      },
    };
    const r = await linkOrLogin(racy, profile('sub-race'), { linkUserId: null, sessionUserId: null, nextPath: null, now: 5 });
    expect(r).toMatchObject({ ok: true, userId: 'u_winner', created: false });
    expect(await d.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 1 });
  });

  it('the pending state is consumed atomically: a second callback with the same state is refused before any token call', async () => {
    const f = await startFlow(d, { redirectUri: REDIRECT });
    const challenge = new URL(f.authorizeUrl).searchParams.get('code_challenge')!;
    const calls: string[] = [];
    const fetchFn: FetchFn = async (u, i) => { calls.push(u); return hub(() => challenge)(u, i); };
    const p = new URLSearchParams({ code: 'c', state: f.state });
    const [a, b] = await Promise.all([
      handleCallback(d, p, f.state, { fetchFn }),
      handleCallback(d, p, f.state, { fetchFn }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(calls.filter((u) => u.endsWith('/oauth/token'))).toHaveLength(1);
  });
});

describe('`next` through the routes (8)', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function roundTrip(next: string): Promise<string | null> {
    const s = mkCtx(d, `${LOOP}/auth/aikahub/start?next=${encodeURIComponent(next)}`);
    const res = await startGET(s.context);
    const state = s.set.hs_aikahub_state;
    const challenge = new URL(res.headers.get('location')!).searchParams.get('code_challenge')!;
    vi.stubGlobal('fetch', hub(() => challenge, { sub: `sub-${next}` }));
    const cb = await callbackGET(mkCtx(d, `${REDIRECT}?code=c&state=${state}`, { hs_aikahub_state: state }).context);
    return cb.headers.get('location');
  }

  it('a safe relative next survives start → AikaHub → callback', async () => {
    expect(await roundTrip('/play/shift')).toBe('/play/shift');
  });

  it('an open-redirect next falls back to /play', async () => {
    expect(await roundTrip('//evil.com/x')).toBe('/play');
  });
});

describe('password endpoints vs AikaHub accounts (8)', () => {
  let d: D1Like;
  beforeEach(async () => { d = (await createTestDb()) as unknown as D1Like; });
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it("login.ts refuses an account whose hash is '!' (even with password '!')", async () => {
    await d.prepare("INSERT INTO users (id, email, password_hash, password_salt, display_name, created_at, updated_at) VALUES ('u_ah', 'aikahub.x@aikahub.invalid', ?, ?, 'R', 1, 1)")
      .bind(NO_PASSWORD, NO_PASSWORD).run();
    for (const password of ['!', '!!!!!!!!', 'whatever123']) {
      const res = await loginPOST(mkCtx(d, `${LOOP}/api/auth/login`, {}, json({ email: 'aikahub.x@aikahub.invalid', password })).context);
      expect(res.status).toBe(401);
    }
    expect(await d.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('signup.ts rejects the placeholder domain', async () => {
    const res = await signupPOST(mkCtx(d, `${LOOP}/api/auth/signup`, {}, json({ email: 'me@aikahub.invalid', password: 'longenough1', company_name: 'Acme Co' })).context);
    expect(res.status).toBe(400);
    expect(await d.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 0 });
  });
});
