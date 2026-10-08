/**
 * Ponte de render: <id>-cenas.json -> Remotion headless (E:\reels-estudio, composição "Reel") -> <id>.mp4
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function renderReel(cenasPath, outPath, projectPath, { onLog } = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(projectPath)) return reject(new Error(`Projeto Remotion não encontrado: ${projectPath}`));
    // Chama o CLI do Remotion direto com o node (sem shell, sem npx.cmd): caminhos com espaço funcionam.
    const cli = path.join(projectPath, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
    if (!fs.existsSync(cli)) return reject(new Error(`Remotion não instalado em ${projectPath}. Rode npm install lá.`));
    const args = [cli, 'render', 'src/index.ts', 'Reel', outPath, `--props=${cenasPath}`, '--log=warn'];
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: projectPath });
    let tail = '';
    const keep = d => { tail = (tail + d.toString()).slice(-4000); if (onLog) onLog(d.toString()); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0 && fs.existsSync(outPath)) resolve({ path: outPath, ms: Date.now() - started });
      else reject(new Error(`Remotion saiu com código ${code}.\n${tail}`));
    });
  });
}

module.exports = { renderReel };
