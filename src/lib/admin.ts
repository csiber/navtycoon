// Admin-jog: csak az ADMIN_USER_IDS környezeti változóban (vesszővel elválasztott users.id-lista) szereplő fiókok.
//
// 2026-11-11: korábban admin volt bárki, akinek az e-mail-címében „+admin" szerepelt, vagy aki
// csiberius@gmail.com címmel regisztrált. Mivel nincs e-mail-ellenőrzés, ezt bárki megszerezhette
// (pl. valaki+admin@akarmi.hu). Az e-mail tehát nem lehet jogosultság alapja; a user_id-t a
// CF Pages környezeti változójában Csaba adja meg. Ha nincs beállítva, senki sem admin.

export function parseAdminIds(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );
}

export function isAdminUser(
  user: { id: string } | null | undefined,
  env: { ADMIN_USER_IDS?: string } | undefined,
): boolean {
  if (!user) return false;
  return parseAdminIds(env?.ADMIN_USER_IDS).has(user.id);
}
