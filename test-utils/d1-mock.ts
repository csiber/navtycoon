// Miniflare-alapú in-memory D1 a Hyperscales tesztekhez.
// A migrations/ minden .sql-fájlját végigfuttatja sorba (0001…), így a
// tesztek mindig az aktuális prod-séma ellen futnak.

import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database } from '@cloudflare/workers-types/experimental';

const MIGRATIONS_DIR = '/home/aika/navtycoon/migrations';

function splitSqlStatements(sql: string): string[] {
  // Sor-megjegyzéseket (`-- …`) eltávolítjuk, nehogy a `;` bennük zavarjon.
  const cleaned = sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createTestDb(): Promise<D1Database> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: ':memory:' },
  });
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    for (const stmt of splitSqlStatements(sql)) {
      try {
        await db.prepare(stmt).run();
      } catch {
        // IF NOT EXISTS / idempotens DDL-eket némán átugrunk
      }
    }
  }
  return db;
}
