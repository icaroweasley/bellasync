#!/usr/bin/env node
/**
 * BellaSync Content Engine — Scheduler & Orchestrator
 * 
 * Generates the weekly/monthly content calendar based on config.json,
 * orchestrates content creation, rendering, approval, and publishing.
 * 
 * Usage:
 *   node engine.js plan           → Gera o calendário da semana/mês
 *   node engine.js create <id>    → Brief + roteiro (LLM) + render (Remotion)
 *   node engine.js script <id>    → Só o roteiro (gera <id>-cenas.json)
 *   node engine.js render <id>    → Só o render (usa <id>-cenas.json)
 *   node engine.js today          → Criativos de hoje
 *   node engine.js daemon [--auto]→ Checa o calendário a cada minuto
 *   node engine.js create-now     → Modo sob demanda (fora da agenda)
 *   node engine.js approve <id>   → Aprova um criativo para publicação
 *   node engine.js publish <id>   → Publica um criativo aprovado
 *   node engine.js status         → Mostra status de todos os criativos pendentes
 *   node engine.js run            → Executa o ciclo completo (plan → create → wait approval)
 */

const fs = require('fs');
const path = require('path');

const ENGINE_DIR = path.resolve(__dirname);
const CONFIG_PATH = path.join(ENGINE_DIR, 'config.json');
const CALENDAR_DIR = path.join(ENGINE_DIR, 'calendar');
const OUTPUT_DIR = path.join(ENGINE_DIR, 'output');
const LOGS_DIR = path.join(ENGINE_DIR, 'logs');

// Ensure directories exist
[CALENDAR_DIR, OUTPUT_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// ─── Helpers ───────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getWeekDates(startDate = new Date()) {
  const dates = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  // Go to Monday
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function dayName(date) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
}

function pickPillar(existingPillars = []) {
  const pillars = config.content_pillars;
  // Weighted random based on ratio, avoiding recent repeats
  const available = pillars.filter(p => !existingPillars.slice(-2).includes(p.id));
  const pool = available.length > 0 ? available : pillars;
  
  const totalWeight = pool.reduce((sum, p) => sum + p.ratio, 0);
  let rand = Math.random() * totalWeight;
  
  for (const p of pool) {
    rand -= p.ratio;
    if (rand <= 0) return p;
  }
  return pool[pool.length - 1];
}

function pickFormat(type) {
  const formats = config.formats[type === 'stories' ? 'story' : type === 'posts' ? 'post' : 'reel'];
  const types = formats.types;
  return types[Math.floor(Math.random() * types.length)];
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

// ─── Plan Generator ───────────────────────────────────────────────────

function generateWeeklyPlan(weekStart = new Date()) {
  const weekDates = getWeekDates(weekStart);
  const plan = {
    id: `week-${formatDate(weekDates[0])}`,
    generated_at: new Date().toISOString(),
    week_start: formatDate(weekDates[0]),
    week_end: formatDate(weekDates[6]),
    items: []
  };

  const usedPillars = [];

  // ── Stories: 2/day, every day ──
  for (const date of weekDates) {
    const dn = dayName(date);
    if (!config.schedule.stories.days.includes(dn)) continue;

    for (const time of config.schedule.stories.times) {
      const pillar = pickPillar(usedPillars);
      usedPillars.push(pillar.id);

      plan.items.push({
        id: generateId(),
        type: 'story',
        date: formatDate(date),
        time,
        pillar: pillar.id,
        pillar_label: pillar.label,
        format: pickFormat('stories'),
        prompt_hint: pillar.examples[Math.floor(Math.random() * pillar.examples.length)],
        status: 'planned',
        dimensions: config.formats.story.dimensions
      });
    }
  }

  // ── Posts: 3/week (mon, wed, fri) ──
  for (const date of weekDates) {
    const dn = dayName(date);
    if (!config.schedule.posts.days.includes(dn)) continue;

    for (const time of config.schedule.posts.times) {
      const pillar = pickPillar(usedPillars);
      usedPillars.push(pillar.id);

      plan.items.push({
        id: generateId(),
        type: 'post',
        date: formatDate(date),
        time,
        pillar: pillar.id,
        pillar_label: pillar.label,
        format: pickFormat('posts'),
        prompt_hint: pillar.examples[Math.floor(Math.random() * pillar.examples.length)],
        status: 'planned',
        dimensions: config.formats.post.dimensions
      });
    }
  }

  // ── Reels: 1/week (mon) = 4/month ──
  for (const date of weekDates) {
    const dn = dayName(date);
    if (dn !== 'mon') continue;

    const pillar = pickPillar(usedPillars);
    usedPillars.push(pillar.id);

    plan.items.push({
      id: generateId(),
      type: 'reel',
      date: formatDate(date),
      time: config.schedule.reels.times[0],
      pillar: pillar.id,
      pillar_label: pillar.label,
      format: pickFormat('reels'),
      prompt_hint: pillar.examples[Math.floor(Math.random() * pillar.examples.length)],
      status: 'planned',
      dimensions: config.formats.reel.dimensions,
      max_duration_sec: config.formats.reel.max_duration_sec
    });
  }

  // Sort by date + time
  plan.items.sort((a, b) => {
    const da = `${a.date}T${a.time}`;
    const db = `${b.date}T${b.time}`;
    return da.localeCompare(db);
  });

  // Save
  const planFile = path.join(CALENDAR_DIR, `${plan.id}.json`);
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf-8');

  return plan;
}

// ─── Status ────────────────────────────────────────────────────────────

function showStatus() {
  const files = fs.readdirSync(CALENDAR_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('\n  📭 Nenhum plano gerado ainda. Use: node engine.js plan\n');
    return;
  }

  for (const file of files.slice(-2)) {
    const plan = JSON.parse(fs.readFileSync(path.join(CALENDAR_DIR, file), 'utf-8'));
    console.log(`\n  📅 ${plan.id} (${plan.week_start} → ${plan.week_end})`);
    console.log(`  ${'─'.repeat(60)}`);

    const byDate = {};
    for (const item of plan.items) {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    }

    for (const [date, items] of Object.entries(byDate)) {
      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'short', day: '2-digit', month: '2-digit'
      });
      console.log(`\n  ${dayLabel}`);
      
      for (const item of items) {
        const emoji = item.type === 'story' ? '📱' : item.type === 'post' ? '🖼️' : '🎬';
        const statusEmoji = {
          planned: '⬜', creating: '🔄', created: '✅', approved: '👍', published: '🚀', rejected: '❌'
        }[item.status] || '❓';
        
        console.log(`    ${statusEmoji} ${emoji} ${item.time} ${item.type.toUpperCase().padEnd(5)} │ ${item.pillar_label.padEnd(25)} │ ${item.format}`);
      }
    }

    // Summary
    const stories = plan.items.filter(i => i.type === 'story').length;
    const posts = plan.items.filter(i => i.type === 'post').length;
    const reels = plan.items.filter(i => i.type === 'reel').length;
    const approved = plan.items.filter(i => i.status === 'approved').length;
    const published = plan.items.filter(i => i.status === 'published').length;

    console.log(`\n  📊 Total: ${stories} stories, ${posts} posts, ${reels} reel(s)`);
    console.log(`  ✅ Aprovados: ${approved} │ 🚀 Publicados: ${published}`);
  }
  console.log();
}

// ─── Approve ───────────────────────────────────────────────────────────

function approveItem(itemId) {
  const found = findItem(itemId);
  if (!found) { console.log(`\n  ❌ Criativo ${itemId} não encontrado\n`); return; }
  const { item, save } = found;
  if (item.status !== 'created') {
    console.log(`\n  ⚠️  Status atual: ${item.status} — só é possível aprovar criativos com status "created"\n`);
    return;
  }
  item.status = 'approved';
  item.approved_at = new Date().toISOString();
  save();
  console.log(`\n  👍 Criativo ${itemId} aprovado!\n`);
}

// ─── Create: brief -> roteiro (LLM) -> render (Remotion) ──────────────

/** Procura um item nos planos semanais e no on-demand. Retorna { item, save } ou null. */
function findItem(itemId) {
  const files = fs.readdirSync(CALENDAR_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const p = path.join(CALENDAR_DIR, file);
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const list = Array.isArray(data) ? data : data.items;
    const item = list.find(i => i.id === itemId);
    if (item) return { item, save: () => fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8') };
  }
  return null;
}

function logRun(entry) {
  const file = path.join(LOGS_DIR, `${formatDate(new Date())}.jsonl`);
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf-8');
}

function briefPathOf(item) {
  return path.join(OUTPUT_DIR, `${item.id}-brief.json`);
}

/** Etapa 1: gera o brief (idempotente). */
function ensureBrief(item) {
  const bp = briefPathOf(item);
  if (!fs.existsSync(bp)) {
    const brief = {
      item_id: item.id,
      type: item.type,
      brand: config.brand.name,
      tone: config.brand.tone,
      pillar: item.pillar_label,
      format: item.format,
      dimensions: item.dimensions,
      prompt_hint: item.prompt_hint,
      hashtags: config.brand.hashtags.slice(0, 5),
      colors: config.brand.colors,
      fonts: config.brand.fonts,
      tts: config.rendering.tts_engine,
      generated_at: new Date().toISOString()
    };
    if (item.max_duration_sec) brief.max_duration_sec = item.max_duration_sec;
    if (item.type === 'story') brief.max_duration_sec = config.formats.story.max_duration_sec;
    if (item.pillar === 'manual') brief.on_demand = true;
    fs.writeFileSync(bp, JSON.stringify(brief, null, 2), 'utf-8');
  }
  return bp;
}

const RENDERABLE = ['reel', 'story']; // ambos 1080x1920 na composição "Reel"; posts (imagem) ainda não

/**
 * Pipeline completo de um criativo: brief -> roteiro (LLM) -> render (Remotion) -> status "created".
 * steps: { script: bool, render: bool }
 */
async function runPipeline(itemId, steps = { script: true, render: true }) {
  const found = findItem(itemId);
  if (!found) { console.log(`\n  ❌ Criativo ${itemId} não encontrado\n`); return false; }
  const { item, save } = found;

  if (!RENDERABLE.includes(item.type)) {
    const bp = ensureBrief(item);
    console.log(`\n  ℹ️  Tipo "${item.type}" ainda não tem roteirizador/render (só reel e story). Brief gerado: ${bp}\n`);
    return false;
  }
  if (!['planned', 'creating', 'failed'].includes(item.status)) {
    console.log(`\n  ⚠️  Este criativo já está em status: ${item.status}\n`);
    return false;
  }

  const { roteirizar } = require('./roteirizador.cjs');
  const { renderReel } = require('./render.cjs');
  const bp = ensureBrief(item);
  const cenasPath = path.join(OUTPUT_DIR, `${item.id}-cenas.json`);
  const mp4Path = path.join(OUTPUT_DIR, `${item.id}.mp4`);

  item.status = 'creating';
  item.brief_path = bp;
  save();
  console.log(`\n  🔄 ${item.id} · ${item.type} · ${item.pillar_label} · "${item.prompt_hint}"`);

  try {
    if (steps.script) {
      console.log('  ✍️  Roteirizando com a LLM...');
      const r = await roteirizar(bp, config.llm || {});
      const words = r.props.cenas.reduce((s, c) => s + c.fala.split(/\s+/).length, 0);
      console.log(`     ${r.props.cenas.length} cenas, ${words} palavras (${(r.ms / 1000).toFixed(1)}s, ${r.usage.input_tokens} in / ${r.usage.output_tokens} out)`);
      logRun({ item: item.id, step: 'script', model: r.model, usage: r.usage, ms: r.ms });
      item.cenas_path = cenasPath;
    }
    if (steps.render) {
      if (!fs.existsSync(cenasPath)) throw new Error(`Sem ${path.basename(cenasPath)}. Rode antes: node engine.cjs script ${item.id}`);
      console.log('  🎬 Narrando (edge-tts) e renderizando com o Remotion (alguns minutos)...');
      const r = await renderReel(cenasPath, mp4Path, config.rendering.project_path, { composition: config.rendering.composition, voice: config.rendering.tts_voice, rate: config.rendering.tts_rate });
      console.log(`     ${mp4Path} (${(r.ms / 1000).toFixed(0)}s)`);
      logRun({ item: item.id, step: 'render', ms: r.ms });
      item.output_path = mp4Path;
      item.status = 'created';
      item.created_at = new Date().toISOString();
      save();
      console.log(`\n  ✅ Pronto para revisar. Assista o vídeo e aprove com: node engine.cjs approve ${item.id}\n`);
    } else {
      item.status = 'planned';
      save();
      console.log(`\n  ✅ Roteiro salvo: ${cenasPath}\n`);
    }
    return true;
  } catch (err) {
    item.status = 'failed';
    item.error = String(err.message || err).slice(0, 500);
    save();
    logRun({ item: item.id, step: 'error', error: item.error });
    console.log(`\n  ❌ Falhou: ${err.message}\n  (status = failed; rode o comando de novo para tentar outra vez)\n`);
    return false;
  }
}

/** Itens do dia que ainda precisam de atenção. */
function todaysItems() {
  const today = formatDate(new Date());
  const out = [];
  for (const file of fs.readdirSync(CALENDAR_DIR).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(CALENDAR_DIR, file), 'utf-8'));
    for (const i of (Array.isArray(data) ? data : data.items)) if (i.date === today) out.push(i);
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function showToday() {
  const items = todaysItems();
  console.log(`\n  📆 Hoje (${formatDate(new Date())})`);
  if (!items.length) { console.log('  Nada agendado. Use: node engine.cjs plan\n'); return; }
  for (const i of items) {
    const st = { planned: '⬜', creating: '🔄', created: '✅ para aprovar', approved: '👍', published: '🚀', failed: '⚠️ falhou' }[i.status] || i.status;
    console.log(`    ${i.time} ${i.type.padEnd(5)} ${i.pillar_label.padEnd(25)} ${st}  [${i.id}]`);
  }
  console.log();
}

/**
 * Daemon simples: a cada minuto olha o calendário de hoje.
 * - Avisa no terminal (sino) quando um criativo "planned" entra na janela de preparo
 *   (scheduler.prepare_minutes_before, padrão 180).
 * - Com --auto (ou scheduler.auto_create=true) já roda o pipeline (gasta tokens da sua chave).
 * - Avisa quando há criativos "created" esperando aprovação.
 */
async function runDaemon(auto) {
  const sch = config.scheduler || {};
  const lead = sch.prepare_minutes_before ?? 180;
  const autoCreate = auto || sch.auto_create === true;
  const notified = new Set();
  console.log(`\n  ⏰ Daemon ligado (preparo ${lead} min antes${autoCreate ? ', criação AUTOMÁTICA' : ', só avisa'}). Ctrl+C para sair.\n`);

  const tick = async () => {
    const now = new Date();
    for (const i of todaysItems()) {
      const when = new Date(`${i.date}T${i.time}:00`);
      const minsLeft = (when - now) / 60000;
      if (i.status === 'planned' && minsLeft <= lead && minsLeft > -60 && !notified.has(i.id + ':due')) {
        notified.add(i.id + ':due');
        console.log(`  \x07🔔 ${i.time} ${i.type} "${i.prompt_hint}" entra em ${Math.max(0, Math.round(minsLeft))} min  [${i.id}]`);
        if (autoCreate && RENDERABLE.includes(i.type)) await runPipeline(i.id);
        else console.log(`     → node engine.cjs create ${i.id}`);
      }
      if (i.status === 'created' && !notified.has(i.id + ':review')) {
        notified.add(i.id + ':review');
        console.log(`  \x07👀 Aguardando sua aprovação: ${i.output_path}\n     → node engine.cjs approve ${i.id}`);
      }
    }
  };
  await tick();
  setInterval(() => tick().catch(e => console.log('  ⚠️ daemon:', e.message)), 60 * 1000);
}

// ─── Create Now (on-demand, outside the schedule) ─────────────────────

function createNow() {
  console.log('\n  ⚡ Modo Sob Demanda — Criativo fora da agenda\n');
  
  const item = {
    id: generateId(),
    type: 'post',  // default, would be interactive in full version
    date: formatDate(new Date()),
    time: new Date().toTimeString().slice(0, 5),
    pillar: 'manual',
    pillar_label: 'Sob Demanda',
    format: 'single_image',
    prompt_hint: 'Criativo manual — defina o tema via prompt',
    status: 'creating',
    dimensions: '1080x1350'
  };

  const brief = {
    item_id: item.id,
    type: item.type,
    brand: config.brand.name,
    tone: config.brand.tone,
    pillar: item.pillar_label,
    format: item.format,
    dimensions: item.dimensions,
    prompt_hint: item.prompt_hint,
    hashtags: config.brand.hashtags.slice(0, 5),
    colors: config.brand.colors,
    fonts: config.brand.fonts,
    generated_at: new Date().toISOString(),
    on_demand: true
  };

  const briefPath = path.join(OUTPUT_DIR, `${item.id}-brief.json`);
  fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2), 'utf-8');

  // Save to an on-demand log
  const demandLog = path.join(CALENDAR_DIR, 'on-demand.json');
  let demands = [];
  if (fs.existsSync(demandLog)) {
    demands = JSON.parse(fs.readFileSync(demandLog, 'utf-8'));
  }
  demands.push(item);
  fs.writeFileSync(demandLog, JSON.stringify(demands, null, 2), 'utf-8');

  console.log(`  🆔 ID: ${item.id}`);
  console.log(`  📋 Brief: ${briefPath}`);
  console.log(`\n  → Agora defina o tema e rode o pipeline de criação\n`);
}

// ─── CLI Router ────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'plan':
    const plan = generateWeeklyPlan();
    console.log(`\n  ✅ Plano gerado: ${plan.id}`);
    console.log(`  📅 ${plan.week_start} → ${plan.week_end}`);
    console.log(`  📦 ${plan.items.length} criativos programados\n`);
    
    const s = plan.items.filter(i => i.type === 'story').length;
    const p = plan.items.filter(i => i.type === 'post').length;
    const r = plan.items.filter(i => i.type === 'reel').length;
    console.log(`     📱 ${s} stories (${s/7 | 0}/dia)`);
    console.log(`     🖼️  ${p} posts (${p}/semana)`);
    console.log(`     🎬 ${r} reel(s) (${r * 4}/mês)\n`);
    break;

  case 'status':
    showStatus();
    break;

  case 'create':
  case 'script':
  case 'render': {
    if (!args[0]) {
      console.log(`\n  ❌ Use: node engine.cjs ${command} <id>\n`);
    } else {
      const steps = command === 'script' ? { script: true, render: false }
        : command === 'render' ? { script: false, render: true }
        : { script: true, render: true };
      runPipeline(args[0], steps);
    }
    break;
  }

  case 'today':
    showToday();
    break;

  case 'daemon':
    runDaemon(args.includes('--auto'));
    break;

  case 'create-now':
    createNow();
    break;

  case 'approve':
    if (!args[0]) {
      console.log('\n  ❌ Use: node engine.js approve <id>\n');
    } else {
      approveItem(args[0]);
    }
    break;

  default:
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║        BellaSync Content Engine v0.1             ║
  ╠══════════════════════════════════════════════════╣
  ║                                                  ║
  ║  Comandos:                                       ║
  ║                                                  ║
  ║  plan        Gera calendário da semana           ║
  ║  status      Mostra status dos criativos         ║
  ║  create <id> Roteiro + render do criativo        ║
  ║  script <id> Só o roteiro (LLM)                  ║
  ║  render <id> Só o render (Remotion)              ║
  ║  today       Criativos de hoje                   ║
  ║  daemon      Avisa/prepara os do dia (--auto)    ║
  ║  create-now  Cria um criativo sob demanda        ║
  ║  approve <id> Aprova um criativo                 ║
  ║                                                  ║
  ║  Agenda configurada:                             ║
  ║  📱 2 stories/dia (09h + 18h)                   ║
  ║  🖼️  3 posts/semana (seg, qua, sex 12h)         ║
  ║  🎬 4 reels/mês (toda seg 19h)                  ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
`);
    break;
}

