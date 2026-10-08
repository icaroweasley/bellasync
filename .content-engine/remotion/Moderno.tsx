/* Composição "Moderno": mesmo cenas.json do Reel, visual novo.
   Fundo com luz em movimento e partículas, barra de progresso de story, cartões de vidro,
   texto com mola (spring), CTA que pulsa. Aceita narração, palavras.json e trilha. */
import React, { useMemo } from 'react';
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { CORES_PADRAO, type Cena, type Cores, type ReelProps } from './tipos';
import { estimarTempos, montarLinhas, type Linha } from './tempo';
import { Fontes } from './fontes';
import { pilhaSans, pilhaSerif } from './fontes';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

const useMola = (delay = 0, damping = 15, stiffness = 120) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness, mass: 0.9 } });
};

const ouro = (c: Cores) => `linear-gradient(120deg, #f6e8cd 0%, ${c.destaque} 45%, #a8823f 100%)`;
const textoOuro = (c: Cores): React.CSSProperties => ({
  backgroundImage: ouro(c),
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
});

/* ───────────── fundo ───────────── */
const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const Fundo: React.FC<{ cores: Cores }> = ({ cores }) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const luz = (cx: number, cy: number, r: number, cor: string, a: number) => (
    <div
      style={{
        position: 'absolute',
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${cor}${a} 0%, transparent 68%)`,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, #0d0b0a 0%, ${cores.fundo} 55%, #0a0908 100%)` }}>
      {luz(540 + 300 * Math.sin(t * 0.7), 420 + 120 * Math.cos(t * 0.5), 620, cores.destaque, '55')}
      {luz(180 + 220 * Math.cos(t * 0.6), 1250 + 160 * Math.sin(t * 0.45), 560, '#b9776a', '40')}
      {luz(930 + 160 * Math.sin(t * 0.9 + 2), 880 + 200 * Math.cos(t * 0.55), 440, '#e7c98f', '30')}
      {/* partículas subindo */}
      {Array.from({ length: 26 }).map((_, i) => {
        const vel = 0.35 + rnd(i, 1) * 0.8;
        const y = 2000 - (((f * vel * 1.4 + rnd(i, 2) * 2200) % 2200) - 140);
        const x = rnd(i, 3) * 1080 + Math.sin(t * (0.6 + rnd(i, 4)) + i) * 26;
        const r = 2 + rnd(i, 5) * 5;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: r,
              height: r,
              borderRadius: '50%',
              background: cores.destaque,
              opacity: 0.12 + rnd(i, 6) * 0.35,
              boxShadow: `0 0 ${r * 4}px ${cores.destaque}`,
            }}
          />
        );
      })}
      {/* vinheta */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

/* ───────────── barra de progresso estilo story + marca ───────────── */
const Topo: React.FC<{ cores: Cores; cenas: { inicio: number; fim: number }[] }> = ({ cores, cenas }) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const entrada = useMola(4, 18);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 64, left: 56, right: 56, display: 'flex', gap: 10 }}>
        {cenas.map((c, i) => {
          const p = interpolate(t, [c.inicio, c.fim], [0, 1], clamp);
          return (
            <div key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
              <div style={{ width: `${p * 100}%`, height: '100%', background: ouro(cores), borderRadius: 4 }} />
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 104,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: entrada,
          transform: `translateY(${(1 - entrada) * -30}px)`,
        }}
      >
        <Img src={staticFile('logo-bellasync.png')} style={{ height: 150 }} />
      </div>
    </AbsoluteFill>
  );
};

/* ───────────── palco de cada cena (entrada e saída suaves) ───────────── */
const Palco: React.FC<{ dur: number; ultima: boolean; children: React.ReactNode }> = ({ dur, ultima, children }) => {
  const f = useCurrentFrame();
  const sai = ultima ? 1 : interpolate(f, [dur - 6, dur], [1, 0], clamp);
  const ent = interpolate(f, [0, 7], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: Math.min(sai, ent), transform: `translateY(${130 + (1 - sai) * -40}px) scale(${1 + (1 - sai) * 0.05})` }}>
      {children}
    </AbsoluteFill>
  );
};

/* ───────────── peças ───────────── */
const Anel: React.FC<{ cores: Cores; cy: number; tam?: number }> = ({ cores, cy, tam = 560 }) => {
  const f = useCurrentFrame();
  return (
    <>
      {[0, 1, 2].map((i) => {
        const p = ((f + i * 28) % 84) / 84;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 540 - tam / 2,
              top: cy - tam / 2,
              width: tam,
              height: tam,
              borderRadius: '50%',
              border: `2px solid ${cores.destaque}`,
              opacity: (1 - p) * 0.45,
              transform: `scale(${0.55 + p * 0.95})`,
            }}
          />
        );
      })}
    </>
  );
};

const Palavra: React.FC<{ texto: string; i: number; marcada: boolean; cores: Cores; fonte: string; tam: number }> = ({ texto, i, marcada, cores, fonte, tam }) => {
  const m = useMola(6 + i * 4, 13, 140);
  return (
    <span
      style={{
        display: 'inline-block',
        margin: '0 0.14em',
        opacity: m,
        transform: `translateY(${(1 - m) * 90}px) rotate(${(1 - m) * 5}deg) scale(${0.85 + 0.15 * m})`,
        filter: `blur(${(1 - m) * 12}px)`,
        fontFamily: pilhaSans(fonte),
        fontWeight: 900,
        fontSize: tam,
        letterSpacing: '-0.035em',
        lineHeight: 1.04,
        color: cores.texto,
        ...(marcada ? textoOuro(cores) : {}),
      }}
    >
      {texto}
    </span>
  );
};

const Titulo: React.FC<{ texto: string; destaque?: string; cores: Cores; fonte: string; tam?: number; atraso?: number }> = ({ texto, destaque, cores, fonte, tam = 118 }) => {
  const marcadas = new Set((destaque ?? '').split(/\s+/).map(norm).filter(Boolean));
  const ps = texto.split(/\s+/);
  return (
    <div style={{ textAlign: 'center', padding: '0 70px' }}>
      {ps.map((p, i) => (
        <Palavra key={i} texto={p} i={i} marcada={marcadas.has(norm(p))} cores={cores} fonte={fonte} tam={tam} />
      ))}
    </div>
  );
};

const IconeAgenda: React.FC<{ cores: Cores }> = ({ cores }) => {
  const m = useMola(0, 11, 130);
  const f = useCurrentFrame();
  return (
    <svg width="230" height="230" viewBox="0 0 120 120" style={{ transform: `scale(${m}) rotate(${(1 - m) * -14}deg) translateY(${Math.sin(f / 18) * 6}px)`, filter: `drop-shadow(0 18px 40px ${cores.destaque}66)` }}>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e8cd" />
          <stop offset="0.5" stopColor={cores.destaque} />
          <stop offset="1" stopColor="#a8823f" />
        </linearGradient>
      </defs>
      <rect x="12" y="20" width="96" height="88" rx="18" fill="url(#g1)" />
      <rect x="12" y="20" width="96" height="26" rx="18" fill="#0d0b0a" opacity="0.25" />
      <rect x="32" y="8" width="8" height="24" rx="4" fill="#fff" />
      <rect x="80" y="8" width="8" height="24" rx="4" fill="#fff" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const mm = spring({ frame: f - 14 - i * 4, fps: 30, config: { damping: 10, stiffness: 160 } });
        return <circle key={i} cx={34 + (i % 3) * 26} cy={66 + Math.floor(i / 3) * 26} r={7 * mm} fill="#fff" opacity={i === 4 ? 1 : 0.55} />;
      })}
    </svg>
  );
};

const Check: React.FC<{ delay: number; cores: Cores }> = ({ delay, cores }) => {
  const f = useCurrentFrame();
  const p = interpolate(f - delay - 5, [0, 12], [0, 1], clamp);
  const m = useMola(delay, 12, 150);
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" style={{ flex: 'none', transform: `scale(${m})` }}>
      <circle cx="42" cy="42" r="40" fill={ouro(cores).includes('gradient') ? cores.destaque : cores.destaque} opacity="0.95" />
      <path d="M24 43 L37 56 L61 30" fill="none" stroke={cores.sobreDestaque} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset={60 * (1 - p)} />
    </svg>
  );
};

const CartaoVidro: React.FC<{ delay: number; children: React.ReactNode; brilho?: boolean; cores: Cores; opaco?: number }> = ({ delay, children, brilho, cores, opaco = 1 }) => {
  const m = useMola(delay, 14, 130);
  const f = useCurrentFrame();
  return (
    <div
      style={{
        width: 900,
        padding: '34px 44px',
        borderRadius: 48,
        background: brilho ? `linear-gradient(135deg, ${cores.destaque}33, rgba(255,255,255,0.06))` : 'rgba(255,255,255,0.07)',
        border: `2px solid ${brilho ? cores.destaque : 'rgba(255,255,255,0.14)'}`,
        boxShadow: brilho ? `0 0 70px ${cores.destaque}55, inset 0 0 40px ${cores.destaque}22` : '0 24px 60px rgba(0,0,0,0.35)',
        opacity: m * opaco,
        transform: `translateX(${(1 - m) * -220}px) translateY(${Math.sin((f + delay * 3) / 22) * 5}px) scale(${0.94 + 0.06 * m})`,
        display: 'flex',
        alignItems: 'center',
        gap: 34,
      }}
    >
      {children}
    </div>
  );
};

/* ───────────── cenas ───────────── */
const Visual: React.FC<{ cena: Cena; cores: Cores; fonte: string; fonteItalica: string }> = ({ cena, cores, fonte, fonteItalica }) => {
  const f = useCurrentFrame();
  const sans = pilhaSans(fonte);
  const serif = pilhaSerif(fonteItalica);

  switch (cena.tipo) {
    case 'gancho':
      return (
        <AbsoluteFill>
          <Anel cores={cores} cy={760} />
          <div style={{ position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <IconeAgenda cores={cores} />
          </div>
          <div style={{ position: 'absolute', top: 600, left: 0, right: 0 }}>
            <Titulo texto={cena.titulo} destaque={cena.destaque} cores={cores} fonte={fonte} />
          </div>
        </AbsoluteFill>
      );

    case 'titulo': {
      const linha = interpolate(f, [0, 16], [0, 260], clamp);
      const sub = useMola(22, 18);
      return (
        <AbsoluteFill>
          <Anel cores={cores} cy={820} tam={700} />
          <div style={{ position: 'absolute', top: 430, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
            <div style={{ width: linha, height: 6, borderRadius: 3, background: ouro(cores) }} />
            <Titulo texto={cena.titulo} destaque={cena.destaque} cores={cores} fonte={fonte} tam={104} />
            {cena.subtitulo && (
              <div style={{ opacity: sub, transform: `translateY(${(1 - sub) * 40}px)`, fontFamily: serif, fontStyle: 'italic', fontSize: 66, color: cores.destaque, textAlign: 'center', padding: '0 90px', lineHeight: 1.12 }}>
                {cena.subtitulo}
              </div>
            )}
          </div>
        </AbsoluteFill>
      );
    }

    case 'lista':
      return (
        <AbsoluteFill>
          <div style={{ position: 'absolute', top: 300, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
            {cena.titulo && (
              <div style={{ marginBottom: 20 }}>
                <Titulo texto={cena.titulo} cores={cores} fonte={fonte} tam={96} />
              </div>
            )}
            {cena.itens.map((it, i) => (
              <CartaoVidro key={i} delay={14 + i * 12} cores={cores}>
                <Check delay={22 + i * 12} cores={cores} />
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 56, color: cores.texto, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{it}</div>
              </CartaoVidro>
            ))}
          </div>
        </AbsoluteFill>
      );

    case 'numero': {
      const p = interpolate(f, [4, 50], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
      const de = cena.de ?? 0;
      const v = de + (cena.ate - de) * p;
      const txt = `${cena.prefixo ?? ''}${v.toFixed(cena.decimais ?? 0).replace('.', ',')}${cena.sufixo ?? ''}`;
      const circ = 2 * Math.PI * 250;
      return (
        <AbsoluteFill>
          <div style={{ position: 'absolute', top: 420, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 600, height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="600" height="600" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                <circle cx="300" cy="300" r="250" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
                <circle cx="300" cy="300" r="250" fill="none" stroke={cores.destaque} strokeWidth="16" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} style={{ filter: `drop-shadow(0 0 18px ${cores.destaque})` }} />
              </svg>
              <div style={{ fontFamily: sans, fontWeight: 900, fontSize: 200, letterSpacing: '-0.05em', ...textoOuro(cores) }}>{txt}</div>
            </div>
            {cena.rotulo && <div style={{ marginTop: 20, fontFamily: serif, fontStyle: 'italic', fontSize: 62, color: cores.texto, textAlign: 'center', padding: '0 100px', lineHeight: 1.12 }}>{cena.rotulo}</div>}
          </div>
        </AbsoluteFill>
      );
    }

    case 'antes-depois': {
      const risco = interpolate(f, [26, 40], [0, 1], clamp);
      const seta = useMola(36, 10, 150);
      return (
        <AbsoluteFill>
          <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
            <CartaoVidro delay={4} cores={cores} opaco={0.8}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, letterSpacing: '0.2em', color: cores.suave, marginBottom: 10 }}>{(cena.rotuloAntes ?? 'ANTES').toUpperCase()}</div>
                <div style={{ position: 'relative', display: 'inline-block', fontFamily: sans, fontWeight: 700, fontSize: 56, color: cores.suave, lineHeight: 1.12 }}>
                  {cena.antes}
                  <div style={{ position: 'absolute', left: -8, top: '55%', height: 7, width: `${risco * 108}%`, background: '#e0584f', borderRadius: 4 }} />
                </div>
              </div>
            </CartaoVidro>
            <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: `scale(${seta}) translateY(${Math.sin(f / 7) * 6}px)` }}>
              <path d="M45 12 L45 66 M22 44 L45 68 L68 44" fill="none" stroke={cores.destaque} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <CartaoVidro delay={34} brilho cores={cores}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 30, letterSpacing: '0.2em', color: cores.destaque, marginBottom: 10 }}>{(cena.rotuloDepois ?? 'DEPOIS').toUpperCase()}</div>
                <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 60, color: cores.texto, lineHeight: 1.1 }}>{cena.depois}</div>
              </div>
            </CartaoVidro>
          </div>
        </AbsoluteFill>
      );
    }

    case 'cta': {
      const a = useMola(2, 16);
      const botao = useMola(10, 9, 150);
      const pulso = 1 + 0.035 * Math.sin(f / 5);
      const prom = useMola(26, 18);
      const seta = Math.sin(f / 6) * 14;
      const sobe = /bio/i.test(cena.palavra) || /link/i.test(cena.chamada ?? '');
      return (
        <AbsoluteFill>
          <div style={{ position: 'absolute', top: 400, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
            {cena.chamada && (
              <div style={{ opacity: a, transform: `translateY(${(1 - a) * 50}px)`, fontFamily: serif, fontStyle: 'italic', fontSize: 100, color: cores.texto }}>{cena.chamada}</div>
            )}
            <div style={{ position: 'relative', transform: `scale(${botao * pulso})`, opacity: Math.min(1, botao) }}>
              {[0, 1].map((i) => {
                const p = ((f + i * 25) % 50) / 50;
                return <div key={i} style={{ position: 'absolute', inset: -10, borderRadius: 60, border: `3px solid ${cores.destaque}`, opacity: (1 - p) * 0.6, transform: `scale(${1 + p * 0.35})` }} />;
              })}
              <div
                style={{
                  padding: '36px 84px',
                  borderRadius: 56,
                  background: ouro(cores),
                  color: cores.sobreDestaque,
                  fontFamily: sans,
                  fontWeight: 900,
                  fontSize: 150,
                  letterSpacing: '-0.03em',
                  boxShadow: `0 0 90px ${cores.destaque}88, 0 30px 70px rgba(0,0,0,.45)`,
                }}
              >
                {cena.palavra}
              </div>
            </div>
            {cena.promessa && (
              <div style={{ opacity: prom, transform: `translateY(${(1 - prom) * 40}px)`, fontFamily: sans, fontWeight: 700, fontSize: 58, color: cores.texto, textAlign: 'center', padding: '0 110px', lineHeight: 1.15 }}>{cena.promessa}</div>
            )}
            {sobe && (
              <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: `translateY(${-Math.abs(seta)}px)`, opacity: prom }}>
                <path d="M55 92 L55 22 M24 52 L55 20 L86 52" fill="none" stroke={cores.destaque} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </AbsoluteFill>
      );
    }
  }
};

/* ───────────── legenda em cartão de vidro ───────────── */
const Legenda: React.FC<{ linhas: Linha[]; cores: Cores; fonte: string; semLegenda: number[] }> = ({ linhas, cores, fonte, semLegenda }) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const linha = linhas.find((l) => t >= l.inicio && t < l.fim);
  if (!linha || semLegenda.includes(linha.palavras[0].cena)) return null;
  const ent = interpolate(t - linha.inicio, [0, 0.14], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ top: 1420, height: 230, justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          opacity: ent,
          transform: `translateY(${(1 - ent) * 24}px) scale(${0.96 + 0.04 * ent})`,
          padding: '26px 52px',
          borderRadius: 52,
          background: 'rgba(10,9,8,0.62)',
          border: '1.5px solid rgba(255,255,255,0.16)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          columnGap: 34,
          maxWidth: 940,
        }}
      >
        {linha.palavras.map((p) => {
          const falada = t >= p.inicio;
          const atual = t >= p.inicio && t < p.fim + 0.08;
          return (
            <span
              key={p.indice}
              style={{
                display: 'inline-block',
                fontFamily: pilhaSans(fonte),
                fontWeight: 800,
                fontSize: 70,
                letterSpacing: '-0.02em',
                color: atual ? cores.destaque : cores.texto,
                opacity: falada ? 1 : 0.32,
                transform: `scale(${atual ? 1.08 : 1})`,
                textShadow: atual ? `0 0 30px ${cores.destaque}88` : 'none',
              }}
            >
              {p.texto}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ───────────── composição ───────────── */
export const Moderno: React.FC<ReelProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const cores: Cores = { ...CORES_PADRAO, ...(props.cores ?? {}) };
  const fonte = props.fonte ?? 'Montserrat';
  const fonteItalica = props.fonteItalica ?? 'Playfair Display';
  const tempos = props.tempos ?? estimarTempos(props.cenas);
  const linhas = useMemo(() => montarLinhas(tempos.palavras, 4), [tempos]);
  const so = (x: string) => norm(x);
  const semLegenda = props.cenas.flatMap((c, i) => (c.tipo === 'cta' || ('titulo' in c && c.titulo && so(c.titulo) === so(c.fala)) ? [i] : []));
  const temVoz = Boolean(props.narracao);
  const totalSeg = durationInFrames / fps;
  const volBase = props.volumeTrilha ?? (temVoz ? 0.22 : 0.7);

  const volumeTrilha = (fr: number) => {
    const t = fr / fps;
    const fade = Math.min(interpolate(t, [0, 0.8], [0, 1], clamp), interpolate(t, [totalSeg - 1.4, totalSeg], [1, 0], clamp));
    if (!temVoz) return volBase * fade;
    let dist = Infinity;
    for (const p of tempos.palavras) {
      const d = t < p.inicio - 0.15 ? p.inicio - 0.15 - t : t > p.fim + 0.3 ? t - p.fim - 0.3 : 0;
      if (d < dist) dist = d;
      if (dist === 0) break;
    }
    return volBase * (0.45 + 0.55 * Math.min(1, dist / 0.35)) * fade;
  };

  return (
    <AbsoluteFill>
      <Fundo cores={cores} />
      <Fontes fonte={fonte} fonteItalica={fonteItalica}>
        {props.cenas.map((cena, i) => {
          const b = tempos.cenas[i];
          const from = Math.round(b.inicio * fps);
          const dur = Math.max(1, Math.round(b.fim * fps) - from);
          return (
            <Sequence key={i} from={from} durationInFrames={dur} name={`${i + 1}. ${cena.tipo}`}>
              <Palco dur={dur} ultima={i === props.cenas.length - 1}>
                <Visual cena={cena} cores={cores} fonte={fonte} fonteItalica={fonteItalica} />
              </Palco>
            </Sequence>
          );
        })}
        <Topo cores={cores} cenas={tempos.cenas} />
        {props.legenda !== false && <Legenda linhas={linhas} cores={cores} fonte={fonte} semLegenda={semLegenda} />}
      </Fontes>
      {props.narracao && <Html5Audio src={staticFile(props.narracao)} />}
      {props.trilha && <Html5Audio src={staticFile(props.trilha)} loop volume={volumeTrilha} />}
    </AbsoluteFill>
  );
};
