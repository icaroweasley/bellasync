/**
 * Ponte de render: <id>-cenas.json -> (narração edge-tts + trilha) -> Remotion headless -> <id>.mp4
 * Composição padrão: "Moderno" (E:\reels-estudio\src\Moderno.tsx).
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const TOOLS = path.join(__dirname, 'tools');
const TRILHA = 'trilha-bellasync.mp3';

/** Gera <public>/<id>-voz.mp3 e <id>-palavras.json (tempo por palavra). */
function narrar(cenasPath, id, projectPath, { voice, rate } = {}) {
  const args = [path.join(TOOLS, 'narrar.py'), cenasPath, path.join(projectPath, 'public'), id];
  if (voice) args.push(voice);
  if (voice && rate) args.push(rate);
  const r = spawnSync('python', args, { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`Falha na narração (edge-tts precisa de internet):\n${(r.stderr || r.stdout || '').slice(-1500)}`);
  return r.stdout.trim();
}

/** Garante a trilha instrumental no public do Remotion (gerada uma vez, sem direitos autorais). */
function garantirTrilha(projectPath) {
  const dest = path.join(projectPath, 'public', TRILHA);
  if (fs.existsSync(dest)) return;
  const r = spawnSync('python', [path.join(TOOLS, 'trilha.py'), dest, '96', '40'], { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`Falha ao gerar a trilha:\n${(r.stderr || '').slice(-1000)}`);
}

function renderReel(cenasPath, outPath, projectPath, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(projectPath)) throw new Error(`Projeto Remotion não encontrado: ${projectPath}`);
      const cli = path.join(projectPath, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
      if (!fs.existsSync(cli)) throw new Error(`Remotion não instalado em ${projectPath}. Rode npm install lá.`);

      const composition = opts.composition || 'Moderno';
      const props = JSON.parse(fs.readFileSync(cenasPath, 'utf-8'));
      const id = path.basename(outPath, '.mp4');

      if (opts.audio !== false) {
        const info = narrar(cenasPath, id, projectPath, { voice: opts.voice, rate: opts.rate });
        if (opts.onLog) opts.onLog(info + '\n');
        garantirTrilha(projectPath);
        props.narracao = `${id}-voz.mp3`;
        props.palavras = `${id}-palavras.json`;
        props.trilha = TRILHA;
      }
      const propsPath = path.join(path.dirname(outPath), `${id}-props.json`);
      fs.writeFileSync(propsPath, JSON.stringify(props, null, 2), 'utf-8');

      const args = [cli, 'render', 'src/index.ts', composition, outPath, `--props=${propsPath}`, '--log=error'];
      const started = Date.now();
      // node direto (sem shell/npx.cmd): caminhos com espaço funcionam
      const child = spawn(process.execPath, args, { cwd: projectPath });
      let tail = '';
      const keep = d => { tail = (tail + d.toString()).slice(-4000); };
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0 && fs.existsSync(outPath)) resolve({ path: outPath, ms: Date.now() - started });
        else reject(new Error(`Remotion saiu com código ${code}.\n${tail}`));
      });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { renderReel, narrar };
