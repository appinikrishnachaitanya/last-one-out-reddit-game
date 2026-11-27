import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import type { Dependencies } from '../src/server/app.ts';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import {
  complete,
  community,
  loadCompletion,
  completionKey,
} from '../src/server/core/completions.ts';
import {
  createOrRetrievePost,
  postRegistryKey,
  recoverPost,
} from '../src/server/core/posts.ts';
import {
  EDITIONS,
  bindingFor,
  editionAt,
} from '../src/server/core/schedule.ts';
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
  options: Pick<
    Dependencies,
    'share' | 'setFlair' | 'hintRefill' | 'readCommentHint' | 'resolveUsername'
  > & {
    telemetry?: () => Promise<void>;
    store?: MemoryStore;
  } = {}
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
      share: options.share,
      setFlair: options.setFlair,
      hintRefill: options.hintRefill,
      readCommentHint: options.readCommentHint,
      resolveUsername: options.resolveUsername,
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
test('leaderboard ranks assists instead of time, shares tied places, and ranks players beyond the top ten', async () => {
  const lookedUp: string[] = [];
  const f = fixture({
    resolveUsername: async (id) => {
      lookedUp.push(id);
      if (id === 't2_01') throw new Error('Account lookup unavailable');
      return `keeper${id.slice(3)}`;
    },
  });
  for (let i = 11; i >= 0; i--)
    await complete(
      f.store,
      day1,
      `t2_${String(i).padStart(2, '0')}`,
      {
        ...payload(),
        personalUndos: i,
        hintUsed: i === 0,
        elapsedSeconds: 12 - i,
      },
      new Date(now.getTime() + (11 - i) * 1000)
    );
  const response = await request(f.app, 'leaderboard', undefined, 't2_11');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const board = await response.json();
  assert.equal(board.total, 12);
  assert.equal(board.yourPlace, 12);
  assert.equal(board.yourAssists, 11);
  assert.equal(board.leaders.length, 10);
  assert.deepEqual(board.leaders.slice(0, 3), [
    { place: 1, username: 'keeper00', you: false, assists: 1 },
    { place: 1, username: null, you: false, assists: 1 },
    { place: 3, username: 'keeper02', you: false, assists: 2 },
  ]);
  assert.equal(lookedUp.length, 10);
  const replay = await request(f.app, 'complete', payload(), 't2_11');
  assert.equal((await replay.json()).firstCompletion, false);
  assert.deepEqual(
    await (await request(f.app, 'leaderboard', undefined, 't2_11')).json(),
    board
  );
  f.setEdition(day3);
  assert.deepEqual(await (await request(f.app, 'leaderboard')).json(), {
    total: 0,
    yourPlace: null,
    yourAssists: null,
    leaders: [],
  });
  f.noPost();
  assert.equal((await request(f.app, 'leaderboard')).status, 404);
});

test('API hides aggregates before solve, binds to the post, and restores the saved result after midnight without writing', async () => {
  const f = fixture();
  assert.equal((await request(f.app, 'comparison')).status, 403);
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
  assert.equal(
    (await (await request(f.app, 'comparison')).json()).totalSolves,
    1
  );
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
  f.setClock(new Date('2026-11-17'));
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

test('crossing archive only lists registered past posts, marks personal completions and uses the UTC schedule', async () => {
  const { app, store, setClock } = fixture();
  const day2 = EDITIONS[1]!;
  await recoverPost(store, day1, 't3_moonroot');
  await recoverPost(store, day3, 't3_later');
  const won = await complete(
    store,
    day1,
    't2_player',
    { ...payload(), elapsedSeconds: 42 },
    now
  );
  assert.equal(won.completion.elapsedSeconds, 42);
  await assert.rejects(
    complete(
      store,
      day1,
      't2_player',
      { ...payload(), elapsedSeconds: -1 },
      now
    )
  );
  setClock(new Date(`${day2.date}T00:00:01Z`));
  const response = await request(app, 'crossings', undefined, 't2_player');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const crossings = await response.json();
  assert.deepEqual(crossings.cards, [
    {
      day: 1,
      title: 'Moonroot Crossing',
      favorite: 'fox',
      puzzleId: day1.puzzleId,
      earnedAt: now.toISOString(),
    },
  ]);
  assert.deepEqual(
    (await (await request(app, 'crossings', undefined, 't2_other')).json())
      .cards,
    []
  );
  assert.equal(crossings.nextAt, Date.parse(`${day3.date}T00:00:00Z`));
  assert.deepEqual(crossings.past, [
    {
      day: 1,
      title: 'Moonroot Crossing',
      url: 'https://www.reddit.com/comments/moonroot/',
      completed: true,
    },
  ]);
  setClock(new Date('2027-01-01T00:00:00Z'));
  assert.equal(
    (await (await request(app, 'crossings')).json()).nextAt,
    Date.parse('2027-01-02T00:00:00Z')
  );
});

test('shares only saved rescues, posts once per account and edition, and persists the delivery state', async () => {
  const messages: string[] = [];
  const f = fixture({
    share: async (postId, text) => {
      assert.equal(postId, 't3_original');
      messages.push(text);
      return 't1_shared';
    },
  });
  assert.equal((await request(f.app, 'share', {})).status, 403);
  assert.equal((await request(f.app, 'share', {}, '')).status, 403);
  await request(f.app, 'complete', {
    ...payload(),
    personalUndos: 0,
    elapsedSeconds: 65,
  });
  assert.equal(messages.length, 0);
  await Promise.all(
    Array.from({ length: 12 }, () =>
      request(f.app, 'share', { favorite: 'turtle' })
    )
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /^>!Last One Out - 2026-11-18 · Rank S!<!?$/m);
  assert.match(messages[0]!, /Rescued: 4\/4 \| Undos: 0 \| First move: Fox/);
  assert.match(messages[0]!, /Can Reddit rescue today's Community Crossing/);
  assert.doesNotMatch(messages[0]!, /Turtle|Rabbit|Badger|% club/);
  assert.equal(
    (await (await request(f.app, 'init')).json()).shareStatus,
    't1_shared'
  );
});

test('failed comment delivery is not retried blindly; flair failure leaves a saved result intact', async () => {
  let shareCalls = 0,
    flairCalls = 0;
  const f = fixture({
    share: async () => {
      shareCalls++;
      throw new Error('ambiguous delivery');
    },
    setFlair: async () => {
      flairCalls++;
      throw new Error('flair not granted');
    },
  });
  await request(f.app, 'complete', payload());
  assert.equal(flairCalls, 0);
  assert.equal((await request(f.app, 'share', {})).status, 503);
  assert.equal((await request(f.app, 'share', {})).status, 409);
  assert.equal(shareCalls, 1);
  assert.equal((await request(f.app, 'flair', {})).status, 503);
  assert.equal(flairCalls, 1);
  const reopened = await (await request(f.app, 'init')).json();
  assert.equal(reopened.shareStatus, 'pending');
  assert.equal(reopened.community.total, 1);
});

test('reported opening traps require a legal stranding move and are counted once among validated finishers', async () => {
  const f = fixture();
  await request(f.app, 'complete', { ...payload(), openingTrap: 'turtle' });
  await request(f.app, 'complete', { ...payload(), openingTrap: 'rabbit' });
  await request(
    f.app,
    'complete',
    { ...payload(), openingTrap: 'badger' },
    't2_b'
  );
  await request(
    f.app,
    'complete',
    { ...payload(), openingTrap: 'turtle', personalUndos: 0 },
    't2_c'
  );
  assert.deepEqual(await community(f.store, day1), {
    total: 3,
    openings: { fox: 3 },
    traps: { turtle: 1 },
  });
});

test('a rotated edition keeps its earned card after it ages out of the recent archive', async () => {
  const edition = editionAt(new Date('2026-11-28T00:00:00Z'))!;
  const f = fixture();
  f.setEdition(edition);
  f.setClock(new Date('2026-11-28T10:00:00Z'));
  assert.equal(
    (await request(f.app, 'complete', payload(edition))).status,
    200
  );
  f.setClock(new Date('2027-02-01T00:00:00Z'));
  const archive = await (await request(f.app, 'crossings')).json();
  assert.deepEqual(archive.cards, [
    {
      day: 11,
      title: boardById(edition.puzzleId, edition.boardVersion).title,
      favorite: 'fox',
      puzzleId: edition.puzzleId,
      earnedAt: '2026-11-28T10:00:00.000Z',
    },
  ]);
  assert.equal(
    (await (await request(f.app, 'init')).json()).edition.id,
    edition.id
  );
});

test('hint state uses the authenticated account and can be read in another post', async () => {
  let refillAt = 0;
  const f = fixture({
    hintRefill: async (id, consume) => {
      assert.equal(id, 't2_a');
      const granted = consume && refillAt === 0;
      if (granted) refillAt = now.getTime() + 60_000;
      return { refillAt, granted };
    },
  });
  assert.equal((await request(f.app, 'hint', {}, '')).status, 403);
  assert.equal(
    (await (await request(f.app, 'hint', { userId: 't2_spoof' })).json())
      .granted,
    true
  );
  f.setEdition(day3);
  assert.equal(
    (await (await request(f.app, 'init')).json()).refillAt,
    refillAt
  );
  assert.equal(
    (await (await request(f.app, 'hint', {})).json()).granted,
    false
  );
});

test('pre-play participation and the granted hint use the preceding daily post', async () => {
  const day2 = EDITIONS[1]!;
  const hint = {
    text: 'Check who still needs a bridge.',
    url: 'https://www.reddit.com/r/example/comments/moonroot/day_one/testhint/',
  };
  const f = fixture({
    hintRefill: async (_, consume) => ({ refillAt: 1, granted: consume }),
    readCommentHint: async (postId) => {
      assert.equal(postId, 't3_moonroot');
      return hint;
    },
  });
  await complete(
    f.store,
    day1,
    't2_yesterday',
    { ...payload(), openingTrap: 'turtle' },
    now
  );
  await f.store.hSet(postRegistryKey(day1), { post: 't3_moonroot' });
  f.setEdition(day2);
  f.setClock(new Date('2026-12-15T10:00:00Z'));
  const init = await (await request(f.app, 'init')).json();
  assert.equal(init.community, null);
  assert.deepEqual(init.previousRescues, {
    yesterday: true,
    totalSolves: 1,
    perfectRuns: 0,
    stranded: {},
  });
  assert.deepEqual(
    (await (await request(f.app, 'hint', {})).json()).hint,
    hint
  );
});
