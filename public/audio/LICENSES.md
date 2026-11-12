# Hyperscales — hangfájlok forrása és licence

A /play hangjai a `src/assets/audio/` mappában vannak (a build tartalom-hash-es néven, `/_astro/` alá teszi őket).
Minden fájl két formátumban: Opus (`.ogg`, alap) és AAC (`.m4a`, tartalék a régebbi Safarinak).
Kód: `src/scripts/audio/` · Újragyártás: `scripts/audio/synth.py <kimenet> <elevenlabs_mappa>`, majd ffmpeg
(ogg: libopus 40k mono / 48–80k sztereó; m4a: AAC 56–96k).

| Fájl | Mire szól | Forrás | Licenc | Dátum |
|---|---|---|---|---|
| `hover` | rámutatás a rack egy gépére (nagyon halk tick) | saját szintézis (numpy) | saját, korlátlan | 2026-11-12 |
| `ok` | sikeres toast | saját szintézis | saját | 2026-11-12 |
| `err` | hibás toast | saját szintézis | saját | 2026-11-12 |
| `attention` | „Döntésre vár” sáv megjelenése | saját szintézis | saját | 2026-11-12 |
| `achievement` | achievement feloldva (kis csilingelés) | saját szintézis | saját | 2026-11-12 |
| `era` | korszak feloldva (fanfár) | saját szintézis | saját | 2026-11-12 |
| `lowcash` | alacsony pénz (epizódonként egyszer) | saját szintézis | saját | 2026-11-12 |
| `music` | háttérzene, 72 mp-es varratmentes lo-fi hurok (80 BPM) | saját szintézis | saját | 2026-11-12 |
| `slide` | új gép becsúszik a rackbe | ElevenLabs Sound Effects (Csaba Starter-előfizetése), vágva, normalizálva | ElevenLabs fizetős csomag: kereskedelmi célra is | 2026-11-12 |
| `buy` | vásárlás (fémes reteszkattanás) | ElevenLabs Sound Effects, vágva | mint fent | 2026-11-12 |
| `cash` | pénz be (érmecsörrenés) | ElevenLabs Sound Effects, vágva | mint fent | 2026-11-12 |
| `room_hum` | szerverterem-alapzaj, 8,1 mp-es hurok (vezérlő, Szerverek) | ElevenLabs Sound Effects, szűrve, varratmentes hurokká áttűnve | mint fent | 2026-11-12 |

A Műszak rövid csippanásai (`src/scripts/shift/shift-fx.ts`) futásidőben, WebAudio-val készülnek — nincs hozzájuk fájl.

A `public/audio/ambient.mp3` a nyitóoldal (`/`) régebbi zenéje, ennek a hangkörnek nem része.
