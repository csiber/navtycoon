// src/lib/play/settings-page.ts
// Hyperscales — a /play/settings tartalma szerveroldalon, a játékos nyelvén (2026-11-11).
//
// Hiba volt: a kliens a gombokat a FELIRATUK alapján kötötte be (/Reset save|Mentés törlése/,
// /Delete account|Fiók törlése/), és a mezőket is felirat szerint hagyta meg — németül („Konto löschen")
// így a fióktörlés gomb semmit sem csinált, a „Mentés törlése" mező pedig eltűnt. Most minden művelet
// `data-action` attribútummal kötődik (reset-save, delete-account, save-profile), nyelvtől függetlenül.

import { esc, usd, type ShellData } from './shell';
import { pt, type PlayLocale } from './strings';
import { renderSoundControl } from './sound-ui';

export interface SettingsData {
  shell: ShellData;
  displayName: string;
  emailLabel: string;
  city: string | null;
  preferredLang: PlayLocale;
  isPro: boolean;
  proUntil: string | null;
  llmUsed: number;
  llmCap: number;
  shiftsToday: number;
  freeCap: number;
  proCap: number;
  aikahub: { nickname: string; avatar_url: string | null; profile_url: string | null } | null;
  aikahubCsrf: string;
  aikahubError: string | null;
}

/** A kliens ezeket a data-action értékeket köti be — a teszt is ezt ellenőrzi. */
export const SETTINGS_ACTIONS = ['save-profile', 'reset-save', 'delete-account'] as const;

export function renderSettingsContent(d: SettingsData): string {
  const s = d.shell;
  const L = s.locale;
  const langBtn = (code: PlayLocale, label: string) =>
    `<button type="button" class="lang-pick${d.preferredLang === code ? ' on' : ''}" data-lang="${code}" aria-pressed="${d.preferredLang === code}">${label}</button>`;
  const ahErr = d.aikahubError === 'already_linked' ? pt(L, 'set.ah.err_already')
    : d.aikahubError === 'signed_in' ? pt(L, 'set.ah.err_signed_in')
    : d.aikahubError === 'link_conflict' ? pt(L, 'set.ah.err_conflict') : '';
  const aikahub = d.aikahub
    ? `<p class="set-ah">${d.aikahub.avatar_url ? `<img src="${esc(d.aikahub.avatar_url)}" alt="" width="32" height="32" referrerpolicy="no-referrer" />` : ''}<span>✓ <b>${esc(d.aikahub.nickname)}</b>${d.aikahub.profile_url ? ` · <a href="${esc(d.aikahub.profile_url)}" target="_blank" rel="noopener">aikahub.com</a>` : ''}</span></p>`
    : `<p class="set-help">${esc(pt(L, 'set.ah.link_help'))}</p>
       <form method="post" action="/auth/aikahub/link" class="set-ah-form">
         <input type="hidden" name="csrf" value="${esc(d.aikahubCsrf)}" />
         <button type="submit" class="btn">${esc(pt(L, 'set.ah.link_btn'))}</button>
       </form>`;

  return `<div class="content">
      <div class="pagehead"><div class="h-left">
        <h1>${esc(pt(L, 'nav.settings'))}</h1>
        <div class="sub">${esc(pt(L, 'set.sub'))}</div>
      </div></div>
      <div class="set-grid">
        <section class="panel set-card">
          <div class="set-prof">
            <div class="crest">${esc(s.initials)}</div>
            <div>
              <h2>${esc(s.company)}</h2>
              <div class="set-meta">${esc(d.emailLabel)}${d.city ? ' · ' + esc(d.city) : ''}</div>
              <div class="set-stats">
                <span>${esc(pt(L, 'top.cash'))} <b>${esc(usd(s.cashCents))}</b></span>
                <span>MRR <b>${esc(usd(s.mrrCents))}</b></span>
                <span>${esc(pt(L, 'top.rep'))} <b>${s.rep}</b></span>
                <span>${esc(pt(L, 'top.day', { n: s.day }))}</span>
              </div>
            </div>
          </div>
          <div class="set-usage">${esc(pt(L, 'set.usage', { used: d.llmUsed, cap: d.llmCap, shifts: d.shiftsToday }))}</div>
        </section>

        <section class="panel set-card">
          <h3>${esc(pt(L, 'set.edit'))}</h3>
          <label for="set-company-name">${esc(pt(L, 'set.company'))}</label>
          <input id="set-company-name" type="text" value="${esc(s.company)}" maxlength="60" minlength="2" required />
          <label for="set-city">${esc(pt(L, 'set.city'))}</label>
          <input id="set-city" type="text" value="${esc(d.city ?? '')}" maxlength="60" />
          <label>${esc(pt(L, 'set.lang'))}</label>
          <div id="set-lang-row" class="set-langs" data-current="${d.preferredLang}">
            ${langBtn('en', 'English')}${langBtn('hu', 'Magyar')}${langBtn('de', 'Deutsch')}
          </div>
          <button type="button" class="btn primary" data-action="save-profile">${esc(pt(L, 'set.save'))}</button>
          <p id="set-status" class="set-status" role="status"></p>
        </section>

        <section class="panel set-card">
          <h3>AikaHub</h3>
          ${aikahub}
          ${ahErr ? `<p class="set-err">${esc(ahErr)}</p>` : ''}
          <h3 class="set-h3-gap">${esc(pt(L, 'set.sub_title'))}</h3>
          <p class="set-help">${esc(pt(L, 'set.limits', { shifts: d.isPro ? 5 : 1, cap: d.isPro ? d.proCap : d.freeCap }))}</p>
        </section>

        <section class="panel set-card" id="sound">
          <h3>${esc(pt(L, 'snd.title'))}</h3>
          ${renderSoundControl(L, 'panel')}
        </section>

        <section class="panel set-card set-danger" id="restart">
          <h3>⚠ ${esc(pt(L, 'set.danger'))}</h3>
          <div class="set-row">
            <div><b>${esc(pt(L, 'set.reset'))}</b><small>${esc(pt(L, 'set.reset_help'))}</small></div>
            <button type="button" class="btn danger" data-action="reset-save" data-confirm="${esc(pt(L, 'set.reset_confirm'))}">${esc(pt(L, 'set.reset_btn'))}</button>
          </div>
          <div class="set-row">
            <div><b>${esc(pt(L, 'set.delete'))}</b><small>${esc(pt(L, 'set.delete_help'))}</small></div>
            <button type="button" class="btn danger" data-action="delete-account" data-confirm="${esc(pt(L, 'set.delete_confirm'))}">${esc(pt(L, 'set.delete_btn'))}</button>
          </div>
        </section>
      </div>
    </div>`;
}
