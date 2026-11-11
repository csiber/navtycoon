// ShiftRoomDO: a műszak lezárása (játékos-kérésre, lejáratkor, utolsó ticket után) — Miniflare-D1-gyel.
import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types/experimental';
import { createTestDb } from '../../../test-utils/d1-mock';
import { createPlayer, type D1Like } from '../../lib/game/db';
import { ShiftRoomDO } from '../shift-room';

function fakeState() {
  const m = new Map<string, unknown>();
  const alarms: number[] = [];
  return {
    alarms,
    storage: {
      get: async <T>(k: string) => m.get(k) as T | undefined,
      put: async (k: string, v: unknown) => { m.set(k, structuredClone(v)); },
      setAlarm: async (t: number) => { alarms.push(t); },
    },
  };
}

async function setup(db: D1Database) {
  await createPlayer(db as unknown as D1Like, { user_id: 'p1', company_name: 'Teszt', city: null });
  const now = Math.floor(Date.now() / 1000);
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    const c = await db.prepare("INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at, satisfaction) VALUES ('p1', ?, 'newbie', 'hobby', ?, 60) RETURNING id")
      .bind('C' + i, now).first<{ id: number }>();
    const t = await db.prepare("INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) VALUES (?, 'p1', 's', 'f', 'in_progress', ?) RETURNING id")
      .bind(c!.id, now).first<{ id: number }>();
    ids.push(t!.id);
  }
  const st = fakeState();
  const room = new ShiftRoomDO(st as never, { DB: db } as never);
  const sent: Record<string, unknown>[] = [];
  await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({
    type: 'init', player_id: 'p1', is_pro: false, shift_id: 's1',
    customers: ids.map((id, i) => ({ ticket_id: id, customer_id: i + 1, customer_name: 'C' + i, archetype: 'newbie', current_satisfaction: 60, ticket_subject: 's', ticket_first_message: 'f' })),
  }) }));
  room.ws = { send: (s: string) => sent.push(JSON.parse(s)) } as never;
  return { room, sent, ids, st };
}

describe('ShiftRoomDO finalize', () => {
  let db: D1Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('init schedules an alarm at expires_at', async () => {
    const { st, room } = await setup(db);
    expect(st.alarms).toEqual([room.shift!.expires_at * 1000]);
  });

  it('end_shift: history row, unresolved tickets reopened, summary with stars — only once', async () => {
    const { room, sent, ids } = await setup(db);
    await room.handleMessage(JSON.stringify({ type: 'action', action: 'close' }));
    await room.handleMessage(JSON.stringify({ type: 'end_shift' }));
    const end = sent.filter((m) => m.type === 'shift_end');
    expect(end).toHaveLength(1);
    const summary = end[0].summary as Record<string, unknown>;
    expect(summary).toMatchObject({ tickets_handled: 1, tickets_total: 3, ended_by: 'player' });
    expect([1, 2, 3]).toContain(summary.stars);
    expect(summary.tip).toBe('unresolved');
    const statuses = (await db.prepare('SELECT id, status FROM tickets ORDER BY id').all<{ id: number; status: string }>()).results;
    expect(statuses.map((r) => r.status)).toEqual(['resolved', 'open', 'open']);
    // Ismételt kérés: a tárolt eredmény megy újra, nincs második shift_history-sor.
    await room.handleMessage(JSON.stringify({ type: 'end_shift' }));
    const hist = await db.prepare("SELECT COUNT(*) AS n FROM shift_history WHERE player_id = 'p1'").first<{ n: number }>();
    expect(hist?.n).toBe(1);
    expect(sent.filter((m) => m.type === 'shift_end')).toHaveLength(2);
    expect(ids).toHaveLength(3);
  });

  it('alarm after expiry finalizes as expired and reopens every ticket', async () => {
    const { room, sent } = await setup(db);
    await room.alarm();
    const end = sent.find((m) => m.type === 'shift_end') as { summary: Record<string, unknown> };
    expect(end.summary).toMatchObject({ ended_by: 'expired', tickets_handled: 0, stars: 1 });
    const open = await db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'").first<{ n: number }>();
    expect(open?.n).toBe(3);
    expect(room.shift!.status).toBe('expired');
  });

  it('closing the last ticket completes the shift; state carries server_now', async () => {
    const { room, sent } = await setup(db);
    for (let i = 0; i < 3; i++) await room.handleMessage(JSON.stringify({ type: 'action', action: 'close' }));
    const end = sent.find((m) => m.type === 'shift_end') as { summary: Record<string, unknown> };
    expect(end.summary).toMatchObject({ ended_by: 'completed', tickets_handled: 3, tickets_total: 3 });
    const st = sent.find((m) => m.type === 'state') as { server_now: number };
    expect(typeof st.server_now).toBe('number');
  });
});
