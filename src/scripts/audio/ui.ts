// src/scripts/audio/ui.ts — a hangvezérlők bekötése: minden [data-snd-ui] blokk (felső sáv lenyílója, Beállítások).
//  [data-snd-mute]        → fő némítás be/ki (aria-pressed = némítva)
//  input[data-snd-ch=...] → csatorna-hangerő 0–100
//  [data-snd-more]        → a lenyíló nyitása (a felső sávban)
// A szövegek szerveroldalon, a játékos nyelvén készülnek (data-label-mute / data-label-unmute).
import type { AudioEngine } from './engine';
import type { AudioSettings, Channel } from './settings';

export function wireSoundUi(eng: AudioEngine, root: ParentNode = document): void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-snd-ui]'));
  if (blocks.length === 0) return;
  const paint = (s: AudioSettings) => {
    for (const b of blocks) {
      b.classList.toggle('is-muted', !s.on);
      b.querySelectorAll<HTMLElement>('[data-snd-mute]').forEach((m) => {
        m.setAttribute('aria-pressed', s.on ? 'false' : 'true');
        const lbl = m.getAttribute(s.on ? 'data-label-mute' : 'data-label-unmute');
        if (lbl) { m.setAttribute('aria-label', lbl); m.title = lbl; const t = m.querySelector('[data-snd-label]'); if (t) t.textContent = lbl; }
      });
      b.querySelectorAll<HTMLInputElement>('input[data-snd-ch]').forEach((inp) => {
        const ch = inp.dataset.sndCh as Channel;
        const v = Math.round(s[ch] * 100);
        if (document.activeElement !== inp) inp.value = String(v);
        inp.style.setProperty('--v', v + '%');
        const out = inp.parentElement?.querySelector('output');
        if (out) out.textContent = v + '%';
      });
    }
  };
  for (const b of blocks) {
    b.querySelectorAll<HTMLElement>('[data-snd-mute]').forEach((m) => m.addEventListener('click', () => {
      eng.unlock();
      eng.toggle();
      if (eng.settings.on) eng.play('ok');
    }));
    b.querySelectorAll<HTMLInputElement>('input[data-snd-ch]').forEach((inp) => {
      const ch = inp.dataset.sndCh as Channel;
      inp.addEventListener('input', () => {
        eng.unlock();
        const patch: Partial<AudioSettings> = { [ch]: parseInt(inp.value, 10) / 100 };
        if (!eng.settings.on && parseInt(inp.value, 10) > 0) patch.on = true; // csúszka felhúzása = hang vissza
        eng.update(patch);
      });
      if (ch === 'sfx') inp.addEventListener('change', () => eng.play('ok'));
    });
    const more = b.querySelector<HTMLButtonElement>('[data-snd-more]');
    const pop = b.querySelector<HTMLElement>('.snd-pop');
    if (more && pop) {
      const setOpen = (open: boolean) => {
        pop.hidden = !open;
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
        b.classList.toggle('is-open', open);
      };
      more.addEventListener('click', (e) => { e.stopPropagation(); setOpen(pop.hidden); });
      document.addEventListener('click', (e) => { if (!pop.hidden && !b.contains(e.target as Node)) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { setOpen(false); more.focus(); } });
    }
  }
  paint(eng.settings);
  eng.subscribe(paint);
}
