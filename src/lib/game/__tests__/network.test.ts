// Hyperscales — a Hálózat szabályai (network.ts) és a tick hálózat-lépései (2026-11-12, hálózat-kör).
import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../economy';
import {
  bandwidthUnits, trafficUnits, networkMonthlyCents, slowdownRatio, slowdownTicketFactor, networkEffects, networkActive,
  loadNetwork, NO_NETWORK,
} from '../network';
import { eventAvoidProb, combineEffects, NO_EFFECTS } from '../upgrade-effects';
import { createTestDb } from '../../../../test-utils/d1-mock';
import { createPlayer, getPlayer } from '../db';
import { tickPlayer } from '../tick';

const N = ECONOMY.network!;
const NOW = 1_800_000_000;

describe('network rules', () => {
  it('only from Era 2', () => {
    expect(networkActive(N, 1)).toBe(false);
    expect(networkActive(N, 2)).toBe(true);
    expect(networkActive(null, 3)).toBe(false);
  });

  it('three tiers: free base, then paid transit with more bandwidth', () => {
    expect(N.tiers[0].monthly_cents).toBe(0);
    for (let i = 1; i < N.tiers.length; i++) {
      expect(N.tiers[i].bandwidth_units).toBeGreaterThan(N.tiers[i - 1].bandwidth_units);
      expect(N.tiers[i].monthly_cents).toBeGreaterThan(N.tiers[i - 1].monthly_cents);
    }
    expect(bandwidthUnits(N, { transit_tier: 99, peering: 0, ddos: 0 })).toBe(N.tiers[N.tiers.length - 1].bandwidth_units);
  });

  it('traffic: business and big clients use more', () => {
    expect(trafficUnits(N, { hobby: 10, business: 5, dedicated: 1 })).toBe(10 + 5 * N.units.business + N.units.dedicated);
  });

  it('peering: worth it on the big transit, barely on the small one', () => {
    const t1 = { transit_tier: 1, peering: 0, ddos: 0 };
    const t2 = { transit_tier: 2, peering: 0, ddos: 0 };
    const save = (t: typeof t1) => networkMonthlyCents(N, t) - networkMonthlyCents(N, { ...t, peering: 1 });
    expect(save(t2)).toBeGreaterThan(0);
    expect(save(t2)).toBeGreaterThan(save(t1));
    expect(bandwidthUnits(N, { ...t2, peering: 1 })).toBeGreaterThan(bandwidthUnits(N, t2));
    // a $200-os egyszeri díj az 1 Gbiten egy éven belül visszajön a megtakarításból
    expect(N.peering.setup_cents / save(t2)).toBeLessThan(12);
  });

  it('slowdown: none within the bandwidth, then more tickets, capped', () => {
    expect(slowdownRatio(80, 80)).toBe(0);
    expect(slowdownRatio(120, 80)).toBe(0.5);
    expect(slowdownRatio(1000, 80)).toBe(1);
    expect(slowdownTicketFactor(N, 0)).toBe(1);
    expect(slowdownTicketFactor(N, 1)).toBe(1 + N.slowdown.ticket_factor);
  });

  it('DDoS protection avoids most DDoS events, never all of them', () => {
    const e = combineEffects(NO_EFFECTS, networkEffects(N, { transit_tier: 0, peering: 0, ddos: 1 }));
    expect(eventAvoidProb('ddos_attempt', e)).toBeCloseTo(N.ddos.avoid_network / 100);
    const max = combineEffects(e, { avoid_network: 80 });
    expect(eventAvoidProb('ddos_attempt', max)).toBeLessThanOrEqual(0.9);
    expect(networkEffects(N, NO_NETWORK)).toEqual({});
  });
});

describe('network in the tick', { timeout: 30_000 }, () => {
  async function setup(uid: string, hobby: number): Promise<{ d: Awaited<ReturnType<typeof createTestDb>> }> {
    const d = await createTestDb();
    await createPlayer(d, { user_id: uid, company_name: 'Net', city: null });
    await d.prepare('UPDATE players SET current_era = 2, cash_usd_cents = 100000, marketing_seo_pct = 0, marketing_ppc_pct = 0, marketing_referral_pct = 0, last_ticked_at = ? WHERE user_id = ?')
      .bind(NOW - 43200, uid).run();
    await d.prepare("INSERT INTO servers (player_id, era, type, capacity, current_load, monthly_cost_cents, purchased_at) VALUES (?, 2, 'vps_node', 150, 0, 0, 0)").bind(uid).run();
    for (let i = 0; i < hobby; i++) {
      await d.prepare("INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES (?, 'C', 'pro', 'hobby', 0, 60)").bind(uid).run();
    }
    return { d };
  }

  it('too much traffic on the base bandwidth slows the sites: satisfaction drops at the half-day turn', async () => {
    const { d } = await setup('u-slow', N.tiers[0].bandwidth_units + 40);
    const r = await tickPlayer(d, (await getPlayer(d, 'u-slow'))!, NOW);
    expect(r.network_slow).toBe(true);
    const s = (await d.prepare('SELECT MAX(satisfaction) AS s FROM customers WHERE player_id = ?').bind('u-slow').first<{ s: number }>())!.s;
    expect(s).toBe(60 - N.slowdown.sat_step);
  });

  it('a bigger transit fixes it and costs its monthly fee', async () => {
    const { d } = await setup('u-fast', N.tiers[0].bandwidth_units + 40);
    await d.prepare('INSERT INTO player_network (player_id, transit_tier, peering, ddos, updated_at) VALUES (?, 1, 0, 0, ?)').bind('u-fast', NOW).run();
    expect(await loadNetwork(d, 'u-fast')).toEqual({ transit_tier: 1, peering: 0, ddos: 0 });
    const r = await tickPlayer(d, (await getPlayer(d, 'u-fast'))!, NOW);
    expect(r.network_slow).toBe(false);
    expect(r.network_fees_cents!).toBeGreaterThanOrEqual(0); // időarányos: egy tickben néhány cent
    const s = (await d.prepare('SELECT MAX(satisfaction) AS s FROM customers WHERE player_id = ?').bind('u-fast').first<{ s: number }>())!.s;
    expect(s).toBeGreaterThanOrEqual(60);
  });

  it('Era 1 is never slowed down, whatever the traffic', async () => {
    const { d } = await setup('u-era1', N.tiers[0].bandwidth_units + 40);
    await d.prepare('UPDATE players SET current_era = 1 WHERE user_id = ?').bind('u-era1').run();
    const r = await tickPlayer(d, (await getPlayer(d, 'u-era1'))!, NOW);
    expect(r.network_slow).toBe(false);
    expect(r.network_fees_cents ?? 0).toBe(0);
  });
});
