import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import {
  checkRemix,
  parseRemix,
  remixBoard,
  remixTemplates,
} from '../src/shared/remix.ts';

const [moon, willow, lantern] = remixTemplates;
const specFor = (board: typeof moon) => ({
  template: board.id,
  slots: board.animals.map(({ id, direction }) => ({ id, direction })),
});

test('fixed Remix templates validate, constrain placement, and explain unsolvable routes', () => {
  for (const board of [moon, willow, lantern]) {
    const spec = parseRemix(specFor(board));
    const remix = remixBoard(spec, 'stable-demo-id', 'creator');
    assert.equal(remix.title, 'Sunday Remix by u/creator');
    assert.deepEqual(remix.animals, board.animals);
    assert.ok(checkRemix(remix).decisionDepth >= 0);
  }
  const spec = specFor(moon);
  spec.slots[0]!.direction = 'N';
  assert.throws(
    () => checkRemix(remixBoard(spec)),
    /has no route.*Try changing/
  );
  spec.slots[0]!.id = 'rabbit';
  assert.throws(() => parseRemix(spec), /once each/);
});

test('Reddit Remix drafts are deduplicated and only a moderator can review once', async () => {
  const rows = new Map<string, string>();
  let moderator = false;
  const api = createApi({
    mode: 'reddit',
    store: new MemoryStore(),
    getContext: async () => ({
      userId: 't2_creator',
      username: 'creator',
      postId: 't3_crossing',
    }),
    canReviewRemix: async () => moderator,
    now: () => new Date('2026-11-24'),
    readPost: async () => undefined,
    communityStorage: {
      get: async (key) => rows.get(key),
      commit: async (key, expected, value) => {
        if (rows.get(key) !== expected) return false;
        rows.set(key, value);
        return true;
      },
    },
  });
  const post = (path: string, data: unknown) =>
    api.request(path, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'content-type': 'application/json' },
    });
  assert.equal((await api.request('/remix')).status, 200);
  assert.equal((await api.request('/remix/queue/list')).status, 403);
  const invalid = specFor(moon);
  invalid.slots[0]!.direction = 'N';
  assert.equal((await post('/remix', invalid)).status, 400);
  const drafts = await Promise.all([
    post('/remix', specFor(moon)),
    post('/remix', specFor(moon)),
  ]);
  const [first, second] = await Promise.all(
    drafts.map((response) => response.json())
  );
  assert.deepEqual(first, second);
  assert.equal(first.status, 'draft');
  const review = { id: first.id, status: 'approved', note: '' };
  assert.equal((await post('/remix/queue/review', review)).status, 403);
  moderator = true;
  assert.equal(
    (await (await api.request('/remix/queue/list')).json()).drafts.length,
    1
  );
  assert.equal(
    (await post('/remix/queue/review', { ...review, status: 'rejected' }))
      .status,
    400
  );
  const reviewed = await Promise.all([
    post('/remix/queue/review', review),
    post('/remix/queue/review', review),
  ]);
  assert.deepEqual(
    reviewed.map((response) => response.status).sort(),
    [200, 409]
  );
  const another = await (await post('/remix', specFor(willow))).json();
  const rejected = await (
    await post('/remix/queue/review', {
      id: another.id,
      status: 'rejected',
      note: 'Too close to the original.',
    })
  ).json();
  assert.equal(rejected.note, 'Too close to the original.');
  assert.equal(rejected.status, 'rejected');
});
