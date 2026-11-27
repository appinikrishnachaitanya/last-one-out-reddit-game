import {
  defaultCompanion,
  parseCompanion,
  canWear,
} from '../shared/companion.ts';
import { remixRoutes } from './routes/remix.ts';
import { goldenLeavesKey, readDailyGoal } from './core/daily-goal.ts';
import {
  CommunityMoveError,
  readCommunity,
  readCommunityReplay,
  submitCommunity,
  submitCommunityVote,
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
import { readLeaderboard } from './core/leaderboard.ts';
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
  canReviewRemix?: () => Promise<boolean>;
  dailyGoalTarget?: () => Promise<unknown>;
  now: () => Date;
  getContext: (c: HonoContext) => Promise<GameContext>;
  readPost: (postId: string) => Promise<unknown>;
  resolveUsername?: (userId: string) => Promise<string | undefined>;
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
  api.route('/remix', remixRoutes(deps));
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
  function goalFor(edition: Edition, userId?: string) {
    return readDailyGoal(deps.store, edition, deps.dailyGoalTarget, userId);
  }
  api.get('/daily-goal', async (c) => {
    try {
      if (deps.mode !== 'reddit' || !deps.dailyGoalTarget)
        return c.json({ status: 'unavailable' }, 404);
      const today = editionAt(deps.now());
      if (!today) return c.json({ status: 'empty' });
      const { userId } = await deps.getContext(c);
      c.header('Cache-Control', 'private, no-store');
      return c.json(await goalFor(today, userId));
    } catch {
      return c.json(
        { error: 'The daily goal is temporarily unavailable.' },
        503
      );
    }
  });
  async function companionRescues(userId: string) {
    const indexed = await deps.store.hGetAll(`rescue-cards:v1:${userId}`);
    const editions = new Map(EDITIONS.map((edition) => [edition.id, edition]));
    for (const id of Object.keys(indexed)) {
      try {
        editions.set(id, editionById(id));
      } catch {
        /* Obsolete edition. */
      }
    }
    const saved = await Promise.all(
      [...editions.values()].map((edition) =>
        loadCompletion(deps.store, edition, userId)
      )
    );
    return saved.filter(Boolean).length;
  }
  api.get('/companion', async (c) => {
    try {
      const { userId } = await deps.getContext(c);
      if (!userId)
        return c.json({
          profile: defaultCompanion,
          rescues: 0,
          signedIn: false,
        });
      const raw = await deps.store.hGet('companions:v1', userId);
      const profile = raw ? parseCompanion(JSON.parse(raw)) : defaultCompanion;
      c.header('Cache-Control', 'private, no-store');
      return c.json({
        profile: profile ?? defaultCompanion,
        rescues: await companionRescues(userId),
        signedIn: true,
      });
    } catch {
      return c.json({ error: 'Could not load your animal.' }, 503);
    }
  });
  api.post('/companion', async (c) => {
    try {
      const { userId } = await deps.getContext(c);
      if (!userId)
        return c.json({ error: 'Sign in to save your animal.' }, 403);
      const profile = parseCompanion(await c.req.json());
      if (!profile)
        return c.json(
          { error: 'Choose an animal, scarf, and accessory.' },
          400
        );
      if (!canWear(profile, await companionRescues(userId)))
        return c.json(
          { error: 'Finish more rescues to unlock this reward.' },
          403
        );
      await deps.store.hSet('companions:v1', {
        [userId]: JSON.stringify(profile),
      });
      return c.json(profile);
    } catch {
      return c.json({ error: 'Could not save your animal. Try again.' }, 503);
    }
  });
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
    const leaves =
      deps.dailyGoalTarget && userId
        ? await deps.store
            .hGetAll(goldenLeavesKey)
            .catch(() => ({}) as Record<string, string>)
        : {};
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
                  ...(leaves[edition.date] &&
                  record.completedAt.slice(0, 10) === edition.date
                    ? { goldenLeaf: true }
                    : {}),
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
        dailyGoalEnabled:
          deps.mode === 'reddit' && Boolean(deps.dailyGoalTarget),
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
      const now = deps.now();
      const result = await complete(
        deps.store,
        edition,
        ctx.userId,
        input,
        now,
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
      const goal =
        deps.mode === 'reddit' &&
        deps.dailyGoalTarget &&
        edition.date === now.toISOString().slice(0, 10) &&
        completion.completedAt.slice(0, 10) === edition.date
          ? await goalFor(edition, ctx.userId).catch(() => undefined)
          : undefined;
      return c.json({ ...result, completion, telemetry, attemptStats, goal });
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
  api.get('/leaderboard', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (deps.mode !== 'reddit' || !edition)
        return c.json(
          { error: 'Open a Reddit daily to see its leaderboard.' },
          404
        );
      c.header('Cache-Control', 'private, no-store');
      return c.json(
        await readLeaderboard(deps.store, edition, ctx, deps.resolveUsername)
      );
    } catch {
      return c.json({ error: 'Could not load the leaderboard.' }, 503);
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
  api.get('/community/replay', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (
        deps.mode !== 'reddit' ||
        !deps.communityStorage ||
        !ctx.postId ||
        !edition
      )
        return c.json(
          { error: 'Open the Reddit daily to watch a replay.' },
          404
        );
      const replay = await readCommunityReplay(
        deps.communityStorage,
        ctx.postId,
        edition
      );
      if (!replay)
        return c.json({ error: 'No shared rescue has finished yet.' }, 404);
      c.header('Cache-Control', 'private, no-store');
      return c.json(replay);
    } catch {
      return c.json(
        {
          error:
            'This replay is unavailable. You can still play the shared crossing.',
        },
        503
      );
    }
  });
  api.post('/community/vote', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (
        deps.mode !== 'reddit' ||
        !deps.communityStorage ||
        !ctx.postId ||
        !edition
      )
        return c.json({ error: 'Open the Reddit daily to vote.' }, 404);
      if (!ctx.userId) return c.json({ error: 'Sign in to vote.' }, 403);
      const { state, changed } = await submitCommunityVote(
        deps.communityStorage,
        ctx.postId,
        edition,
        ctx.userId,
        await c.req.json(),
        deps.now()
      );
      if (changed)
        await deps
          .notifyCommunity?.(state.channel, state.moveNumber)
          .catch(() => undefined);
      return c.json(state);
    } catch (error) {
      if (error instanceof CommunityMoveError)
        return c.json({ error: error.message }, error.status);
      return c.json({ error: 'Could not save your vote. Try again.' }, 503);
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
        await c.req.json(),
        deps.now()
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
        stats,
        saved.hintUsed === true
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
