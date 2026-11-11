// src/scripts/rack3d/rack3d.ts — a játékos szerverei 3D rackben (three.js, csak dinamikus importtal töltődik be).
// A valódi gépek rack-egységek; a LED-ek a terheléssel arányosan villognak; túlterhelt / leállt gép piros
// fényt kap; az újonnan vett gép becsúszik a helyére; rámutatásra adatlap, kattintásra megnyitja a részleteket.
// Kamera: finom parallaxis (egér) + korlátozott forgatás húzással. Rajzolás csak látható lapon és képernyőn
// lévő vásznon; DPR legfeljebb 2; kilépéskor mindent felszabadít (dispose).

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, PlaneGeometry, CircleGeometry,
  MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, Color, HemisphereLight, DirectionalLight,
  PointLight, Raycaster, Vector2, SRGBColorSpace, ACESFilmicToneMapping, AdditiveBlending, Sprite,
  SpriteMaterial, Texture, Object3D, Material, BufferGeometry, MathUtils,
} from 'three';
import type { RackModel, RackUnit } from '../../lib/play/rack-model';
import { ledHz } from '../../lib/play/rack-model';

export interface RackLabels { [k: string]: string }
export interface MountOptions {
  labels: RackLabels;
  onOpen: (id: number) => void;
  /** Az újonnan megjelent gépek (becsúszó animáció). */
  fresh: Set<number>;
  debug?: boolean;
}
export interface RackHandle { dispose(): void; stats(): { fps: number; frames: number; cpuMs: number; calls: number; triangles: number } }

const COL = {
  indigo: new Color('#6366f1'), indigo2: new Color('#818cf8'), mint: new Color('#34d399'),
  amber: new Color('#f59e0b'), pink: new Color('#f43f5e'), panel: new Color('#161a2c'),
};
const STATE_COL: Record<RackUnit['state'], Color> = {
  idle: COL.indigo2, ok: COL.mint, warn: COL.amber, hot: COL.pink, down: COL.pink,
};
const U_H = 0.2;      // egy rack-egység magassága
const W = 2.0;        // belső szélesség
const D = 1.5;        // mélység

function tr(L: RackLabels, k: string, p?: Record<string, string | number>) {
  return (L[k] ?? k).replace(/\{(\w+)\}/g, (m, n: string) => (p && n in p ? String(p[n]) : m));
}

/** Lágy kör alakú fénypötty additív sprite-okhoz (LED-glória, piros izzás). */
function glowTexture(): Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

/** A gép előlapja: név, U-szám, terhelés-sáv, szellőzőrács. */
function faceTexture(u: RackUnit | null, label: string): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 96);
  bg.addColorStop(0, u ? '#262c46' : '#141828'); bg.addColorStop(1, u ? '#1a1f33' : '#0e1220');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 96);
  g.strokeStyle = u ? 'rgba(129,140,248,.35)' : 'rgba(255,255,255,.05)'; g.lineWidth = 3; g.strokeRect(2, 2, 1020, 92);
  // fülek (rack ears) csavarral
  for (const x of [8, 984]) {
    g.fillStyle = u ? '#2e3554' : '#191d2e'; g.fillRect(x, 6, 32, 84);
    g.fillStyle = '#0b0e17'; g.beginPath(); g.arc(x + 16, 48, 6, 0, Math.PI * 2); g.fill();
  }
  // szellőzés
  g.fillStyle = u ? 'rgba(7,9,15,.55)' : 'rgba(7,9,15,.4)';
  for (let x = u ? 520 : 70; x < (u ? 840 : 960); x += 14) g.fillRect(x, 24, 7, 48);
  g.fillStyle = u ? '#5d6483' : '#3a4060'; g.font = '600 30px "JetBrains Mono", ui-monospace, monospace'; g.textBaseline = 'middle';
  g.fillText(`U${String(u ? u.u : 0).padStart(2, '0')}`, 56, 48);
  if (u) {
    g.fillStyle = '#e9ecf5'; g.font = '600 34px "Space Grotesk", "Inter", system-ui, sans-serif';
    let name = u.name; while (g.measureText(name).width > 330 && name.length > 4) name = name.slice(0, -2);
    if (name !== u.name) name = name.trimEnd() + '…';
    g.fillText(name, 150, 40);
    // terhelés-sáv
    const col = STATE_COL[u.state];
    g.fillStyle = 'rgba(7,9,15,.7)'; g.fillRect(150, 64, 330, 10);
    g.fillStyle = `#${col.getHexString()}`; g.fillRect(150, 64, Math.round(330 * Math.min(100, u.util) / 100), 10);
    g.fillStyle = '#8b92ad'; g.font = '500 24px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'right'; g.fillText(`${u.util}%`, 960, 48); g.textAlign = 'left';
  } else {
    g.fillStyle = '#3a4060'; g.font = '500 24px "JetBrains Mono", ui-monospace, monospace'; g.fillText(label, 150, 48);
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}

function floorTexture(): Texture {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grd.addColorStop(0, 'rgba(99,102,241,.45)'); grd.addColorStop(0.5, 'rgba(99,102,241,.12)'); grd.addColorStop(1, 'rgba(99,102,241,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(129,140,248,.18)'; g.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  const mask = g.createRadialGradient(256, 256, 100, 256, 256, 256);
  mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(1, 'rgba(7,9,15,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = mask; g.fillRect(0, 0, 512, 512);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

interface UnitObj {
  unit: RackUnit; group: Group; body: Mesh; face: Mesh; leds: Mesh[]; halos: Sprite[];
  glow: Sprite | null; baseZ: number; hover: number; slideT: number; phase: number;
}

export function mountRack(host: HTMLElement, model: RackModel, opt: MountOptions): RackHandle {
  const L = opt.labels;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'rack3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', tr(L, 'r3.aria', { n: model.units.length }));
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const slots = Math.max(model.slots, model.units.length);
  const rackH = slots * U_H;
  const root = new Group(); scene.add(root);
  root.position.y = -rackH / 2;

  // Fények: hideg fő-fény, indigó perem, menta alulról — a konzol palettája.
  scene.add(new HemisphereLight(0x8b92ff, 0x07090f, 0.9));
  const key = new DirectionalLight(0xdfe6ff, 1.25); key.position.set(3, 5, 6); scene.add(key);
  const rim = new DirectionalLight(0x6366f1, 2.2); rim.position.set(-4, 3, -5); scene.add(rim);
  const fill = new DirectionalLight(0x34d399, 0.35); fill.position.set(2, -3, 4); scene.add(fill);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // Rack-keret: oszlopok, tető, talp, oldalpanelek.
  const frameMat = track(new MeshStandardMaterial({ color: 0x1a1f33, metalness: 0.7, roughness: 0.38 }));
  const postGeo = track(new BoxGeometry(0.12, rackH + 0.3, 0.12));
  for (const [x, z] of [[-W / 2 - 0.08, D / 2], [W / 2 + 0.08, D / 2], [-W / 2 - 0.08, -D / 2], [W / 2 + 0.08, -D / 2]]) {
    const p = new Mesh(postGeo, frameMat); p.position.set(x, rackH / 2, z); root.add(p);
  }
  const capGeo = track(new BoxGeometry(W + 0.34, 0.12, D + 0.2));
  const top = new Mesh(capGeo, frameMat); top.position.y = rackH + 0.15; root.add(top);
  const bottom = new Mesh(capGeo, frameMat); bottom.position.y = -0.15; root.add(bottom);
  const sideMat = track(new MeshStandardMaterial({ color: 0x0e1220, metalness: 0.4, roughness: 0.7, transparent: true, opacity: 0.92 }));
  const sideGeo = track(new BoxGeometry(0.04, rackH + 0.2, D));
  for (const x of [-W / 2 - 0.1, W / 2 + 0.1]) { const s = new Mesh(sideGeo, sideMat); s.position.set(x, rackH / 2, 0); root.add(s); }
  const backGeo = track(new PlaneGeometry(W, rackH));
  const back = new Mesh(backGeo, track(new MeshBasicMaterial({ color: 0x05070c }))); back.position.set(0, rackH / 2, -D / 2 + 0.02); root.add(back);
  // Indigó élfény a keret elején.
  const edgeMat = track(new MeshBasicMaterial({ color: COL.indigo, transparent: true, opacity: 0.55 }));
  const edgeGeo = track(new BoxGeometry(0.02, rackH + 0.2, 0.02));
  for (const x of [-W / 2 - 0.02, W / 2 + 0.02]) { const e = new Mesh(edgeGeo, edgeMat); e.position.set(x, rackH / 2, D / 2 + 0.07); root.add(e); }

  // Padló-rács fénykörrel.
  const floor = new Mesh(track(new CircleGeometry(4.2, 48)), track(new MeshBasicMaterial({ map: track(floorTexture()), transparent: true, depthWrite: false })));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.22; root.add(floor);

  const glowTex = track(glowTexture());
  const bodyGeo = track(new BoxGeometry(W - 0.04, U_H - 0.022, D - 0.1));
  const faceGeo = track(new PlaneGeometry(W - 0.02, U_H - 0.02));
  const ledGeo = track(new BoxGeometry(0.045, 0.045, 0.02));
  const blankMat = track(new MeshStandardMaterial({ color: 0x10131f, metalness: 0.5, roughness: 0.8 }));
  const emptyFace = track(faceTexture(null, (L['r3.empty'] ?? '— empty —')));
  const emptyFaceMat = track(new MeshStandardMaterial({ map: emptyFace, metalness: 0.3, roughness: 0.8 }));

  const units: UnitObj[] = [];
  const byU = new Map(model.units.map((u) => [u.u, u]));
  const glowLights: PointLight[] = [];
  for (let i = 0; i < slots; i++) {
    const uNum = 24 - i;
    const y = rackH - (i + 0.5) * U_H;
    const u = byU.get(uNum) ?? null;
    if (!u) {
      const blank = new Mesh(faceGeo, emptyFaceMat); blank.position.set(0, y, D / 2 - 0.12); root.add(blank);
      continue;
    }
    const g = new Group(); g.position.set(0, y, 0); root.add(g);
    const bodyMat = track(new MeshStandardMaterial({ color: 0x161b2c, metalness: 0.6, roughness: 0.55, emissive: new Color(0x000000) }));
    const body = new Mesh(bodyGeo, bodyMat); g.add(body);
    const tex = track(faceTexture(u, ''));
    const faceMat = track(new MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.55, emissive: new Color(0xffffff), emissiveMap: tex, emissiveIntensity: 0.18 }));
    const face = new Mesh(faceGeo, faceMat); face.position.z = (D - 0.1) / 2 + 0.002; g.add(face);
    const col = STATE_COL[u.state];
    const leds: Mesh[] = []; const halos: Sprite[] = [];
    for (let k = 0; k < 3; k++) {
      const lm = track(new MeshBasicMaterial({ color: k === 1 ? COL.indigo2 : col }));
      const led = new Mesh(ledGeo, lm); led.position.set(W / 2 - 0.42 + k * 0.08, 0, face.position.z + 0.012); g.add(led); leds.push(led);
      const sm = track(new SpriteMaterial({ map: glowTex, color: k === 1 ? COL.indigo2 : col, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
      const halo = new Sprite(sm); halo.scale.setScalar(0.2); halo.position.copy(led.position); halo.position.z += 0.01; g.add(halo); halos.push(halo);
    }
    let glow: Sprite | null = null;
    // Piros izzás csak túlterhelt / leállt gépen (a teli, „terhelt" gép normális: borostyán LED + sáv elég).
    if (u.state === 'hot' || u.state === 'down') {
      const gm = track(new SpriteMaterial({ map: glowTex, color: COL.pink, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 }));
      glow = new Sprite(gm); glow.scale.set(W * 1.5, U_H * 2.6, 1); glow.position.z = D / 2 + 0.02; g.add(glow);
      if (glowLights.length < 2) {
        const pl = new PointLight(0xf43f5e, 0.9, 1.6, 2); pl.position.set(0, y, D / 2 + 0.45); root.add(pl); glowLights.push(pl);
      }
    }
    const fresh = opt.fresh.has(u.id);
    units.push({ unit: u, group: g, body, face, leds, halos, glow, baseZ: 0, hover: 0, slideT: fresh ? 0 : 1, phase: Math.random() * Math.PI * 2 });
    if (fresh) g.position.z = 2.6;
  }

  // ─── Kamera + interakció ───
  const ray = new Raycaster(); const ptr = new Vector2(-9, -9);
  let hovered: UnitObj | null = null;
  let yaw = 0.42, pitch = 0.07, tYaw = 0.42, tPitch = 0.07, dragBase = 0;
  let dragging = false, dragX = 0, dragMoved = 0, inside = false;
  const tip = document.createElement('div'); tip.className = 'rack3d-tip'; tip.hidden = true; host.appendChild(tip);

  function fit() {
    const w = host.clientWidth || 300, h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // A rack köré írt gömböt illesztjük a szűkebb látószögbe (keskeny panelen a szélesség, magas lapon a magasság dönt).
    const vFov = MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const R = Math.hypot(W / 2 + 0.2, rackH / 2 + 0.25, D / 2);
    dist = (R / Math.sin(Math.min(vFov, hFov) / 2)) * 0.9;
    camera.updateProjectionMatrix();
  }
  let dist = 8;
  function placeCamera() {
    camera.position.set(Math.sin(yaw) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * dist);
    camera.lookAt(0, 0, 0);
  }

  function pick(): UnitObj | null {
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(units.map((u) => u.body).concat(units.map((u) => u.face)), false);
    if (!hits.length) return null;
    return units.find((u) => u.body === hits[0].object || u.face === hits[0].object) ?? null;
  }
  function showTip(u: UnitObj | null, x: number, y: number) {
    if (!u) { tip.hidden = true; canvas.style.cursor = dragging ? 'grabbing' : 'grab'; return; }
    canvas.style.cursor = 'pointer';
    tip.replaceChildren();
    const b = document.createElement('b'); b.textContent = `U${u.unit.u} · ${u.unit.name}`;
    const s1 = document.createElement('span'); s1.className = 'st ' + u.unit.state; s1.textContent = tr(L, 'r3.state.' + u.unit.state);
    const s2 = document.createElement('span'); s2.textContent = `${tr(L, 'r3.customers', { n: u.unit.load, c: u.unit.capacity })} · ${u.unit.util}%`;
    const s3 = document.createElement('small'); s3.textContent = tr(L, 'r3.open') + ' →';
    tip.append(b, s1, s2, s3);
    tip.hidden = false;
    const r = host.getBoundingClientRect();
    tip.style.left = Math.min(r.width - 190, Math.max(8, x + 14)) + 'px';
    tip.style.top = Math.max(8, y - 10) + 'px';
  }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    inside = true;
    if (dragging) {
      const dx = e.clientX - dragX; dragMoved = Math.max(dragMoved, Math.abs(dx));
      dragBase = MathUtils.clamp(dragBase + dx * 0.006, -0.75, 0.75); dragX = e.clientX;
    }
    hovered = dragging ? null : pick();
    showTip(hovered, e.clientX - r.left, e.clientY - r.top);
    wake();
  };
  const onLeave = () => { inside = false; hovered = null; tip.hidden = true; ptr.set(-9, -9); };
  const onDown = (e: PointerEvent) => { dragging = true; dragX = e.clientX; dragMoved = 0; canvas.setPointerCapture(e.pointerId); };
  const onUp = (e: PointerEvent) => {
    if (dragging && dragMoved < 5) { const u = pick(); if (u) opt.onOpen(u.unit.id); }
    dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch { /* már elengedve */ }
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.style.touchAction = 'pan-y';

  // ─── Rajzolási ciklus (csak ha látszik) ───
  let raf = 0, visible = true, last = performance.now(), t0 = last;
  let frames = 0, fps = 0, fpsAcc = 0, fpsN = 0, cpuAcc = 0, cpuMs = 0;
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  function frame() {
    raf = 0;
    // performance.now() és nem a rAF-időbélyeg: az utóbbi a képkocka kezdete (korábbi is lehet a `last`-nál).
    const now = performance.now();
    const c0 = performance.now();
    // A rAF-időbélyeg a képkocka kezdete — lehet korábbi, mint a láthatóvá váláskor mért `last` → sosem negatív.
    const realDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, realDt); last = now;
    const t = (now - t0) / 1000;
    frames++; fpsAcc += realDt; fpsN++;
    if (fpsAcc >= 1) { fps = Math.round(fpsN / fpsAcc); cpuMs = +(cpuAcc / fpsN).toFixed(2); fpsAcc = 0; fpsN = 0; cpuAcc = 0; }
    // kamera: parallaxis + lassú ringás + húzás
    const px = inside ? ptr.x : Math.sin(t * 0.25) * 0.35;
    const py = inside ? ptr.y : Math.sin(t * 0.18) * 0.2;
    tYaw = 0.42 + dragBase + px * 0.22;
    tPitch = 0.07 + py * 0.06;
    yaw += (tYaw - yaw) * Math.min(1, dt * 4);
    pitch += (tPitch - pitch) * Math.min(1, dt * 4);
    placeCamera();
    for (const u of units) {
      // becsúszás
      if (u.slideT < 1) {
        u.slideT = Math.min(1, u.slideT + dt / 1.2);
        const k = t < 0.35 ? 0 : ease(Math.min(1, u.slideT));
        u.group.position.z = 2.6 * (1 - k);
      }
      // rámutatás: kicsit kihúzódik
      u.hover += ((hovered === u ? 1 : 0) - u.hover) * Math.min(1, dt * 10);
      if (u.slideT >= 1) u.group.position.z = u.hover * 0.14;
      (u.body.material as MeshStandardMaterial).emissive.setRGB(0.05 * u.hover, 0.06 * u.hover, 0.16 * u.hover);
      // LED-ek: terheléssel arányos villogás
      const hz = ledHz(u.unit.util, u.unit.state);
      for (let k = 0; k < 3; k++) {
        const on = k === 1 ? 0.9 : (Math.sin((t * hz + k * 0.37) * Math.PI * 2 + u.phase) > (k === 0 ? -0.2 : 0.35) ? 1 : 0.18);
        const lvl = u.unit.state === 'down' && k !== 1 ? (Math.sin(t * 7.5) > 0 ? 1 : 0.05) : on;
        (u.halos[k].material as SpriteMaterial).opacity = 0.85 * lvl;
        (u.leds[k].material as MeshBasicMaterial).color.copy(k === 1 ? COL.indigo2 : STATE_COL[u.unit.state]).multiplyScalar(0.35 + 0.65 * lvl);
      }
      if (u.glow) {
        (u.glow.material as SpriteMaterial).opacity = 0.22 + 0.22 * (0.5 + 0.5 * Math.sin(t * (u.unit.state === 'down' ? 6 : 2.4)));
      }
    }
    for (const pl of glowLights) pl.intensity = 0.6 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3));
    renderer.render(scene, camera);
    cpuAcc += performance.now() - c0;
    if (opt.debug) dbg.textContent = `${fps} fps · ${cpuMs} ms JS · dpr ${renderer.getPixelRatio()} · ${renderer.info.render.calls} calls`;
    schedule();
  }
  const dbg = document.createElement('div'); dbg.className = 'rack3d-dbg'; if (opt.debug) host.appendChild(dbg);
  function schedule() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }
  function wake() { schedule(); }
  const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) { last = performance.now(); schedule(); } }, { threshold: 0.01 });
  io.observe(host);
  const onVis = () => { if (!document.hidden) { last = performance.now(); schedule(); } };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { fit(); schedule(); });
  ro.observe(host);
  fit(); placeCamera(); schedule();

  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    if (raf) cancelAnimationFrame(raf);
    io.disconnect(); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
    scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.geometry) (m.geometry as BufferGeometry).dispose();
      const mat = (m as unknown as { material?: Material | Material[] }).material;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    });
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove(); tip.remove(); dbg.remove();
  }
  return { dispose, stats: () => ({ fps, frames, cpuMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) };
}
