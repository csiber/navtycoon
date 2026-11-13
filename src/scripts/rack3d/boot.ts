// src/scripts/rack3d/boot.ts — eldönti, kell-e 3D rack, és csak akkor tölti be a three.js-t (dinamikus import).
// 2D tartalék (a meglévő rack-sorok) marad: mozgáscsökkentés kérésekor, WebGL nélkül, gyenge gépen
// (failIfMajorPerformanceCaveat, kevés mag/memória, adattakarékos mód), mobilon (≤ 900 px vagy érintőképernyő),
// illetve ha a játékos a „2D" gombbal kikapcsolta (localStorage hs_rack3d = '0').
// ?rack3d=1 → kényszerített 3D (teszteléshez: szoftveres WebGL-en is), ?rack3d=debug → fps-kijelzővel.
import type { RackModel } from '../../lib/play/rack-model';
import type { RackHandle } from './rack3d';
import './rack3d.css';

interface RackBoot { model: RackModel; labels: Record<string, string>; page: 'dashboard' | 'servers'; cosmetics?: { skin?: string | null; led?: string | null } }

const SEEN_KEY = 'hs_rack_seen';

export function capability(force: boolean): { ok: boolean; reason: string } {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (!force) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { ok: false, reason: 'reduced-motion' };
    if (matchMedia('(max-width: 900px), (pointer: coarse)').matches) return { ok: false, reason: 'mobile' };
    if (nav.connection?.saveData) return { ok: false, reason: 'save-data' };
    if ((nav.deviceMemory ?? 8) < 4 || (nav.hardwareConcurrency ?? 8) < 4) return { ok: false, reason: 'low-power' };
  }
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: !force }) as WebGL2RenderingContext | null;
    if (!gl) return { ok: false, reason: 'no-webgl' };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { return { ok: false, reason: 'no-webgl' }; }
  return { ok: true, reason: '' };
}

function readSeen(): Set<number> | null {
  try { const v = localStorage.getItem(SEEN_KEY); return v ? new Set(JSON.parse(v) as number[]) : null; } catch { return null; }
}

async function boot() {
  const dataEl = document.getElementById('rack3d-data');
  const host = document.querySelector<HTMLElement>('[data-rack3d]');
  const panel = host?.closest<HTMLElement>('.panel');
  if (!dataEl || !host || !panel) return;
  const data = JSON.parse(dataEl.textContent || '{}') as RackBoot;
  const q = new URLSearchParams(location.search).get('rack3d');
  const force = q === '1' || q === 'debug';
  const cap = capability(force);
  panel.dataset.rack3d = cap.ok ? 'available' : 'off:' + cap.reason;
  const toggle = panel.querySelector<HTMLButtonElement>('[data-rack3d-toggle]');
  // Az új (még nem látott) gépek becsúsznak. Első látogatáskor nincs előzmény → nincs animáció.
  // 2026-11-12: a 2D nézet is számon tartja, hogy a becsúszás hangja (src/scripts/audio) ott is megszólaljon.
  const seen = readSeen();
  const fresh = new Set<number>(seen ? data.model.units.filter((u) => !seen.has(u.id)).map((u) => u.id) : []);
  if (data.model.units.length > 0) try { localStorage.setItem(SEEN_KEY, JSON.stringify(data.model.units.map((u) => u.id))); } catch { /* sandboxed */ }
  // A hang a 3D becsúszás közepére esik (0,35 mp várakozás + 1,2 mp csúszás); 2D-ben rögtön.
  if (fresh.size > 0) setTimeout(() => window.hsSfx?.('slide'), cap.ok ? 650 : 150);
  if (!cap.ok || data.model.units.length === 0) { toggle?.remove(); return; }

  let handle: RackHandle | null = null;
  let loading = false;
  const onOpen = (id: number) => {
    if (data.page === 'servers') {
      const row = document.querySelector<HTMLElement>(`.rack-vis [data-srv="${id}"]`);
      row?.click();
      document.querySelector(`[data-srv-detail="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      location.href = `/play/servers#srv-${id}`;
    }
  };
  async function on() {
    if (handle || loading) return;
    loading = true;
    panel!.classList.add('rack3d-loading');
    try {
      const { mountRack } = await import('./rack3d');
      if (document.fonts?.ready) await document.fonts.ready;
      // Előbb látható legyen a tartó, hogy az első képkocka már a valódi méretre illesszen.
      host!.hidden = false;
      panel!.classList.add('rack3d-on');
      handle = mountRack(host!, data.model, {
        labels: data.labels, onOpen, fresh, debug: q === 'debug',
        // AikaHub-kozmetika: a szerver adja (cosmetics.ts), itt csak a két ismert érték számít.
        skin: data.cosmetics?.skin === 'colo' ? 'colo' : null, led: data.cosmetics?.led === 'aurora' ? 'aurora' : null,
      });
      (window as unknown as { __rack3d?: RackHandle }).__rack3d = handle;
      host!.querySelector('canvas')?.addEventListener('webglcontextlost', () => off(false), { once: true });
    } catch (e) {
      console.warn('rack3d: 2D marad', e);
      off(false);
    } finally {
      loading = false;
      panel!.classList.remove('rack3d-loading');
    }
  }
  function off(remember: boolean) {
    handle?.dispose(); handle = null;
    panel!.classList.remove('rack3d-on');
    host!.hidden = true;
    if (remember) try { localStorage.setItem('hs_rack3d', '0'); } catch { /* sandboxed */ }
    paint();
  }
  function paint() {
    if (!toggle) return;
    const is3d = !!handle;
    toggle.textContent = is3d ? '2D' : '3D';
    toggle.title = data.labels[is3d ? 'r3.view2d' : 'r3.view3d'] ?? '';
    toggle.setAttribute('aria-pressed', is3d ? 'true' : 'false');
    toggle.hidden = false;
  }
  toggle?.addEventListener('click', async () => {
    if (handle) off(true);
    else { try { localStorage.setItem('hs_rack3d', '1'); } catch { /* sandboxed */ } await on(); paint(); }
  });
  // Navigációkor (és bfcache-be tételkor) minden GPU-erőforrás felszabadul.
  addEventListener('pagehide', () => { handle?.dispose(); handle = null; });
  addEventListener('pageshow', (e) => { if (e.persisted && !handle && panel!.classList.contains('rack3d-on')) void on(); });
  let pref: string | null = null;
  try { pref = localStorage.getItem('hs_rack3d'); } catch { /* sandboxed */ }
  if (pref === '0' && !force) { paint(); return; }
  await on();
  paint();
}

void boot();
