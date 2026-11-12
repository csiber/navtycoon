// A közös hangmotor logikája hamis AudioContexttel (nincs böngésző, nincs valódi hang).
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEngine, type CtxLike, type GainLike, type ParamLike, type SourceLike, type BufferLike, type NodeLike } from '../engine';
import { loadSettings, saveSettings, DEFAULTS, SETTINGS_KEY, LEGACY_KEY, type StorageLike } from '../settings';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

class FakeParam implements ParamLike {
  value: number; target: number;
  constructor(v = 1) { this.value = v; this.target = v; }
  setValueAtTime(v: number) { this.value = v; this.target = v; }
  linearRampToValueAtTime(v: number) { this.target = v; }
  cancelScheduledValues() { /* nincs ütemezés */ }
}
class FakeNode implements NodeLike {
  out: NodeLike[] = [];
  connect(n: NodeLike) { this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
class FakeGain extends FakeNode implements GainLike { gain = new FakeParam(1); }
class FakeSource extends FakeNode implements SourceLike {
  buffer: BufferLike | null = null; loop = false; onended: (() => void) | null = null;
  started: { when?: number; offset?: number } | null = null; stopped = false;
  start(when?: number, offset?: number) { this.started = { when, offset }; }
  stop() { this.stopped = true; }
}
class FakeCtx implements CtxLike {
  currentTime = 0; state = 'suspended'; destination = new FakeNode();
  gains: FakeGain[] = []; sources: FakeSource[] = []; suspends = 0; resumes = 0;
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  async decodeAudioData() { return { duration: 72 }; }
  async resume() { this.resumes++; this.state = 'running'; }
  async suspend() { this.suspends++; this.state = 'suspended'; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function make(opts: { storage?: MemStorage; session?: MemStorage; reduced?: boolean } = {}) {
  const storage = opts.storage ?? new MemStorage();
  const ctx = new FakeCtx();
  const loads: string[] = [];
  const timers: (() => void)[] = [];
  let created = 0;
  const eng = new AudioEngine({
    createContext: () => { created++; return ctx; },
    load: async (n) => { loads.push(n); return new ArrayBuffer(8); },
    storage,
    session: opts.session ?? new MemStorage(),
    reducedMotion: opts.reduced,
    setTimer: (fn) => { timers.push(fn); return 0; },
  });
  return { eng, ctx, storage, loads, timers, created: () => created, runTimers: () => { while (timers.length) timers.shift()!(); } };
}

describe('hangbeállítások', () => {
  it('alapértékek: hang BE, effekt 70%, alapzaj 35%, zene 25%', () => {
    expect(loadSettings(new MemStorage())).toEqual({ on: true, sfx: 0.7, amb: 0.35, music: 0.25 });
    expect(DEFAULTS.on).toBe(true);
  });
  it('mentés → visszaolvasás', () => {
    const st = new MemStorage();
    saveSettings(st, { on: false, sfx: 0.4, amb: 0, music: 0.9 });
    expect(loadSettings(st)).toEqual({ on: false, sfx: 0.4, amb: 0, music: 0.9 });
  });
  it('sérült vagy tartományon kívüli adat → alapérték / levágás', () => {
    const st = new MemStorage();
    st.setItem(SETTINGS_KEY, '{nem json');
    expect(loadSettings(st)).toEqual({ ...DEFAULTS });
    st.setItem(SETTINGS_KEY, JSON.stringify({ on: 'igen', sfx: 3, amb: -1, music: 'x' }));
    expect(loadSettings(st)).toEqual({ on: true, sfx: 1, amb: 0, music: 0.25 });
  });
  it("régi Műszak-kapcsoló: hs_sound='0' → némítva marad", () => {
    const st = new MemStorage(); st.setItem(LEGACY_KEY, '0');
    expect(loadSettings(st).on).toBe(false);
    expect(JSON.parse(st.getItem(SETTINGS_KEY)!).on).toBe(false); // átvéve az új kulcsba
  });
  it("régi hs_sound='1' → szól; nincs régi kulcs (új játékos) → szól", () => {
    const st = new MemStorage(); st.setItem(LEGACY_KEY, '1');
    expect(loadSettings(st).on).toBe(true);
    expect(loadSettings(new MemStorage()).on).toBe(true);
  });
  it('az új kulcs elsőbbséget élvez a régivel szemben', () => {
    const st = new MemStorage();
    st.setItem(SETTINGS_KEY, JSON.stringify({ on: true, sfx: 0.5, amb: 0.2, music: 0.1 }));
    st.setItem(LEGACY_KEY, '0');
    expect(loadSettings(st).on).toBe(true);
  });
  it('tiltott tároló (kivételt dob) → alapérték, nincs hiba', () => {
    const bad: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadSettings(bad)).toEqual({ ...DEFAULTS });
    expect(() => saveSettings(bad, { ...DEFAULTS })).not.toThrow();
  });
});

describe('hangmotor', () => {
  let h: ReturnType<typeof make>;
  beforeEach(() => { h = make(); });

  it('interakció előtt nincs AudioContext és nincs letöltés', async () => {
    h.eng.setLoops({ amb: 'room_hum', music: 'music' });
    h.eng.play('ok');
    await flush();
    expect(h.created()).toBe(0);
    expect(h.loads).toEqual([]);
  });

  it('feloldás után: az alapzaj és a zene halkan beúszik (0-ról indul)', async () => {
    h.eng.setLoops({ amb: 'room_hum', music: 'music' });
    h.eng.unlock();
    await flush(); await flush();
    expect(h.ctx.state).toBe('running');
    expect(h.loads.sort()).toEqual(['music', 'room_hum']);
    const loops = h.ctx.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(2);
    // a hurok saját erősítője 0-ról indul és felfelé rámpáz
    const loopGains = h.ctx.gains.slice(4);
    expect(loopGains.every((g) => g.gain.value === 0 && g.gain.target > 0)).toBe(true);
  });

  it('csatorna-hangerők a beállítás szerint; a fő némítás minden csatornát elnémít', () => {
    h.eng.unlock();
    expect(h.eng.debugState().chans).toEqual({ sfx: 0.7, amb: 0.35, music: 0.25 });
    h.eng.update({ on: false });
    const [master, sfx, amb, music] = h.ctx.gains;
    expect([master, sfx, amb, music].map((g) => g.gain.target)).toEqual([0, 0, 0, 0]);
    expect(h.eng.effectiveVolume('sfx') + h.eng.effectiveVolume('amb') + h.eng.effectiveVolume('music')).toBe(0);
    expect(JSON.parse(h.storage.getItem(SETTINGS_KEY)!).on).toBe(false);
    h.eng.update({ on: true });
    expect([master, sfx, amb, music].map((g) => g.gain.target)).toEqual([1, 0.7, 0.35, 0.25]);
  });

  it('némítva nem szól effekt, és nem is töltődik le', async () => {
    h.eng.update({ on: false });
    h.eng.unlock();
    h.eng.play('ok');
    await flush();
    expect(h.ctx.sources).toHaveLength(0);
    expect(h.loads).toEqual([]);
  });

  it('effekt lejátszása: forrás az effekt-csatornán, a túl sűrű ismétlés elnyelve', async () => {
    let now = 1000;
    const st = new MemStorage();
    const ctx = new FakeCtx();
    const eng = new AudioEngine({ createContext: () => ctx, load: async () => new ArrayBuffer(1), storage: st, now: () => now, setTimer: () => 0 });
    eng.unlock();
    eng.play('hover'); eng.play('hover');
    now += 200; eng.play('hover');
    await flush();
    expect(ctx.sources.filter((s) => s.started)).toHaveLength(2);
  });

  it('interakció előtt kért fontos jelzés (queue) a feloldáskor lejátszódik, a többi nem', async () => {
    h.eng.play('era');
    h.eng.play('ok');
    h.eng.unlock();
    h.runTimers();
    await flush();
    expect(h.loads).toEqual(['era']);
  });

  it('rejtett lapon elhalkul és szünetel, visszatéréskor folytatódik', async () => {
    h.eng.setLoops({ music: 'music' });
    h.eng.unlock();
    await flush();
    h.eng.setHidden(true);
    expect(h.ctx.gains[0].gain.target).toBe(0);
    h.runTimers();
    await flush();
    expect(h.ctx.suspends).toBe(1);
    expect(h.ctx.state).toBe('suspended');
    h.eng.play('ok'); // rejtett lapon nincs effekt
    await flush();
    expect(h.loads).not.toContain('ok');
    h.eng.setHidden(false);
    await flush();
    expect(h.ctx.state).toBe('running');
    expect(h.ctx.gains[0].gain.target).toBe(1);
  });

  it('ha gyorsan visszatér a lapra, az elhalasztott szüneteltetés elmarad', async () => {
    h.eng.unlock();
    h.eng.setHidden(true);
    h.eng.setHidden(false);
    h.runTimers();
    await flush();
    expect(h.ctx.suspends).toBe(0);
  });

  it('zene-pozíció: lapelhagyáskor mentve, a következő oldalon onnan folytatódik', async () => {
    const session = new MemStorage();
    const a = make({ session });
    a.eng.setLoops({ music: 'music' });
    a.eng.unlock(); await flush(); await flush();
    a.ctx.currentTime = 10.5;
    a.eng.persist();
    expect(session.getItem('hs_music_pos')).toBe('10.50');
    const b = make({ session });
    b.eng.setLoops({ music: 'music' });
    b.eng.unlock(); await flush(); await flush();
    expect(b.ctx.sources.find((s) => s.loop)!.started!.offset).toBeCloseTo(10.5);
  });

  it('prefers-reduced-motion: halkabb effekt-csatorna', () => {
    const r = make({ reduced: true });
    r.eng.unlock();
    expect(r.eng.effectiveVolume('sfx')).toBeCloseTo(0.49);
    expect(r.eng.debugState().chans.sfx).toBeCloseTo(0.49);
  });

  it('feliratkozók értesülnek a változásról (a vezérlők szinkronban maradnak)', () => {
    const seen: boolean[] = [];
    h.eng.subscribe((s) => seen.push(s.on));
    h.eng.toggle(); h.eng.toggle();
    expect(seen).toEqual([false, true]);
  });

  it('némításkor a hurkok nem indulnak; visszakapcsoláskor igen', async () => {
    h.eng.update({ on: false });
    h.eng.setLoops({ amb: 'room_hum' });
    h.eng.unlock(); await flush();
    expect(h.ctx.sources).toHaveLength(0);
    h.eng.update({ on: true }); await flush(); await flush();
    expect(h.ctx.sources.filter((s) => s.loop)).toHaveLength(1);
  });

  it('synthOut: némítva null, egyébként az effekt-csatorna', () => {
    h.eng.unlock();
    expect(h.eng.synthOut()?.out).toBe(h.ctx.gains[1]);
    h.eng.update({ on: false });
    expect(h.eng.synthOut()).toBeNull();
  });

  it('hurok: ha a dekódolt fájl hosszabb (AAC-kitöltés), a hurok a pontos hossznál fordul', async () => {
    const ctx = new FakeCtx();
    ctx.decodeAudioData = async () => ({ duration: 72.013 });
    const eng = new AudioEngine({ createContext: () => ctx, load: async () => new ArrayBuffer(1), storage: new MemStorage(), setTimer: () => 0 });
    eng.setLoops({ music: 'music' });
    eng.unlock(); await flush(); await flush();
    const src = ctx.sources.find((s) => s.loop) as FakeSource & { loopEnd?: number };
    expect(src.loopEnd).toBe(72);
  });
});
