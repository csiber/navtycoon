// src/lib/play/upgrade-value.ts
// Hyperscales — „most mennyit ér" egy fejlesztés a játékos MOSTANI állapotában (2026-11-12, játékmag).
// A kutatás-lap kártyája ezt mutatja a hatás-felirat (upgradeEffectLines) alatt. Ugyanazokból a képletekből
// számol, mint a tick (economy.ts, upgrade-effects.ts), csak várható értékkel, véletlen nélkül.

import {
  ECONOMY, TICKS_PER_DAY, acquisitionProb, ticketSpawnProb, eraTicketFactor, ppcSpendPerTick, type EconomyRules,
} from '../game/economy';
import { getDailyCap } from '../game/llm-cap';
import { serverCapacity } from '../game/server-types';
import { UPGRADE_SPECS } from '../game/upgrade-tree';
import { EFFECT_KEYS, EVENT_AVOID_KEY, type EffectKey, type UpgradeEffects } from '../game/upgrade-effects';
import { eventPoolForEra } from '../game/event-pool';
import type { Player } from '../game/types';
import { pt, type PlayLocale, type PlayKey } from './strings';
import { usd } from './shell';

export interface UpgradeValueCtx {
  player: Pick<Player, 'cash_usd_cents' | 'mrr_usd_cents' | 'reputation' | 'current_era' | 'is_pro' | 'founded_at'
    | 'marketing_seo_pct' | 'marketing_ppc_pct' | 'marketing_referral_pct' | 'pricing_hobby_cents' | 'pricing_business_cents'>;
  /** Az aktív ügyfelek elégedettsége. */
  satisfactions: number[];
  /** A gépek típusa és tárolt kapacitása. */
  servers: Array<{ type: string; capacity: number }>;
  /** A gépek listázott havidíja összesen (cent / hó). */
  monthlyFeesCents: number;
  /** A birtokolt fejlesztések összesített hatása. */
  effects: UpgradeEffects;
  /** A fejlesztés már a játékosé? (Akkor a saját hatását a mostaniból „visszaszámoljuk".) */
  owned: Set<string>;
  now: number;
}

let decimalComma = false; // HU/DE: tizedesvessző (upgradeValueNow állítja)
const round1 = (x: number): string => {
  const t = x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10);
  return decimalComma ? t.replace('.', ',') : t;
};

/** Egy hatás-kulcs mostani értéke szövegként (v: a fejlesztés értéke ennél a kulcsnál). */
function valueLine(L: PlayLocale, key: EffectKey, v: number, c: UpgradeValueCtx, ownedThis: boolean, rules: EconomyRules): string | null {
  const eff = c.effects;
  const n = c.satisfactions.length;
  const others = (k: EffectKey) => eff[k] - (ownedThis ? v : 0);
  switch (key) {
    case 'capacity_pct': {
      if (c.servers.length === 0) return null;
      const cap = (pct: number) => c.servers.reduce((a, s) => a + serverCapacity(s.type, s.capacity, pct), 0);
      const plus = cap(others('capacity_pct') + v) - cap(others('capacity_pct'));
      return pt(L, 'now.capacity_pct', { n: plus, s: c.servers.length });
    }
    case 'ticket_pct': {
      if (n === 0) return null;
      const perWeek = c.satisfactions.reduce((a, sat) => a + ticketSpawnProb({ ...rules, upgrade_effects: false }, sat), 0) * TICKS_PER_DAY * 7
        * eraTicketFactor(rules, c.player.current_era);
      return pt(L, 'now.ticket_pct', { n: round1((perWeek * Math.abs(v)) / 100) });
    }
    case 'churn_pct': {
      if (n === 0) return null;
      return pt(L, 'now.churn_pct', { n, v: usd(c.player.mrr_usd_cents) });
    }
    case 'fee_pct': {
      if (c.monthlyFeesCents <= 0) return null;
      return pt(L, 'now.fee_pct', { v: usd(Math.round((c.monthlyFeesCents * Math.abs(v)) / 100)) });
    }
    case 'acq_pct': {
      const p = c.player;
      const spend = ppcSpendPerTick(rules, { ppc_pct: p.marketing_ppc_pct, cash_cents: p.cash_usd_cents, mrr_cents: p.mrr_usd_cents });
      const base = acquisitionProb({ ...rules, upgrade_effects: false }, {
        seo_pct: p.marketing_seo_pct, ppc_effective_pct: spend.effective_pct, referral_pct: p.marketing_referral_pct,
        reputation: p.reputation, era: p.current_era, is_pro: p.is_pro === 1, age_days: (c.now - p.founded_at) / 86400,
        pricing_hobby_cents: p.pricing_hobby_cents, pricing_business_cents: p.pricing_business_cents,
      });
      const perMonth = (base * TICKS_PER_DAY * 30 * v) / 100;
      const cap = c.servers.reduce((a, s) => a + serverCapacity(s.type, s.capacity, eff.capacity_pct), 0);
      const full = rules.capacity_limit && n >= cap;
      return pt(L, full ? 'now.acq_full' : 'now.acq_pct', { n: round1(perMonth) });
    }
    case 'mrr_pct': {
      if (c.player.mrr_usd_cents <= 0) return null;
      const base = c.player.mrr_usd_cents / (1 + eff.mrr_pct / 100);
      return pt(L, 'now.mrr_pct', { v: usd(Math.round((base * v) / 100)) });
    }
    case 'shift_slots': {
      const a = rules.shift_ticket_limit + others('shift_slots');
      return pt(L, 'now.shift_slots', { a, b: a + v });
    }
    case 'ai_calls': {
      const a = getDailyCap(c.player.is_pro === 1, others('ai_calls'));
      return pt(L, 'now.ai_calls', { a, b: a + v });
    }
    default: {
      // avoid_*: a kivédett események várható száma havonta a mostani korszak eseménykészletéből
      const pool = eventPoolForEra(c.player.current_era);
      const covered = pool.filter((t) => EVENT_AVOID_KEY[t] === key).length;
      if (covered === 0) return null;
      const perMonth = rules.random_event_prob_per_tick * TICKS_PER_DAY * 30 * (covered / pool.length) * (v / 100);
      return pt(L, 'now.avoid', { n: round1(perMonth) });
    }
  }
}

/** A fejlesztés „most ennyit ér" sorai; üres állapotnál egy „még semmit" sor. */
export function upgradeValueNow(L: PlayLocale, id: string, c: UpgradeValueCtx, rules: EconomyRules = ECONOMY): string[] {
  const u = UPGRADE_SPECS.find((x) => x.id === id);
  if (!u) return [];
  decimalComma = L !== 'en';
  const lines = Object.entries(u.effect_data)
    .filter(([k]) => (EFFECT_KEYS as readonly string[]).includes(k))
    .map(([k, v]) => valueLine(L, k as EffectKey, v, c, c.owned.has(id), rules))
    .filter((x): x is string => !!x);
  return lines.length > 0 ? lines : [pt(L, 'now.nothing' as PlayKey)];
}
