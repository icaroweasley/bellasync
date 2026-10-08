/**
 * Roteirizador: brief (<id>-brief.json) -> cenas.json no formato do Remotion (E:\reels-estudio, composição "Reel").
 * Usa a API da Claude com saída estruturada (JSON Schema). BYOK: chave em ANTHROPIC_API_KEY
 * (variável de ambiente ou .content-engine/.env).
 */
const fs = require('fs');
const path = require('path');

const ENGINE_DIR = __dirname;
const WORDS_PER_SEC = 2.6; // ritmo médio de fala em pt-BR

function loadEnv() {
  const file = path.join(ENGINE_DIR, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Schema das cenas (espelha src/tipos.ts do reels-estudio) ──
const str = { type: 'string' };
const obj = (props, required) => ({ type: 'object', properties: props, required, additionalProperties: false });
const SCENE_SCHEMAS = [
  obj({ tipo: { type: 'string', enum: ['gancho'] }, titulo: str, destaque: str, fala: str }, ['tipo', 'titulo', 'fala']),
  obj({ tipo: { type: 'string', enum: ['titulo'] }, titulo: str, subtitulo: str, destaque: str, fala: str }, ['tipo', 'titulo', 'fala']),
  obj({ tipo: { type: 'string', enum: ['lista'] }, titulo: str, itens: { type: 'array', items: str }, fala: str }, ['tipo', 'itens', 'fala']),
  obj({ tipo: { type: 'string', enum: ['numero'] }, de: { type: 'number' }, ate: { type: 'number' }, prefixo: str, sufixo: str, rotulo: str, decimais: { type: 'integer' }, fala: str }, ['tipo', 'ate', 'fala']),
  obj({ tipo: { type: 'string', enum: ['antes-depois'] }, antes: str, depois: str, rotuloAntes: str, rotuloDepois: str, fala: str }, ['tipo', 'antes', 'depois', 'fala']),
  obj({ tipo: { type: 'string', enum: ['cta'] }, palavra: str, chamada: str, promessa: str, fala: str }, ['tipo', 'palavra', 'fala']),
];
const OUTPUT_SCHEMA = obj({ cenas: { type: 'array', items: { anyOf: SCENE_SCHEMAS } } }, ['cenas']);

function wordCount(s) { return (s.match(/\S+/g) || []).length; }

function systemPrompt(brief, knowledge, maxWords) {
  return `Você é a roteirista de vídeos curtos do Instagram da marca ${brief.brand}, voltada a donas de salão de beleza no Brasil.
Tom de voz: ${brief.tone}
Idioma: português do Brasil, falado, frases curtas.

Sua saída é uma lista de cenas que um motor de vídeo (Remotion) renderiza. Tipos de cena disponíveis:
- gancho: primeira cena. "titulo" é a frase que aparece na tela (até 8 palavras); "destaque" é o trecho do título que ganha cor (precisa existir dentro do título).
- titulo: título + subtítulo opcional.
- lista: itens curtos (2 a 4 itens, até 6 palavras cada).
- numero: contador animado. Só use se o número vier da base de conhecimento. Se não houver número real, não use esta cena.
- antes-depois: duas frases curtas em contraste (sem números inventados).
- cta: última cena. "palavra" é a palavra-chave em caixa alta que a pessoa comenta; "chamada" é o verbo (ex.: "Comenta"); "promessa" é o que a pessoa recebe.
Cada cena tem "fala": o texto narrado nessa cena (e legenda palavra por palavra). A fala deve soar natural e bater com o que está na tela.

Regras:
1. A primeira cena é um gancho que nomeia um problema ou promessa clara, sem enrolação. O espectador decide em 3 segundos.
2. Uma única ideia por vídeo. Total de palavras falando, somando todas as cenas: no máximo ${maxWords}.
3. A última cena é sempre cta e a palavra-chave deve ser coerente com o brief.
4. ${brief.on_demand ? 'Este é um pedido sob demanda: siga o tema do brief.' : 'Siga o pilar e o formato indicados no brief.'}
5. Nunca invente estatística, porcentagem, depoimento, nome de cliente, prêmio ou quantidade de usuários. Use apenas fatos da base de conhecimento abaixo; no mais, fale de forma geral.
6. Sem emojis nos textos de tela e de fala.

BASE DE CONHECIMENTO:
${knowledge}`;
}

function userPrompt(brief) {
  return `Escreva as cenas deste vídeo.
Tipo: ${brief.type} (${brief.dimensions}${brief.max_duration_sec ? `, até ${brief.max_duration_sec}s` : ''})
Pilar: ${brief.pillar}
Formato: ${brief.format}
Tema: ${brief.prompt_hint}`;
}

/** Valida e corrige o que a LLM devolveu. Lança erro se algo inviabiliza o render. */
function validate(cenas, maxWords) {
  const erros = [];
  if (!Array.isArray(cenas) || cenas.length < 3) erros.push('menos de 3 cenas');
  else {
    if (cenas[0].tipo !== 'gancho') erros.push('a primeira cena precisa ser "gancho"');
    if (cenas[cenas.length - 1].tipo !== 'cta') erros.push('a última cena precisa ser "cta"');
    cenas.forEach((c, i) => {
      if (!c.fala || !c.fala.trim()) erros.push(`cena ${i + 1} sem fala`);
      if (c.tipo === 'gancho' && c.destaque && !c.titulo.toLowerCase().includes(c.destaque.toLowerCase())) {
        delete c.destaque; // destaque fora do título quebraria o realce: remove em vez de falhar
      }
      if (c.tipo === 'cta') c.palavra = c.palavra.toUpperCase();
    });
    const total = cenas.reduce((s, c) => s + wordCount(c.fala || ''), 0);
    if (total > maxWords * 1.15) erros.push(`${total} palavras faladas (limite ${maxWords})`);
  }
  if (erros.length) throw new Error('Roteiro inválido: ' + erros.join('; '));
}

function toReelProps(cenas, brief) {
  const c = brief.colors || {};
  return {
    cores: {
      fundo: c.primary || '#1a1a1a',
      texto: c.bg || '#faf8f5',
      destaque: c.accent || '#c9a87c',
      suave: '#a89f93',
      sobreDestaque: c.primary || '#1a1a1a',
    },
    fonte: (brief.fonts && brief.fonts.body) || 'Montserrat',
    fonteItalica: (brief.fonts && brief.fonts.heading) || 'Playfair Display',
    legenda: true,
    narracao: null,
    palavras: null,
    trilha: null,
    cenas,
  };
}

/**
 * Gera <id>-cenas.json ao lado do brief. Retorna { path, props, usage, ms }.
 * options.model, options.effort vêm do config.json (llm.*).
 */
async function roteirizar(briefPath, options = {}) {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não encontrada. Crie .content-engine/.env com ANTHROPIC_API_KEY=sk-ant-... (o arquivo é ignorado pelo git).');
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)();

  const brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
  const knowledgePath = path.join(ENGINE_DIR, 'knowledge.md');
  const knowledge = fs.existsSync(knowledgePath) ? fs.readFileSync(knowledgePath, 'utf-8') : '(sem base de conhecimento)';
  const maxSec = brief.max_duration_sec || (brief.type === 'story' ? 15 : 30);
  const maxWords = Math.floor((maxSec - 2) * WORDS_PER_SEC); // 2s de folga p/ transições e cauda

  const started = Date.now();
  const res = await client.messages.create({
    model: options.model || 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: options.effort || 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    system: systemPrompt(brief, knowledge, maxWords),
    messages: [{ role: 'user', content: userPrompt(brief) }],
  });

  if (res.stop_reason === 'refusal') throw new Error('A LLM recusou o pedido: ' + JSON.stringify(res.stop_details || {}));
  if (res.stop_reason === 'max_tokens') throw new Error('Resposta cortada (max_tokens). Tente de novo.');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const { cenas } = JSON.parse(text);
  validate(cenas, maxWords);

  const props = toReelProps(cenas, brief);
  const out = path.join(path.dirname(briefPath), `${brief.item_id}-cenas.json`);
  fs.writeFileSync(out, JSON.stringify(props, null, 2), 'utf-8');
  return { path: out, props, usage: res.usage, model: res.model, ms: Date.now() - started };
}

module.exports = { roteirizar, validate, toReelProps, OUTPUT_SCHEMA };
