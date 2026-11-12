// Hyperscales — közös /play keret kliens-oldala (2026-11-11, UX-javítás 1. fázis).
//  - mobilmenü (☰ / ✕ / háttér / Esc)
//  - „Következő nap: … múlva" visszaszámláló a felső sávban
//  - korszak-doboz nyitott/zárt állapota (localStorage)
//  - window.hsToast(text, kind, amountText, silent) + window.hsSetCash(cents) számanimációval
//  - 2026-11-12: a toastok hangja a közös hangmotoron át (window.hsSfx, src/scripts/audio); ha nincs betöltve, csend
(function () {
  'use strict';
  var body = document.body;

  // ─── Mobile nav ───
  var aside = document.getElementById('play-nav');
  var backdrop = document.querySelector('.nav-backdrop');
  var toggle = document.querySelector('.nav-toggle');
  function setNav(open) {
    body.classList.toggle('nav-open', open);
    if (backdrop) backdrop.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle) toggle.addEventListener('click', function () { setNav(!body.classList.contains('nav-open')); });
  var closeBtn = aside && aside.querySelector('.nav-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { setNav(false); });
  if (backdrop) backdrop.addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  // ─── Next-day countdown ───
  var clock = document.querySelector('[data-next-day-at]');
  if (clock) {
    var at = parseInt(clock.getAttribute('data-next-day-at'), 10) || 0;
    var tpl = clock.getAttribute('data-tpl') || '{t}';
    var hm = clock.getAttribute('data-hm') || '{h}h {m}m';
    var render = function () {
      var left = Math.max(0, at - Math.floor(Date.now() / 1000));
      if (left === 0) { clock.textContent = tpl.replace('{t}', hm.replace('{h}', '0').replace('{m}', '0')); return; }
      var h = Math.floor(left / 3600);
      var m = Math.floor((left % 3600) / 60);
      clock.textContent = tpl.replace('{t}', hm.replace('{h}', String(h)).replace('{m}', String(m)));
    };
    render();
    setInterval(render, 30000);
  }

  // ─── Era box open state ───
  var era = document.getElementById('era-box');
  if (era) {
    try {
      var saved = localStorage.getItem('hs_era_box_open');
      // Alapból nyitva asztali nézetben, csukva mobilon.
      var open = saved === null ? window.innerWidth > 900 : saved === '1';
      if (open) era.setAttribute('open', ''); else era.removeAttribute('open');
      era.addEventListener('toggle', function () {
        localStorage.setItem('hs_era_box_open', era.open ? '1' : '0');
      });
    } catch (e) { /* storage blocked */ }
  }

  // ─── Toasts ───
  function container() {
    var c = document.getElementById('hs-toasts');
    if (!c) {
      c = document.createElement('div');
      c.id = 'hs-toasts';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
    }
    return c;
  }
  function sfx(name) { try { if (window.hsSfx) window.hsSfx(name); } catch (e) { /* hang nélkül is megy */ } }
  window.hsToast = function (text, kind, amountText, silent) {
    if (!silent) sfx(kind === 'bad' ? 'err' : 'ok');
    var t = document.createElement('div');
    t.className = 'hs-toast' + (kind ? ' ' + kind : '');
    if (amountText) {
      var a = document.createElement('span');
      a.className = 'amt';
      a.textContent = amountText;
      t.appendChild(a);
    }
    var s = document.createElement('span');
    s.textContent = text;
    t.appendChild(s);
    container().appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 250);
    }, 4200);
  };

  // ─── Cash number animation ───
  function fmt(cents) {
    var v = Math.round(cents / 100);
    var s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−$' : '$') + s;
  }
  window.hsSetCash = function (newCents) {
    document.querySelectorAll('[data-cash-cents]').forEach(function (el) {
      var from = parseInt(el.getAttribute('data-cash-cents'), 10) || 0;
      var to = Math.round(newCents);
      if (from === to) return;
      el.setAttribute('data-cash-cents', String(to));
      el.classList.remove('num-flash-up', 'num-flash-down');
      el.classList.add(to > from ? 'num-flash-up' : 'num-flash-down');
      var t0 = performance.now();
      var dur = 700;
      var step = function (now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step);
        else setTimeout(function () { el.classList.remove('num-flash-up', 'num-flash-down'); }, 600);
      };
      requestAnimationFrame(step);
    });
  };
  /** Pénzmozgás: toast + számanimáció. deltaCents < 0 = kiadás. sound: a hang neve (alap: bevételnél 'cash', kiadásnál 'ok'). */
  window.hsMoney = function (deltaCents, text, newCashCents, sound) {
    var amt = (deltaCents >= 0 ? '+' : '−') + '$' + (Math.abs(deltaCents) / 100).toFixed(Math.abs(deltaCents) % 100 ? 2 : 0);
    sfx(sound || (deltaCents > 0 ? 'cash' : 'ok'));
    window.hsToast(text, deltaCents >= 0 ? 'good' : 'bad', amt, true);
    if (typeof newCashCents === 'number') window.hsSetCash(newCashCents);
    else {
      var el = document.querySelector('[data-cash-cents]');
      if (el) window.hsSetCash((parseInt(el.getAttribute('data-cash-cents'), 10) || 0) + deltaCents);
    }
  };
})();
