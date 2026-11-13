// src/lib/game/restart.ts
// „Vállalat újraindítása" (Beállítások → Veszélyzóna, POST /api/game/reset), 2026-11-12.
//
// A cég állása nulláról indul (kezdőcsomag: $1000, 1 ingyenes szerver, 3 ügyfél — bootstrap.seedStarterKit),
// a fiók és ami a fiókhoz tartozik, megmarad. A korábbi reset a players-sort törölte, ezért:
//  - elveszett a Pro-előfizetés (is_pro, pro_until) — fizetett szolgáltatás tűnt el egy gombnyomásra;
//  - a cégnév helyére a fiók megjelenítendő neve került, a nyelv angolra állt;
//  - törölte az llm_usage-t és a napi műszak-számlálót: egy újraindítással újra lehetett tölteni a napi
//    AI-keretet és műszakot (költség-kiskapu);
//  - a shift_history (ON DELETE CASCADE a players-re) is vele veszett, pedig a megjegyzés szerint megmaradt volna;
//  - a players-sor törlése után a /play → /signup → /play végtelen átirányítás volt (azóta ensurePlayer javítja).
// Most a players-sor megmarad, csak a játékállás-mezői állnak vissza a séma-alapértékre (0001_initial_schema.sql),
// és a kezdőcsomag újra létrejön. Az llm_usage és a shift_history érintetlen.

import type { Player } from './types';
import { getPlayer, type D1Like } from './db';
import { seedStarterKit, type StarterLang } from './bootstrap';

/** Ezek a táblák a cég állását tartják: újraindításkor ürülnek. (llm_usage, shift_history: marad.) */
export const RESTART_WIPED_TABLES = ['tickets', 'customers', 'servers', 'events', 'achievements', 'upgrades'] as const;

/** A 0013-as migráció táblái (lehet, hogy még nincsenek): újraindításkor ezek is ürülnek. */
export const RESTART_OPTIONAL_TABLES = ['staff', 'player_network'] as const;

export type RestartError = 'no_player' | 'npc';

export async function restartCompany(
  db: D1Like,
  userId: string,
): Promise<{ ok: true; player: Player } | { ok: false; error: RestartError }> {
  const old = await getPlayer(db, userId) as (Player & { is_npc?: number; preferred_lang?: string }) | null;
  if (!old) return { ok: false, error: 'no_player' };
  if (old.is_npc === 1) return { ok: false, error: 'npc' };

  for (const t of RESTART_WIPED_TABLES) {
    await db.prepare(`DELETE FROM ${t} WHERE player_id = ?`).bind(userId).run();
  }
  // 2026-11-12 (csapat- és hálózat-kör, 0013-as migráció): a csapat és a hálózat is a cég állása. Külön, hibatűrően:
  // a migráció előtt élesített kódnál a táblák még nincsenek.
  for (const t of RESTART_OPTIONAL_TABLES) {
    try { await db.prepare(`DELETE FROM ${t} WHERE player_id = ?`).bind(userId).run(); } catch { /* nincs még tábla */ }
  }
  // 2026-11-13 (végjáték): a csúcs-MRR (audit_log 'mrr_peak') az új cégé legyen; a befejezés az events-szel már törlődött.
  try { await db.prepare("DELETE FROM audit_log WHERE player_id = ? AND action = 'mrr_peak'").bind(userId).run(); } catch { /* nincs tábla */ }
  // Játékállás → séma-alapértékek. Marad: cégnév, város, nyelv, Pro, a mai műszak-számláló, a bevezető.
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    'UPDATE players SET founded_at = ?, current_era = 1, reputation = 50, cash_usd_cents = 100000, mrr_usd_cents = 0, ' +
    'pricing_hobby_cents = 500, pricing_business_cents = 1500, ' +
    'marketing_seo_pct = 33, marketing_ppc_pct = 33, marketing_referral_pct = 34, last_active_at = ? WHERE user_id = ?',
  ).bind(now, now, userId).run();

  const lang = (['en', 'hu', 'de'] as const).includes(old.preferred_lang as StarterLang)
    ? (old.preferred_lang as StarterLang) : 'en';
  await seedStarterKit(db, userId, lang);

  const p = await getPlayer(db, userId);
  if (!p) throw new Error('restartCompany: player missing after restart');
  return { ok: true, player: p };
}
