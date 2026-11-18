import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { isObject } from '../../shared/daily';
import { EDITIONS, editionAt, editionById } from '../core/schedule';
import { createPost, recoverEditionPost, requireModerator } from '../platform';
export const menu = new Hono();
const url = (id: string) =>
  `https://www.reddit.com/r/${context.subredditName}/comments/${id.replace('t3_', '')}/`;
menu.use('*', async (c, next) => {
  try {
    await requireModerator();
    await next();
  } catch (error) {
    return c.json<UiResponse>(
      {
        showToast:
          error instanceof Error ? error.message : 'Moderator access required',
      },
      403
    );
  }
});
menu.post('/post-create', async (c) => {
  try {
    const edition = editionAt(new Date());
    if (!edition)
      return c.json<UiResponse>({
        showToast:
          'No daily is scheduled for today. Use Choose playtest edition to open an existing edition.',
      });
    return c.json<UiResponse>({ navigateTo: url(await createPost(edition)) });
  } catch (error) {
    return c.json<UiResponse>(
      {
        showToast:
          error instanceof Error
            ? error.message
            : 'Could not open the daily. Please retry.',
      },
      503
    );
  }
});
menu.post('/choose-edition', (c) =>
  c.json<UiResponse>({
    showForm: {
      name: 'editionForm',
      form: {
        title: 'Choose a private playtest edition',
        fields: [
          {
            name: 'editionId',
            label: 'Daily edition (UTC)',
            type: 'select',
            options: EDITIONS.map((e) => ({
              label: `Day ${e.number} · ${e.date}`,
              value: e.id,
            })),
            required: true,
            multiSelect: false,
          },
        ],
      },
    },
  })
);
menu.post('/recover', (c) =>
  c.json<UiResponse>({
    showForm: {
      name: 'recoverForm',
      form: {
        title: 'Recover an existing edition post',
        description:
          'If creation was interrupted, enter the existing app post ID from the community. This reuses it without creating another post.',
        fields: [
          {
            name: 'postId',
            label: 'Existing post ID (t3_...)',
            type: 'string',
            required: true,
          },
        ],
      },
    },
  })
);
menu.post('/edition-submit', async (c) => {
  try {
    const body: unknown = await c.req.json();
    if (
      !isObject(body) ||
      !Array.isArray(body.editionId) ||
      typeof body.editionId[0] !== 'string'
    )
      throw new Error('Choose an edition');
    return c.json<UiResponse>({
      navigateTo: url(await createPost(editionById(body.editionId[0]))),
    });
  } catch (error) {
    return c.json<UiResponse>(
      {
        showToast:
          error instanceof Error
            ? error.message
            : 'Could not open this edition',
      },
      503
    );
  }
});
menu.post('/recover-submit', async (c) => {
  try {
    const body: unknown = await c.req.json();
    if (!isObject(body) || typeof body.postId !== 'string')
      throw new Error('Enter an existing post ID');
    return c.json<UiResponse>({
      navigateTo: url(await recoverEditionPost(body.postId.trim())),
    });
  } catch (error) {
    return c.json<UiResponse>(
      {
        showToast:
          error instanceof Error
            ? error.message
            : 'Could not recover this post',
      },
      503
    );
  }
});
