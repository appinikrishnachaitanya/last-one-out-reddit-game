import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { isObject } from '../../shared/daily.ts';
import { checkRemix, parseRemix, remixBoard } from '../../shared/remix.ts';
import type { RemixDraft } from '../../shared/remix.ts';
import type { Dependencies } from '../app.ts';

const queue = 'remix-queue:v1';
const keyFor = (id: string) => `remix-draft:v1:${id}`;

export function remixRoutes(deps: Dependencies) {
  const api = new Hono();
  api.get('/', async (c) => {
    const { userId, username, postId } = await deps.getContext(c);
    const signedIn = Boolean(userId && username && postId);
    const enabled = deps.mode === 'reddit' && Boolean(deps.communityStorage);
    const canReview =
      enabled &&
      signedIn &&
      Boolean(await deps.canReviewRemix?.().catch(() => false));
    c.header('Cache-Control', 'private, no-store');
    return c.json({ enabled, signedIn, canReview });
  });
  api.post('/', async (c) => {
    const { userId, username, postId } = await deps.getContext(c);
    const storage = deps.communityStorage;
    if (deps.mode !== 'reddit' || !storage || !userId || !username || !postId)
      return c.json(
        { error: 'Open a Reddit crossing and sign in to submit a draft.' },
        403
      );
    let spec;
    let difficulty;
    try {
      spec = parseRemix(await c.req.json());
      difficulty = checkRemix(remixBoard(spec));
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : 'Check the four slots.',
        },
        400
      );
    }
    try {
      const id = createHash('sha256')
        .update(JSON.stringify([userId, spec]))
        .digest('hex');
      const key = keyFor(id);
      const draft: RemixDraft = {
        id,
        spec,
        creator: username,
        createdAt: deps.now().toISOString(),
        difficulty,
        status: 'draft',
      };
      // Index first so retries can recover after either write is interrupted.
      await deps.store.hSetNX(queue, id, draft.createdAt);
      await storage.commit(key, undefined, JSON.stringify(draft));
      const saved = await storage.get(key);
      if (!saved) throw new Error('Draft not confirmed');
      return c.json(JSON.parse(saved) as RemixDraft);
    } catch {
      return c.json({ error: 'Could not save the draft. Try again.' }, 503);
    }
  });
  api.use('/queue/*', async (c, next) => {
    if (
      deps.mode !== 'reddit' ||
      !deps.communityStorage ||
      !(await deps.canReviewRemix?.().catch(() => false))
    )
      return c.json({ error: 'Moderator access is required.' }, 403);
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  api.get('/queue/list', async (c) => {
    try {
      const entries = Object.entries(await deps.store.hGetAll(queue)).sort(
        (a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])
      );
      const cursor = c.req.query('after');
      const start = cursor
        ? Math.max(0, entries.findIndex(([id]) => id === cursor) + 1)
        : 0;
      const page = entries.slice(start, start + 20);
      const drafts = await Promise.all(
        page.map(async ([id]) => {
          const raw = await deps.communityStorage!.get(keyFor(id));
          return raw ? (JSON.parse(raw) as RemixDraft) : null;
        })
      );
      return c.json({
        drafts: drafts.filter(Boolean),
        next: entries[start + 20] ? page.at(-1)?.[0] : undefined,
      });
    } catch {
      return c.json(
        { error: 'The review queue could not load. Try again.' },
        503
      );
    }
  });
  api.post('/queue/review', async (c) => {
    const input: unknown = await c.req.json().catch(() => null);
    if (
      !isObject(input) ||
      typeof input.id !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.id) ||
      (input.status !== 'approved' && input.status !== 'rejected') ||
      typeof input.note !== 'string' ||
      input.note.trim().length > 240 ||
      (input.status === 'rejected' && !input.note.trim())
    )
      return c.json({ error: 'Add a short note when rejecting a draft.' }, 400);
    try {
      const storage = deps.communityStorage!;
      const key = keyFor(input.id);
      const raw = await storage.get(key);
      if (!raw) return c.json({ error: 'Draft unavailable.' }, 404);
      const current = JSON.parse(raw) as RemixDraft;
      if (current.status !== 'draft')
        return c.json(
          { error: 'Another moderator has already reviewed this draft.' },
          409
        );
      if (input.status === 'approved')
        checkRemix(remixBoard(parseRemix(current.spec)));
      const updated: RemixDraft = {
        ...current,
        status: input.status,
        note: input.note.trim(),
      };
      if (!(await storage.commit(key, raw, JSON.stringify(updated))))
        return c.json({ error: 'The draft changed. Reload the queue.' }, 409);
      return c.json(updated);
    } catch {
      return c.json({ error: 'Could not save the review. Try again.' }, 503);
    }
  });
  return api;
}
