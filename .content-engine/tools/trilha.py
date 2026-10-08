"""
Gera uma trilha instrumental curta e moderna (pad suave + arpejo + batida leve), sem direitos autorais.
Uso: python trilha.py <saida.mp3> [bpm] [segundos]
"""
import subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
out = Path(sys.argv[1])
BPM = float(sys.argv[2]) if len(sys.argv) > 2 else 96
SEG = float(sys.argv[3]) if len(sys.argv) > 3 else 40
beat = 60 / BPM
n = int(SR * SEG)
t = np.arange(n) / SR
rng = np.random.default_rng(7)


def hz(m):  # nota MIDI -> Hz
    return 440 * 2 ** ((m - 69) / 12)


def lp(x, fc):
    b, a = butter(2, fc / (SR / 2), "low")
    return lfilter(b, a, x)


def hp(x, fc):
    b, a = butter(2, fc / (SR / 2), "high")
    return lfilter(b, a, x)


# progressão Am9 - Fmaj7 - Cmaj7 - G6 (1 compasso cada, 4 tempos)
acordes = [
    (45, [57, 60, 64, 71]),   # Am9
    (41, [53, 57, 60, 64]),   # Fmaj7
    (48, [55, 59, 64, 67]),   # Cmaj7
    (43, [55, 59, 62, 64]),   # G6
]
compasso = 4 * beat
mix = np.zeros(n)
pad = np.zeros(n)
bass = np.zeros(n)
pluck = np.zeros(n)

for c in range(int(SEG / compasso) + 1):
    baixo, notas = acordes[c % 4]
    i0 = int(c * compasso * SR)
    if i0 >= n:
        break
    L = min(int((compasso + 0.6) * SR), n - i0)
    tt = np.arange(L) / SR
    env = np.minimum(1, tt / 0.5) * np.exp(-np.maximum(0, tt - compasso) * 6)
    for m in notas:
        f = hz(m)
        for det in (-0.12, 0.0, 0.12):
            pad[i0:i0 + L] += env * np.sin(2 * np.pi * (f + det) * tt + rng.uniform(0, 6)) * 0.05
    benv = np.exp(-tt * 1.6) * np.minimum(1, tt / 0.02)
    bass[i0:i0 + L] += benv * np.sin(2 * np.pi * hz(baixo) * tt) * 0.32
    # arpejo em colcheias
    for k in range(8):
        s = i0 + int(k * beat / 2 * SR)
        if s >= n:
            break
        m = notas[(k * 3) % len(notas)] + 12
        Lp = min(int(0.9 * SR), n - s)
        tp = np.arange(Lp) / SR
        pe = np.exp(-tp * 5.5)
        pluck[s:s + Lp] += pe * (np.sin(2 * np.pi * hz(m) * tp) + 0.35 * np.sin(2 * np.pi * hz(m) * 2 * tp)) * 0.07

pad = lp(pad, 1800)
# eco no arpejo
eco = np.zeros(n)
atraso = int(beat * 0.75 * SR)
eco[atraso:] = pluck[:-atraso] * 0.45
pluck = lp(pluck + eco, 5200)

# batida: bumbo nos tempos 1 e 3, chimbal nas colcheias
kick = np.zeros(n)
hat = np.zeros(n)
for b in range(int(SEG / beat)):
    s = int(b * beat * SR)
    if b % 4 in (0, 2):
        Lk = min(int(0.35 * SR), n - s)
        tk = np.arange(Lk) / SR
        fk = 48 + 90 * np.exp(-tk * 28)
        kick[s:s + Lk] += np.sin(2 * np.pi * np.cumsum(fk) / SR) * np.exp(-tk * 11) * 0.55
    for h in (0, 0.5):
        sh = s + int(h * beat * SR)
        if sh >= n:
            continue
        Lh = min(int(0.05 * SR), n - sh)
        hat[sh:sh + Lh] += rng.normal(0, 1, Lh) * np.exp(-np.arange(Lh) / SR * 90) * (0.05 if h == 0 else 0.03)
hat = hp(hat, 6500)

mix = pad + bass + pluck + kick + hat
# entrada/saída suaves e loop sem estalo
mix *= np.minimum(1, t / 0.6) * np.minimum(1, (SEG - t) / 1.2)
mix = np.tanh(mix * 1.4)
mix /= np.max(np.abs(mix)) / 0.85
est = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1)

with tempfile.TemporaryDirectory() as d:
    wav = Path(d) / "t.wav"
    wavfile.write(wav, SR, (est * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-b:a", "192k", str(out)], check=True)
print("trilha ok:", out)
