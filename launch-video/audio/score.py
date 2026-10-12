"""Synthesizes the launch video's score and sound effects, synced to the frames in src/Launch.tsx (30 fps).

    python audio/score.py out/score.wav
"""

import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
FPS = 30
DUR = 1560 / FPS + 1.5
N = int(DUR * SR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def t(n):
    return np.arange(n) / SR


def env(n, a=0.005, d=0.2):
    x = t(n)
    e = np.minimum(1, x / max(a, 1e-4)) * np.exp(-np.maximum(0, x - a) / max(d, 1e-4))
    return e


def lp(x, hz):
    b, a = butter(2, min(hz / (SR / 2), 0.99), "low")
    return lfilter(b, a, x)


def hp(x, hz):
    b, a = butter(2, min(hz / (SR / 2), 0.99), "high")
    return lfilter(b, a, x)


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * (1 - max(0, pan))
    R[i : i + len(sig)] += sig * gain * (1 + min(0, pan))


def F(frame):
    return frame / FPS


# ---------------------------------------------------------------- instruments
def beep(f=1000, d=0.12):
    n = int(d * SR)
    return np.sin(2 * np.pi * f * t(n)) * env(n, 0.002, d / 3)


def kick():
    n = int(0.35 * SR)
    x = t(n)
    f = 45 + 110 * np.exp(-x * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x * 9) + 0.3 * np.tanh(4 * np.sin(ph)) * np.exp(-x * 25)


def hat(d=0.05):
    n = int(d * SR)
    return hp(rng.standard_normal(n), 7000) * env(n, 0.001, d / 4)


def clap():
    n = int(0.2 * SR)
    nz = hp(lp(rng.standard_normal(n), 3000), 900)
    e = np.zeros(n)
    for off in (0, 0.01, 0.02):
        i = int(off * SR)
        e[i:] += np.exp(-t(n - i) * 35)
    return nz * e * 0.6


def bass(f, d):
    n = int(d * SR)
    x = t(n)
    s = np.sign(np.sin(2 * np.pi * f * x)) * 0.5 + np.sin(2 * np.pi * f * x)
    return lp(s, 400) * env(n, 0.01, d * 0.6)


def impact(d=2.5):
    n = int(d * SR)
    x = t(n)
    boom = np.sin(2 * np.pi * (35 + 60 * np.exp(-x * 6)) * x) * np.exp(-x * 2.2)
    crack = lp(rng.standard_normal(n), 5000) * np.exp(-x * 14)
    return np.tanh(1.6 * (boom + 0.5 * crack))


def riser(d=1.5):
    n = int(d * SR)
    x = t(n)
    nz = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep a band of noise upward
    for k in range(8):
        a, b = int(k * n / 8), int((k + 1) * n / 8)
        out[a:b] = hp(lp(nz[a:b], 600 + 9000 * (k / 8) ** 2), 300 + 3000 * (k / 8) ** 2)
    return out * (x / d) ** 2


def whoosh(d=0.45):
    n = int(d * SR)
    x = t(n)
    shape = np.sin(np.pi * x / d) ** 2
    nz = lp(hp(rng.standard_normal(n), 400), 6000)
    return nz * shape * 0.7


def glitch(d=0.6):
    n = int(d * SR)
    x = t(n)
    s = np.sign(np.sin(2 * np.pi * (220 + 900 * rng.random()) * x))
    s *= (rng.random(n) > 0.3)
    stut = (np.floor(x * 40) % 2)
    crushed = np.round(rng.standard_normal(n) * 4) / 4
    return np.tanh(2 * (0.5 * s * stut + 0.5 * crushed)) * np.exp(-x * 3)


def click():
    n = int(0.025 * SR)
    return hp(rng.standard_normal(n), 2500) * env(n, 0.0005, 0.006)


def pop(f=600):
    n = int(0.12 * SR)
    x = t(n)
    return np.sin(2 * np.pi * (f + 900 * np.exp(-x * 60)) * x) * np.exp(-x * 30)


def chime(freqs, d=1.6):
    n = int(d * SR)
    x = t(n)
    s = sum(np.sin(2 * np.pi * f * x) + 0.3 * np.sin(2 * np.pi * f * 2.01 * x) for f in freqs)
    return s / len(freqs) * env(n, 0.004, d / 3)


def buzz(d=0.5):
    n = int(d * SR)
    x = t(n)
    s = np.sign(np.sin(2 * np.pi * 110 * x)) + np.sign(np.sin(2 * np.pi * 116 * x))
    return lp(s, 1800) * 0.5 * env(n, 0.005, d / 2)


def ring():
    n = int(0.9 * SR)
    x = t(n)
    trem = (np.floor(x * 18) % 2)
    s = (np.sin(2 * np.pi * 440 * x) + np.sin(2 * np.pi * 480 * x)) * 0.5 * trem
    return s * env(n, 0.01, 0.6)


def pad(freqs, d):
    n = int(d * SR)
    x = t(n)
    s = sum(np.sin(2 * np.pi * f * x + np.sin(2 * np.pi * 0.2 * x) * 0.5) for f in freqs) / len(freqs)
    fade = np.minimum(1, x / 1.0) * np.minimum(1, (d - x) / 1.0)
    return lp(s, 1200) * fade


# ---------------------------------------------------------------- 1. cold open: heartbeat monitor
add(pad([55, 82.4, 110], 4.2), 0, 0.22)
for fr in (13.75, 41.3, 68.8, 96.3):
    add(beep(1000, 0.11), F(fr), 0.35)
    add(kick() * 0.5, F(fr) - 0.05, 0.35)

# ---------------------------------------------------------------- 2. "It was wrong."
add(riser(0.7), F(120) - 0.7, 0.35)
add(impact(2.6), F(120), 0.9)
add(glitch(0.7), F(120), 0.45, -0.3)
add(glitch(0.5), F(124), 0.35, 0.3)
add(pad([46.2, 69.3, 92.5], 7.0), F(124), 0.26)  # tense drone into "the lie"

# ---------------------------------------------------------------- 3. the lie
for i in range(12):
    add(pop(500 + i * 40) * 0.6, F(200 + 6 + i * 2.5), 0.25, (i % 4 - 1.5) / 2)
add(beep(880, 0.09), F(260), 0.35)
add(beep(660, 0.09), F(263), 0.35)
add(whoosh(0.5), F(268), 0.4, 0.4)
for i in range(5):
    add(click() * 2, F(292 + i * 7), 0.4)
add(impact(1.2) * 0.6, F(325), 0.55)
add(buzz(0.35), F(325), 0.3)

# ---------------------------------------------------------------- 4. brand reveal
add(riser(1.6), F(390) - 1.2, 0.5)
add(impact(3.0), F(392), 0.85)
add(chime([523.25, 659.25, 783.99, 1046.5], 2.6), F(426), 0.4)
add(pad([65.4, 98, 130.8, 164.8], 4.3), F(392), 0.3)

# ---------------------------------------------------------------- 5. the loop: 120 BPM beat
BPM = 120
beat = 60 / BPM
start, stop = F(515), F(1425)
roots = [55, 55, 65.41, 49]  # A, A, C, G per bar
b = 0
x0 = start
while x0 < stop - 0.01:
    bar = b // 4
    add(kick(), x0, 0.75)
    if b % 2 == 1:
        add(clap(), x0, 0.45)
    add(hat(), x0 + beat / 2, 0.22, 0.25)
    add(hat(0.03), x0 + beat / 4 * 3, 0.12, -0.25)
    add(bass(roots[bar % 4], beat * 0.9), x0, 0.35)
    b += 1
    x0 += beat
for fr in (515, 630, 755, 870, 1000, 1150, 1275):
    add(whoosh(0.5), F(fr) - 0.3, 0.5, 0.0)
add(pad([110, 164.8, 220], F(1425) - F(515)), F(515), 0.12)

# Cause: typing
for i in range(23):
    add(click(), F(630 + 8) + i / 1.6 / FPS, 0.5, rng.uniform(-0.3, 0.3))
add(pop(900), F(630 + 36), 0.3)
# Family: variants split off
for i in range(10):
    add(pop(700 + i * 60), F(755 + 18 + i * 2), 0.3, (i / 9 - 0.5))
# Proof: rising ticks, then the success chord
scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0]
for i, f in enumerate(scale):
    add(beep(f, 0.14), F(870 + 44 + i * 7), 0.3)
add(chime([523.25, 659.25, 783.99, 1046.5], 1.8), F(870 + 84), 0.4)
# Approve: phone rings, the phrase, the merge
add(ring(), F(1000), 0.3)
add(ring(), F(1000) + 1.0, 0.18)
add(pop(1200), F(1088), 0.4)
add(chime([659.25, 987.77, 1318.5], 1.6), F(1112), 0.4)
# Immune
add(buzz(0.5), F(1150 + 36), 0.4)
add(chime([783.99, 987.77, 1174.66, 1567.98], 2.0), F(1150 + 62), 0.42)
# Stats: count-up ticks
for i in range(4):
    for j in range(8):
        add(click() * 1.5, F(1275 + 24 + i * 8) + j * 0.06, 0.18)

# ---------------------------------------------------------------- 7. end card
add(riser(1.2), F(1425) - 1.2, 0.45)
add(impact(3.5), F(1425), 0.9)
add(chime([261.63, 329.63, 392.0, 523.25, 659.25], 4.0), F(1429), 0.45)
add(pad([65.4, 98, 130.8, 196], 4.6), F(1425), 0.32)

# ---------------------------------------------------------------- master
mix = np.stack([L, R], axis=1)
# a touch of room: short stereo slap
d = int(0.023 * SR)
mix[d:, 0] += 0.18 * mix[:-d, 1]
mix[d:, 1] += 0.18 * mix[:-d, 0]
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else "out/score.wav", SR, (mix * 32767).astype(np.int16))
print("score written", round(len(mix) / SR, 1), "s")
