import { postRegistryKey } from './core/posts.ts';
import { boardById } from '../shared/boards.ts';
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { isAnimalId, titleCase } from '../shared/engine.ts';
import { formatElapsed, isObject } from '../shared/daily.ts';
import type { Edition } from '../shared/daily.ts';
import { community, complete, loadCompletion } from './core/completions.ts';
import type { CompletionStore } from './core/completions.ts';
import {
  editionAt,
  editionFromPost,
  editionById,
  recentEditions,
  EDITIONS,
} from './core/schedule.ts';
export type GameContext = { userId?: string; postId?: string };
export type Store = CompletionStore & {
  hSet(key: string, values: Record<string, string>): Promise<number>;
};
export type Dependencies = {
  store: Store;
  mode: 'demo' | 'reddit';
  now: () => Date;
  getContext: (c: HonoContext) => Promise<GameContext>;
  readPost: (postId: string) => Promise<unknown>;
  share?: (postId: string, text: string) => Promise<string>;
  setFlair?: (text: string) => Promise<void>;
  hintRefill?: (
    userId: string,
    consume: boolean
  ) => Promise<{ refillAt: number; granted: boolean }>;
  endJourney?: (journeyId: string) => Promise<void>;
};
export const favoriteKey = (edition: Edition) => `card:v1:${edition.id}`;
const shareKey = (edition: Edition) => `rescue-share:v1:${edition.id}`;
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
    const { userId } = await deps.getContext(c);
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
      return c.json({
        status: 'ready',
        mode: deps.mode,
        edition,
        completion,
        shareStatus:
          completion && ctx.userId && deps.share
            ? await deps.store
                .hGet(shareKey(edition), ctx.userId)
                .catch(() => undefined)
            : undefined,
        refillAt:
          ctx.userId && deps.hintRefill
            ? (await deps.hintRefill(ctx.userId, false).catch(() => undefined))
                ?.refillAt
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
        deps.now()
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
      return c.json({ ...result, completion, telemetry });
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
  api.post('/hint', async (c) => {
    try {
      const { ctx, edition } = await requestEdition(c);
      if (!ctx.userId || !edition || !deps.hintRefill)
        return c.json({ error: 'Hint sync unavailable' }, 403);
      return c.json(await deps.hintRefill(ctx.userId, true));
    } catch {
      return c.json({ error: 'Hint sync unavailable' }, 503);
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
      const stats = await community(deps.store, edition);
      const body: unknown = await c.req.json();
      const favorite =
        isObject(body) && isAnimalId(body.favorite)
          ? body.favorite
          : saved.favorite;
      const hook =
        saved.openingTrap && (stats.traps?.[saved.openingTrap] ?? 0) >= 2
          ? 'That tempting first move fooled me too. Which move fooled you?'
          : 'Which move fooled you?';
      const text = [
        `**Last One Out — Day #${edition.number}**`,
        boardById(edition.puzzleId, edition.boardVersion).title,
        '✦ ✦ ✦ ✦ · Everyone home',
        saved.personalUndos === 0
          ? '✨ Clean Crossing (personal)'
          : `${saved.personalUndos} personal undos`,
        `Card: ${titleCase(favorite)}${saved.elapsedSeconds === undefined ? '' : ` · Time ${formatElapsed(saved.elapsedSeconds)}`}`,
        hook,
      ].join('\n\n');
      if ((await deps.store.hSetNX(key, ctx.userId, 'pending')) !== 1) {
        const status = await deps.store.hGet(key, ctx.userId);
        if (status && status !== 'pending') return c.json({ shared: true });
        return c.json(
          {
            error:
              'A share is pending or could not be confirmed. Check the comments or copy your result.',
          },
          409
        );
      }
      const commentId = await deps.share(ctx.postId, text);
      await deps.store.hSet(key, { [ctx.userId]: commentId });
      return c.json({ shared: true });
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
        `🐾 Crossing Keeper · ${streak === 30 ? '30+' : streak}d`
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
    api.get('/previews', (c) => c.json({ editions: EDITIONS }));
  return api;
}
