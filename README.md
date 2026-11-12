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

## Belépés AikaHub-fiókkal (ág: aikahub-auth)

OAuth 2.0 engedélykód + PKCE (S256), `client_id=hyperscales`, scope: `profile achievements` (2026-11-12 óta; a meglévő tagok
a következő belépéskor egyszer újra jóváhagyják). Kód: `src/lib/aikahub.ts`,
`src/pages/auth/aikahub/start.ts`, `src/pages/auth/callback.ts` (törzs nélküli 302, `Referrer-Policy: no-referrer`),
migráció `migrations/0012_aikahub_auth.sql` (`account_links`, `oauth_pending`). Tokent nem tárolunk: a profilt csak
belépéskor olvassuk, a frissítő tokent azonnal visszavonjuk. Az e-mail+jelszavas belépés változatlan.
Összekötés e-mailes fiókhoz: Beállítások → POST `/auth/aikahub/link` (CSRF-token). `src/middleware.ts`: www → apex 301
(a state-süti host-only; www-ről indítva mindig state_mismatch lett volna).
Helyi teszt: `wrangler pages dev dist --port 8788` → http://127.0.0.1:8788 (az AikaHubon regisztrált loopback;
mindig kér jóváhagyó kattintást). A migrációk helyben/prodon: `wrangler d1 execute … --file`, mert a
`wrangler d1 migrations apply` a `0010b_…`-t a `0010_…` elé sorolja és elhasal.

## AikaHub-achievementek (ág: achi-hub, 2026-11-12)

18 achievement (`src/lib/game/achievements.ts`, HU/DE: `src/lib/play/achievements-i18n.ts`); a rejtettek (`refund_king`,
`comeback_kid`) „???”-ként látszanak, amíg nincsenek meg. A Hub-definíció: `/mnt/ssd/claude-tmp/achievements/hyperscales.js`
(claude-3 viszi be). Hub-továbbítás: `src/lib/aikahub-achi.ts` — szerver→szerver, `Authorization: Basic
base64("hyperscales:<AIKAHUB_CLIENT_KEY>")`, a pairwise `sub`-ra; Hub-id = `hyperscales:` + id aláhúzás→kötőjel.
- Feloldás: Pages-végpontok (achievements, server, upgrade, events resolve) + `ShiftRoomDO` (műszak vége) + a tick vége
  (`src/lib/game/achievement-tick.ts`, cron és lazy-tick). Új feloldás → azonnali küldés (waitUntil); belépéskor a meglévők
  visszamenőleg (idempotens).
- Retry-sor séma-módosítás nélkül, az `audit_log`-ban (`aikahub_achi_sync` kész / `aikahub_achi_try` próbálkozás /
  `aikahub_scope` hatókör). A navtycoon-do 5 perces cronja (`retryPendingHubSync`) ritkulva próbálja újra (5 perc → max. 1 nap,
  legfeljebb 30 napig). Végleg eldobva csak 409 not_linked és 403 insufficient_scope; a 404 (definíció még nincs fent), 401, 5xx,
  időtúllépés (5 mp) újrapróbálandó.
- Csak `achievements` hatókörrel küld (a userinfo `scope` mezője a belépéskor). Kulcs nélkül csendben kihagy.
- Titok mindkét helyen kell (Csaba szkriptje): Pages-titok `AIKAHUB_CLIENT_KEY`, és a worker-titok
  `npx wrangler secret put AIKAHUB_CLIENT_KEY -c wrangler.do.toml` (navtycoon-do). A worker kódja is változott → újratelepítés.
- `survived_first_ddos`: a lezáráskori ügyfélszámot az esemény menti, a következő tick dönt (≤10% esés). `comeback_kid`:
  mélypont (pénz < max($100, 7 napi kiadás)) naponta egyszer az `audit_log`-ba (`cash_low_point`), 30 napon belül 2× MRR.
- Jogosultságok: `fetchHubEntitlements` / `hasEntitlement` (GET /oauth/entitlements, 10 perc gyorsítótár).
- TODO: a kozmetikai jogosultságok hatása még nincs bekötve: `rack_skin_colo` (3D rack colo-ketrec kinézet), `rack_led_theme`
  (választható LED-színséma), `company_banner` (egyedi cégszín a ranglistán).
- TODO: a /play `achievementMap` (toastokhoz) a rejtett achievementek nevét is a kliensnek adja (enyhe spoiler a forrásban).

## UX 2. fázis (ág: ux-2, 2026-11-11)

- **Műszak 2.0** (`src/pages/play/shift.astro`, `src/scripts/shift/`, `src/styles/shift.css`): konzol-dizájn,
  30 perces visszaszámláló, élő elégedettség-sávok, lebegő +$/hangulat jelzések, „gépel…” jelzés, gombállapotok,
  záróképernyő 1–3 csillaggal (`src/lib/game/shift-score.ts`), opcionális hangok (alapból KI), mobilon vízszintes
  ügyfél-sáv. A futó műszak újratöltés után folytatható.
- **ShiftRoomDO**: `end_shift` üzenet, DO-alarm a lejáratkor, a megoldatlan ticketek visszakerülnek `open`-be,
  a lejárt műszak is bekerül a `shift_history`-ba. → **a navtycoon-do workert újra kell telepíteni** (a régi DO
  az új kliens `end_shift` üzenetére nem válaszol, a visszaszámláló végén nem zárna).
- **3D rack** (`src/scripts/rack3d/`, `src/lib/play/rack-model.ts`): three.js 0.187.0, csak dinamikus importtal;
  2D tartalék mobilon, `prefers-reduced-motion` mellett, WebGL / erős gép nélkül. `?rack3d=1` kényszeríti,
  `?rack3d=debug` fps-kijelzővel.
- Migráció nincs. A fióktörlés a fórum-, piactér-, műszak-történet- és audit-sorokat is törli.
- A konzol-CSS (`src/styles/template.css`, `src/styles/play-shell.css`) `?url`-importtal, tartalom-hash-es
  `/_astro/…` URL-en megy ki (ux-3): a CSS-változás azonnal látszik, a `public/_headers` az `/_astro/*`-ot
  „immutable"-ként gyorsítótárazza.
- Webfontok saját kiszolgálásban (ux-3, GDPR): `src/styles/fonts.css` + `src/assets/fonts/` (Inter, Space Grotesk,
  JetBrains Mono, @fontsource 5.3.0, latin + latin-ext, csak a használt súlyok; licenc: SIL OFL 1.1). Google Fonts-kérés nincs.
- TODO: a `public/js/play-shell.js` még a CF alapérték szerinti 4 órás cache-sel megy ki (a CSS-hez hasonlóan verziózható).
- TODO: a landing (`/`) a gsap / lenis / canvas-confetti könyvtárat a jsdelivr CDN-ről tölti (harmadik fél, GDPR) —
  a `canvas-confetti` már npm-függőség, a többi is helyben kiszolgálható.

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

## Hangok (ág: hangok, 2026-11-12)

Közös hangmotor minden /play oldalon: `src/scripts/audio/` (`engine.ts` logika, `settings.ts` beállítások, `boot.ts` oldal-szintű
jelzések, `ui.ts` vezérlők), betöltés: `src/components/PlayAudio.astro`. Három csatorna: effektek (70%), szerverterem-alapzaj (35%,
csak vezérlő + Szerverek), zene (25%); fő némítás. Beállítás: localStorage `hs_audio`; a régi Műszak-kapcsoló (`hs_sound`='0')
némítva marad. Vezérlő: a felső sáv hangszóró-gombja (1 kattintás = némítás) + lenyíló, és a Beállítások „Hang” kártyája
(`src/lib/play/sound-ui.ts`). Az alapzaj és a zene csak az első interakció után indul (beúszik), a fájlok is csak akkor töltődnek;
rejtett lapon elhalkul és szünetel. Kliensből: `window.hsSfx('ok' | 'err' | 'cash' | 'buy' | …)`. Fájlok és licencük:
`public/audio/LICENSES.md`.
