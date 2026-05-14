// src/lib/forum/moderation.ts
// Lightweight content-filter for forum posts. Goal: not a CSAM/abuse
// hardgate (PromNET-side already handles that for cross-brand users) but
// a low-effort spam + obvious-slur filter so a fresh signup can't
// instantly drop a 4chan paste on the leaderboard.
//
// Three layers:
//   1. Length / rate-limit (handled at API layer, not here)
//   2. Bad-word substring match (case-insensitive, fuzzy-tolerant)
//   3. Link spam (more than 2 URLs in a single post → blocked)

const BAD_PATTERNS: readonly RegExp[] = [
  // Slur stubs — kept abstract; the production-grade list is in PromNET.
  // Add words as `\\b` anchored to avoid Scunthorpe-style false positives.
  /\b(n[i1]gg[ea3]r|f[a4]gg[o0]t|r[e3]t[a4]rd|k[i1]ke|tr[a4]nn[i1]e)\b/i,
  // CSAM-adjacent keyword combinations get hard-blocked immediately. The
  // game also has a separate report flow for nuanced cases.
  /\b(cp|csam|lolicon|shotacon)\b/i,
  // Crypto-scam boilerplate
  /\b(send me|pump|airdrop) (eth|btc|sol|usdt)\b/i,
];

export interface ModResult {
  ok: boolean;
  reason?: string;
}

export function moderate(body: string): ModResult {
  if (!body || body.trim().length === 0) {
    return { ok: false, reason: 'A poszt nem lehet üres.' };
  }
  if (body.length > 8000) {
    return { ok: false, reason: 'Túl hosszú. Max 8000 karakter.' };
  }
  const linkMatches = body.match(/https?:\/\/\S+/g) ?? [];
  if (linkMatches.length > 2) {
    return { ok: false, reason: 'Túl sok link. Max 2.' };
  }
  for (const pat of BAD_PATTERNS) {
    if (pat.test(body)) {
      return { ok: false, reason: 'A poszt sértő tartalmat tartalmaz.' };
    }
  }
  return { ok: true };
}
