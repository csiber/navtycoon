// src/lib/auth/delete-account.ts — egy fiók minden adatának törlése (POST /api/auth/delete).
// 2026-11-11 (ux-2): a fórum (szálak + válaszok), a piactér-hirdetések, a műszak-történet és az audit-napló is
// megy — eddig ezek a fiók törlése után is megmaradtak (a fórumon név nélkül, a piactéren „árván").

export interface DeleteDb {
  prepare(sql: string): { bind(...a: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<{ results?: T[] }> } };
}

export async function deleteAccountData(db: DeleteDb, userId: string): Promise<void> {
  const run = (sql: string) => db.prepare(sql).bind(userId).run();

  // Fórum: más szálaiban írt válaszok → utána a válaszszám újraszámolása ezeken a szálakon.
  const touched = ((await db.prepare(
    'SELECT DISTINCT thread_id FROM forum_replies WHERE author_id = ?',
  ).bind(userId).all<{ thread_id: number }>()).results ?? []).map((r) => r.thread_id);
  await run('DELETE FROM forum_replies WHERE author_id = ?');
  // A saját szálak a rájuk érkezett (bárki által írt) válaszokkal együtt.
  await run('DELETE FROM forum_replies WHERE thread_id IN (SELECT id FROM forum_threads WHERE author_id = ?)');
  await run('DELETE FROM forum_threads WHERE author_id = ?');
  for (const id of touched) {
    await db.prepare(
      'UPDATE forum_threads SET replies_count = (SELECT COUNT(*) FROM forum_replies WHERE thread_id = ?), ' +
      'last_reply_at = COALESCE((SELECT MAX(created_at) FROM forum_replies WHERE thread_id = ?), created_at) WHERE id = ?',
    ).bind(id, id, id).run();
  }
  await run('DELETE FROM marketplace_listings WHERE author_id = ?');

  // Játékállás.
  await run('DELETE FROM tickets WHERE player_id = ?');
  await run('DELETE FROM customers WHERE player_id = ?');
  await run('DELETE FROM servers WHERE player_id = ?');
  await run('DELETE FROM events WHERE player_id = ?');
  await run('DELETE FROM achievements WHERE player_id = ?');
  await run('DELETE FROM upgrades WHERE player_id = ?');
  await run('DELETE FROM llm_usage WHERE player_id = ?');
  await run('DELETE FROM shift_history WHERE player_id = ?');
  await run('DELETE FROM audit_log WHERE player_id = ?');
  await run('DELETE FROM players WHERE user_id = ?');

  // Fiók (saját users/sessions tábla 2026-10-05 óta; AikaHub-kötés: tokent nem tárolunk, csak a kötés sora megy).
  await run('DELETE FROM sessions WHERE user_id = ?');
  await run('DELETE FROM legacy_accounts WHERE user_id = ?');
  await run('DELETE FROM account_links WHERE user_id = ?');
  await run('DELETE FROM oauth_pending WHERE link_user_id = ?');
  await run('DELETE FROM users WHERE id = ?');
}
