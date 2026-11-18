import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { menu } from './routes/menu';
const app = new Hono();
app.get('/api/health', (c) => c.json({ ok: true, board: 'moonroot-v1' }));
app.route('/internal/menu', menu);
serve({ fetch: app.fetch, createServer, port: getServerPort() });
