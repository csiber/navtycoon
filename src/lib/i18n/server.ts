// src/lib/i18n/server.ts
// Shared server-side locale resolver used by every /play/*.astro page
// that has to render NPC content in the viewer's language.
//
// Priority order:
//   1) ?lang=hu|de|en URL param (explicit override, used by the shift
//      iframe modal and any link-with-locale-hint)
//   2) hs_lang cookie (mirrors the client-side localStorage choice; set
//      by I18nDashboard's bootstrap script on every page load)
//   3) players.preferred_lang (DB row, set at signup and updated by the
//      Settings page or by the auto-sync POST when the cookie diverges)
//   4) Accept-Language request header
//   5) 'en' fallback
//
// All callers pass Astro's request — keep the signature small so it's
// trivial to drop into a frontmatter.

import type { D1Database } from '@cloudflare/workers-types/experimental';

export type Locale = 'en' | 'hu' | 'de';
const SUPPORTED: readonly Locale[] = ['en', 'hu', 'de'] as const;

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (SUPPORTED as readonly string[]).includes(v);
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export interface ResolveLocaleArgs {
  request: Request;
  /** D1 binding; only consulted if userId is provided. */
  db?: D1Database | null;
  /** Player user_id (from getCurrentUser). */
  userId?: string;
}

export async function resolveLocale(args: ResolveLocaleArgs): Promise<Locale> {
  const url = new URL(args.request.url);
  const q = url.searchParams.get('lang');
  if (isLocale(q)) return q;

  const cookieLang = readCookie(args.request, 'hs_lang');
  if (isLocale(cookieLang)) return cookieLang;

  if (args.db && args.userId) {
    try {
      const row = await args.db
        .prepare('SELECT preferred_lang FROM players WHERE user_id = ? LIMIT 1')
        .bind(args.userId)
        .first<{ preferred_lang?: string }>();
      const pl = row?.preferred_lang;
      if (isLocale(pl)) return pl;
    } catch { /* DB miss, fall through */ }
  }

  const al = args.request.headers.get('accept-language') ?? '';
  const first = al.split(',')[0]?.slice(0, 2).toLowerCase();
  if (isLocale(first)) return first;

  return 'en';
}
