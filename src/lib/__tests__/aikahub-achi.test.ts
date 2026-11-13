// Hyperscales → AikaHub achievement-továbbítás: Hub-id, kliens hamis fetch-csel (200, 409, 403, 404, 401, 5xx, időtúllépés),
// kulcs nélkül kihagy, a naplóban nincs kulcs, hatókör, retry-sor ritkulással, visszamenőleges szinkron, entitlementek.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hubAchievementId, hubEntitlementId, basicAuthHeader, sendHubUnlock, syncAchievementsToHub, retryPendingHubSync,
  backfillHubAchievements, recordHubScope, hasAchievementsScope, scopeHasAchievements, fetchHubEntitlements, hasEntitlement,
  clearEntitlementCache, retryDelaySec, RETRY_WINDOW_SEC, AUDIT_TRY, HUB_TIMEOUT_MS, ENTITLEMENTS, type HubCtx,
} from '../aikahub-achi';
import { startFlow, handleCallback, AIKAHUB_SCOPE, type FetchFn } from '../aikahub';
import type { D1Like } from '../auth';
import { ACHIEVEMENTS, checkAndUnlockAchievements } from '../game/achievements';
import { createPlayer } from '../game/db';
import { createTestDb } from '../../../test-utils/d1-mock';
import type { D1Database } from '@cloudflare/workers-types/experimental';

// minden teszt több in-memory D1-et épít (Miniflare), a terhelt CT120-on ez másodpercekig tart
vi.setConfig({ testTimeout: 120_000 });

const KEY = 'hs_test_key_SUPERSECRET_0123456789abcdef';
const SUB = '0123456789abcdef0123456789abcdef';

type Call = { url: string; method: string; auth: string; body: string };
function fakeHub(statusFor: (call: Call) => number | Response | 'throw' | 'hang', json: (call: Call) => unknown = () => ({ ok: true })) {
  const calls: Call[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const h = (init?.headers ?? {}) as Record<string, string>;
    const call = { url, method: init?.method ?? 'GET', auth: h.authorization ?? '', body: typeof init?.body === 'string' ? init.body : '' };
    calls.push(call);
    const s = statusFor(call);
    if (s === 'throw') throw new TypeError('fetch failed');
    if (s === 'hang') return new Promise<Response>(() => { /* soha */ });
    if (s instanceof Response) return s;
    return Response.json(json(call) as object, { status: s });
  };
  return { fetchFn, calls };
}

async function setup(opts: { link?: boolean; scope?: boolean | null } = {}) {
  const db = await createTestDb();
  await createPlayer(db as unknown as D1Like, { user_id: 'u1', company_name: 'X', city: null });
  if (opts.link !== false) {
    await db.prepare("INSERT INTO account_links (provider, sub, user_id, created_at, last_login_at) VALUES ('aikahub', ?, 'u1', 1, 1)").bind(SUB).run();
  }
  if (opts.scope !== null) await recordHubScope(db, 'u1', opts.scope ?? true, 1);
  return db;
}
const unlockRow = (db: D1Database, id: string, at: number) =>
  db.prepare("INSERT INTO achievements (player_id, achievement_id, unlocked_at) VALUES ('u1', ?, ?)").bind(id, at).run();

describe('Hub ids', () => {
  it('underscore → hyphen, hyperscales: prefix', () => {
    expect(hubAchievementId('first_shift')).toBe('hyperscales:first-shift');
    expect(hubAchievementId('era_colo')).toBe('hyperscales:era-colo');
    expect(hubAchievementId('first_10k_mrr')).toBe('hyperscales:first-10k-mrr');
    expect(hubEntitlementId('rack_skin_colo')).toBe('hyperscales:rack-skin-colo');
    expect(hubEntitlementId('rack_led_theme')).toBe('hyperscales:rack-led-theme');
    expect(hubEntitlementId('company_banner')).toBe('hyperscales:company-banner');
  });
  it('all 18 (+5 endgame) ids match the live Hub map (aikahub main 836ed57, docs/achievements-integracio.md)', () => {
    const HUB_MAP: Record<string, string> = {
      first_shift: 'hyperscales:first-shift',
      first_blood: 'hyperscales:first-blood',
      three_star_shift: 'hyperscales:three-star-shift',
      ten_customers: 'hyperscales:ten-customers',
      shift_marathon: 'hyperscales:shift-marathon',
      ticket_whisperer: 'hyperscales:ticket-whisperer',
      era_colo: 'hyperscales:era-colo',
      first_k_mrr: 'hyperscales:first-k-mrr',
      perfect_week: 'hyperscales:perfect-week',
      high_rep: 'hyperscales:high-rep',
      era_vps: 'hyperscales:era-vps',
      hundred_customers: 'hyperscales:hundred-customers',
      survived_first_ddos: 'hyperscales:survived-first-ddos',
      first_10k_mrr: 'hyperscales:first-10k-mrr',
      era_dedicated: 'hyperscales:era-dedicated',
      one_million_lifetime: 'hyperscales:one-million-lifetime',
      refund_king: 'hyperscales:refund-king',
      comeback_kid: 'hyperscales:comeback-kid',
      // 2026-11-13 (végjáték): az 5 új achievement — a Hub-definíciót claude-3 tölti be
      first_cloud_region: 'hyperscales:first-cloud-region',
      first_edge_pop: 'hyperscales:first-edge-pop',
      enterprise_contract: 'hyperscales:enterprise-contract',
      hyperscaled: 'hyperscales:hyperscaled',
      speedrun_hyperscaler: 'hyperscales:speedrun-hyperscaler',
    };
    expect(ACHIEVEMENTS.map((a) => a.id).sort()).toEqual(Object.keys(HUB_MAP).sort());
    for (const [id, hub] of Object.entries(HUB_MAP)) expect(hubAchievementId(id)).toBe(hub);
    expect(ENTITLEMENTS.map(hubEntitlementId)).toEqual([
      'hyperscales:rack-skin-colo', 'hyperscales:rack-led-theme', 'hyperscales:company-banner',
    ]);
  });
  it('every in-game id maps to a valid Hub key (a-z0-9-, 2–40)', () => {
    for (const a of ACHIEVEMENTS) {
      const key = hubAchievementId(a.id).slice('hyperscales:'.length);
      expect(key).toMatch(/^[a-z0-9][a-z0-9-]{1,39}$/);
    }
  });
  it('Basic header = base64("hyperscales:<key>")', () => {
    expect(atob(basicAuthHeader(KEY).slice(6))).toBe(`hyperscales:${KEY}`);
  });
});

describe('scope', () => {
  it('authorize asks for profile + achievements', () => {
    expect(AIKAHUB_SCOPE).toBe('profile achievements');
    expect(scopeHasAchievements('profile achievements')).toBe(true);
    expect(scopeHasAchievements('profile')).toBe(false);
    expect(scopeHasAchievements(undefined)).toBe(false);
  });

  async function login(scope: string | undefined) {
    const db = await createTestDb();
    const d = db as unknown as D1Like;
    const st = await startFlow(d, { redirectUri: 'http://127.0.0.1:8788/auth/callback' });
    expect(new URL(st.authorizeUrl).searchParams.get('scope')).toBe('profile achievements');
    const fetchFn: FetchFn = async (url) => {
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'at', refresh_token: 'rt' });
      if (url.endsWith('/oauth/userinfo')) return Response.json({ sub: SUB, aud: 'hyperscales', nickname: 'Róka', ...(scope !== undefined ? { scope } : {}) });
      return Response.json({});
    };
    const r = await handleCallback(d, new URLSearchParams({ code: 'c', state: st.state }), st.state, { fetchFn });
    expect(r.ok).toBe(true);
    return { db, r: r as Extract<typeof r, { ok: true }> };
  }

  it('callback accepts the extended scope and records it', async () => {
    const { db, r } = await login('profile achievements');
    expect(r.achievementsScope).toBe(true);
    expect(await hasAchievementsScope(db, r.userId)).toBe(true);
  });
  it('profile-only consent is recorded as "no achievements" → nothing is sent', async () => {
    const { db, r } = await login('profile');
    expect(r.achievementsScope).toBe(false);
    expect(await hasAchievementsScope(db, r.userId)).toBe(false);
    const hub = fakeHub(() => 200);
    await db.prepare("INSERT INTO achievements (player_id, achievement_id, unlocked_at) VALUES (?, 'first_shift', 1)").bind(r.userId).run();
    const s = await backfillHubAchievements(db, { key: KEY, fetchFn: hub.fetchFn }, r.userId);
    expect(s.skipped).toBe(true);
    expect(hub.calls).toHaveLength(0);
  });
  it('missing scope field → treated as not granted', async () => {
    const { r } = await login(undefined);
    expect(r.achievementsScope).toBe(false);
  });
  it('the latest login wins (re-consent turns it on)', async () => {
    const db = await setup({ scope: false });
    expect(await hasAchievementsScope(db, 'u1')).toBe(false);
    await recordHubScope(db, 'u1', true, 2);
    expect(await hasAchievementsScope(db, 'u1')).toBe(true);
  });
});

describe('sendHubUnlock', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); });
    }
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('200 → ok; correct URL, method, Basic header, JSON body with the Hub id', async () => {
    const hub = fakeHub(() => 200);
    expect(await sendHubUnlock({ key: KEY, fetchFn: hub.fetchFn }, SUB, 'first_10k_mrr')).toBe('ok');
    expect(hub.calls[0].url).toBe('https://aikahub.com/oauth/achievements/unlock');
    expect(hub.calls[0].method).toBe('POST');
    expect(hub.calls[0].auth).toBe(basicAuthHeader(KEY));
    expect(JSON.parse(hub.calls[0].body)).toEqual({ sub: SUB, id: 'hyperscales:first-10k-mrr' });
  });

  it.each([
    [409, 'not_linked', 'drop'],
    [403, 'insufficient_scope', 'drop'],
    [403, 'wrong_game', 'retry'],
    [404, 'unknown_achievement', 'retry'],
    [401, 'invalid_client', 'retry'],
    [500, 'server_error', 'retry'],
    [503, 'unavailable', 'retry'],
    [429, 'rate', 'retry'],
    [400, 'invalid_request', 'retry'],
  ])('%i %s → %s', async (status, error, want) => {
    const hub = fakeHub(() => status, () => ({ error }));
    expect(await sendHubUnlock({ key: KEY, fetchFn: hub.fetchFn }, SUB, 'first_shift')).toBe(want);
  });

  it('network error → retry', async () => {
    const hub = fakeHub(() => 'throw');
    expect(await sendHubUnlock({ key: KEY, fetchFn: hub.fetchFn }, SUB, 'first_shift')).toBe('retry');
  });

  it('5 s timeout → retry', async () => {
    vi.useFakeTimers();
    const hub = fakeHub(() => 'hang');
    const p = sendHubUnlock({ key: KEY, fetchFn: hub.fetchFn }, SUB, 'first_shift');
    await vi.advanceTimersByTimeAsync(HUB_TIMEOUT_MS + 1);
    expect(await p).toBe('retry');
  });

  it('no key → skip, fetch is never called', async () => {
    const hub = fakeHub(() => 200);
    for (const key of [undefined, null, '', '   ']) {
      expect(await sendHubUnlock({ key, fetchFn: hub.fetchFn }, SUB, 'first_shift')).toBe('skip');
    }
    expect(hub.calls).toHaveLength(0);
  });

  it('the log never contains the key, the Authorization header or the sub', async () => {
    for (const s of [200, 401, 403, 404, 409, 500, 'throw'] as const) {
      const hub = fakeHub(() => s, () => ({ error: 'x', echo: 'nope' }));
      await sendHubUnlock({ key: KEY, fetchFn: hub.fetchFn }, SUB, 'first_shift');
    }
    const db = await setup();
    await unlockRow(db, 'first_shift', Math.floor(Date.now() / 1000));
    await retryPendingHubSync(db, { key: KEY, fetchFn: fakeHub(() => 500).fetchFn });
    await fetchHubEntitlements(db, { key: KEY, fetchFn: fakeHub(() => 500).fetchFn }, 'u1');
    expect(logs.length).toBeGreaterThan(0);
    const all = logs.join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(basicAuthHeader(KEY).slice(6));
    expect(all).not.toMatch(/Basic /);
    expect(all).not.toContain(SUB);
  });
});

describe('unlock → Hub (checkAndUnlockAchievements)', () => {
  it('sends the newly unlocked ones once; nothing without a key / link / scope', async () => {
    const db = await setup();
    const hub = fakeHub(() => 200);
    const p = (await db.prepare("SELECT * FROM players WHERE user_id = 'u1'").first())!;
    const input = { player: p as never, customer_count: 1, ticket_count: 0, resolved_ticket_count: 0, total_refund_cents: 0, shift_count: 1 };
    const r = await checkAndUnlockAchievements(db, 'u1', input, { hub: { key: KEY, fetchFn: hub.fetchFn } });
    expect(r.sort()).toEqual(['first_blood', 'first_shift']);
    expect(hub.calls.map((c) => JSON.parse(c.body).id).sort()).toEqual(['hyperscales:first-blood', 'hyperscales:first-shift']);
    await checkAndUnlockAchievements(db, 'u1', input, { hub: { key: KEY, fetchFn: hub.fetchFn } });
    expect(hub.calls).toHaveLength(2);

    for (const o of [{ link: false }, { scope: null }, { scope: false }] as const) {
      const d2 = await setup(o);
      const h2 = fakeHub(() => 200);
      await checkAndUnlockAchievements(d2, 'u1', input, { hub: { key: KEY, fetchFn: h2.fetchFn } });
      expect(h2.calls).toHaveLength(0);
    }
    const d3 = await setup();
    const h3 = fakeHub(() => 200);
    expect(await checkAndUnlockAchievements(d3, 'u1', input, { hub: { key: '', fetchFn: h3.fetchFn } })).toHaveLength(2);
    expect(h3.calls).toHaveLength(0);
  });

  it('waitUntil: the send is handed over, not awaited inline', async () => {
    const db = await setup();
    const hub = fakeHub(() => 200);
    const pending: Promise<unknown>[] = [];
    const p = (await db.prepare("SELECT * FROM players WHERE user_id = 'u1'").first())!;
    await checkAndUnlockAchievements(db, 'u1', { player: p as never, customer_count: 1, ticket_count: 0, resolved_ticket_count: 0, total_refund_cents: 0, shift_count: 0 },
      { hub: { key: KEY, fetchFn: hub.fetchFn, waitUntil: (x) => pending.push(x) } });
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(hub.calls).toHaveLength(1);
  });
});

describe('retry queue (cron, no schema change)', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('retryDelaySec: 5 min, doubling, capped at 1 day', () => {
    expect(retryDelaySec(0)).toBe(0);
    expect(retryDelaySec(1)).toBe(300);
    expect(retryDelaySec(2)).toBe(600);
    expect(retryDelaySec(3)).toBe(1200);
    expect(retryDelaySec(12)).toBe(86400);
    expect(retryDelaySec(500)).toBe(86400);
  });

  it('5xx → kept, backoff, then delivered once', async () => {
    const t0 = 1_800_000_000;
    const db = await setup();
    await unlockRow(db, 'first_shift', t0);
    let status = 500;
    const hub = fakeHub(() => status);
    const ctx = (now: number): HubCtx => ({ key: KEY, fetchFn: hub.fetchFn, now });
    expect((await syncAchievementsToHub(db, ctx(t0), 'u1', ['first_shift'])).retry).toBe(1);
    expect(hub.calls).toHaveLength(1);
    expect((await retryPendingHubSync(db, ctx(t0 + 60))).sent).toBe(0); // még nem esedékes (5 perc)
    expect((await retryPendingHubSync(db, ctx(t0 + 301))).retry).toBe(1); // 2. próba
    expect((await retryPendingHubSync(db, ctx(t0 + 301 + 500))).sent).toBe(0); // 10 perc kell
    status = 200;
    expect((await retryPendingHubSync(db, ctx(t0 + 301 + 601))).ok).toBe(1);
    expect((await retryPendingHubSync(db, ctx(t0 + 100000))).sent).toBe(0); // kész, nem küldi újra
    expect(hub.calls).toHaveLength(3);
  });

  it('401 invalid_client (key not active yet) stays in the queue', async () => {
    const t0 = 1_800_000_000;
    const db = await setup();
    await unlockRow(db, 'first_shift', t0);
    let status = 401;
    const hub = fakeHub(() => status, () => ({ error: 'invalid_client' }));
    expect((await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 })).retry).toBe(1);
    status = 200;
    expect((await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 + 301 })).ok).toBe(1);
  });

  it('404 unknown_achievement (definitions not live yet) stays in the queue with backoff, max 30 days', async () => {
    const t0 = 1_800_000_000;
    const db = await setup();
    await unlockRow(db, 'era_colo', t0);
    const hub = fakeHub(() => 404, () => ({ error: 'unknown_achievement' }));
    // 30 napnyi cron-futás (óránként mintavételezve): a ritkulás miatt csak néhány tucat kérés megy
    for (let t = t0; t < t0 + RETRY_WINDOW_SEC + 2 * 86400; t += 3600) {
      await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t });
    }
    expect(hub.calls.length).toBeGreaterThan(20);
    expect(hub.calls.length).toBeLessThan(50);
    const tries = await db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?').bind(AUDIT_TRY).first<{ n: number }>();
    expect(tries!.n).toBe(hub.calls.length);
    // a 30 napos ablakon túl már nem próbálja
    const before = hub.calls.length;
    await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 + RETRY_WINDOW_SEC + 10 * 86400 });
    expect(hub.calls.length).toBe(before);
  });

  it('409 not_linked / 403 insufficient_scope → dropped for good, the cron does not resend', async () => {
    for (const [status, error] of [[409, 'not_linked'], [403, 'insufficient_scope']] as const) {
      const t0 = 1_800_000_000;
      const db = await setup();
      await unlockRow(db, 'first_shift', t0);
      const hub = fakeHub(() => status, () => ({ error }));
      expect((await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 })).dropped).toBe(1);
      expect((await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 + 86400 })).sent).toBe(0);
      expect(hub.calls).toHaveLength(1);
    }
  });

  it('one run stops at the first failure (Hub down → 1 request per run)', async () => {
    const t0 = 1_800_000_000;
    const db = await setup();
    for (const id of ['first_shift', 'first_blood', 'ten_customers']) await unlockRow(db, id, t0);
    const hub = fakeHub(() => 503);
    await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 });
    expect(hub.calls).toHaveLength(1);
  });

  it('only players who granted the achievements scope are queued; no key → no-op', async () => {
    const t0 = 1_800_000_000;
    const db = await setup({ scope: false });
    await unlockRow(db, 'first_shift', t0);
    const hub = fakeHub(() => 200);
    expect((await retryPendingHubSync(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 })).sent).toBe(0);
    const db2 = await setup();
    await unlockRow(db2, 'first_shift', t0);
    expect((await retryPendingHubSync(db2, { key: '', fetchFn: hub.fetchFn, now: t0 })).skipped).toBe(true);
    expect(hub.calls).toHaveLength(0);
  });
});

describe('backfill (login / link)', () => {
  it('sends every owned achievement (old ones too), idempotent on repeat', async () => {
    const db = await setup();
    const old = 1_600_000_000; // jóval a retry-ablakon kívül
    let k = 0;
    for (const id of ['first_shift', 'first_blood', 'refund_king']) await unlockRow(db, id, old + k++);
    const hub = fakeHub(() => 200, () => ({ ok: true, new: true }));
    const r = await backfillHubAchievements(db, { key: KEY, fetchFn: hub.fetchFn }, 'u1');
    expect(r).toMatchObject({ sent: 3, ok: 3, skipped: false });
    expect(hub.calls.map((c) => JSON.parse(c.body).id)).toEqual(['hyperscales:first-shift', 'hyperscales:first-blood', 'hyperscales:refund-king']);
    await backfillHubAchievements(db, { key: KEY, fetchFn: hub.fetchFn }, 'u1');
    expect(hub.calls).toHaveLength(6); // a Hub idempotens: újra elküldhető
  });
  it('without key or link → nothing', async () => {
    const hub = fakeHub(() => 200);
    const db = await setup({ link: false });
    await unlockRow(db, 'first_shift', 1);
    expect((await backfillHubAchievements(db, { key: KEY, fetchFn: hub.fetchFn }, 'u1')).skipped).toBe(true);
    expect((await backfillHubAchievements(await setup(), { key: '', fetchFn: hub.fetchFn }, 'u1')).skipped).toBe(true);
    expect(hub.calls).toHaveLength(0);
  });
});

describe('entitlements', () => {
  beforeEach(() => { clearEntitlementCache(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('GET /oauth/entitlements?sub=… with Basic auth, own prefix only, cached for 10 min', async () => {
    const db = await setup();
    const hub = fakeHub(() => 200, () => ({
      sub: SUB, game: 'hyperscales',
      entitlements: [{ value: 'hyperscales:rack-skin-colo' }, { value: 'longlight:ship-skin' }],
    }));
    const t0 = 1_800_000_000;
    expect(await fetchHubEntitlements(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 }, 'u1')).toEqual(['hyperscales:rack-skin-colo']);
    expect(hub.calls[0].url).toBe(`https://aikahub.com/oauth/entitlements?sub=${SUB}`);
    expect(hub.calls[0].method).toBe('GET');
    expect(hub.calls[0].auth).toBe(basicAuthHeader(KEY));
    expect(await hasEntitlement(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 + 60 }, 'u1', 'rack_skin_colo')).toBe(true);
    expect(await hasEntitlement(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 + 60 }, 'u1', 'company_banner')).toBe(false);
    expect(hub.calls).toHaveLength(1);
    await fetchHubEntitlements(db, { key: KEY, fetchFn: hub.fetchFn, now: t0 + 601 }, 'u1');
    expect(hub.calls).toHaveLength(2);
  });

  it('errors are not cached; no key / no scope → [] without a request', async () => {
    const db = await setup();
    let status = 500;
    const hub = fakeHub(() => status, () => ({ entitlements: [{ value: 'hyperscales:company-banner' }] }));
    expect(await fetchHubEntitlements(db, { key: KEY, fetchFn: hub.fetchFn, now: 1 }, 'u1')).toEqual([]);
    status = 200;
    expect(await fetchHubEntitlements(db, { key: KEY, fetchFn: hub.fetchFn, now: 2 }, 'u1')).toEqual(['hyperscales:company-banner']);
    clearEntitlementCache();
    const n = hub.calls.length;
    expect(await fetchHubEntitlements(db, { key: '', fetchFn: hub.fetchFn }, 'u1')).toEqual([]);
    expect(await fetchHubEntitlements(await setup({ scope: false }), { key: KEY, fetchFn: hub.fetchFn }, 'u1')).toEqual([]);
    expect(hub.calls.length).toBe(n);
  });
});
