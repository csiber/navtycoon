# Hyperscales

> Hosting-tycoon játék AI-ügyfelekkel. Browser-first, Cloudflare-natív.

🌐 https://hyperscaler.game (coming soon)

## Stack
Astro 5 · Cloudflare Pages + Workers + D1 + Cron · Workers AI (Llama-3.3-70b) · Vectorize

## Status
Phase 1 MVP development.

## Állapot (2026-10-06)

- **AI-ügyfelek újra élnek.** A CF 2026-05-30-án kivezette a `@cf/meta/llama-3.1-8b-instruct`-ot (5028-as hiba),
  azóta minden jegy és válasz csendben a sablonszövegre esett vissza. Most: `llama-3.3-70b-instruct-fp8-fast`,
  tartalék a `llama-3.1-8b-instruct-fast` (`CHAT_MODELS`, src/lib/ai/workers-ai.ts); a hiba a logba megy
  (navtycoon-do: observability bekapcsolva). A navtycoon-do workert kézzel kell telepíteni:
  `wrangler deploy -c wrangler.do.toml` (amd64-en); a Pages a git-pushból buildel.

- **Független a PromNET-től.** A belépés a saját D1 (`navtycoon-prod`) `users`/`sessions` tábláiban él
  (migrations/0011_own_auth.sql); a `PROMNET_DB` binding, a PromNET-SSO (promnet-bridge/-callback) és a
  PromNET-előfizetésből jövő Pro-státusz megszűnt. A régi játékosok e-mail-címe a `legacy_accounts` táblában:
  ugyanazzal az e-mail-címmel regisztrálva a régi user_id-t és a játékállást kapják vissza (jelszót nem vittünk át).
- A fióktörlés most a `users`/`sessions`/`legacy_accounts` sort is törli.
- A tesztek (`npm test`) a Pi-n nem futnak (a workerd/Miniflare jemalloc-gond miatt lefagy) — amd64-en (CT120) mind zöld.
- TODO: saját Pro-forrás (most nincs Pro); a `legacy_accounts` e-mail-ellenőrzés nélkül köti vissza a régi fiókot.
