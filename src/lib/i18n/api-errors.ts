// src/lib/i18n/api-errors.ts
// API-válaszüzenetek (hibák + rövid visszajelzések) EN/HU/DE-ben, a kérés nyelvén.
//
// Használat egy API-végpontban:
//   const loc = localeFromRequest(context.request, body.lang);
//   return jsonError(400, loc, 'invalid_email');
//   apiMsg(loc, 'company_real_brand_sub', { name: 'aws' })
//
// Nyelv sorrendje (localeFromRequest): body.lang → ?lang= → hs_lang süti → Accept-Language (q-értékkel) → 'en'.
// Új kulcsot mindhárom nyelvre fel kell venni (a src/lib/__tests__/api-errors.test.ts ezt ellenőrzi).

export type ApiLocale = 'en' | 'hu' | 'de';
export const API_LOCALES: readonly ApiLocale[] = ['en', 'hu', 'de'] as const;

export function isApiLocale(v: unknown): v is ApiLocale {
  return typeof v === 'string' && (API_LOCALES as readonly string[]).includes(v);
}

const EN = {
  db_missing: 'The server is not configured. Please try again later.',
  invalid_json: 'Invalid request.',
  invalid_email: 'Please enter a valid email address.',
  email_password_required: 'Email and password are required.',
  bad_credentials: 'Wrong email or password.',
  email_taken: 'An account with this email already exists. Log in instead?',
  password_too_short: 'The password must be at least 8 characters.',
  password_too_long: 'The password can be at most 128 characters.',
  company_too_short: 'The company name must be at least 2 characters.',
  company_too_long: 'The company name can be at most 80 characters.',
  company_real_brand: 'That is a real hosting/cloud company. Make up your own name — it is more fun.',
  company_real_brand_sub: '"{name}" is a real company name and cannot be used in the game. Make up your own.',
  signup_failed: 'Sign-up failed. Please try again in a minute.',
  login_failed: 'Login failed. Please try again in a minute.',
  unauthorized: 'Please log in first.',
  forbidden: 'You are not allowed to do that.',
  not_found: 'Not found.',
  rate_limited: 'Too many requests. Please slow down a little.',
  not_enough_cash: 'Not enough cash.',
  internal: 'Something went wrong on our side. Please try again.',
  era_locked: 'This unlocks in a later era.',
  invalid_item: 'Unknown item.',
  unavailable: 'Not available right now (era, prerequisite, or you already own it).',
  already_resolved: 'This has already been decided.',
  nothing_to_update: 'Nothing to change.',
  bad_request: 'Invalid request.',
  no_player: 'No company yet — open the dashboard first.',
  invalid_value: 'Invalid value: {field}.',
} as const;

export type ApiMsgKey = keyof typeof EN;

export const API_MESSAGES: Record<ApiLocale, Record<ApiMsgKey, string>> = {
  en: EN,
  hu: {
    db_missing: 'A szerver nincs beállítva. Próbáld újra később.',
    invalid_json: 'Érvénytelen kérés.',
    invalid_email: 'Adj meg egy érvényes e-mail-címet.',
    email_password_required: 'Az e-mail-cím és a jelszó kötelező.',
    bad_credentials: 'Hibás e-mail-cím vagy jelszó.',
    email_taken: 'Ezzel az e-mail-címmel már van fiók. Inkább jelentkezz be?',
    password_too_short: 'A jelszó legalább 8 karakter legyen.',
    password_too_long: 'A jelszó legfeljebb 128 karakter lehet.',
    company_too_short: 'A cégnév legalább 2 karakter legyen.',
    company_too_long: 'A cégnév legfeljebb 80 karakter lehet.',
    company_real_brand: 'Ez egy valódi hosting-/felhőcég neve. Találj ki egy sajátot — úgy viccesebb.',
    company_real_brand_sub: 'A(z) „{name}” valódi cég neve, a játékban nem használhatod. Találj ki egy sajátot.',
    signup_failed: 'A regisztráció nem sikerült. Próbáld újra egy perc múlva.',
    login_failed: 'A belépés nem sikerült. Próbáld újra egy perc múlva.',
    unauthorized: 'Előbb jelentkezz be.',
    forbidden: 'Ehhez nincs jogosultságod.',
    not_found: 'Nem található.',
    rate_limited: 'Túl sok kérés. Lassíts egy kicsit.',
    not_enough_cash: 'Nincs elég pénzed.',
    internal: 'Valami hiba történt nálunk. Próbáld újra.',
    era_locked: 'Ez egy későbbi korszakban nyílik meg.',
    invalid_item: 'Ismeretlen elem.',
    unavailable: 'Most nem elérhető (korszak, előfeltétel, vagy már a tiéd).',
    already_resolved: 'Erről már döntöttél.',
    nothing_to_update: 'Nincs mit módosítani.',
    bad_request: 'Érvénytelen kérés.',
    no_player: 'Még nincs céged — előbb nyisd meg a vezérlőt.',
    invalid_value: 'Érvénytelen érték: {field}.',
  },
  de: {
    db_missing: 'Der Server ist nicht konfiguriert. Bitte versuche es später erneut.',
    invalid_json: 'Ungültige Anfrage.',
    invalid_email: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    email_password_required: 'E-Mail und Passwort sind erforderlich.',
    bad_credentials: 'E-Mail oder Passwort ist falsch.',
    email_taken: 'Mit dieser E-Mail gibt es bereits ein Konto. Lieber einloggen?',
    password_too_short: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
    password_too_long: 'Das Passwort darf höchstens 128 Zeichen lang sein.',
    company_too_short: 'Der Firmenname muss mindestens 2 Zeichen lang sein.',
    company_too_long: 'Der Firmenname darf höchstens 80 Zeichen lang sein.',
    company_real_brand: 'Das ist ein echter Hosting-/Cloud-Anbieter. Denk dir einen eigenen Namen aus — macht mehr Spaß.',
    company_real_brand_sub: '„{name}“ ist ein echter Firmenname und im Spiel nicht erlaubt. Denk dir einen eigenen aus.',
    signup_failed: 'Die Registrierung ist fehlgeschlagen. Bitte versuche es in einer Minute erneut.',
    login_failed: 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es in einer Minute erneut.',
    unauthorized: 'Bitte melde dich zuerst an.',
    forbidden: 'Das darfst du nicht.',
    not_found: 'Nicht gefunden.',
    rate_limited: 'Zu viele Anfragen. Bitte etwas langsamer.',
    not_enough_cash: 'Nicht genug Geld.',
    internal: 'Bei uns ist etwas schiefgelaufen. Bitte versuche es erneut.',
    era_locked: 'Das wird erst in einer späteren Ära freigeschaltet.',
    invalid_item: 'Unbekanntes Element.',
    unavailable: 'Gerade nicht verfügbar (Ära, Voraussetzung, oder schon in deinem Besitz).',
    already_resolved: 'Darüber hast du schon entschieden.',
    nothing_to_update: 'Nichts zu ändern.',
    bad_request: 'Ungültige Anfrage.',
    no_player: 'Noch keine Firma — öffne zuerst die Übersicht.',
    invalid_value: 'Ungültiger Wert: {field}.',
  },
};

/** Lefordított üzenet; a {param} helyőrzőket a params értékeire cseréli. Ismeretlen kulcs → EN → maga a kulcs. */
export function apiMsg(locale: ApiLocale, key: ApiMsgKey, params?: Record<string, string | number>): string {
  const raw = API_MESSAGES[locale]?.[key] ?? API_MESSAGES.en[key] ?? String(key);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m));
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) {
      try { return decodeURIComponent(part.slice(eq + 1)); } catch { return null; }
    }
  }
  return null;
}

/** Az Accept-Language fejléc első támogatott nyelve (q-értékek szerint rendezve), különben null. */
export function localeFromAcceptLanguage(header: string | null | undefined): ApiLocale | null {
  if (!header) return null;
  const items = header.split(',').map((part, idx) => {
    const [tag, ...rest] = part.trim().split(';');
    const qPart = rest.find((r) => r.trim().startsWith('q='));
    const q = qPart ? Number(qPart.trim().slice(2)) : 1;
    return { lang: (tag ?? '').trim().slice(0, 2).toLowerCase(), q: Number.isFinite(q) ? q : 0, idx };
  });
  items.sort((a, b) => b.q - a.q || a.idx - b.idx);
  for (const it of items) if (it.q > 0 && isApiLocale(it.lang)) return it.lang;
  return null;
}

/** A kérés nyelve: body.lang → ?lang= → hs_lang süti → Accept-Language → 'en'. */
export function localeFromRequest(request: Request, bodyLang?: unknown): ApiLocale {
  if (typeof bodyLang === 'string' && isApiLocale(bodyLang.toLowerCase())) return bodyLang.toLowerCase() as ApiLocale;
  try {
    const q = new URL(request.url).searchParams.get('lang');
    if (isApiLocale(q)) return q;
  } catch { /* relatív URL */ }
  const c = readCookie(request, 'hs_lang');
  if (isApiLocale(c)) return c;
  return localeFromAcceptLanguage(request.headers.get('accept-language')) ?? 'en';
}

/** JSON-hibaválasz a kérés nyelvén: { ok: false, error, code }. */
export function jsonError(
  status: number,
  locale: ApiLocale,
  key: ApiMsgKey,
  params?: Record<string, string | number>,
): Response {
  return new Response(JSON.stringify({ ok: false, error: apiMsg(locale, key, params), code: key }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

// A /api/game/* végpontok régi, gépi angol hibakódjai → lefordított üzenet (2026-11-11, UX-javítás).
// A válaszban az `error` a játékos nyelvén olvasható szöveg, a `code` a stabil kulcs.
const LEGACY_CODES: Record<string, ApiMsgKey> = {
  'auth': 'unauthorized',
  'no DB': 'db_missing',
  'No DB': 'db_missing',
  'no player': 'no_player',
  'JSON': 'invalid_json',
  'bad JSON': 'invalid_json',
  'insufficient cash': 'not_enough_cash',
  'era locked': 'era_locked',
  'invalid server type': 'invalid_item',
  'invalid upgrade': 'invalid_item',
  'unavailable (era, prereq, or owned)': 'unavailable',
  'already resolved': 'already_resolved',
  'event not found': 'not_found',
  'unknown option': 'invalid_item',
  'unknown event type': 'invalid_item',
  'bad event id': 'bad_request',
  'option_id required': 'bad_request',
  'nothing to update': 'nothing_to_update',
  'company_name 2-60 chars': 'company_too_short',
  'company_name cannot be null': 'company_too_short',
  'admin only': 'forbidden',
};

export function legacyError(request: Request, status: number, code: string): Response {
  const loc = localeFromRequest(request);
  const key = LEGACY_CODES[code] ?? (status === 401 ? 'unauthorized' : status === 404 ? 'not_found' : status >= 500 ? 'internal' : 'bad_request');
  return jsonError(status, loc, key, { field: code });
}
export const LEGACY_ERROR_CODES = LEGACY_CODES;
