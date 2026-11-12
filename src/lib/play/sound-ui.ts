// src/lib/play/sound-ui.ts — a hangvezérlő HTML-je (szerveroldalon, a játékos nyelvén). A kliens-oldali bekötés:
// src/scripts/audio/ui.ts. Két változat: 'top' (hangszóró-gomb + lenyíló a felső sávban), 'panel' (Beállítások).
import { pt, type PlayLocale } from './strings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Hangszóró-ikon: hullámokkal (szól) és áthúzva (néma) — a .is-muted osztály vált köztük. */
export const SPEAKER_SVG = `<svg class="snd-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><g class="snd-waves" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.8a7.4 7.4 0 0 1 0 10.4"/></g><g class="snd-x" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M16 9.5l5 5M21 9.5l-5 5"/></g></svg>`;

function sliders(L: PlayLocale, idp: string): string {
  return (['sfx', 'amb', 'music'] as const).map((ch) => {
    const id = `${idp}-${ch}`;
    return `<div class="snd-row"><label for="${id}">${esc(pt(L, `snd.${ch}`))}</label><input id="${id}" type="range" min="0" max="100" step="5" data-snd-ch="${ch}" /><output for="${id}"></output></div>`;
  }).join('');
}

export function renderSoundControl(L: PlayLocale, variant: 'top' | 'panel'): string {
  const mute = esc(pt(L, 'snd.mute'));
  const unmute = esc(pt(L, 'snd.unmute'));
  if (variant === 'panel') {
    return `<div class="snd snd-panel" data-snd-ui>
        <button type="button" class="btn snd-btn-wide" data-snd-mute aria-pressed="false" data-label-mute="${mute}" data-label-unmute="${unmute}">${SPEAKER_SVG}<span data-snd-label>${mute}</span></button>
        ${sliders(L, 'snd-set')}
        <p class="set-help">${esc(pt(L, 'snd.set_help'))}</p>
      </div>`;
  }
  return `<div class="snd snd-top" data-snd-ui>
      <button type="button" class="snd-btn" data-snd-mute aria-pressed="false" data-label-mute="${mute}" data-label-unmute="${unmute}" aria-label="${mute}" title="${mute}">${SPEAKER_SVG}</button>
      <button type="button" class="snd-more" data-snd-more aria-expanded="false" aria-controls="snd-pop" aria-label="${esc(pt(L, 'snd.settings'))}" title="${esc(pt(L, 'snd.settings'))}"><svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="snd-pop" id="snd-pop" role="group" aria-label="${esc(pt(L, 'snd.settings'))}" hidden>
        <div class="snd-head"><b>${esc(pt(L, 'snd.title'))}</b><button type="button" class="snd-btn sm" data-snd-mute aria-pressed="false" data-label-mute="${mute}" data-label-unmute="${unmute}" aria-label="${mute}" title="${mute}">${SPEAKER_SVG}</button></div>
        ${sliders(L, 'snd-top')}
        <p class="snd-hint">${esc(pt(L, 'snd.hint'))}</p>
      </div>
    </div>`;
}
