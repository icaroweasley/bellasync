"""
Narra um cenas.json com edge-tts (voz neural gratuita da Microsoft) e mede o tempo de cada palavra.

Uso: python narrar.py <cenas.json> <pasta_public_do_remotion> <id> [voz] [velocidade]
Gera em <public>/: <id>-voz.mp3 e <id>-palavras.json (formato "Tempos" do Remotion).
"""
import asyncio, json, subprocess, sys, tempfile
from pathlib import Path

import edge_tts

LEAD = 0.30   # silêncio antes da primeira fala
GAP = 0.28    # pausa entre cenas


def dur(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


async def narrar_cena(texto: str, voz: str, rate: str, destino: Path):
    com = edge_tts.Communicate(texto, voz, rate=rate, boundary="WordBoundary")
    palavras, audio = [], bytearray()
    async for ev in com.stream():
        if ev["type"] == "audio":
            audio += ev["data"]
        elif ev["type"] == "WordBoundary":
            palavras.append((ev["text"], ev["offset"] / 1e7, (ev["offset"] + ev["duration"]) / 1e7))
    destino.write_bytes(bytes(audio))
    return palavras


async def main():
    cenas_path, public, id_ = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    voz = sys.argv[4] if len(sys.argv) > 4 else "pt-BR-FranciscaNeural"
    rate = sys.argv[5] if len(sys.argv) > 5 else "+4%"
    props = json.loads(cenas_path.read_text(encoding="utf-8"))
    tmp = Path(tempfile.mkdtemp(prefix="narrar-"))

    partes, palavras_out, cenas_out = [], [], []
    t = LEAD
    for i, cena in enumerate(props["cenas"]):
        mp3 = tmp / f"c{i}.mp3"
        ws = await narrar_cena(cena["fala"], voz, rate, mp3)
        d = dur(mp3)
        inicio_cena = 0.0 if i == 0 else t - GAP / 2
        for texto, a, b in ws:
            palavras_out.append({"texto": texto, "inicio": round(t + a, 3), "fim": round(t + b, 3), "cena": i})
        partes.append((mp3, t))
        t += d + GAP
        cenas_out.append({"inicio": round(inicio_cena, 3), "fim": round(t - GAP / 2, 3)})
    total = t - GAP + 0.2
    cenas_out[-1]["fim"] = round(total, 3)

    # monta o áudio único: cada cena atrasada até o seu início
    cmd = ["ffmpeg", "-y", "-v", "error"]
    for mp3, _ in partes:
        cmd += ["-i", str(mp3)]
    filtros = [f"[{k}:a]adelay={int(s * 1000)}|{int(s * 1000)}[a{k}]" for k, (_, s) in enumerate(partes)]
    mix = "".join(f"[a{k}]" for k in range(len(partes))) + f"amix=inputs={len(partes)}:normalize=0,apad=whole_dur={total}[o]"
    cmd += ["-filter_complex", ";".join(filtros + [mix]), "-map", "[o]", "-ac", "2", "-b:a", "192k", str(public / f"{id_}-voz.mp3")]
    subprocess.run(cmd, check=True)

    tempos = {"palavras": palavras_out, "cenas": cenas_out, "duracao": round(total, 3)}
    (public / f"{id_}-palavras.json").write_text(json.dumps(tempos, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"narração ok: {len(palavras_out)} palavras, {total:.1f}s")


asyncio.run(main())
