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

## Állapot (2026-11-13) — lezárva

A projekt 2026-11-13-án lezárva: a játék végigjátszható — 4 korszak (1. LAMP/garázs, 2. Colo, 3. VPS/felhő,
4. Dedikált/edge + nagyvállalat) és a végcél (`/play/finale`), 23 achievement. A kezdőlap (`/`) ugyanezt mutatja
(4 korszak + végcél, a Csapat él; GPU-t, áramszámlát és hasonló, a játékban nem létező dolgot nem ígér).
Tesztek: CT120, `npx vitest run`.
A `@hyperscales.app` címekre (hello/privacy/legal/abuse) érkező levelek továbbítva (Cloudflare Email Routing),
a 15 árva `players`-sor (a PromNET-korszak törölt fiókjai) törölve.

### Nyitott pontok

- TODO: a végjáték-achievementek (+5) Hub-definíciója és ikonjai (Csaba / claude-3); addig a retry-sor tartja őket.
- TODO: az alkalmi játékos (napi egy műszak, fejlesztés nélkül) a 3. korszakban elakad — ha ő is célba érjen,
  a ticket-kapacitáson kell lazítani.
- TODO: a kozmetikai Hub-jogosultságok (`rack_skin_colo`, `rack_led_theme`, `company_banner`) hatása nincs bekötve.
- TODO: a /play `achievementMap` (toastokhoz) a rejtett achievementek nevét is a kliensnek adja (enyhe spoiler).
- TODO: a `public/js/play-shell.js` a CF alapérték szerinti 4 órás cache-sel megy ki (nem verziózott).
- TODO: a landing a gsap / lenis / canvas-confetti könyvtárat a jsdelivr CDN-ről tölti (harmadik fél, GDPR).
- TODO: saját Pro-forrás (most nincs Pro).

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

## Végjáték (ág: vegjatek, 2026-11-13) — a játék végigjátszható

- **Végcél** (`src/lib/game/endgame.ts`, `GOAL`): 4. korszak · $15 000 MRR (a nagy ügyfelek díja nélkül, mint a
  korszakoknál) · 90 hírnév · 2 felhőrégió · 3 edge POP · 1 élő nagyvállalati szerződés. Végig látszik: oldalsáv
  (végcél-doboz minden oldalon) és a vezérlő korszak-paneljén (mobilon is). Részletek és záróképernyő: `/play/finale`.
- **Befejezés**: a tick (8.5. lépés) egyszer feljegyzi egy lezárt `game_completed` eseménysorban (`data_json.days`), a
  csúcs-MRR félnaponta az `audit_log`-ba (`mrr_peak`). **Migráció nincs.** Utána a játék megy tovább (sandbox); a
  „Vállalat újraindítása” (Beállítások, `#restart`) az eseményekkel a befejezést és a csúcs-MRR-t is törli.
- **Záróképernyő** (`src/lib/play/finale-page.ts`, `src/pages/play/finale.astro`): gratuláció, a cég számokban
  (alapítás, célba érés napja, csúcs-MRR, ügyfelek, műszakok, ticketek, csapat, gépek, achievementek), stáblista,
  megosztható szöveg (vágólap / natív megosztás) és 1200×630-as PNG (canvas, külső könyvtár nélkül), a nyilvános
  profilra (`/u/<id>`) mutató linkkel. Ranglista és nyilvános profil: „X nap alatt befejezte” + a leggyorsabb befejezők.
- **3. korszak**: felhőrégió (`cloud_region`: 400 hely, $450/hó, $3000, legalább 1 Gbites tranzit — az API is
  ellenőrzi), 10 Gbites tranzit ($400/hó, 2000 egység), 3 fejlesztés (`autoscaling`, `object_storage`, `ai_triage`).
- **4. korszak**: edge POP (`edge_pop`: 120 hely, $250/hó, $2500, +250 sávszélesség — `network.ts edge_units`),
  3 fejlesztés (`anycast_dns`, `green_ppa`, `premium_support`), csapat 6 → 8 fő, **nagyvállalati szerződés**:
  `plan_tier = 'enterprise'` egy szabad dedikált gépen, ugyanazokkal a gondozási szabályokkal, mint a dedikált ügyfél
  (SLA, ticketek, távozás), de $1200–$2000/hó; csak 75+ hírnévvel, 1 felhőrégióval és 2 edge POP-pal jön
  (`dedicated.ts enterpriseEligible`). Az események a `dedicated_signed/lost` sorokat használják (`enterprise: true`).
- **Tempó** (szimulátor, `__tests__/economy-sim-endgame.test.ts`, 365 nap): beszerzési szorzó 3. korszak ×2 → ×4,
  4. ×3 → ×5; a 4. korszak MRR-feltétele $10 000 → $8000. Az 1–2. korszak és így a 3. korszak elérése változatlan.
  6 seed, 365 nap — aktív: 4. korszak a 92–175. napon, célba a 137–233. napon (medián ~150, ≈ 5 hónap); dedikált
  profil: célba 126–178 (medián ~165); alkalmi (napi egy műszak, fejlesztés nélkül): a 3. korszakban ~100–130 ügyfélnél
  megáll → soha; csapat nélkül: ~$5,5k MRR-nél megáll → soha; tétlen és „soha nem vesz”: soha. A célba érés után az
  MRR ~$21k körül beáll (a ticket-kapacitás a plafon) — onnan sandbox. A szimulátor a hosszú futásokhoz
  gyorsítótárazott darabszámokkal fut (bitre azonos eredmény).
- **Achievementek** (+5, összesen 23): `first_cloud_region`, `first_edge_pop`, `enterprise_contract`, `hyperscaled`,
  rejtett `speedrun_hyperscaler` (≤ 140 nap; 2026-11-13-ig 120 volt, de a szimulátorban egy seed
  sem ért be 120 alatt, a leggyorsabb 126 nap). A Hub-definíciót claude-3 tölti be; addig a retry-sor tartja őket.
- A tick, a műszak és a DO is változott → **a `navtycoon-do` workert újra kell telepíteni.**

## Csapat és Hálózat (ág: csapat-halozat, 2026-11-12)

Mindkettő a 2. korszaktól. A szabályok egy helyen: `src/lib/game/staff.ts`, `src/lib/game/network.ts`, a számok az
`economy.ts`-ben (`STAFF_RULE_V3`, `NETWORK_RULE_V3`); a tick, a szimulátor és a felület ugyanazt hívja.
- **Csapat** (max. 3 fő a 2., 6 a 3. korszaktól): ügyfélszolgálatos (félnaponta megold néhány ticketet, gyengébben, mint a
  műszak), SRE (kevesebb ticket, elmaradó hardver-/hálózati incidensek), értékesítő (+új ügyfél). Szint a munkanapokból
  (emeléssel), hangulat (túlterhelés, tartozás, kevés pénz) → gyengébb munka / csapatdráma / felmondás. Naponta 3 jelölt,
  MI nélkül (determinisztikus). Felvételi díj: fél havi bér. API: `POST /api/game/staff`.
- **Hálózat**: tranzit-csomag (sávszélesség; kevés → lassulás, több ticket, −elégedettség), peering, DDoS-védelem.
  API: `POST /api/game/network`.
- A bér és a hálózati díj a szerver-havidíjjal együtt fogy; a tartozás-határnál előbb a legkevésbé hasznos ember megy,
  aztán a DDoS-védelem, csak utána a gép. A `staff_drama` csak csapattal jön, és egy valódi munkatársról szól.
- **Migráció: `migrations/0013_staff_network.sql`** (`staff`, `player_network`; additív). A kód a migráció előtt is fut:
  üres csapat, alap-hálózat, az API `feature_not_ready` hibát ad. Futtatás: `wrangler d1 execute navtycoon-prod --remote --file migrations/0013_staff_network.sql`.
- A tick változott → a `navtycoon-do` worker is újratelepítendő (a cron onnan tickel).
- Szimulátor: új profilok `no_staff`, `overhire_staff`; az `active` jó csapatot épít. Teszt: `__tests__/economy-sim.test.ts`.
- **Utókör (ág: csapat-utokor, 2026-11-12)**:
  - `recruit_ad` a 2. korszaktól valódi munkatárs (`src/lib/game/recruit.ts`): tapasztalt SRE (2. szint), felvételi díj
    nélkül, a szokásos bérrel; teli csapatnál a felvétel tiltott, a felirat megmondja, miért. Az 1. korszakban a régi
    esemény marad (a szimulátorban a kivétele az alkalmi játékos 2. korszakát 24 → 33 napra tolta), a felirata a valódi hatást mondja.
  - Piactér: a peering kategóriájú, `enable_peering` hatású NPC-hirdetés bekapcsolja a peeringet: a hirdetés ára az
    egyszeri díj, a havidíj kedvezményes (a payload `monthly_cents`). Csak a 2. korszaktól, 100 Mbites tranzittal, ha még
    nincs peering; a hirdetés elkel. Migráció nélkül: `player_network.peering` 0/1/≥2 (≥2 = a piactéri havidíj centben).
    **Az új hirdetéseket élesítés után be kell tölteni:** `POST /api/admin/seed-marketplace` (admin, idempotens).
  - `competitor_buyout` „take the money": $25 000 → $6000 (a szimulátorban a pénz e fölött már nem gyorsít, csak felhalmozódik).

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

## Állapot (2026-11-11)

- Átvizsgálás + javítás: „Mentés törlése" utáni végtelen átirányítás (a /play most újra létrehozza a kezdőállást),
  tárolt XSS a `<script type="application/json">` blokkokban (cégnév a ranglistán), nyitott átirányítás /
  `javascript:` a `/login?next=`-ben, e-mail-alapú admin-jog (`+admin` / tulaj-cím ellenőrzés nélkül) → `ADMIN_USER_IDS`,
  a `legacy_accounts` automatikus visszakötése kikapcsolva, a műszak WebSocket tulajdonos-ellenőrzése,
  a kivezetés alatt álló `llama-3.1-8b-instruct-fast` tartalékmodell cseréje, NPC-k a cron-tickben,
  napi AI-keret 5 → 30 (az első műszakra sem volt elég), mobil landing (vízszintes görgetés, egymásra csúszó gombok),
  valótlan landing-szövegek („no signup", „saves locally", „bring your own LLM key").

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

## Hangok (ág: hangok, 2026-11-12)

Közös hangmotor minden /play oldalon: `src/scripts/audio/` (`engine.ts` logika, `settings.ts` beállítások, `boot.ts` oldal-szintű
jelzések, `ui.ts` vezérlők), betöltés: `src/components/PlayAudio.astro`. Három csatorna: effektek (70%), szerverterem-alapzaj (35%,
csak vezérlő + Szerverek), zene (25%); fő némítás. Beállítás: localStorage `hs_audio`; a régi Műszak-kapcsoló (`hs_sound`='0')
némítva marad. Vezérlő: a felső sáv hangszóró-gombja (1 kattintás = némítás) + lenyíló, és a Beállítások „Hang” kártyája
(`src/lib/play/sound-ui.ts`). Az alapzaj és a zene csak az első interakció után indul (beúszik), a fájlok is csak akkor töltődnek;
rejtett lapon elhalkul és szünetel. Kliensből: `window.hsSfx('ok' | 'err' | 'cash' | 'buy' | …)`. Fájlok és licencük:
`public/audio/LICENSES.md`.
