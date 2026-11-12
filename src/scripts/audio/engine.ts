// src/scripts/audio/engine.ts — Hyperscales közös hangmotor (2026-11-12).
// Hanggráf: forrás → (hang saját hangereje) → csatorna (sfx | amb | music) → fő → kimenet.
//  - A beállítások (settings.ts) localStorage-ben; a fő némítás minden csatornát elnémít.
//  - Autoplay-szabály: amíg nem volt felhasználói interakció (unlock), semmi nem szól és semmi nem töltődik le;
//    az alapzaj és a zene utána halkan beúszik. A közben kért fontos jelzések (queue) rövid ideig várnak.
//  - Rejtett lap: a fő hangerő lehalkul, majd a kontextus szünetel; visszatéréskor folytatódik.
//  - prefers-reduced-motion: halkabb effektek, lassabb beúszás, a nagy fanfár helyett szelídebb változat.
// A DOM-tól és a böngésző-API-któl független (függőségek befecskendezve), így hamis AudioContexttel tesztelhető.
import { CHANNELS, loadSettings, saveSettings, normalizeVolume, type AudioSettings, type Channel, type StorageLike } from './settings';

// ─── A WebAudio-ból csak ennyit használunk (a tesztek hamis változata ezt valósítja meg) ───
export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface NodeLike { connect(n: NodeLike): NodeLike; disconnect(): void }
export interface GainLike extends NodeLike { gain: ParamLike }
export interface BufferLike { duration: number }
export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart?: number;
  loopEnd?: number;
  onended: (() => void) | null;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}
export interface CtxLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(b: ArrayBuffer): Promise<BufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
}

export type SoundName =
  | 'hover' | 'slide' | 'buy' | 'ok' | 'err' | 'attention' | 'achievement' | 'era' | 'cash' | 'lowcash'
  | 'room_hum' | 'music';

export interface SoundDef {
  ch: Channel;
  /** A hang saját szintje (a csatorna hangerején felül). */
  gain: number;
  /** Ugyanaz a hang legfeljebb ilyen sűrűn szólhat (ms). */
  minGapMs: number;
  /** Interakció előtt kérve: várjon-e az első interakcióig (rövid ideig). */
  queue?: boolean;
  /** Hurok pontos hossza (mp): az AAC-tartalék végén lehet pár ms kitöltés, azt a hurok átugorja. */
  loopLen?: number;
}

export const SOUNDS: Record<SoundName, SoundDef> = {
  hover: { ch: 'sfx', gain: 0.18, minGapMs: 70 },
  slide: { ch: 'sfx', gain: 0.75, minGapMs: 400, queue: true },
  buy: { ch: 'sfx', gain: 0.8, minGapMs: 200 },
  ok: { ch: 'sfx', gain: 0.45, minGapMs: 150 },
  err: { ch: 'sfx', gain: 0.5, minGapMs: 250 },
  attention: { ch: 'sfx', gain: 0.5, minGapMs: 2000, queue: true },
  achievement: { ch: 'sfx', gain: 0.6, minGapMs: 600, queue: true },
  era: { ch: 'sfx', gain: 0.7, minGapMs: 3000, queue: true },
  cash: { ch: 'sfx', gain: 0.7, minGapMs: 120 },
  lowcash: { ch: 'sfx', gain: 0.45, minGapMs: 5000, queue: true },
  room_hum: { ch: 'amb', gain: 1, minGapMs: 0, loopLen: 8.1 },
  music: { ch: 'music', gain: 1, minGapMs: 0, loopLen: 72 },
};

export interface EngineDeps {
  /** Új AudioContext (vagy null, ha nincs WebAudio). Csak az első interakció után hívódik. */
  createContext: () => CtxLike | null;
  /** Egy hang fájljának bájtjai (a böngészőben fetch a tartalom-hash-es URL-re). */
  load: (name: SoundName) => Promise<ArrayBuffer>;
  storage: StorageLike | null;
  /** Munkameneti tároló (zene-pozíció); nem kötelező. */
  session?: StorageLike | null;
  reducedMotion?: boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

const QUEUE_WINDOW_MS = 8000;
const MUSIC_POS_KEY = 'hs_music_pos';

interface LoopState { name: SoundName; src: SourceLike | null; gain: GainLike | null; startedAt: number; offset: number; dur: number }

export class AudioEngine {
  private s: AudioSettings;
  private ctx: CtxLike | null = null;
  private master: GainLike | null = null;
  private chans: Partial<Record<Channel, GainLike>> = {};
  private buffers = new Map<SoundName, Promise<BufferLike | null>>();
  private last = new Map<SoundName, number>();
  private pending: { name: SoundName; at: number }[] = [];
  private wanted: Partial<Record<'amb' | 'music', SoundName | null>> = {};
  private loops: Partial<Record<'amb' | 'music', LoopState>> = {};
  private listeners = new Set<(s: AudioSettings) => void>();
  private hidden = false;
  private suspendToken = 0;
  unlocked = false;
  readonly reduced: boolean;
  private readonly now: () => number;
  private readonly timer: (fn: () => void, ms: number) => unknown;

  constructor(private deps: EngineDeps) {
    this.s = loadSettings(deps.storage);
    this.reduced = !!deps.reducedMotion;
    this.now = deps.now ?? (() => Date.now());
    this.timer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  }

  // ─── Beállítások ───
  get settings(): AudioSettings { return { ...this.s }; }

  update(patch: Partial<AudioSettings>): void {
    const was = this.s.on;
    const n: AudioSettings = { ...this.s };
    if (typeof patch.on === 'boolean') n.on = patch.on;
    for (const c of CHANNELS) if (patch[c] !== undefined) n[c] = normalizeVolume(patch[c], this.s[c]);
    this.s = n;
    saveSettings(this.deps.storage, n);
    this.applyGains(0.15);
    if (n.on && !was) this.syncLoops();
    for (const l of this.listeners) l(this.settings);
  }
  toggle(): void { this.update({ on: !this.s.on }); }
  subscribe(fn: (s: AudioSettings) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Egy csatorna tényleges szintje most (0, ha némítva vagy rejtett a lap). */
  effectiveVolume(ch: Channel): number {
    if (!this.s.on || this.hidden) return 0;
    return this.s[ch] * (ch === 'sfx' && this.reduced ? 0.7 : 1);
  }

  // ─── Feloldás (első interakció) ───
  unlock(): void {
    if (this.unlocked) { if (this.ctx && this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume().catch(() => {}); return; }
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.unlocked = true;
    if (!this.hidden) void ctx.resume().catch(() => {});
    this.syncLoops();
    const t = this.now();
    const q = this.pending.filter((p) => t - p.at <= QUEUE_WINDOW_MS);
    this.pending = [];
    // Egyszerre legfeljebb a két legutóbbi várakozó jelzés, egymás után.
    q.slice(-2).forEach((p, i) => this.timer(() => this.play(p.name), 120 + i * 650));
  }

  /** Ha a böngésző már engedi a hangot (pl. a munkamenetben korábban volt interakció), azonnali feloldás. */
  tryResumeWithoutGesture(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'running') { this.unlock(); return; }
    void ctx.resume().then(() => { if (ctx.state === 'running') this.unlock(); }).catch(() => {});
  }

  private ensureCtx(): CtxLike | null {
    if (this.ctx) return this.ctx;
    let ctx: CtxLike | null = null;
    try { ctx = this.deps.createContext(); } catch { ctx = null; }
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const c of CHANNELS) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.chans[c] = g;
    }
    this.applyGains(0);
    return ctx;
  }

  private applyGains(ramp: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const set = (p: ParamLike, v: number) => {
      p.cancelScheduledValues(t);
      if (ramp <= 0) { p.setValueAtTime(v, t); p.value = v; return; }
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(v, t + ramp);
    };
    set(this.master.gain, this.s.on && !this.hidden ? 1 : 0);
    for (const c of CHANNELS) {
      const g = this.chans[c];
      if (g) set(g.gain, this.s.on ? this.s[c] * (c === 'sfx' && this.reduced ? 0.7 : 1) : 0);
    }
  }

  // ─── Betöltés ───
  private buffer(name: SoundName): Promise<BufferLike | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const ctx = this.ctx;
      p = !ctx ? Promise.resolve(null) : this.deps.load(name)
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }
  /** Előtöltés (feloldás után), hogy az első kattintásnál ne késsen. */
  preload(names: SoundName[]): void { if (this.unlocked) for (const n of names) void this.buffer(n); }

  // ─── Effektek ───
  play(name: SoundName): void {
    const def = SOUNDS[name];
    if (!def || def.ch !== 'sfx') return;
    if (!this.s.on || this.s.sfx <= 0) return;
    const t = this.now();
    if (!this.unlocked || !this.ctx) {
      if (def.queue) this.pending.push({ name, at: t });
      return;
    }
    if (this.hidden) return;
    const prev = this.last.get(name);
    if (prev !== undefined && t - prev < def.minGapMs) return;
    this.last.set(name, t);
    const ctx = this.ctx;
    void this.buffer(name).then((buf) => {
      if (!buf || !this.s.on || this.hidden) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const lvl = name === 'era' && this.reduced ? def.gain * 0.6 : def.gain;
      g.gain.setValueAtTime(lvl, ctx.currentTime);
      g.gain.value = lvl;
      src.connect(g); g.connect(this.chans.sfx!);
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* már leválasztva */ } };
      src.start();
    });
  }

  /** A Műszak szintetizált csippanásainak kimenete: az effekt-csatorna (null, ha néma vagy még nincs feloldva). */
  synthOut(): { ctx: CtxLike; out: NodeLike } | null {
    if (!this.s.on || this.s.sfx <= 0 || this.hidden) return null;
    if (!this.unlocked) this.unlock(); // a Műszak hangjai mindig kattintásra szólnak
    if (!this.ctx || !this.chans.sfx) return null;
    return { ctx: this.ctx, out: this.chans.sfx };
  }

  // ─── Hurkok (alapzaj, zene) ───
  setLoops(want: Partial<Record<'amb' | 'music', SoundName | null>>): void {
    this.wanted = { ...this.wanted, ...want };
    this.syncLoops();
  }

  private syncLoops(): void {
    if (!this.unlocked || !this.ctx || !this.s.on || this.hidden) return;
    for (const slot of ['amb', 'music'] as const) {
      const name = this.wanted[slot] ?? null;
      const cur = this.loops[slot];
      if (cur && cur.name === name) continue;
      if (cur) this.stopLoop(slot, 0.6);
      if (name) void this.startLoop(slot, name);
    }
  }

  private async startLoop(slot: 'amb' | 'music', name: SoundName): Promise<void> {
    const ctx = this.ctx!;
    const st: LoopState = { name, src: null, gain: null, startedAt: 0, offset: 0, dur: 0 };
    this.loops[slot] = st;
    const buf = await this.buffer(name);
    if (this.loops[slot] !== st || !buf) { if (this.loops[slot] === st) delete this.loops[slot]; return; }
    let offset = 0;
    if (slot === 'music') {
      const v = parseFloat(this.deps.session?.getItem(MUSIC_POS_KEY) ?? '');
      if (Number.isFinite(v) && v > 0 && buf.duration > 0) offset = v % Math.min(buf.duration, SOUNDS[name].loopLen ?? Infinity);
    } else if (buf.duration > 0) {
      offset = Math.random() * Math.min(buf.duration, SOUNDS[name].loopLen ?? Infinity);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const len = SOUNDS[name].loopLen;
    if (len && buf.duration > len) { src.loopStart = 0; src.loopEnd = len; }
    const g = ctx.createGain();
    const fadeIn = slot === 'music' ? (this.reduced ? 6 : 4) : (this.reduced ? 4 : 2.5);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(SOUNDS[name].gain, t + fadeIn);
    src.connect(g); g.connect(this.chans[SOUNDS[name].ch]!);
    src.start(t, offset);
    Object.assign(st, { src, gain: g, startedAt: t, offset, dur: Math.min(buf.duration, len ?? Infinity) });
  }

  private stopLoop(slot: 'amb' | 'music', fade: number): void {
    const st = this.loops[slot];
    delete this.loops[slot];
    if (!st?.src || !st.gain || !this.ctx) return;
    if (slot === 'music') this.saveMusicPos(st);
    const t = this.ctx.currentTime;
    st.gain.gain.cancelScheduledValues(t);
    st.gain.gain.setValueAtTime(st.gain.gain.value, t);
    st.gain.gain.linearRampToValueAtTime(0, t + fade);
    const src = st.src;
    try { src.stop(t + fade + 0.05); } catch { /* már leállt */ }
  }

  private saveMusicPos(st: LoopState): void {
    if (!this.ctx || !st.dur) return;
    const pos = (st.offset + (this.ctx.currentTime - st.startedAt)) % st.dur;
    try { this.deps.session?.setItem(MUSIC_POS_KEY, pos.toFixed(2)); } catch { /* tiltott tároló */ }
  }

  /** Lapelhagyáskor: a zene pozíciója megmarad a következő /play oldalra. */
  persist(): void { const m = this.loops.music; if (m) this.saveMusicPos(m); }

  // ─── Láthatóság ───
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const ctx = this.ctx;
    const token = ++this.suspendToken;
    if (hidden) {
      this.persist();
      this.applyGains(0.25);
      if (ctx) this.timer(() => { if (token === this.suspendToken && this.hidden) void ctx.suspend().catch(() => {}); }, 300);
    } else {
      if (ctx && this.unlocked) void ctx.resume().catch(() => {});
      this.applyGains(0.6);
      this.syncLoops();
    }
  }

  get isHidden(): boolean { return this.hidden; }
  /** Teszthez / hibakereséshez. */
  debugState() {
    return {
      unlocked: this.unlocked, hidden: this.hidden, ctxState: this.ctx?.state ?? null,
      master: this.master?.gain.value ?? null,
      chans: Object.fromEntries(CHANNELS.map((c) => [c, this.chans[c]?.gain.value ?? null])),
      loops: Object.fromEntries(Object.entries(this.loops).map(([k, v]) => [k, v?.name])),
      pending: this.pending.map((p) => p.name),
    };
  }
}
