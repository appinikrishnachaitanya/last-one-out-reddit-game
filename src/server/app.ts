import {
  CommunityMoveError,
  readCommunity,
  submitCommunity,
} from './core/community-board.ts';
import type { CommunityStorage } from './core/community-board.ts';
import {
  readAttemptStats,
  readFirstMove,
  recordAttempt,
} from './core/attempts.ts';
import { postRegistryKey } from './core/posts.ts';
import { CHALLENGES, boardById } from '../shared/boards.ts';
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { isAnimalId, titleCase } from '../shared/engine.ts';
import { isObject, rescueShare } from '../shared/daily.ts';
import type { CommentHint, Edition } from '../shared/daily.ts';
import { community, complete, loadCompletion } from './core/completions.ts';
import type { CompletionStore } from './core/completions.ts';
import {
  editionAt,
  editionFromPost,
  editionById,
  recentEditions,
  EDITIONS,
  challengePreviews,
} from './core/schedule.ts';
export type GameContext = {
  userId?: string;
  postId?: string;
  username?: string;
};
export type Store = CompletionStore & {
  hSet(key: string, values: Record<string, string>): Promise<number>;
};
export type Dependencies = {
  store: Store;
  mode: 'demo' | 'reddit';
  now: () => Date;
  getContext: (c: HonoContext) => Promise<GameContext>;
  readPost: (postId: string) => Promise<unknown>;
  communityStorage?: CommunityStorage;
  notifyCommunity?: (channel: string, revision: number) => Promise<void>;
  readCommentHint?: (postId: string) => Promise<CommentHint | undefined>;
  share?: (postId: string, text: string) => Promise<string>;
  setFlair?: (text: string) => Promise<void>;
  hintRefill?: (
    userId: string,
    consume: boolean,
    edition: Edition
  ) => Promise<{ refillAt: number; granted: boolean }>;
  endJourney?: (journeyId: string) => Promise<void>;
};
export const favoriteKey = (edition: Edition) => `card:v1:${edition.id}`;
const shareKey = (edition: Edition) => `rescue-share:v1:${edition.id}`;
function precedingEdition(edition: Edition): Edition | undefined {
  return editionAt(
    new Date(Date.parse(`${edition.date}T00:00:00Z`) - 86_400_000)
  );
}
export function createApi(deps: Dependencies) {
  const api = new Hono();
  async function requestEdition(c: HonoContext) {
    const ctx = await deps.getContext(c);
    if (!ctx.postId) return { ctx, edition: undefined };
    return { ctx, edition: editionFromPost(await deps.readPost(ctx.postId)) };
  }
  const withFavorite = async (edition: Edition, userId: string) => {
    const saved = await loadCompletion(deps.store, edition, userId);
    if (!saved) return null;
    const preference = await deps.store.hGet(favoriteKey(edition), userId);
    return preference && isAnimalId(preference)
      ? { ...saved, favorite: preference }
      : saved;
  };
  api.get('/crossings', async (c) => {
    const now = deps.now();
    const today = now.toISOString().slice(0, 10);
    const { userId, username } = await deps.getContext(c);
    const editions = [
      ...new Map(
        [...EDITIONS, ...recentEditions(now)].map((edition) => [
          edition.id,
          edition,
        ])
      ).values(),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const tomorrow = new Date(`${today}T00:00:00Z`).getTime() + 86_400_000;
    const next =
      EDITIONS.find((edition) => edition.date > today) ??
      editionAt(new Date(tomorrow));
    const past = await Promise.all(
      editions
        .filter((edition) => edition.date < today)
        .map(async (edition) => {
          const post = await deps.store.hGet(postRegistryKey(edition), 'post');
          if (!post || !/^t3_[a-z0-9]+$/.test(post)) return null;
          return {
            day: edition.number,
            title: boardById(edition.puzzleId, edition.boardVersion).title,
            url: `https://www.reddit.com/comments/${post.slice(3)}/`,
            completed: userId
              ? !!(await loadCompletion(deps.store, edition, userId))
              : false,
          };
        })
    );
    const indexed = userId
      ? await deps.store.hGetAll(`rescue-cards:v1:${userId}`)
      : {};
    const cardEditions = new Map(
      EDITIONS.map((edition) => [edition.id, edition])
    );
    for (const id of Object.keys(indexed)) {
      try {
        cardEditions.set(id, editionById(id));
      } catch {
        /* obsolete edition */
      }
    }
    const cards = userId
      ? await Promise.all(
          [...cardEditions.values()].map(async (edition) => {
            const record = await withFavorite(edition, userId);
            return record
              ? {
                  day: edition.number,
                  title: boardById(edition.puzzleId, edition.boardVersion)
                    .title,
                  favorite: record.favorite,
                  puzzleId: edition.puzzleId,
                  earnedAt: record.completedAt,
                }
              : null;
          })
        )
      : [];
    const completedDays = new Set(
      cards.flatMap((card) => (card ? [card.day] : []))
    );
    const currentDay = editionAt(now)?.number ?? 0;
    let day = completedDays.has(currentDay) ? currentDay : currentDay - 1;
    let streak = 0;
    while (completedDays.has(day)) {
      streak++;
      day--;
    }
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      streak,
      signedIn: Boolean(userId),
      ...(userId && username && deps.mode === 'reddit'
        ? { owner: username }
        : {}),
      challengeTotal: CHALLENGES.length,
      totalEditions: EDITIONS.length,
      cards: cards.filter((card) => card !== null),
      serverTime: now.getTime(),
      nextAt: next ? Date.parse(`${next.date}T00:00:00Z`) : null,
      past: past.filter((entry) => entry !== null).reverse(),
    });
  });
  api.get('/init', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!edition)
        return c.json({
          status: 'empty',
          mode: deps.mode,
          message: editionAt(deps.now())
            ? 'Open the daily’s Reddit post to play.'
            : 'No puzzle is scheduled for today. Come back for the next crossing.',
        });
      c.header('Cache-Control', 'private, no-store');
      const completion = ctx.userId
        ? await withFavorite(edition, ctx.userId)
        : null;
      if (completion && ctx.userId && edition.number > EDITIONS.length)
        await deps.store
          .hSetNX(`rescue-cards:v1:${ctx.userId}`, edition.id, 'earned')
          .catch(() => undefined);
      const previous =
        deps.mode === 'reddit' && !completion
          ? precedingEdition(edition)
          : undefined;
      const todayStats =
        deps.mode === 'reddit'
          ? await readAttemptStats(deps.store, edition).catch(() => undefined)
          : undefined;
      const priorStats = previous
        ? await readAttemptStats(deps.store, previous).catch(() => undefined)
        : undefined;
      const hasPrevious = Boolean(
        priorStats &&
        (priorStats.totalSolves ||
          priorStats.players ||
          Object.keys(priorStats.stranded).length)
      );
      const banner = hasPrevious ? priorStats : todayStats;
      return c.json({
        status: 'ready',
        mode: deps.mode,
        ...(ctx.userId && ctx.username && deps.mode === 'reddit'
          ? { username: ctx.username }
          : {}),
        edition,
        completion,
        attemptStats: completion ? todayStats : undefined,
        communityEnabled:
          deps.mode === 'reddit' && Boolean(deps.communityStorage),
        ...(banner && !completion
          ? {
              previousRescues: {
                yesterday: hasPrevious,
                totalSolves: banner.totalSolves,
                perfectRuns: banner.perfectRuns,
                stranded: banner.stranded,
              },
            }
          : {}),
        shareStatus:
          completion && ctx.userId && deps.share
            ? await deps.store
                .hGet(shareKey(edition), ctx.userId)
                .catch(() => undefined)
            : undefined,
        hintSync: Boolean(ctx.userId && deps.hintRefill),
        refillAt:
          ctx.userId && deps.hintRefill
            ? (
                await deps
                  .hintRefill(ctx.userId, false, edition)
                  .catch(() => undefined)
              )?.refillAt
            : undefined,
        community: completion ? await community(deps.store, edition) : null,
        commentsUrl:
          deps.mode === 'reddit' && ctx.postId
            ? `https://www.reddit.com/comments/${ctx.postId.replace('t3_', '')}/`
            : null,
      });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'The daily could not load. Please retry.',
        },
        503
      );
    }
  });
  api.post('/attempt', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (deps.mode !== 'reddit' || !ctx.userId || !edition)
        return c.json({ error: 'Reddit sign-in required.' }, 403);
      await recordAttempt(deps.store, edition, ctx.userId, await c.req.json());
      return c.json({ recorded: true });
    } catch {
      return c.json({ error: 'Could not record this attempt event.' }, 400);
    }
  });
  api.post('/complete', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!ctx.userId)
        return c.json(
          {
            error:
              'Sign in to Reddit to save your rescue. Your reunion is still here.',
          },
          401
        );
      if (!edition)
        return c.json({ error: 'This post has no scheduled edition' }, 400);
      const input: unknown = await c.req.json();
      const result = await complete(
        deps.store,
        edition,
        ctx.userId,
        input,
        deps.now(),
        deps.mode === 'reddit' && isObject(input)
          ? await readFirstMove(
              deps.store,
              edition,
              ctx.userId,
              input.attemptId
            ).catch(() => undefined)
          : undefined
      );
      if (edition.number > EDITIONS.length)
        await deps.store.hSetNX(
          `rescue-cards:v1:${ctx.userId}`,
          edition.id,
          'earned'
        );
      // Saving is complete before telemetry is attempted. SDK/network failures never change the result.
      let telemetry: 'not-requested' | 'attempted' | 'unavailable' =
        'not-requested';
      const journey = c.req.header('x-devvit-journey-id');
      if (journey && journey.length <= 256 && deps.endJourney) {
        telemetry = 'attempted';
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const claimed = await deps.store.hSetNX(
            `journey-completions:${edition.id}`,
            `${ctx.userId}:${journey}`,
            'claimed'
          );
          if (claimed === 1)
            await Promise.race([
              deps.endJourney(journey),
              new Promise<void>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('telemetry timeout')),
                  800
                );
              }),
            ]);
        } catch {
          telemetry = 'unavailable';
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      const completion =
        (await withFavorite(edition, ctx.userId)) ?? result.completion;
      const attemptStats =
        deps.mode === 'reddit'
          ? await readAttemptStats(deps.store, edition).catch(() => undefined)
          : undefined;
      return c.json({ ...result, completion, telemetry, attemptStats });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'The rescue could not be saved. Please retry.',
        },
        400
      );
    }
  });
  api.post('/favorite', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (
        !ctx.userId ||
        !edition ||
        !(await loadCompletion(deps.store, edition, ctx.userId))
      )
        return c.json(
          { error: 'Save your rescue before choosing card art' },
          403
        );
      const input: unknown = await c.req.json();
      if (!isObject(input) || !isAnimalId(input.favorite))
        return c.json({ error: 'Choose one of the four animals' }, 400);
      await deps.store.hSet(favoriteKey(edition), {
        [ctx.userId]: input.favorite,
      });
      return c.json({ saved: true });
    } catch {
      return c.json(
        { error: 'Your card art could not be saved. Try again.' },
        503
      );
    }
  });
  api.get('/lifelines', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!ctx.userId || !edition || !deps.hintRefill)
        return c.json({ error: 'Sign in to sync hints.' }, 403);
      c.header('Cache-Control', 'private, no-store');
      const hint = await deps.hintRefill(ctx.userId, false, edition);
      return c.json({ refillAt: hint.refillAt });
    } catch {
      return c.json({ error: 'Could not refresh hints.' }, 503);
    }
  });
  api.get('/comparison', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (
        !ctx.userId ||
        !edition ||
        !(await loadCompletion(deps.store, edition, ctx.userId))
      )
        return c.json(
          { error: 'Finish your rescue to unlock comparisons.' },
          403
        );
      c.header('Cache-Control', 'private, no-store');
      return c.json(await readAttemptStats(deps.store, edition));
    } catch {
      return c.json({ error: 'Could not refresh comparisons.' }, 503);
    }
  });
  api.post('/hint', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!ctx.userId || !edition || !deps.hintRefill)
        return c.json({ error: 'Hint sync unavailable' }, 403);
      const charge = await deps.hintRefill(ctx.userId, true, edition);
      const previous =
        deps.mode === 'reddit' && charge.granted
          ? precedingEdition(edition)
          : undefined;
      const reader = deps.readCommentHint;
      const hint =
        previous && reader
          ? await (async () => {
              try {
                const postId = await deps.store.hGet(
                  postRegistryKey(previous),
                  'post'
                );
                return postId ? await reader(postId) : undefined;
              } catch {
                return undefined;
              }
            })()
          : undefined;
      return c.json({ ...charge, ...(hint ? { hint } : {}) });
    } catch {
      return c.json({ error: 'Hint sync unavailable' }, 503);
    }
  });
  api.get('/community', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (
        deps.mode !== 'reddit' ||
        !deps.communityStorage ||
        !ctx.postId ||
        !edition
      )
        return c.json(
          { error: 'Open the Reddit daily to join the community crossing.' },
          404
        );
      c.header('Cache-Control', 'private, no-store');
      return c.json(
        await readCommunity(
          deps.communityStorage,
          ctx.postId,
          edition,
          ctx.userId
        )
      );
    } catch {
      return c.json(
        { error: 'The shared board could not load. Try refreshing.' },
        503
      );
    }
  });
  api.post('/community', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (
        deps.mode !== 'reddit' ||
        !deps.communityStorage ||
        !ctx.postId ||
        !edition
      )
        return c.json(
          { error: 'Open the Reddit daily to join the community crossing.' },
          404
        );
      if (!ctx.userId || !ctx.username)
        return c.json({ error: 'Sign in to Reddit to move an animal.' }, 403);
      const state = await submitCommunity(
        deps.communityStorage,
        ctx.postId,
        edition,
        { id: ctx.userId, username: ctx.username },
        await c.req.json()
      );
      await deps
        .notifyCommunity?.(state.channel, state.moveNumber)
        .catch(() => undefined);
      return c.json(state);
    } catch (error) {
      if (error instanceof CommunityMoveError)
        return c.json({ error: error.message }, error.status);
      return c.json(
        { error: 'Could not confirm the move. Refresh the shared board.' },
        503
      );
    }
  });
  api.post('/share', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!ctx.userId || !ctx.postId || !edition || !deps.share)
        return c.json({ error: 'Reddit sharing is unavailable here.' }, 403);
      const saved = await withFavorite(edition, ctx.userId);
      if (!saved) return c.json({ error: 'Save your rescue first.' }, 403);
      const key = shareKey(edition);
      const stats = await readAttemptStats(deps.store, edition).catch(
        () => undefined
      );
      const text = rescueShare(
        edition,
        saved.personalUndos,
        saved.firstMove ?? saved.opening,
        stats
      );
      if ((await deps.store.hSetNX(key, ctx.userId, 'pending')) !== 1) {
        const status = await deps.store.hGet(key, ctx.userId);
        if (status && status !== 'pending')
          return c.json({ shared: true, commentId: status });
        return c.json(
          {
            error:
              'A share is pending or could not be confirmed. Check the comments or copy your result.',
          },
          409
        );
      }
      const commentId = await deps.share(
        ctx.postId,
        text
          .split('\n')
          .map((line) => `>!${line}!<`)
          .join('\n\n')
      );
      await deps.store.hSet(key, { [ctx.userId]: commentId });
      return c.json({ shared: true, commentId });
    } catch {
      return c.json(
        {
          error:
            'Reddit could not confirm the share. Check comments or copy your result.',
        },
        503
      );
    }
  });
  api.post('/flair', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!ctx.userId || !edition || !deps.setFlair)
        return c.json({ error: 'Subreddit flair is unavailable here.' }, 403);
      const saved = await withFavorite(edition, ctx.userId);
      if (!saved) return c.json({ error: 'Save your rescue first.' }, 403);
      let streak = 0;
      for (const prior of recentEditions(
        new Date(`${edition.date}T00:00:00Z`)
      )) {
        if (!(await loadCompletion(deps.store, prior, ctx.userId))) break;
        streak++;
      }
      await deps.setFlair(
        `🐾 ${titleCase(saved.favorite)} Keeper · ${streak === 30 ? '30+' : streak}d rescue streak`
      );
      return c.json({ updated: true });
    } catch {
      return c.json(
        { error: 'This community could not update your flair.' },
        503
      );
    }
  });
  if (deps.mode === 'demo')
    api.get('/previews', (c) =>
      c.json({ editions: [...EDITIONS, ...challengePreviews] })
    );
  return api;
}
