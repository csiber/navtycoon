// POST /api/game/staff — Csapat (2026-11-12, csapat-kör).
//   { action: 'hire', key: '<nap>.<hely>' }  — a nap egyik jelöltjének felvétele (fél havi bér toborzási díj)
//   { action: 'fire', staff_id: <id> }      — elbocsátás (a többiek hangulata romlik egy kicsit)
// A jelölteket a szerver újraszámolja (staff.generateCandidates: a játékos + a nap), a kliensnek nem hisz.
// Ha a 0013-as migráció még nem futott le (nincs staff tábla), érthető hibát ad (feature_not_ready).
import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getPlayer } from '../../../lib/game/db';
import { ECONOMY } from '../../../lib/game/economy';
import {
  generateCandidates, hireFeeCents, maxStaff, loadStaff, candidateSalaryCents, staffSalaryCents,
} from '../../../lib/game/staff';
import { jsonError, localeFromRequest } from '../../../lib/i18n/api-errors';

export const prerender = false;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
});

export const POST = async (c: APIContext): Promise<Response> => {
  const loc = localeFromRequest(c.request);
  const user = await getCurrentUser(c);
  if (!user) return jsonError(401, loc, 'unauthorized');
  const db = getDB(c);
  if (!db) return jsonError(500, loc, 'db_missing');
  const player = await getPlayer(db, user.id);
  if (!player) return jsonError(404, loc, 'no_player');
  const SR = ECONOMY.staff;
  if (!SR || player.current_era < SR.min_era) return jsonError(403, loc, 'era_locked');

  let body: { action?: string; key?: string; staff_id?: number } = {};
  try { body = await c.request.json(); } catch { return jsonError(400, loc, 'invalid_json'); }

  // A tábla megléte (a migráció előtt élesített kód ne dőljön el).
  try { await db.prepare('SELECT 1 FROM staff LIMIT 1').bind().all(); } catch { return jsonError(503, loc, 'feature_not_ready'); }

  const now = Math.floor(Date.now() / 1000);
  const staff = await loadStaff(db, user.id);

  if (body.action === 'hire') {
    const m = /^(\d+)\.([0-2])$/.exec(String(body.key ?? ''));
    if (!m) return jsonError(400, loc, 'bad_request');
    const day = Math.floor(now / 86400);
    if (Number(m[1]) !== day) return jsonError(409, loc, 'candidate_gone');
    const cand = generateCandidates(SR, user.id, day)[Number(m[2])];
    if (!cand || staff.some((s) => s.name === cand.name)) return jsonError(409, loc, 'candidate_gone');
    const max = maxStaff(SR, player.current_era);
    if (staff.length >= max) return jsonError(409, loc, 'staff_full', { max });
    const fee = hireFeeCents(SR, cand);
    // Atomikusan: csak akkor vonja le és szúrja be, ha van rá pénz (párhuzamos kattintás ellen a feltétel az UPDATE-ben).
    const upd = await db.prepare('UPDATE players SET cash_usd_cents = cash_usd_cents - ? WHERE user_id = ? AND cash_usd_cents >= ?')
      .bind(fee, user.id, fee).run();
    if (((upd as { meta?: { changes?: number } }).meta?.changes ?? 0) === 0) return jsonError(402, loc, 'not_enough_cash');
    const ins = await db.prepare(
      'INSERT INTO staff (player_id, role, name, trait, level_start, base_salary_cents, raise_pct, morale, four_day, hired_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?) RETURNING id',
    ).bind(user.id, cand.role, cand.name, cand.trait, cand.level_start, cand.base_salary_cents, SR.morale.start, now).first<{ id: number }>();
    await db.prepare(
      'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
      "VALUES (?, 'staff_hired', ?, ?, 'positive', ?)",
    ).bind(user.id, JSON.stringify({
      name: cand.name, role: cand.role, cash_delta_cents: -fee, salary_cents: candidateSalaryCents(SR, cand),
    }), now, now).run();
    return json({ ok: true, staff_id: ins?.id ?? null, fee_cents: fee });
  }

  if (body.action === 'fire') {
    const id = Number(body.staff_id);
    const who = staff.find((s) => s.id === id);
    if (!who) return jsonError(404, loc, 'not_found');
    await db.prepare('DELETE FROM staff WHERE id = ? AND player_id = ?').bind(id, user.id).run();
    await db.prepare('UPDATE staff SET morale = MAX(0, morale - ?) WHERE player_id = ?').bind(SR.morale.fire_hit, user.id).run();
    // A róla szóló, még nyitott csapatdráma okafogyott.
    await db.prepare(
      "UPDATE events SET resolved_at = ?, outcome = 'neutral' WHERE player_id = ? AND event_type = 'staff_drama' AND resolved_at IS NULL AND data_json LIKE ?",
    ).bind(now, user.id, `%"staff_id":${id},%`).run();
    await db.prepare(
      'INSERT INTO events (player_id, event_type, data_json, spawned_at, outcome, resolved_at) ' +
      "VALUES (?, 'staff_fired', ?, ?, 'neutral', ?)",
    ).bind(user.id, JSON.stringify({ name: who.name, role: who.role, salary_cents: staffSalaryCents(SR, who, now) }), now, now).run();
    return json({ ok: true });
  }

  return jsonError(400, loc, 'bad_request');
};
