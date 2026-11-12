#!/usr/bin/env python3
"""Hyperscales hangkör — saját szintézis (numpy). Kimenet: WAV-ok a megadott mappába.
   python synth.py <kimenet_mappa> <el_mappa>
Minden itt készült hang licenctiszta (saját kód, nincs minta). Az ElevenLabs-hangokat (el_mappa) csak vágja,
normalizálja, a zúgásból varratmentes hurkot készít."""
import sys, os, subprocess
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

SR = 48000
OUT, ELD = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1112)

def t_(d): return np.arange(int(SR * d)) / SR
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def env_ad(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)
    return e
def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x, axis=0)
def norm(x, peak_db):
    p = np.max(np.abs(x)) or 1
    return x / p * 10 ** (peak_db / 20)
def fade(x, fin=0.003, fout=0.02):
    x = x.copy(); a = int(SR * fin); b = int(SR * fout)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None] if x.ndim > 1 else np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None] if x.ndim > 1 else np.linspace(1, 0, b)
    return x
def save(name, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    wavfile.write(os.path.join(OUT, name + '.wav'), SR, x)
def reverb_ir(dur, decay, stereo=True):
    n = int(SR * dur); t = np.arange(n) / SR
    ch = []
    for _ in range(2 if stereo else 1):
        w = rng.standard_normal(n) * np.exp(-t / decay)
        ch.append(lp(w, 6000))
    ir = np.stack(ch, 1) if stereo else ch[0]
    return ir / np.sqrt(np.sum(ir ** 2, axis=0))
def add_verb(x, wet, dur=1.6, decay=0.45):
    ir = reverb_ir(dur, decay, stereo=False)
    y = fftconvolve(x, ir)[:len(x) + len(ir)]
    out = np.zeros(len(y)); out[:len(x)] = x
    return out + wet * y

def bell(f, d, bright=1.0):
    t = t_(d)
    parts = [(1, 1, 1), (2.0, .35 * bright, .6), (3.01, .18 * bright, .35), (4.2, .08 * bright, .25), (5.43, .04 * bright, .15)]
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (d * dk * 0.45)) for r, a, dk in parts)
    return s * np.minimum(1, t / 0.002)
def mallet(f, d):
    t = t_(d)
    s = np.sin(2 * np.pi * f * t) + .25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / .02)
    return s * np.exp(-t / (d * .3)) * np.minimum(1, t / .002)
def place(buf, x, at):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n]

# ─── UI-hangok ───
def hover():
    t = t_(0.035)
    x = np.sin(2 * np.pi * 2600 * t) * np.exp(-t / .006) + .3 * lp(rng.standard_normal(len(t)), 5000) * np.exp(-t / .003)
    save('hover', fade(norm(hp(x, 800), -6), 0.0005, 0.005))

def ok():
    b = np.zeros(int(SR * .6))
    place(b, mallet(hz(84), .35), 0); place(b, .8 * mallet(hz(91), .45), .075)
    save('ok', fade(norm(lp(add_verb(b, .15, .8, .2)[:len(b)], 7000), -3)))

def err():
    b = np.zeros(int(SR * .65))
    for m, at in ((64, 0), (60, .11)):
        t = t_(.4); f = hz(m)
        x = (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2 * f * t) + .12 * np.sin(2 * np.pi * 3 * f * t))
        place(b, x * env_ad(len(t), .01, .12), at)
    save('err', fade(norm(lp(b, 2500), -3)))

def attention():
    b = np.zeros(int(SR * 1.6))
    for i, m in enumerate((79, 83, 86)):
        place(b, (.9 - .15 * i) * bell(hz(m), 1.1, .7), i * .14)
    save('attention', fade(norm(lp(add_verb(b, .22, 1.2, .3)[:len(b)], 8000), -3), 0.002, 0.2))

def achievement():
    b = np.zeros(int(SR * 2.0))
    for i, m in enumerate((72, 76, 79, 84)):
        place(b, .8 * mallet(hz(m), .5), i * .085)
    place(b, .7 * bell(hz(88), 1.4, 1.0), .34); place(b, .5 * bell(hz(91), 1.4, 1.0), .40)
    t = t_(.9)  # csillámlás
    sp = hp(rng.standard_normal(len(t)), 7000) * np.exp(-t / .25) * .05
    place(b, sp, .34)
    save('achievement', fade(norm(add_verb(b, .25, 1.4, .35)[:len(b)], -2), 0.002, 0.3))

def brass(f, d, swell=.08):
    t = t_(d)
    ph = 2 * np.pi * f * t + .004 * np.sin(2 * np.pi * 5.2 * t) * 2 * np.pi * f / 5.2 * 0.02
    saw = sum(((-1) ** (k + 1)) / k * np.sin(k * ph) for k in range(1, 14))
    e = np.minimum(1, t / swell) * np.exp(-np.maximum(0, t - swell) / (d * .6))
    return lp(saw, 1400 + 1800) * e

def era():
    b = np.zeros(int(SR * 3.6))
    seq = [((60, 64, 67), 0, .32), ((60, 64, 67), .36, .2), ((65, 69, 72), .6, .32), ((67, 71, 74), .96, .32), ((72, 76, 79, 84), 1.32, 1.9)]
    for notes, at, d in seq:
        for m in notes:
            place(b, .3 * brass(hz(m), d), at)
    t = t_(1.2)  # üstdob-szerű dobbanás
    place(b, .9 * np.sin(2 * np.pi * (70 * t + 40 * (1 - np.exp(-t / .05)) * .05)) * np.exp(-t / .35), 1.32)
    place(b, .9 * np.sin(2 * np.pi * 65 * t) * np.exp(-t / .2), 0)
    for i, m in enumerate((84, 88, 91, 96)):
        place(b, .25 * bell(hz(m), 1.5, .9), 1.36 + i * .07)
    st = np.stack([b, b], 1)
    y = fftconvolve(b, reverb_ir(2.2, .6, False))[:len(b)]
    y2 = fftconvolve(b, reverb_ir(2.2, .6, False))[:len(b)]
    st[:, 0] += .3 * y; st[:, 1] += .3 * y2
    save('era', fade(norm(st, -1.5), 0.002, 0.5))

def lowcash():
    b = np.zeros(int(SR * .9))
    for at in (0, .26):
        t = t_(.24); f = hz(69)
        x = np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 1.5 * t)
        place(b, x * env_ad(len(t), .02, .07), at)
    save('lowcash', fade(norm(lp(add_verb(b, .12, .7, .2)[:len(b)], 3000), -4)))

# ─── ElevenLabs-hangok utómunkája ───
def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)
def trim(x, thr_db=-50, pad=0.005):
    thr = 10 ** (thr_db / 20); idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0: return x
    a = max(0, idx[0] - int(pad * SR)); b = min(len(x), idx[-1] + int(0.03 * SR))
    return x[a:b]
def el_short(src, name, peak, maxd, tail_db=-55):
    x = trim(load(os.path.join(ELD, src)), tail_db)[:int(maxd * SR)]
    save(name, fade(norm(hp(x, 60), peak), 0.002, 0.04))

def hum_loop():
    x = load(os.path.join(ELD, 'room_hum.mp3'))
    x = lp(hp(x, 40), 9000)[int(.3 * SR):int(9.9 * SR)]  # szűrés a hurok előtt (különben a szűrő-tranziens a varratnál pattan)
    xf = int(1.5 * SR); body = x[:-xf].copy(); tail = x[-xf:]
    w = np.sin(np.linspace(0, np.pi / 2, xf)) ** 2  # egyenletes teljesítményű áttűnés
    body[:xf] = body[:xf] * np.sqrt(w) + tail * np.sqrt(1 - w)
    rms = np.sqrt(np.mean(body ** 2)); body = body / rms * 10 ** (-24 / 20)
    st = np.stack([body, np.roll(body, int(.37 * SR))], 1)  # álsztereó: ugyanaz a hurok eltolva, továbbra is varratmentes
    save('room_hum', np.clip(st, -.9, .9))

# ─── Zene: nyugis lo-fi/ambient hurok (80 BPM, 24 ütem = 72 mp) ───
def music():
    bpm = 80; beat = 60 / bpm; bar = 4 * beat; bars = 24; L = bars * bar
    tail = 4.0; N = int(SR * (L + tail))
    keys = np.zeros((N, 2)); pad = np.zeros((N, 2)); bass = np.zeros(N); drums = np.zeros(N); mel = np.zeros((N, 2))
    prog = [(50, (62, 65, 69, 72, 76)), (55, (62, 65, 69, 71, 76)), (48, (60, 64, 67, 71, 74)), (45, (60, 64, 67, 69, 71))]  # Dm9 G13 Cmaj9 Am9
    def ep(f, d):  # puha elektromos zongora
        t = t_(d)
        x = np.sin(2 * np.pi * f * t + .6 * np.sin(2 * np.pi * f * t) * np.exp(-t / .4)) + .15 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / .3)
        return x * np.minimum(1, t / .008) * np.exp(-t / 1.6) * (1 + .12 * np.sin(2 * np.pi * 4.5 * t))
    def padv(f, d):
        t = t_(d); x = np.zeros(len(t))
        for det in (-.07, 0, .06):
            x += np.sin(2 * np.pi * f * (1 + det / 100 * 12) * t + rng.uniform(0, 6.28))
            x += .3 * np.sin(2 * np.pi * 2 * f * (1 + det / 100 * 12) * t)
        a = np.minimum(1, t / 1.2) * np.minimum(1, np.maximum(0, (d - t)) / 1.5)
        return x * a
    for b in range(bars):
        root, ch = prog[(b // 2) % 4]; t0 = b * bar; sec = b // 8
        if b % 2 == 0:
            # billentyű: akkord az 1-re, lágy ismétlés a 3. negyed után
            for k, m in enumerate(ch):
                g = .16 * (1 - .08 * k); pan = .35 + .3 * (k / 4)
                for at, gg in ((0, 1), (2.5 * beat, .55), (4 * beat, .7), (6.5 * beat, .45)):
                    s = ep(hz(m), 3.2) * g * gg
                    i = int((t0 + at + k * .012) * SR); n = min(len(s), N - i)
                    keys[i:i + n, 0] += s[:n] * (1 - pan); keys[i:i + n, 1] += s[:n] * pan
            p = padv(hz(ch[1]), 2 * bar + .5) * .05 + padv(hz(ch[3]), 2 * bar + .5) * .04
            i = int(t0 * SR); n = min(len(p), N - i); pad[i:i + n, 0] += p[:n]; pad[i:i + n, 1] += np.roll(p, 700)[:n]
            for at, d in ((0, 1.8 * beat), (3 * beat, .8 * beat), (4 * beat, 1.8 * beat), (7 * beat, .9 * beat)):
                tt = t_(d); f = hz(root - 12 if root > 47 else root)
                s = (np.sin(2 * np.pi * f * tt) + .2 * np.sin(4 * np.pi * f * tt)) * np.minimum(1, tt / .015) * np.exp(-tt / .9) * np.minimum(1, (d - tt) / .05)
                place(bass, .32 * s, t0 + at)
        # dob: nagyon finom, a középső szakaszban telibb
        if sec != 0 or b >= 4:
            for at in (0, 2.5 * beat):
                tt = t_(.45); s = np.sin(2 * np.pi * (52 * tt + 60 * .04 * (1 - np.exp(-tt / .04)))) * np.exp(-tt / .18)
                place(drums, .42 * s, t0 + at)
            for at in (beat, 3 * beat):
                tt = t_(.25); s = lp(hp(rng.standard_normal(len(tt)), 900), 4500) * np.exp(-tt / .06)
                place(drums, (.10 if sec == 1 else .07) * s, t0 + at)
            for k in range(8):
                swing = .06 * beat if k % 2 else 0
                tt = t_(.06); s = hp(rng.standard_normal(len(tt)), 7000) * np.exp(-tt / .012)
                place(drums, (.035 if k % 2 else .05) * s, t0 + k * beat / 2 + swing)
        # dallam-töredékek a 2. és 3. szakaszban (pentaton, ritkás)
        if sec >= 1 and b % 2 == 1:
            phr = [(0, 81), (.75, 79), (1.5, 76), (2.5, 74)] if (b // 2) % 2 == 0 else [(0, 76), (1, 79), (2, 81), (3.25, 84)]
            for at, m in phr:
                s = bell(hz(m), 1.4, .5) * (.06 if sec == 1 else .05)
                i = int((t0 + at * beat) * SR); n = min(len(s), N - i)
                mel[i:i + n, 0] += s[:n] * .4; mel[i:i + n, 1] += s[:n] * .6
    # lo-fi szín: billentyű-visszhang (késleltetés), lágy szűrés, sercegés
    d = int(SR * beat * .75)
    echo = np.zeros_like(keys); src = keys + mel
    for k in range(1, 4):
        sh = d * k
        echo[sh:] += (0.3 ** k) * src[:-sh][:, ::-1 if k % 2 else 1]
    mix = keys + pad + mel + echo + np.stack([bass, bass], 1) + np.stack([drums, drums], 1) * .9
    ir = reverb_ir(3.0, .9)
    wet = np.stack([fftconvolve(mix[:, c], ir[:, c])[:N] for c in range(2)], 1)
    mix = mix + .22 * wet
    mix = lp(mix, 5200)
    crack = np.zeros(N); pos = rng.integers(0, N, int(L * 6)); crack[pos] = rng.uniform(-1, 1, len(pos)) * .05
    crack = hp(lp(crack, 6000), 1500) + .0015 * lp(rng.standard_normal(N), 3000)
    mix += np.stack([crack, crack], 1)
    # varratmentes hurok: a farok visszahajtva az elejére
    Ln = int(SR * L); out = mix[:Ln].copy(); out[:N - Ln] += mix[Ln:]
    rms = np.sqrt(np.mean(out ** 2)); out = out / rms * 10 ** (-20 / 20)
    out = np.tanh(out * 1.2) / 1.2
    save('music', np.clip(out, -.98, .98))

for f in ([hover, ok, err, attention, achievement, era, lowcash, music] if len(sys.argv) < 4 else []):
    f()
el_short('rack_slide.mp3', 'slide', -2, 1.6)
el_short('latch.mp3', 'buy', -2, 0.6)
el_short('coins.mp3', 'cash', -3, 0.8)
hum_loop()
print('ok')
