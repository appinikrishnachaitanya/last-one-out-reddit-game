// Keep CLI credentials/cache in an ignored local directory. Never put tokens in devvit.json.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const local = join(root, '.local');
const child = spawn(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve('devvit/bin/devvit')),
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEVVIT_ROOT_DIR: process.env.DEVVIT_ROOT_DIR || local,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || join(local, 'cache'),
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || join(local, 'config'),
      NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || '1',
      DEVVIT_DISABLE_METRICS: process.env.DEVVIT_DISABLE_METRICS || '1',
    },
  }
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
