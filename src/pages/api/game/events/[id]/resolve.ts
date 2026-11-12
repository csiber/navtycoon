// POST /api/game/events/:id/resolve { option_id }
// Resolve a pending event with the player's chosen option:
//   1. ownership-check (player_id + resolved_at IS NULL)
//   2. apply EventOptionResult (cash, reputation, all-customer satisfaction)
//   3. mark event resolved (resolved_at + outcome)
//   4. DDoS: az akkori ügyfélszám az eseménybe (customers_at_resolve); a survived_first_ddos-t a következő tick
//      ítéli meg (achievement-tick.ts: az ügyfélszám legfeljebb 10%-ot eshet), nem a lezárás azonnal

import { legacyError, localeFromRequest } from '../../../../../lib/i18n/api-errors';
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../../../lib/auth';
import { localizeEventMessage } from '../../../../../lib/game/event-i18n';
import { getEventDefinition } from '../../../../../lib/game/event-options';
import { ECONOMY, scaleEventCash } from '../../../../../lib/game/economy';
import { checkAndUnlockAchievements } from '../../../../../lib/game/achievements';
import { hubFromLocals } from '../../../../../lib/aikahub-achi';
import { computeAchievementInput } from '../../../../../lib/game/achievements-helper';
import type { EventType } from '../../../../../lib/game/types';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { dramaData, dramaMessage, dramaGoneMessage } from '../../../../../lib/game/staff-drama';
import { loadStaff } from '../../../../../lib/game/staff';

export const prerender = false;


export const POST = async (c: APIContext): Promise<Response> => {
  // Hibaüzenet a játékos nyelvén (src/lib/i18n/api-errors.ts legacyError).
  const jerr = (s: number, e: string): Response => legacyError(c.request, s, e);
  const user = await getCurrentUser(c);
  if (!user) return jerr(401, 'auth');
  const db = getDB(c);
  if (!db) return jerr(500, 'no DB');

  const eventId = Number(c.params.id);
  if (!Number.isFinite(eventId)) return jerr(400, 'bad event id');

  let body: { option_id?: string } = {};
  try {
    body = (await c.request.json()) as { option_id?: string };
  } catch {
    return jerr(400, 'bad JSON');
  }
  const optionId = body.option_id;
  if (!optionId || typeof optionId !== 'string') {
    return jerr(400, 'option_id required');
  }

  // Load + ownership-check
  const event = await db
    .prepare(
      'SELECT id, event_type, resolved_at, data_json FROM events WHERE id = ? AND player_id = ?',
    )
    .bind(eventId, user.id)
    .first<{ id: number; event_type: string; resolved_at: number | null; data_json: string | null }>();
  if (!event) return jerr(404, 'event not found');
  if (event.resolved_at !== null) return jerr(409, 'already resolved');

  // 2026-11-12 (csapat-kör): a csapatdráma egy valódi munkatársról — saját, valódi hatású döntések (staff-drama.ts).
  const SR = ECONOMY.staff;
  const dd = event.event_type === 'staff_drama' && SR ? dramaData(event.data_json) : null;
  if (dd && SR) return resolveStaffDrama(c, db as unknown as D1Database, user.id, event, dd, optionId);

  const def = getEventDefinition(event.event_type as EventType);
  if (!def) return jerr(500, 'unknown event type');
  const opt = def.options.find((o) => o.id === optionId);
  if (!opt) return jerr(400, 'unknown option');

  const result = opt.apply();
  const now = Math.floor(Date.now() / 1000);

  // 2026-11-12: a döntés ára a cég méretéhez igazodik (economy.scaleEventCash) — ugyanaz a szám, amit a
  // /api/game/events a feliratban mutatott. A bevétel (pl. felvásárlás) nem skálázódik.
  const mrrRow = await db.prepare('SELECT mrr_usd_cents FROM players WHERE user_id = ?')
    .bind(user.id).first<{ mrr_usd_cents: number }>();
  const cashDelta = scaleEventCash(ECONOMY, result.cash_delta_cents, mrrRow?.mrr_usd_cents ?? 0);

  // Apply: cash, reputation, all-customer satisfaction
  if (cashDelta > 0 || (cashDelta < 0 && !ECONOMY.clamp_costs_at_zero)) {
    await db
      .prepare('UPDATE players SET cash_usd_cents = cash_usd_cents + ? WHERE user_id = ?')
      .bind(cashDelta, user.id)
      .run();
  } else if (cashDelta < 0) {
    // 2026-11-12: egy döntés költsége nem viheti 0 alá a pénzt (economy.applyCashDelta szabálya SQL-ben):
    // amennyi van, annyit von le — a negatív kassza és a belőle induló spirál így nem alakulhat ki.
    await db
      .prepare('UPDATE players SET cash_usd_cents = CASE WHEN cash_usd_cents <= 0 THEN cash_usd_cents ELSE MAX(0, cash_usd_cents + ?) END WHERE user_id = ?')
      .bind(cashDelta, user.id)
      .run();
  }
  if (result.reputation_delta !== 0) {
    await db
      .prepare(
        'UPDATE players SET reputation = MAX(-100, MIN(100, reputation + ?)) WHERE user_id = ?',
      )
      .bind(result.reputation_delta, user.id)
      .run();
  }
  if (result.satisfaction_delta_global !== 0) {
    await db
      .prepare(
        'UPDATE customers SET satisfaction = MAX(-100, MIN(100, satisfaction + ?)) WHERE player_id = ? AND is_active = 1',
      )
      .bind(result.satisfaction_delta_global, user.id)
      .run();
  }

  // A döntés pénzhatása az eseménysorba kerül, hogy a Pénzügy lap „Pénzmozgások" listája valós legyen (2026-11-11).
  let prevData: Record<string, unknown> = {};
  try { prevData = event.data_json ? JSON.parse(event.data_json) : {}; } catch { /* hibás JSON */ }
  // DDoS-túlélés (survived_first_ddos): a lezáráskori ügyfélszám — a következő tick ehhez méri az esést.
  let ddosExtra: Record<string, unknown> = {};
  if (event.event_type === 'ddos_attempt') {
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM customers WHERE player_id = ? AND is_active = 1')
      .bind(user.id).first<{ n: number }>())?.n ?? 0;
    ddosExtra = { customers_at_resolve: n };
  }
  const newData = JSON.stringify({ ...prevData, ...ddosExtra, option_id: optionId, cash_delta_cents: cashDelta, reputation_delta: result.reputation_delta });
  await db
    .prepare('UPDATE events SET resolved_at = ?, outcome = ?, data_json = ? WHERE id = ?')
    .bind(now, result.outcome, newData, eventId)
    .run();

  // Counts-driven achievements: cash/rep/customer-satisfaction deltas above
  // may have crossed unlock thresholds (e.g. high_rep, first_k_mrr).
  let newly_unlocked: string[] = [];
  try {
    const input = await computeAchievementInput(db as unknown as D1Database, user.id);
    if (input) {
      newly_unlocked = await checkAndUnlockAchievements(
        db as unknown as D1Database, user.id, input, { hub: hubFromLocals(c.locals) },
      );
    }
  } catch { /* non-fatal */ }
  // A survived_first_ddos már nem itt jön (a következő tick dönt), a régi mező a régi kliens miatt marad.
  const narrativeUnlocked: string | null = newly_unlocked.includes('survived_first_ddos') ? 'survived_first_ddos' : null;

  return new Response(
    JSON.stringify({
      ok: true,
      outcome: result.outcome,
      message: localizeEventMessage(event.event_type, optionId, localeFromRequest(c.request), result.message),
      cash_delta_cents: cashDelta,
      reputation_delta: result.reputation_delta,
      satisfaction_delta: result.satisfaction_delta_global,
      // Legacy field kept for backwards compat with current frontend.
      newly_unlocked_achievement: narrativeUnlocked,
      newly_unlocked,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
};

async function resolveStaffDrama(
  c: APIContext, db: D1Database, uid: string,
  event: { id: number; data_json: string | null },
  dd: NonNullable<ReturnType<typeof dramaData>>, optionId: string,
): Promise<Response> {
  const SR = ECONOMY.staff!;
  const loc = localeFromRequest(c.request);
  if (!['give_raise', 'fridays_off', 'let_her_walk'].includes(optionId)) return legacyError(c.request, 400, 'unknown option');
  const now = Math.floor(Date.now() / 1000);
  const member = (await loadStaff(db, uid)).find((m) => m.id === dd.staff_id) ?? null;
  let rep = 0;
  let sat = 0;
  let outcome: 'positive' | 'neutral' | 'negative' = 'neutral';
  let message: string;
  if (!member) {
    message = dramaGoneMessage(loc, dd.name);
  } else if (optionId === 'give_raise') {
    await db.prepare('UPDATE staff SET raise_pct = raise_pct + ?, morale = MAX(morale, ?) WHERE id = ? AND player_id = ?')
      .bind(SR.drama.raise_pct, SR.drama.raise_morale, member.id, uid).run();
    outcome = 'positive';
    message = dramaMessage(loc, optionId, member.name);
  } else if (optionId === 'fridays_off' && !member.four_day) {
    await db.prepare('UPDATE staff SET four_day = 1, morale = MIN(100, morale + ?) WHERE id = ? AND player_id = ?')
      .bind(SR.drama.four_day_morale, member.id, uid).run();
    outcome = 'positive';
    message = dramaMessage(loc, optionId, member.name);
  } else {
    await db.prepare('DELETE FROM staff WHERE id = ? AND player_id = ?').bind(member.id, uid).run();
    rep = -SR.drama.leave_rep;
    sat = -SR.drama.leave_sat;
    await db.prepare('UPDATE players SET reputation = MAX(-100, MIN(100, reputation + ?)) WHERE user_id = ?').bind(rep, uid).run();
    await db.prepare('UPDATE customers SET satisfaction = MAX(-100, MIN(100, satisfaction + ?)) WHERE player_id = ? AND is_active = 1')
      .bind(sat, uid).run();
    outcome = 'negative';
    message = dramaMessage(loc, 'let_her_walk', member.name);
  }
  let prev: Record<string, unknown> = {};
  try { prev = event.data_json ? JSON.parse(event.data_json) : {}; } catch { /* hibás JSON */ }
  await db.prepare('UPDATE events SET resolved_at = ?, outcome = ?, data_json = ? WHERE id = ?')
    .bind(now, outcome, JSON.stringify({ ...prev, option_id: optionId, cash_delta_cents: 0, reputation_delta: rep }), event.id).run();
  return new Response(JSON.stringify({
    ok: true, outcome, message, cash_delta_cents: 0, reputation_delta: rep, satisfaction_delta: sat,
    newly_unlocked_achievement: null, newly_unlocked: [],
  }), { headers: { 'content-type': 'application/json' } });
}
