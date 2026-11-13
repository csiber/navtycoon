// Hyperscales → AikaHub achievement-továbbítás (szerver→szerver, kliens-kulccsal; 2026-11-12).
// Útmutató: aikahub_website docs/achievements-integracio.md, „Szerver→szerver kliens-kulccsal”.
//
//   POST https://aikahub.com/oauth/achievements/unlock
//   Authorization: Basic base64("hyperscales:<AIKAHUB_CLIENT_KEY>")
//   {"sub":"<pairwise sub>","id":"hyperscales:<key>"}
//
// Felhasználói tokent továbbra sem tárolunk (a belépés után azonnal visszavonjuk): elég a pairwise `sub` az account_links-ből.
//
// Szabályok:
//  - Kulcs nélkül (üres AIKAHUB_CLIENT_KEY) csendben kihagyjuk — a játékon belül az achievement így is megvan.
//  - Csak akkor küldünk, ha a tag a legutóbbi belépéskor megadta az `achievements` hatókört (audit_log 'aikahub_scope').
//  - A Hub-id: 'hyperscales:' + a játékbeli id aláhúzás→kötőjel (first_shift → hyperscales:first-shift).
//  - 200 → kész. Végleg csak a 409 not_linked és a 403 insufficient_scope eldobandó (kész-jelöléssel; a következő
//    belépéskori visszamenőleges szinkron úgyis újraküldi, idempotens).
//  - Minden más (404 unknown_achievement, egyéb 403 pl. wrong_game — amíg a Hub nem élesítette a definíciókat —, 401 invalid_client, 5xx, 429, 400,
//    időtúllépés 5 mp, hálózati hiba) → retry-sor: a DO 5 perces cronja (retryPendingHubSync) ritkuló időközzel próbálja újra
//    (5 perc, 10, 20 … legfeljebb 1 nap; retryDelaySec), a feloldás után legfeljebb RETRY_WINDOW_SEC-ig (30 nap). Egy futás az
//    első sikertelen válasz után megáll, így tartós hibánál 5 percenként legfeljebb 1 kérés megy.
//  - Séma-módosítás nincs: a kész-jelölés, a próbálkozások és a hatókör az audit_log táblába kerül (action =
//    'aikahub_achi_sync' / 'aikahub_achi_try' / 'aikahub_scope'). Naplóba SOHA nem írunk kulcsot, Authorization-fejlécet vagy sub-ot.

import { AIKAHUB_ISSUER, AIKAHUB_CLIENT_ID, AIKAHUB_PROVIDER, type FetchFn } from './aikahub';

export const HUB_TIMEOUT_MS = 5000;
/** Ennyi ideig próbálja újra a cron a sikertelen küldést (utána csak a következő belépéskori szinkron viszi). */
export const RETRY_WINDOW_SEC = 30 * 24 * 3600;
export const RETRY_BASE_SEC = 300;
export const RETRY_MAX_DELAY_SEC = 24 * 3600;
/** n sikertelen próbálkozás után ennyit várunk a következőig: 5 perc · 2^(n−1), legfeljebb 1 nap. */
export function retryDelaySec(tries: number): number {
  if (tries <= 0) return 0;
  return Math.min(RETRY_MAX_DELAY_SEC, RETRY_BASE_SEC * 2 ** Math.min(20, tries - 1));
}
/** Egy cron-futás legfeljebb ennyi kérést küld (a Hub tagonként 60/óra korlátot tart). */
export const RETRY_BATCH = 25;
export const ENTITLEMENT_TTL_MS = 10 * 60 * 1000;

export const AUDIT_SYNC = 'aikahub_achi_sync';
export const AUDIT_TRY = 'aikahub_achi_try';
export const AUDIT_SCOPE = 'aikahub_scope';

/** A Hub felé kellő környezet. A kulcs a Pages-titkok és a navtycoon-do worker titkai között: AIKAHUB_CLIENT_KEY. */
export interface HubCtx {
  key?: string | null;
  fetchFn?: FetchFn;
  /** Ha van (Pages: locals.runtime.ctx, DO: state), a küldés a válasz után fut le. */
  waitUntil?: (p: Promise<unknown>) => void;
  now?: number;
}

interface DbLike {
  prepare(sql: string): {
    bind(...v: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
  };
}

/** first_shift → hyperscales:first-shift (a Hub kulcsa kisbetű/szám/kötőjel). */
export function hubAchievementId(id: string): string {
  return `${AIKAHUB_CLIENT_ID}:${id.toLowerCase().replace(/_/g, '-')}`;
}

/** Játékon belüli entitlement-név → Hub-érték (rack_skin_colo → hyperscales:rack-skin-colo). */
export function hubEntitlementId(name: string): string {
  return hubAchievementId(name);
}

export function basicAuthHeader(key: string): string {
  // RFC 6749 2.3.1: az id és a titok form-urlencoded, a Hub decodeURIComponent-tel bontja ki.
  return 'Basic ' + btoa(`${encodeURIComponent(AIKAHUB_CLIENT_ID)}:${encodeURIComponent(key)}`);
}

/** Pages-végpontból: kulcs + waitUntil a futtatókörnyezetből. */
export function hubFromLocals(locals: unknown): HubCtx {
  const rt = (locals as { runtime?: { env?: { AIKAHUB_CLIENT_KEY?: string }; ctx?: { waitUntil?: (p: Promise<unknown>) => void } } })?.runtime;
  const wu = rt?.ctx?.waitUntil;
  return {
    key: rt?.env?.AIKAHUB_CLIENT_KEY ?? null,
    waitUntil: wu ? (p) => wu.call(rt!.ctx, p) : undefined,
  };
}

export type SendOutcome = 'ok' | 'drop' | 'retry' | 'skip';

async function withTimeout(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, HUB_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fetchFn(url, { ...init, signal: ctl.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Egy feloldás elküldése. Hibát nem dob. */
export async function sendHubUnlock(hub: HubCtx, sub: string, achievementId: string): Promise<SendOutcome> {
  const key = (hub.key ?? '').trim();
  if (!key || !sub) return 'skip';
  const fetchFn = hub.fetchFn ?? ((i, init) => fetch(i, init));
  const hubId = hubAchievementId(achievementId);
  let status = 0;
  let errCode = '';
  try {
    const r = await withTimeout(fetchFn, `${AIKAHUB_ISSUER}/oauth/achievements/unlock`, {
      method: 'POST',
      headers: { authorization: basicAuthHeader(key), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sub, id: hubId }),
    });
    status = r.status;
    if (status === 403) {
      try { errCode = String(((await r.json()) as { error?: unknown }).error ?? ''); } catch { errCode = ''; }
    }
  } catch (e) {
    console.warn('aikahub-achi: nem elérhető, később újra', { id: hubId, reason: (e as Error)?.name === 'AbortError' || (e as Error)?.message === 'timeout' ? 'timeout' : 'network' });
    return 'retry';
  }
  if (status >= 200 && status < 300) return 'ok';
  if (status === 409 || (status === 403 && errCode === 'insufficient_scope')) {
    console.warn('aikahub-achi: eldobva', { id: hubId, status });
    return 'drop';
  }
  console.warn('aikahub-achi: sikertelen, később újra', { id: hubId, status });
  return 'retry';
}

/** A tag Hub-célpontja: pairwise sub, ha össze van kötve ÉS a legutóbbi belépéskor megadta az `achievements` hatókört. */
export async function hubTarget(db: DbLike, userId: string): Promise<{ sub: string } | null> {
  const link = await db.prepare('SELECT sub FROM account_links WHERE provider = ? AND user_id = ?')
    .bind(AIKAHUB_PROVIDER, userId).first<{ sub: string }>();
  if (!link?.sub) return null;
  if (!(await hasAchievementsScope(db, userId))) return null;
  return { sub: link.sub };
}

export async function hasAchievementsScope(db: DbLike, userId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT metadata_json FROM audit_log WHERE player_id = ? AND action = ? ORDER BY id DESC LIMIT 1',
  ).bind(userId, AUDIT_SCOPE).first<{ metadata_json: string | null }>();
  if (!row?.metadata_json) return false;
  try { return (JSON.parse(row.metadata_json) as { achievements?: boolean }).achievements === true; } catch { return false; }
}

/** A userinfo `scope` mezője (szóközzel elválasztva) → megadta-e az `achievements` hatókört. */
export function scopeHasAchievements(scope: unknown): boolean {
  return typeof scope === 'string' && scope.split(/\s+/).includes('achievements');
}

/** Belépéskor: feljegyezzük, megadta-e a tag az achievements-engedélyt (a legutóbbi sor számít). */
export async function recordHubScope(db: DbLike, userId: string, granted: boolean, now: number): Promise<void> {
  await db.prepare('INSERT INTO audit_log (player_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, AUDIT_SCOPE, JSON.stringify({ achievements: granted }), now).run();
}

async function markTry(db: DbLike, userId: string, id: string, now: number): Promise<void> {
  await db.prepare('INSERT INTO audit_log (player_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, AUDIT_TRY, JSON.stringify({ id }), now).run();
}

async function markSynced(db: DbLike, userId: string, id: string, outcome: 'ok' | 'drop', now: number): Promise<void> {
  await db.prepare('INSERT INTO audit_log (player_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, AUDIT_SYNC, JSON.stringify({ id, outcome }), now).run();
}

export interface SyncResult { sent: number; ok: number; dropped: number; retry: number; skipped: boolean }

/** A megadott (játékbeli) achievement-id-k elküldése egy tagnak. Hibát nem dob. */
export async function syncAchievementsToHub(
  db: DbLike, hub: HubCtx, userId: string, ids: string[],
): Promise<SyncResult> {
  const res: SyncResult = { sent: 0, ok: 0, dropped: 0, retry: 0, skipped: true };
  if (!(hub.key ?? '').trim() || ids.length === 0) return res;
  let target: { sub: string } | null = null;
  try { target = await hubTarget(db, userId); } catch { return res; }
  if (!target) return res;
  res.skipped = false;
  const now = hub.now ?? Math.floor(Date.now() / 1000);
  for (const id of ids) {
    const o = await sendHubUnlock(hub, target.sub, id);
    res.sent++;
    if (o === 'ok' || o === 'drop') {
      if (o === 'ok') res.ok++; else res.dropped++;
      try { await markSynced(db, userId, id, o, now); } catch { /* a cron legfeljebb még egyszer elküldi (idempotens) */ }
    } else if (o === 'retry') {
      res.retry++;
      try { await markTry(db, userId, id, now); } catch { /* legfeljebb hamarabb próbálja újra */ }
      break; // a Hub most nem elérhető: a többit is a cron viszi
    }
  }
  return res;
}

/** Új feloldás(ok) után: a válasz után (waitUntil), vagy ha az nincs, megvárva. Hibát nem dob. */
export async function notifyHubUnlocks(db: DbLike, hub: HubCtx | undefined, userId: string, ids: string[]): Promise<void> {
  if (!hub || !(hub.key ?? '').trim() || ids.length === 0) return;
  const p = syncAchievementsToHub(db, hub, userId, ids).catch(() => undefined);
  if (hub.waitUntil) hub.waitUntil(p);
  else await p;
}

/** Visszamenőleges szinkron (belépés / összekötés után): a tag MINDEN meglévő achievementje (a Hub idempotens). */
export async function backfillHubAchievements(db: DbLike, hub: HubCtx, userId: string): Promise<SyncResult> {
  if (!(hub.key ?? '').trim()) return { sent: 0, ok: 0, dropped: 0, retry: 0, skipped: true };
  const rows = (await db.prepare('SELECT achievement_id FROM achievements WHERE player_id = ? ORDER BY unlocked_at, rowid')
    .bind(userId).all<{ achievement_id: string }>()).results ?? [];
  return syncAchievementsToHub(db, hub, userId, rows.map((r) => r.achievement_id));
}

/**
 * Cron (navtycoon-do, 5 perc): a RETRY_WINDOW_SEC-ben feloldott, összekötött tagok még kész-jelölés nélküli achievementjei.
 * Legfeljebb RETRY_BATCH kérés; az első „retry” kimenetnél megáll (a Hub nem elérhető / a kulcs még nem él).
 */
export async function retryPendingHubSync(db: DbLike, hub: HubCtx): Promise<SyncResult> {
  const res: SyncResult = { sent: 0, ok: 0, dropped: 0, retry: 0, skipped: true };
  if (!(hub.key ?? '').trim()) return res;
  const now = hub.now ?? Math.floor(Date.now() / 1000);
  const rows = (await db.prepare(
    'SELECT a.player_id, a.achievement_id, ' +
    '  (SELECT COUNT(*) FROM audit_log t WHERE t.player_id = a.player_id AND t.action = ? ' +
    "     AND json_extract(t.metadata_json, '$.id') = a.achievement_id AND t.created_at >= a.unlocked_at) AS tries, " +
    '  (SELECT MAX(t.created_at) FROM audit_log t WHERE t.player_id = a.player_id AND t.action = ? ' +
    "     AND json_extract(t.metadata_json, '$.id') = a.achievement_id AND t.created_at >= a.unlocked_at) AS last_try " +
    'FROM achievements a ' +
    'JOIN account_links l ON l.provider = ? AND l.user_id = a.player_id ' +
    'WHERE a.unlocked_at >= ? AND NOT EXISTS (' +
    '  SELECT 1 FROM audit_log g WHERE g.player_id = a.player_id AND g.action = ? ' +
    "    AND json_extract(g.metadata_json, '$.id') = a.achievement_id AND g.created_at >= a.unlocked_at" +
    ') AND (' +
    // csak ha a legutóbbi belépéskor megadta az achievements-hatókört (különben a sorban ragadna)
    "  SELECT json_extract(s.metadata_json, '$.achievements') FROM audit_log s " +
    '  WHERE s.player_id = a.player_id AND s.action = ? ORDER BY s.id DESC LIMIT 1' +
    ') = 1 ORDER BY RANDOM() LIMIT ?',
    // RANDOM: egy tartósan hibás sor ne tartsa fel a többit (az első „retry” után a futás megáll)
  ).bind(AUDIT_TRY, AUDIT_TRY, AIKAHUB_PROVIDER, now - RETRY_WINDOW_SEC, AUDIT_SYNC, AUDIT_SCOPE, RETRY_BATCH * 8)
    .all<{ player_id: string; achievement_id: string; tries: number; last_try: number | null }>()).results ?? [];
  // ritkuló újrapróbálás: csak az esedékesek
  const due = rows.filter((r) => !r.tries || now - (r.last_try ?? 0) >= retryDelaySec(r.tries));
  if (due.length === 0) return res;
  res.skipped = false;
  const byPlayer = new Map<string, string[]>();
  for (const r of due) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r.achievement_id]);
  for (const [userId, ids] of byPlayer) {
    if (res.sent >= RETRY_BATCH) break;
    const r = await syncAchievementsToHub(db, { ...hub, now }, userId, ids.slice(0, RETRY_BATCH - res.sent));
    res.sent += r.sent; res.ok += r.ok; res.dropped += r.dropped; res.retry += r.retry;
    if (r.retry > 0) break;
  }
  return res;
}

// ── Jogosultságok (entitlementek) ──────────────────────────────────

/** A játékon belüli kozmetikai jogosultságok (hyperscales.md). A hatásuk: src/lib/play/cosmetics.ts (2026-11-13). */
export const ENTITLEMENTS = ['rack_skin_colo', 'rack_led_theme', 'company_banner'] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

const entCache = new Map<string, { at: number; values: string[] }>();

/** Teszthez. */
export function clearEntitlementCache(): void { entCache.clear(); }

/**
 * GET /oauth/entitlements?sub=… — a tag Hub-oldali jogosultságai ebben a játékban ('hyperscales:rack-skin-colo' …).
 * 10 percre gyorsítótárazva (izolátumonként, sub szerint). Kulcs / kötés / hatókör nélkül, vagy hibánál: üres lista
 * (a hibát nem gyorsítótárazzuk). Hibát nem dob.
 */
export async function fetchHubEntitlements(db: DbLike, hub: HubCtx, userId: string): Promise<string[]> {
  const key = (hub.key ?? '').trim();
  if (!key) return [];
  let target: { sub: string } | null = null;
  try { target = await hubTarget(db, userId); } catch { return []; }
  if (!target) return [];
  const nowMs = (hub.now ?? Date.now() / 1000) * 1000;
  const hit = entCache.get(target.sub);
  if (hit && nowMs - hit.at < ENTITLEMENT_TTL_MS) return hit.values;
  const fetchFn = hub.fetchFn ?? ((i, init) => fetch(i, init));
  try {
    const r = await withTimeout(fetchFn, `${AIKAHUB_ISSUER}/oauth/entitlements?sub=${encodeURIComponent(target.sub)}`, {
      headers: { authorization: basicAuthHeader(key), accept: 'application/json' },
    });
    if (!r.ok) {
      console.warn('aikahub-achi: entitlements sikertelen', { status: r.status });
      return [];
    }
    const j = await r.json() as { entitlements?: Array<{ value?: unknown } | string> };
    const prefix = `${AIKAHUB_CLIENT_ID}:`;
    const values = (j.entitlements ?? [])
      .map((e) => (typeof e === 'string' ? e : typeof e?.value === 'string' ? e.value : ''))
      .filter((v) => v.startsWith(prefix));
    entCache.set(target.sub, { at: nowMs, values });
    return values;
  } catch {
    console.warn('aikahub-achi: entitlements nem elérhető');
    return [];
  }
}

/** Megvan-e a tagnak egy játékbeli jogosultság (pl. 'rack_skin_colo'). */
export async function hasEntitlement(db: DbLike, hub: HubCtx, userId: string, ent: Entitlement): Promise<boolean> {
  return (await fetchHubEntitlements(db, hub, userId)).includes(hubEntitlementId(ent));
}
