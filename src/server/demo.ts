import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createApi } from './app.ts';
import { MemoryStore } from './core/memory-store.ts';
import { bindingFor, EDITIONS, editionById } from './core/schedule.ts';
import { isObject } from '../shared/daily.ts';
const store = new MemoryStore(),
  file = '.local/demo-store.json';
mkdirSync('.local', { recursive: true });
if (existsSync(file)) {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (isObject(data))
    for (const [key, fields] of Object.entries(data))
      if (isObject(fields))
        store.hashes.set(
          key,
          new Map(
            Object.entries(fields).filter(
              (pair): pair is [string, string] => typeof pair[1] === 'string'
            )
          )
        );
}
store.changed = () => {
  writeFileSync(
    `${file}.tmp`,
    JSON.stringify(
      Object.fromEntries(
        [...store.hashes].map(([key, fields]) => [
          key,
          Object.fromEntries(fields),
        ])
      )
    )
  );
  renameSync(`${file}.tmp`, file);
};
const app = new Hono();
app.route(
  '/api',
  createApi({
    store,
    mode: 'demo',
    now: () => new Date(),
    getContext: async (c) => {
      let userId = getCookie(c, 'loo-preview');
      if (!userId) {
        userId = `preview-${randomUUID()}`;
        setCookie(c, 'loo-preview', userId, {
          httpOnly: true,
          sameSite: 'Strict',
          path: '/',
          maxAge: 86400 * 7,
        });
      }
      const editionId = c.req.query('edition') ?? EDITIONS[0]?.id;
      return { userId, postId: editionId ? `demo:${editionId}` : undefined };
    },
    readPost: async (postId) => bindingFor(editionById(postId.slice(5))),
  })
);
serve({
  fetch: app.fetch,
  port: Number(process.env.DEMO_API_PORT ?? 5174),
  hostname: '127.0.0.1',
});
console.log(
  'Local preview API: mock identity and local disk storage; no Reddit community data or telemetry.'
);
