# Hyperscales

> Hosting-tycoon játék AI-ügyfelekkel. Browser-first, Cloudflare-natív.

🌐 https://hyperscales.app (nyílt béta, ingyenes)

## Stack
Astro 5 · Cloudflare Pages + Workers + D1 + Cron · Workers AI (Llama-3.3-70b → Llama-4-Scout → Mistral-Small-3.1) · Vectorize

## Telepítés
- **Weboldal (Pages):** push a `main`-re → a CF Pages git-buildből telepít.
- **navtycoon-do worker** (cron-tick 5 percenként + ShiftRoomDO): kézzel, amd64-en (CT120):
  `wrangler deploy -c wrangler.do.toml`. A `src/do-worker-entry.ts`, `src/durable-objects/`, `src/lib/game/`
  vagy `src/lib/ai/` változása után kell.
- **Tesztek:** `npm ci && npx vitest run` — csak amd64-en (a Pi-n a Miniflare lefagy).
- **Admin** (force-tick, seed-végpontok): Pages környezeti változó `ADMIN_USER_IDS` (vesszővel elválasztott
  `users.id`-k). Nincs beállítva → senki sem admin.

## Állapot (2026-11-11)

- Átvizsgálás + javítás: „Mentés törlése" utáni végtelen átirányítás (a /play most újra létrehozza a kezdőállást),
  tárolt XSS a `<script type="application/json">` blokkokban (cégnév a ranglistán), nyitott átirányítás /
  `javascript:` a `/login?next=`-ben, e-mail-alapú admin-jog (`+admin` / tulaj-cím ellenőrzés nélkül) → `ADMIN_USER_IDS`,
  a `legacy_accounts` automatikus visszakötése kikapcsolva, a műszak WebSocket tulajdonos-ellenőrzése,
  a kivezetés alatt álló `llama-3.1-8b-instruct-fast` tartalékmodell cseréje, NPC-k a cron-tickben,
  napi AI-keret 5 → 30 (az első műszakra sem volt elég), mobil landing (vízszintes görgetés, egymásra csúszó gombok),
  valótlan landing-szövegek („no signup", „saves locally", „bring your own LLM key").
- TODO: a `@hyperscales.app` címeknek (hello/privacy/legal/abuse) nincs MX-rekordja — a jogi oldalak kapcsolati címei
  nem kézbesíthetők; CF Email Routing kell.
- TODO: 15 árva `players`-sor (a PromNET-korszak törölt fiókjai) még a ranglistán; törlésük prod-írás, Csaba döntése.

## Állapot (2026-10-06)

- **AI-ügyfelek újra élnek.** A CF 2026-05-30-án kivezette a `@cf/meta/llama-3.1-8b-instruct`-ot (5028-as hiba),
  azóta minden jegy és válasz csendben a sablonszövegre esett vissza. Most: `llama-3.3-70b-instruct-fp8-fast`,
  tartalék a `llama-3.1-8b-instruct-fast` (`CHAT_MODELS`, src/lib/ai/workers-ai.ts); a hiba a logba megy
  (navtycoon-do: observability bekapcsolva). A navtycoon-do workert kézzel kell telepíteni:
  `wrangler deploy -c wrangler.do.toml` (amd64-en); a Pages a git-pushból buildel.

- **Független a PromNET-től.** A belépés a saját D1 (`navtycoon-prod`) `users`/`sessions` tábláiban él
  (migrations/0011_own_auth.sql); a `PROMNET_DB` binding, a PromNET-SSO (promnet-bridge/-callback) és a
  PromNET-előfizetésből jövő Pro-státusz megszűnt. A régi játékosok e-mail-címe a `legacy_accounts` táblában:
  2026-11-11 óta NEM kötjük vissza automatikusan (e-mail-ellenőrzés nélkül fiókátvétel lett volna); csak kézzel.
- A fióktörlés most a `users`/`sessions`/`legacy_accounts` sort is törli.
- A tesztek (`npm test`) a Pi-n nem futnak (a workerd/Miniflare jemalloc-gond miatt lefagy) — amd64-en (CT120) mind zöld.
- TODO: saját Pro-forrás (most nincs Pro).
