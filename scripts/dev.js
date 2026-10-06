import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchFrontend } from './build.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watcher = await watchFrontend();
const server = spawn(process.execPath, ['--watch', 'server/index.js'], { cwd: root, stdio: 'inherit' });
let stopping = false;
async function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  server.kill(signal);
  await watcher.dispose();
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop());
server.on('error', async error => { console.error(error); await stop(); process.exitCode = 1; });
server.on('exit', async code => { await stop(); process.exitCode = code ?? 0; });
