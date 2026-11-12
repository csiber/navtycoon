// src/scripts/audio/boot.ts — minden /play oldalon fut (src/components/PlayAudio.astro).
// Feloldás az első interakcióra, láthatóság, vezérlők, és az oldal-szintű jelzések: alapzaj (vezérlő, Szerverek),
// zene (minden /play oldal), „Döntésre vár" sáv, korszak-feloldás, alacsony pénz (epizódonként egyszer), 2D rack.
import { getAudio } from './audio';
import { wireSoundUi } from './ui';
import type { SoundName } from './engine';

const UNLOCK_KEY = 'hs_audio_unlocked';
const LOWCASH_KEY = 'hs_lowcash_warned';
const EVENTS_KEY = 'hs_ev_seen';

function store(kind: 'local' | 'session'): Storage | null {
  try { return kind === 'local' ? localStorage : sessionStorage; } catch { return null; }
}

const eng = getAudio();
const path = location.pathname.replace(/\/+$/, '') || '/';
const ambPage = path === '/play' || path === '/play/servers';
eng.setLoops({ amb: ambPage ? 'room_hum' : null, music: 'music' });

// ─── Feloldás ───
const PRELOAD: SoundName[] = ['ok', 'err', 'hover', 'cash', 'buy'];
// „A hang az első kattintással indul" — csak amíg valóban vár a hang.
const hideHint = () => document.querySelectorAll<HTMLElement>('.snd-hint').forEach((h) => { h.hidden = true; });
function onGesture(e: Event) {
  if (e.type === 'keydown' && ((e as KeyboardEvent).key === 'Tab' || (e as KeyboardEvent).key === 'Escape')) return;
  const was = eng.unlocked;
  eng.unlock();
  if (eng.unlocked && !was) {
    store('session')?.setItem(UNLOCK_KEY, '1');
    eng.preload(PRELOAD);
    hideHint();
  }
  if (eng.unlocked) for (const t of ['pointerdown', 'keydown', 'touchend'] as const) removeEventListener(t, onGesture, true);
}
for (const t of ['pointerdown', 'keydown', 'touchend'] as const) addEventListener(t, onGesture, { capture: true, passive: true });
// A munkamenetben már volt interakció: ha a böngésző engedi, kattintás nélkül is szól (különben az első kattintásra).
if (store('session')?.getItem(UNLOCK_KEY) === '1') {
  eng.tryResumeWithoutGesture();
  // A resume() aszinkron: kicsit később nézzük meg, sikerült-e.
  setTimeout(() => { if (eng.unlocked) { eng.preload(PRELOAD); hideHint(); } }, 400);
}

// ─── Láthatóság, lapelhagyás ───
eng.setHidden(document.hidden);
document.addEventListener('visibilitychange', () => eng.setHidden(document.hidden));
addEventListener('pagehide', () => eng.persist());

// ─── Vezérlők ───
wireSoundUi(eng);

// ─── Oldal-szintű jelzések ───
// Alacsony pénz: a figyelmeztetés-sáv megjelenésekor egyszer; újra csak akkor, ha közben rendbejött.
const ls = store('local');
if (document.querySelector('.cash-warn')) {
  if (ls?.getItem(LOWCASH_KEY) !== '1') { eng.play('lowcash'); ls?.setItem(LOWCASH_KEY, '1'); }
} else if (document.querySelector('[data-cash-cents]')) {
  ls?.removeItem(LOWCASH_KEY);
}

// „Döntésre vár": csak ha van benne olyan esemény, amit ebben a munkamenetben még nem jeleztünk.
const evIds = Array.from(document.querySelectorAll<HTMLElement>('#events-strip [data-event-id]')).map((e) => e.dataset.eventId || '');
if (evIds.length) {
  const ss = store('session');
  const seen = new Set((ss?.getItem(EVENTS_KEY) || '').split(',').filter(Boolean));
  if (evIds.some((id) => !seen.has(id))) eng.play('attention');
  ss?.setItem(EVENTS_KEY, Array.from(new Set([...seen, ...evIds])).slice(-50).join(','));
}

// Korszak feloldva (a vezérlő ünnepi ablaka).
if (document.getElementById('era-unlock-modal')) eng.play('era');

// 2D rack: nagyon halk tick rámutatáskor (csak egérrel — érintésnél nincs rámutatás).
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('.rack-vis [data-srv], .rack-body .u:not(.empty)').forEach((row) => {
    row.addEventListener('pointerenter', () => eng.play('hover'));
  });
}
