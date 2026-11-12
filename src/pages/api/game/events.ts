// GET /api/game/events — pending (unresolved) events of the current player.
// Joins the spawned events-row with the static EVENT_DEFINITIONS (title /
// narrative / options) so the frontend can render the resolve-UI directly.

import type { APIContext } from 'astro';
import { getCurrentUser, getDB } from '../../../lib/auth';
import { getEventDefinition } from '../../../lib/game/event-options';
import { localizeEvent } from '../../../lib/game/event-i18n';
import { ECONOMY, scaleEventCash, rescaleMoneyLabel } from '../../../lib/game/economy';
import { localeFromRequest } from '../../../lib/i18n/api-errors';
import type { EventType } from '../../../lib/game/types';
import { dramaData, dramaView } from '../../../lib/game/staff-drama';
import { loadStaff } from '../../../lib/game/staff';
import { recruitData, recruitView } from '../../../lib/game/recruit';

export const prerender = false;

export const GET = async (c: APIContext): Promise<Response> => {
  const user = await getCurrentUser(c);
  if (!user) return new Response('auth', { status: 401 });
  const db = getDB(c);
  if (!db) return new Response('no DB', { status: 500 });

  const rows = (
    await db
      .prepare(
        `SELECT id, event_type, data_json, spawned_at
         FROM events
         WHERE player_id = ? AND resolved_at IS NULL
         ORDER BY spawned_at DESC
         LIMIT 20`,
      )
      .bind(user.id)
      .all<{
        id: number;
        event_type: string;
        data_json: string | null;
        spawned_at: number;
      }>()
  ).results ?? [];

  const locale = localeFromRequest(c.request);
  // 2026-11-12: a költség a cég méretéhez igazodik (economy.scaleEventCash); a feliratban is a valódi ár áll.
  const mrrRow = await db.prepare('SELECT mrr_usd_cents, current_era FROM players WHERE user_id = ?')
    .bind(user.id).first<{ mrr_usd_cents: number; current_era: number }>();
  const mrr = mrrRow?.mrr_usd_cents ?? 0;
  // 2026-11-12 (csapat-kör): a csapatdráma egy valódi munkatársról szól (staff-drama.ts);
  // a toborzás (recruit_ad) a 2. korszaktól valódi jelöltet hoz (recruit.ts).
  const SR = ECONOMY.staff;
  const needStaff = SR && rows.some((r) => (r.event_type === 'staff_drama' && dramaData(r.data_json))
    || (r.event_type === 'recruit_ad' && recruitData(r.data_json)));
  const staff = needStaff ? await loadStaff(db, user.id) : [];
  const nowSec = Math.floor(Date.now() / 1000);
  const events = rows.map((r) => {
    const dd = r.event_type === 'staff_drama' && SR ? dramaData(r.data_json) : null;
    if (dd && SR) {
      const v = dramaView(SR, locale, dd, staff.find((m) => m.id === dd.staff_id) ?? null, nowSec);
      return { id: r.id, event_type: r.event_type, spawned_at: r.spawned_at, title: v.title, narrative: v.narrative, options: v.options };
    }
    const rd = r.event_type === 'recruit_ad' && SR ? recruitData(r.data_json) : null;
    if (rd && SR) {
      const v = recruitView(SR, locale, rd, mrrRow?.current_era ?? 1, staff);
      return { id: r.id, event_type: r.event_type, spawned_at: r.spawned_at, title: v.title, narrative: v.narrative, options: v.options };
    }
    const def = getEventDefinition(r.event_type as EventType);
    const loc0 = def ? localizeEvent(def, locale) : null;
    const loc = def && loc0 ? {
      ...loc0,
      options: loc0.options.map((o, i) => {
        // counter_offer kimenete véletlen (és bevétel) — nem hívjuk meg csak a felirat kedvéért.
        const nominal = def.options[i].id === 'counter_offer' ? 0 : def.options[i].apply().cash_delta_cents;
        const scaled = scaleEventCash(ECONOMY, nominal, mrr);
        return { ...o, label: rescaleMoneyLabel(o.label, nominal, scaled), cost_cents: scaled < 0 ? -scaled : 0 };
      }),
    } : null;
    return {
      id: r.id,
      event_type: r.event_type,
      spawned_at: r.spawned_at,
      title: loc?.title ?? r.event_type,
      narrative: loc?.narrative ?? '',
      options: loc?.options ?? [],
    };
  });

  return new Response(JSON.stringify({ ok: true, events }), {
    headers: { 'content-type': 'application/json' },
  });
};
