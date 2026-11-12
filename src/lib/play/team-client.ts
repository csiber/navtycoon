// src/lib/play/team-client.ts
// Hyperscales — a Csapat és a Hálózat lap gombjai (felvétel, elbocsátás, hálózat-váltás), 2026-11-12.
// Kliensoldali, keret nélküli JS (a lap <script is:inline>-ként kapja); a szövegek a #team-i18n JSON-ból jönnek.
export const TEAM_CLIENT_JS = `(function () {
  var T = JSON.parse(document.getElementById('team-i18n').textContent);
  async function post(url, body) {
    var r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  document.addEventListener('click', async function (ev) {
    var t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    var btn = t.closest('[data-staff-hire], [data-staff-fire], [data-net]');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    var name = btn.getAttribute('data-name') || '';
    if (btn.hasAttribute('data-staff-fire') && !confirm(T.fireConfirm.replace('{name}', name))) return;
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = '…';
    try {
      var cost = parseInt(btn.getAttribute('data-cost') || '0', 10);
      if (btn.hasAttribute('data-staff-hire')) {
        await post('/api/game/staff', { action: 'hire', key: btn.getAttribute('data-staff-hire') });
        window.hsMoney && window.hsMoney(-cost, T.hired.replace('{name}', name), undefined, 'buy');
      } else if (btn.hasAttribute('data-staff-fire')) {
        await post('/api/game/staff', { action: 'fire', staff_id: Number(btn.getAttribute('data-staff-fire')) });
        window.hsToast && window.hsToast(T.fired.replace('{name}', name), 'info');
      } else {
        await post('/api/game/network', JSON.parse(btn.getAttribute('data-net')));
        if (cost > 0 && window.hsMoney) window.hsMoney(-cost, T.netSaved, undefined, 'buy');
        else window.hsToast && window.hsToast(T.netSaved, 'good');
      }
      btn.textContent = '✓';
      setTimeout(function () { location.reload(); }, 1100);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = orig;
      window.hsToast && window.hsToast(T.error.replace('{msg}', e.message), 'bad');
    }
  });
})();`;
