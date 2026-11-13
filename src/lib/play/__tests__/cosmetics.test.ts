// Hyperscales — az AikaHub kozmetikai jogosultságai (2026-11-13): a szerver dönti el (fetchHubEntitlements), csak a
// megjelenést változtatják (cégzászló, rack-bőr, LED-téma), a gazdaságot nem.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cosmeticsFromEntitlements, loadCosmetics, rackCosmeticClass, rack3dCosmetics, NO_COSMETICS,
} from '../cosmetics';
import { renderSidebar, renderTopbar, EMPTY_TEAM, type ShellData } from '../shell';
import { clearEntitlementCache, recordHubScope } from '../../aikahub-achi';
import type { FetchFn } from '../../aikahub';
import type { D1Like } from '../../auth';
import { createPlayer } from '../../game/db';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { dailyCashFlow } from '../../game/runway';
import { NO_EFFECTS } from '../../game/upgrade-effects';

vi.setConfig({ testTimeout: 120_000 });

const KEY = 'hs_test_key_cosmetics_0123456789';
const SUB = 'fedcba9876543210fedcba9876543210';

function shell(over: Partial<ShellData> = {}): ShellData {
  return {
    locale: 'en', company: 'Acme <b>', initials: 'AC', displayName: 'Acme', founded: 2026, era: 3, day: 40,
    nextDayAt: 0, cashCents: 100000, mrrCents: 50000, rep: 80,
    flow: dailyCashFlow({ cash_usd_cents: 100000, mrr_usd_cents: 50000, marketing_ppc_pct: 0 }),
    counts: { servers: 4, customers: 60, newCustomers24h: 0, openTickets: 0, upgradesOwned: 0, upgradesTotal: 20 },
    fleet: { capacity: 90, utilPct: 60, lost24h: 0, monthlyListedCents: 0 }, effects: { ...NO_EFFECTS }, team: EMPTY_TEAM,
    era2: null, ...over,
  };
}

function hubReturning(values: string[]) {
  const calls: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    calls.push(url);
    return Response.json({ sub: SUB, entitlements: values.map((value) => ({ value })) });
  };
  return { fetchFn, calls };
}

async function setup(link = true) {
  const db = await createTestDb();
  await createPlayer(db as unknown as D1Like, { user_id: 'u1', company_name: 'X', city: null });
  if (link) {
    await db.prepare("INSERT INTO account_links (provider, sub, user_id, created_at, last_login_at) VALUES ('aikahub', ?, 'u1', 1, 1)").bind(SUB).run();
    await recordHubScope(db, 'u1', true, 1);
  }
  return db;
}

describe('cosmetics from Hub entitlements', () => {
  it('maps the three entitlements; other games and unknown values do nothing', () => {
    expect(cosmeticsFromEntitlements([])).toEqual(NO_COSMETICS);
    expect(cosmeticsFromEntitlements(['hyperscales:rack-skin-colo'])).toEqual({ rackSkin: 'colo', ledTheme: null, banner: false });
    expect(cosmeticsFromEntitlements(['hyperscales:rack-led-theme', 'hyperscales:company-banner']))
      .toEqual({ rackSkin: null, ledTheme: 'aurora', banner: true });
    expect(cosmeticsFromEntitlements(['longlight:rack-skin-colo', 'hyperscales:gold-everything', 'rack_skin_colo'])).toEqual(NO_COSMETICS);
  });

  it('class names and 3D options are fixed words only', () => {
    expect(rackCosmeticClass(null)).toBe('');
    expect(rackCosmeticClass(NO_COSMETICS)).toBe('');
    expect(rackCosmeticClass({ rackSkin: 'colo', ledTheme: 'aurora', banner: false })).toBe(' skin-colo led-aurora');
    // egy hamisított érték sem jut át
    expect(rack3dCosmetics({ rackSkin: '"><script>' as never, ledTheme: 'x' as never, banner: true })).toEqual({ skin: null, led: null });
  });
});

describe('loadCosmetics (server-side gating)', () => {
  beforeEach(() => { clearEntitlementCache(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('linked member with entitlements → cosmetics on', async () => {
    const db = await setup();
    const hub = hubReturning(['hyperscales:rack-skin-colo', 'hyperscales:company-banner']);
    expect(await loadCosmetics(db, { key: KEY, fetchFn: hub.fetchFn }, 'u1')).toEqual({ rackSkin: 'colo', ledTheme: null, banner: true });
    expect(hub.calls).toHaveLength(1);
  });

  it('no hub / no key / no link / Hub error → nothing, and no request without key or link', async () => {
    const db = await setup(false);
    const hub = hubReturning(['hyperscales:company-banner']);
    expect(await loadCosmetics(db, null, 'u1')).toEqual(NO_COSMETICS);
    expect(await loadCosmetics(db, { key: '', fetchFn: hub.fetchFn }, 'u1')).toEqual(NO_COSMETICS);
    expect(await loadCosmetics(db, { key: KEY, fetchFn: hub.fetchFn }, 'u1')).toEqual(NO_COSMETICS);
    expect(hub.calls).toHaveLength(0);
    const linked = await setup();
    const failing: FetchFn = async () => new Response('down', { status: 503 });
    expect(await loadCosmetics(linked, { key: KEY, fetchFn: failing }, 'u1')).toEqual(NO_COSMETICS);
  });
});

describe('cosmetics in the shell (visual only)', () => {
  it('banner only when the server granted it; company name still escaped', () => {
    expect(renderSidebar(shell(), 'dashboard')).not.toContain('co-banner');
    expect(renderSidebar(shell({ cosmetics: NO_COSMETICS }), 'dashboard')).not.toContain('has-banner');
    const html = renderSidebar(shell({ cosmetics: { rackSkin: null, ledTheme: null, banner: true } }), 'dashboard');
    expect(html).toContain('company-card has-banner');
    expect(html).toContain('co-banner');
    expect(html).toContain('Acme &lt;b&gt;');
  });

  it('numbers are unchanged by cosmetics (topbar identical)', () => {
    const all = { rackSkin: 'colo', ledTheme: 'aurora', banner: true } as const;
    expect(renderTopbar(shell({ cosmetics: all }), ['x'])).toBe(renderTopbar(shell(), ['x']));
  });
});
