import { validGoalTarget } from './core/daily-goal';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import {
  cache,
  createServer,
  getServerPort,
  context,
  redis,
  reddit,
  realtime,
  settings,
} from '@devvit/web/server';
import { telemetry } from '@devvit/analytics/server/reddit';
import { createApi } from './app';
import {
  createPost,
  isPlayableEditionPost,
  readBoundPost,
  requirePostModerator,
} from './platform';
import { menu } from './routes/menu';
import { telemetryRoutes } from './routes/telemetry';
import { isT2, isT3 } from '@devvit/web/shared';
import { parseCommentHint } from '../shared/daily';
import { HINT_REFILL_MS } from '../shared/hint-refill';
import { editionAt } from './core/schedule';
import { findShowcaseCrossing } from './core/posts';
const app = new Hono();
app.route(
  '/api',
  createApi({
    store: redis,
    mode: 'reddit',
    canReviewRemix: async () => {
      await requirePostModerator();
      return true;
    },
    dailyGoalTarget: () => settings.get('dailyGoalTarget'),
    now: () => new Date(),
    getContext: async () => ({
      userId: context.userId,
      postId: context.postId,
      username: context.username,
    }),
    readPost: readBoundPost,
    resolveUsername: async (userId) => {
      if (!isT2(userId)) return undefined;
      const username = await cache(
        async () => (await reddit.getUserById(userId))?.username ?? null,
        { key: `leaderboard:username:${userId}`, ttl: 300 }
      );
      return username ?? undefined;
    },
    communityStorage: {
      get: (key) => redis.get(key),
      commit: async (key, expected, value, archive) => {
        const tx = await redis.watch(key);
        let started = false;
        try {
          if ((await redis.get(key)) !== expected) {
            await tx.unwatch();
            return false;
          }
          await tx.multi();
          started = true;
          await tx.set(key, value);
          if (archive) await tx.set(archive.key, archive.value);
          const replies = await tx.exec();
          return (
            replies.length === (archive ? 2 : 1) &&
            replies.every((reply) => reply != null)
          );
        } catch (error) {
          if (started) await tx.discard().catch(() => undefined);
          else await tx.unwatch().catch(() => undefined);
          throw error;
        }
      },
    },
    notifyCommunity: (channel, revision) =>
      realtime.send(channel, { revision }),
    hintRefill: async (userId, consume, edition) => {
      const key = `hint-refill:v2:${edition.id}:${userId}`;
      const refillAt = Date.now() + HINT_REFILL_MS;
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
    readCommentHint: async (postId) => {
      if (!isT3(postId)) return undefined;
      const comments = await reddit
        .getComments({ postId, sort: 'top', limit: 25, depth: 1 })
        .all();
      for (const comment of comments) {
        if (
          comment.parentId !== postId ||
          comment.removed ||
          comment.spam ||
          comment.score < 2 ||
          comment.authorName === context.appSlug
        )
          continue;
        const match = /^\[hint\]\s+([^\r\n<>]{12,130})$/i.exec(
          comment.body.trim()
        );
        if (!match || /https?:|\bwww\./i.test(match[1]!)) continue;
        const hint = parseCommentHint({
          text: match[1],
          url: `https://www.reddit.com${comment.permalink}`,
        });
        if (hint) return hint;
      }
      return undefined;
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
app.get('/api/callback/destination', async (c) => {
  const crossing = await findShowcaseCrossing(
    redis,
    new Date(),
    isPlayableEditionPost
  );
  c.header('Cache-Control', 'no-store');
  return c.json(
    crossing ?? {
      kind: 'community',
      url: `https://www.reddit.com/r/${context.subredditName}/`,
    }
  );
});
app.route('/internal/menu', menu);
app.post('/internal/settings/daily-goal-target', async (c) => {
  const payload: unknown = await c.req.json().catch(() => null);
  const value =
    payload && typeof payload === 'object' && 'value' in payload
      ? payload.value
      : undefined;
  return c.json(
    validGoalTarget(value)
      ? { success: true }
      : { success: false, error: 'Enter a whole number from 1 to 10,000.' }
  );
});
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
