import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(
    process.execPath,
    [
      '--watch',
      '--watch-preserve-output',
      '--experimental-strip-types',
      'src/server/demo.ts',
    ],
    { cwd: root, stdio: 'inherit', env: process.env }
  ),
  spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      'vite.demo.config.ts',
      '--host',
      '0.0.0.0',
    ],
    { cwd: root, stdio: 'inherit', env: process.env }
  ),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
