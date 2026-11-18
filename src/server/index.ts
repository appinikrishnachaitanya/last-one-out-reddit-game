import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import {
  createServer,
  getServerPort,
  context,
  redis,
} from '@devvit/web/server';
import { telemetry } from '@devvit/analytics/server/reddit';
import { createApi } from './app';
import { readBoundPost } from './platform';
import { menu } from './routes/menu';
import { telemetryRoutes } from './routes/telemetry';
const app = new Hono();
app.route(
  '/api',
  createApi({
    store: redis,
    mode: 'reddit',
    now: () => new Date(),
    getContext: async () => ({
      userId: context.userId,
      postId: context.postId,
    }),
    readPost: readBoundPost,
    endJourney: async (journeyId) => {
      const event = await telemetry.endJourney({
        journeyId,
        complete: true,
        game: { win: true, score: 4 },
      });
      console.info('Journeys completion receipt', event.receipt.status);
    },
  })
);
app.route('/api/telemetry', telemetryRoutes);
app.route('/internal/menu', menu);
serve({ fetch: app.fetch, createServer, port: getServerPort() });
