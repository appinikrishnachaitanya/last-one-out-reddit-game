import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import {
  createServer,
  getServerPort,
  context,
  redis,
  reddit,
} from '@devvit/web/server';
import { telemetry } from '@devvit/analytics/server/reddit';
import { createApi } from './app';
import { createPost, readBoundPost } from './platform';
import { menu } from './routes/menu';
import { telemetryRoutes } from './routes/telemetry';
import { isT3 } from '@devvit/web/shared';
import { editionAt } from './core/schedule';
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
    hintRefill: async (userId, consume) => {
      const key = `hint-refill:v1:${userId}`;
      const refillAt = Date.now() + 60_000;
      const claim = `${refillAt}:${crypto.randomUUID()}`;
      if (consume)
        await redis.set(key, claim, {
          nx: true,
          expiration: new Date(refillAt),
        });
      const current = await redis.get(key);
      return {
        refillAt: Number(current?.split(':')[0]) || 0,
        granted: consume && current === claim,
      };
    },
    share: async (postId, text) => {
      if (!isT3(postId)) throw new Error('Invalid post');
      const comment = await reddit.submitComment({
        id: postId,
        text,
        runAs: 'APP',
      });
      return comment.id;
    },
    setFlair: async (text) => {
      if (!context.username) throw new Error('Sign in first');
      await reddit.setUserFlair({
        subredditName: context.subredditName,
        username: context.username,
        text,
      });
    },
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
app.post('/internal/cron/daily', async (c) => {
  try {
    const subreddit = await reddit.getSubredditInfoByName(
      context.subredditName
    );
    // This draft is scoped to private playtesting.
    if (subreddit.type !== 'private') return c.json({ skipped: true });
    const edition = editionAt(new Date());
    if (edition) await createPost(edition);
    return c.json({ ok: true });
  } catch (error) {
    console.error('Daily post requires moderator recovery', error);
    return c.json({ error: 'Daily post could not be confirmed' }, 503);
  }
});
serve({ fetch: app.fetch, createServer, port: getServerPort() });
