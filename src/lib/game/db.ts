// Hyperscaler — D1 CRUD-helpers per-table.
// Stílus: per-player WHERE-szűrés, prepared-statement bind, types from types.ts.
//
// Konvenciók:
//  - Pénz INTEGER (USD cents).
//  - Időbélyeg: epoch-seconds (Math.floor(Date.now()/1000)).
//  - Per-user-szigetelés: minden user-scoped read/write WHERE player_id = ?
//
// SECURITY — IDOR PREVENTION:
//  Néhány függvény (closeTicket, updateTicket, setCustomerInactive, resolveEvent)
//  NEM kap player_id-t — ID-alapon dolgoznak. MINDEN API-route handler KÖTELES
//  ELŐSZÖR ownership-ot ellenőrizni: `getCustomer(db, id, player_id)` vagy
//  hasonló tulajdonjog-ellenőrzés, MIELŐTT ezeket hívná.
//
//    const c = await getCustomer(db, id, playerId);
//    if (!c) return jerr(404, '...');
//    await setCustomerInactive(db, id);   // ownership-resolved
//
//  Ne hívd ezeket körültekintés nélkül — IDOR-veszély.

import type {
  Player,
  Customer,
  Ticket,
  Server,
  UpgradeRow,
  GameEvent,
  EraId,
  PersonaArchetype,
  PlanTier,
  ServerType,
  TicketStatus,
  EventType,
  EventOutcome,
} from './types';

// Lokális D1-shape — minimal-interface in-line, NavBot-mintára.
interface DBRow { [k: string]: unknown }
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = DBRow>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number } }>;
  all<T = DBRow>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(query: string): D1Stmt;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ── Players ─────────────────────────────────────────────────────────

const PLAYER_PATCHABLE: ReadonlyArray<keyof Player> = [
  'company_name', 'city', 'current_era', 'reputation',
  'cash_usd_cents', 'mrr_usd_cents',
  'pricing_hobby_cents', 'pricing_business_cents',
  'marketing_seo_pct', 'marketing_ppc_pct', 'marketing_referral_pct',
  'free_shifts_today', 'paid_shifts_today',
  'is_pro', 'pro_until', 'last_active_at',
];

export async function createPlayer(
  db: D1Like,
  data: { user_id: string; company_name: string; city: string | null },
): Promise<Player> {
  const now = nowSec();
  const r = await db.prepare(
    'INSERT INTO players (user_id, company_name, city, founded_at, last_active_at, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(data.user_id, data.company_name, data.city, now, now, now).first<Player>();
  if (!r) throw new Error('createPlayer returned no row');
  return r;
}

export async function getPlayer(
  db: D1Like, userId: string,
): Promise<Player | null> {
  return db.prepare('SELECT * FROM players WHERE user_id = ? LIMIT 1')
    .bind(userId).first<Player>();
}

export async function updatePlayer(
  db: D1Like, userId: string,
  patch: Partial<Player>,
): Promise<Player | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const key of PLAYER_PATCHABLE) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      args.push(patch[key] ?? null);
    }
  }
  if (sets.length === 0) {
    return getPlayer(db, userId);
  }
  args.push(userId);
  const r = await db.prepare(
    `UPDATE players SET ${sets.join(', ')} WHERE user_id = ? RETURNING *`,
  ).bind(...args).first<Player>();
  return r ?? null;
}

// ── Customers ───────────────────────────────────────────────────────

const CUSTOMER_PATCHABLE: ReadonlyArray<keyof Customer> = [
  'name', 'persona_archetype', 'plan_tier',
  'satisfaction', 'churn_risk', 'lifetime_value_cents',
  'last_ticket_at', 'is_active',
];

export async function createCustomer(
  db: D1Like,
  data: {
    player_id: string;
    name: string;
    persona_archetype: PersonaArchetype;
    plan_tier: PlanTier;
  },
): Promise<Customer> {
  const r = await db.prepare(
    'INSERT INTO customers (player_id, name, persona_archetype, plan_tier, joined_at) ' +
    'VALUES (?, ?, ?, ?, ?) RETURNING *',
  ).bind(
    data.player_id, data.name, data.persona_archetype, data.plan_tier, nowSec(),
  ).first<Customer>();
  if (!r) throw new Error('createCustomer returned no row');
  return r;
}

export async function listCustomers(
  db: D1Like, playerId: string, activeOnly: boolean = true,
): Promise<Customer[]> {
  const where: string[] = ['player_id = ?'];
  const args: unknown[] = [playerId];
  if (activeOnly) {
    where.push('is_active = 1');
  }
  const rs = await db.prepare(
    `SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY joined_at DESC`,
  ).bind(...args).all<Customer>();
  return rs.results ?? [];
}

export async function getCustomer(
  db: D1Like, id: number, playerId: string,
): Promise<Customer | null> {
  return db.prepare('SELECT * FROM customers WHERE id = ? AND player_id = ? LIMIT 1')
    .bind(id, playerId).first<Customer>();
}

export async function updateCustomer(
  db: D1Like, id: number, playerId: string,
  patch: Partial<Customer>,
): Promise<Customer | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const key of CUSTOMER_PATCHABLE) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      args.push(patch[key] ?? null);
    }
  }
  if (sets.length === 0) {
    return getCustomer(db, id, playerId);
  }
  args.push(id, playerId);
  const r = await db.prepare(
    `UPDATE customers SET ${sets.join(', ')} WHERE id = ? AND player_id = ? RETURNING *`,
  ).bind(...args).first<Customer>();
  return r ?? null;
}

// ID-only — ownership-check a caller felelőssége (lásd SECURITY-header).
export async function setCustomerInactive(
  db: D1Like, id: number,
): Promise<boolean> {
  const r = await db.prepare(
    'UPDATE customers SET is_active = 0 WHERE id = ? AND is_active = 1',
  ).bind(id).run();
  return (r.meta?.changes ?? 0) > 0;
}

// ── Tickets ─────────────────────────────────────────────────────────

const TICKET_PATCHABLE: ReadonlyArray<keyof Ticket> = [
  'summary', 'full_text', 'status', 'resolution',
  'ai_quality_rating', 'satisfaction_delta', 'embedding_id', 'resolved_at',
];

export async function createTicket(
  db: D1Like,
  data: {
    customer_id: number;
    player_id: string;
    summary: string;
    full_text: string;
  },
): Promise<Ticket> {
  const r = await db.prepare(
    'INSERT INTO tickets (customer_id, player_id, summary, full_text, status, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(
    data.customer_id, data.player_id, data.summary, data.full_text,
    'open' satisfies TicketStatus, nowSec(),
  ).first<Ticket>();
  if (!r) throw new Error('createTicket returned no row');
  return r;
}

export async function listTickets(
  db: D1Like, playerId: string, status?: TicketStatus,
): Promise<Ticket[]> {
  const where: string[] = ['player_id = ?'];
  const args: unknown[] = [playerId];
  if (status) {
    where.push('status = ?');
    args.push(status);
  }
  const rs = await db.prepare(
    `SELECT * FROM tickets WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
  ).bind(...args).all<Ticket>();
  return rs.results ?? [];
}

// ID-only — ownership-check a caller felelőssége (lásd SECURITY-header).
export async function updateTicket(
  db: D1Like, id: number,
  patch: Partial<Ticket>,
): Promise<Ticket | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const key of TICKET_PATCHABLE) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      args.push(patch[key] ?? null);
    }
  }
  if (sets.length === 0) {
    return db.prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1')
      .bind(id).first<Ticket>();
  }
  args.push(id);
  const r = await db.prepare(
    `UPDATE tickets SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
  ).bind(...args).first<Ticket>();
  return r ?? null;
}

// ID-only — ownership-check a caller felelőssége (lásd SECURITY-header).
export async function closeTicket(
  db: D1Like, id: number,
  resolution: string, satisfactionDelta: number,
): Promise<Ticket | null> {
  const r = await db.prepare(
    'UPDATE tickets SET status = ?, resolution = ?, satisfaction_delta = ?, resolved_at = ? ' +
    'WHERE id = ? RETURNING *',
  ).bind(
    'resolved' satisfies TicketStatus, resolution, satisfactionDelta, nowSec(), id,
  ).first<Ticket>();
  return r ?? null;
}

// ── Servers ─────────────────────────────────────────────────────────

export async function createServer(
  db: D1Like,
  data: {
    player_id: string;
    era: EraId;
    type: ServerType;
    capacity: number;
    monthly_cost_cents: number;
    upgrades_json?: string;
  },
): Promise<Server> {
  const r = await db.prepare(
    'INSERT INTO servers (player_id, era, type, capacity, monthly_cost_cents, ' +
    'upgrades_json, purchased_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(
    data.player_id, data.era, data.type, data.capacity,
    data.monthly_cost_cents, data.upgrades_json ?? '[]', nowSec(),
  ).first<Server>();
  if (!r) throw new Error('createServer returned no row');
  return r;
}

export async function listServers(
  db: D1Like, playerId: string,
): Promise<Server[]> {
  const rs = await db.prepare(
    'SELECT * FROM servers WHERE player_id = ? ORDER BY purchased_at',
  ).bind(playerId).all<Server>();
  return rs.results ?? [];
}

export async function getTotalCapacity(
  db: D1Like, playerId: string,
): Promise<number> {
  const r = await db.prepare(
    'SELECT COALESCE(SUM(capacity), 0) AS total FROM servers WHERE player_id = ?',
  ).bind(playerId).first<{ total: number }>();
  return r?.total ?? 0;
}

export async function getTotalLoad(
  db: D1Like, playerId: string,
): Promise<number> {
  const r = await db.prepare(
    'SELECT COALESCE(SUM(current_load), 0) AS total FROM servers WHERE player_id = ?',
  ).bind(playerId).first<{ total: number }>();
  return r?.total ?? 0;
}

// ── Upgrades ────────────────────────────────────────────────────────

export async function addUpgrade(
  db: D1Like, playerId: string, upgradeId: string,
): Promise<UpgradeRow> {
  const r = await db.prepare(
    'INSERT INTO upgrades (player_id, upgrade_id, purchased_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(player_id, upgrade_id) DO NOTHING RETURNING *',
  ).bind(playerId, upgradeId, nowSec()).first<UpgradeRow>();
  if (r) return r;
  // Conflict-ágon a RETURNING üres — visszaolvassuk a meglévőt.
  const existing = await db.prepare(
    'SELECT * FROM upgrades WHERE player_id = ? AND upgrade_id = ?',
  ).bind(playerId, upgradeId).first<UpgradeRow>();
  if (!existing) throw new Error('addUpgrade: row not found after insert');
  return existing;
}

export async function listUpgrades(
  db: D1Like, playerId: string,
): Promise<UpgradeRow[]> {
  const rs = await db.prepare(
    'SELECT * FROM upgrades WHERE player_id = ? ORDER BY purchased_at',
  ).bind(playerId).all<UpgradeRow>();
  return rs.results ?? [];
}

export async function hasUpgrade(
  db: D1Like, playerId: string, upgradeId: string,
): Promise<boolean> {
  const r = await db.prepare(
    'SELECT 1 AS x FROM upgrades WHERE player_id = ? AND upgrade_id = ? LIMIT 1',
  ).bind(playerId, upgradeId).first<{ x: number }>();
  return r !== null;
}

// ── Events ──────────────────────────────────────────────────────────

export async function spawnEvent(
  db: D1Like, playerId: string,
  type: EventType, dataJson: string | null = null,
): Promise<GameEvent> {
  const r = await db.prepare(
    'INSERT INTO events (player_id, event_type, data_json, spawned_at) ' +
    'VALUES (?, ?, ?, ?) RETURNING *',
  ).bind(playerId, type, dataJson, nowSec()).first<GameEvent>();
  if (!r) throw new Error('spawnEvent returned no row');
  return r;
}

export async function listRecentEvents(
  db: D1Like, playerId: string, sinceTs: number,
): Promise<GameEvent[]> {
  const rs = await db.prepare(
    'SELECT * FROM events WHERE player_id = ? AND spawned_at >= ? ORDER BY spawned_at DESC',
  ).bind(playerId, sinceTs).all<GameEvent>();
  return rs.results ?? [];
}

// ID-only — ownership-check a caller felelőssége (lásd SECURITY-header).
export async function resolveEvent(
  db: D1Like, id: number, outcome: EventOutcome,
): Promise<GameEvent | null> {
  const r = await db.prepare(
    'UPDATE events SET outcome = ?, resolved_at = ? WHERE id = ? RETURNING *',
  ).bind(outcome, nowSec(), id).first<GameEvent>();
  return r ?? null;
}
