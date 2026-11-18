import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import {
  complete,
  community,
  loadCompletion,
  completionKey,
} from '../src/server/core/completions.ts';
import { createOrRetrievePost, recoverPost } from '../src/server/core/posts.ts';
import { EDITIONS, bindingFor } from '../src/server/core/schedule.ts';
import { boardById } from '../src/shared/boards.ts';
import { solve } from '../src/shared/engine.ts';
const day1 = EDITIONS[0]!,
  day3 = EDITIONS[2]!;
const payload = (
  edition = day1,
  sequence = solve(boardById(edition.puzzleId, edition.boardVersion))[0]!
) => ({
  editionId: edition.id,
  puzzleId: edition.puzzleId,
  boardVersion: edition.boardVersion,
  sequence,
  personalUndos: 2,
  favorite: 'fox',
});
const now = new Date('2026-11-18T23:59:59Z');
test('concurrent valid submissions record one completion; a different successful opening cannot replace it', async () => {
  const store = new MemoryStore(),
    orders = solve(boardById(day3.puzzleId, day3.boardVersion));
  const rabbit = orders.find((s) => s[0] === 'rabbit')!,
    badger = orders.find((s) => s[0] === 'badger')!;
  const requests = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      complete(
        store,
        day3,
        't2_same',
        payload(day3, i % 2 ? rabbit : badger),
        now
      )
    )
  );
  assert.equal(requests.filter((r) => r.firstCompletion).length, 1);
  const saved = (await loadCompletion(store, day3, 't2_same'))!;
  assert.equal(saved.opening, 'badger');
  const retried = await complete(
    store,
    day3,
    't2_same',
    payload(day3, rabbit),
    now
  );
  assert.equal(retried.completion.opening, 'badger');
  assert.equal(retried.community.total, 1);
  await complete(store, day3, 't2_other', payload(day3, rabbit), now);
  assert.deepEqual(await community(store, day3), {
    total: 2,
    openings: { badger: 1, rabbit: 1 },
  });
  assert.equal((await community(store, day1)).total, 0);
});
test('illegal, malformed, partial, wrong edition/version and anonymous submissions never write', async () => {
  const store = new MemoryStore(),
    good = payload();
  for (const bad of [
    null,
    {},
    'bad',
    { ...good, sequence: ['turtle', 'rabbit', 'fox', 'badger'] },
    { ...good, sequence: ['fox'] },
    { ...good, sequence: ['fox', 'rabbit', 'turtle', 'turtle'] },
    { ...good, sequence: [1, 2, 3, 4] },
    { ...good, boardVersion: 99 },
    { ...good, puzzleId: day3.puzzleId },
    { ...good, editionId: day3.id },
    { ...good, personalUndos: -1 },
  ])
    await assert.rejects(complete(store, day1, 't2_a', bad, now));
  await assert.rejects(complete(store, day1, '', good, now));
  assert.equal(store.hashes.size, 0);
});
function fixture(
  options: { telemetry?: () => Promise<void>; store?: MemoryStore } = {}
) {
  const store = options.store ?? new MemoryStore();
  let clock = now,
    postEdition = day1,
    postId: string | undefined = 't3_original';
  const app = new Hono().route(
    '/api',
    createApi({
      store,
      mode: 'reddit',
      now: () => clock,
      getContext: async (c) => ({
        userId: c.req.header('x-test-user'),
        postId,
      }),
      readPost: async () => bindingFor(postEdition),
      endJourney: options.telemetry,
    })
  );
  return {
    app,
    store,
    setClock: (d: Date) => {
      clock = d;
    },
    setEdition: (e: typeof day1) => {
      postEdition = e;
    },
    noPost: () => {
      postId = undefined;
    },
  };
}
const request = (
  app: Hono,
  path: string,
  body?: unknown,
  user = 't2_a',
  journey?: string
) =>
  app.request(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(user ? { 'x-test-user': user } : {}),
      ...(journey ? { 'x-devvit-journey-id': journey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
test('API hides aggregates before solve, binds to the post, and restores the saved result after midnight without writing', async () => {
  const f = fixture();
  const before = await (await request(f.app, 'init')).json();
  assert.equal(before.community, null);
  assert.equal(before.completion, null);
  assert.equal(
    (await request(f.app, 'complete', { ...payload(), boardVersion: 2 }))
      .status,
    400
  );
  const saved = await (
    await request(f.app, 'complete', { ...payload(), userId: 'spoofed' })
  ).json();
  assert.equal(saved.validated, true);
  assert.equal(await f.store.hGet(completionKey(day1), 'spoofed'), undefined);
  f.setClock(new Date('2026-11-19T00:00:01Z'));
  const reopened = await (await request(f.app, 'init')).json();
  assert.equal(reopened.edition.id, day1.id);
  assert.equal(reopened.completion.personalUndos, 2);
  assert.equal(reopened.community.total, 1);
  assert.equal(
    reopened.commentsUrl,
    'https://www.reddit.com/comments/original/'
  );
  const once = JSON.stringify([...f.store.hashes]);
  await request(f.app, 'init');
  assert.equal(JSON.stringify([...f.store.hashes]), once);
  f.noPost();
  f.setClock(new Date('2030-01-01'));
  const empty = await (await request(f.app, 'init')).json();
  assert.equal(empty.status, 'empty');
  assert.match(empty.message, /No puzzle/);
});
test('card art is independently saved; original opening stays immutable; anonymous completion rejected', async () => {
  const f = fixture();
  assert.equal(
    (await request(f.app, 'favorite', { favorite: 'rabbit' })).status,
    403
  );
  assert.equal((await request(f.app, 'complete', payload(), '')).status, 401);
  await request(f.app, 'complete', payload());
  const opening = (await loadCompletion(f.store, day1, 't2_a'))!.opening;
  assert.equal(
    (await request(f.app, 'favorite', { favorite: 'rabbit' })).status,
    200
  );
  const reopened = await (await request(f.app, 'init')).json();
  assert.equal(reopened.completion.favorite, 'rabbit');
  assert.equal(reopened.completion.opening, opening);
  assert.equal((await request(f.app, 'previews')).status, 404);
});
test('telemetry failure cannot lose a valid save, and duplicates do not emit another completion', async () => {
  let events = 0;
  const f = fixture({
    telemetry: async () => {
      events++;
      throw new Error('Not allowlisted');
    },
  });
  const first = await (
    await request(f.app, 'complete', payload(), 't2_a', 'journey-test')
  ).json();
  assert.equal(first.validated, true);
  assert.equal(first.telemetry, 'unavailable');
  const retry = await (
    await request(f.app, 'complete', payload(), 't2_a', 'journey-test')
  ).json();
  assert.equal(retry.community.total, 1);
  assert.equal(events, 1);
});
test('a response lost after the atomic write is recoverable on retry, with no inflated totals', async () => {
  const store = new MemoryStore();
  const original = store.hGetAll.bind(store);
  let fail = true;
  store.hGetAll = async (key) => {
    if (fail) {
      fail = false;
      throw new Error('temporary response failure');
    }
    return original(key);
  };
  await assert.rejects(complete(store, day1, 't2_a', payload(), now));
  const retry = await complete(store, day1, 't2_a', payload(), now);
  assert.equal(retry.firstCompletion, false);
  assert.equal(retry.community.total, 1);
});
test('post creation is at-most-once across concurrent attempts; uncertain publication has a recoverable reservation', async () => {
  const store = new MemoryStore();
  let submits = 0;
  const submit = async () => {
    submits++;
    return 't3_existing';
  };
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => createOrRetrievePost(store, day1, submit))
  );
  assert.equal(submits, 1);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  assert.equal(await createOrRetrievePost(store, day1, submit), 't3_existing');
  const other = new MemoryStore();
  await assert.rejects(
    createOrRetrievePost(other, day1, async () => {
      throw new Error('ambiguous timeout');
    }),
    /could not be confirmed/
  );
  await assert.rejects(createOrRetrievePost(other, day1, submit), /recovery/);
  assert.equal(submits, 1);
  assert.equal(await recoverPost(other, day1, 't3_recovered'), 't3_recovered');
  assert.equal(await createOrRetrievePost(other, day1, submit), 't3_recovered');
});
