import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { isAnimalId } from '../shared/engine.ts';
import { isObject } from '../shared/daily.ts';
import type { Edition } from '../shared/daily.ts';
import { community, complete, loadCompletion } from './core/completions.ts';
import type { CompletionStore } from './core/completions.ts';
import { editionAt, editionFromPost, EDITIONS } from './core/schedule.ts';
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
  endJourney?: (journeyId: string) => Promise<void>;
};
export const favoriteKey = (edition: Edition) => `card:v1:${edition.id}`;
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
      const completion = ctx.userId
        ? await withFavorite(edition, ctx.userId)
        : null;
      return c.json({
        status: 'ready',
        mode: deps.mode,
        edition,
        completion,
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
  if (deps.mode === 'demo')
    api.get('/previews', (c) => c.json({ editions: EDITIONS }));
  return api;
}
