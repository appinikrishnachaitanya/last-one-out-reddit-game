import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import { EDITIONS, bindingFor } from '../src/server/core/schedule.ts';
import { goalStreaks } from '../src/server/core/daily-goal.ts';
import { boardById } from '../src/shared/boards.ts';
import { solve } from '../src/shared/engine.ts';

test('goal streak carries yesterday during an open UTC day and resets after a miss', () => {
  const dates = ['2026-11-30', '2026-12-01', '2026-12-05'];
  assert.deepEqual(goalStreaks(dates, '2026-12-01'), { streak: 2, best: 2 });
  assert.deepEqual(goalStreaks(dates, '2026-12-02'), { streak: 2, best: 2 });
  assert.deepEqual(goalStreaks(dates, '2026-12-03'), { streak: 0, best: 2 });
  assert.deepEqual(goalStreaks(dates, '2026-12-05'), { streak: 1, best: 2 });
});

test('UTC goal deduplicates Solo saves and awards earlier contributors retroactively', async () => {
  const editions = EDITIONS.slice(0, 2);
  let now = new Date('2026-11-18T23:59:50.000Z');
  let target = 4;
  const api = createApi({
    store: new MemoryStore(),
    mode: 'reddit',
    now: () => now,
    dailyGoalTarget: async () => target,
    getContext: async (c) => ({
      userId: c.req.header('x-account') ?? 'a',
      postId: c.req.header('x-post') ?? 't3_dayone',
    }),
    readPost: async (id) => bindingFor(editions[id === 't3_dayone' ? 0 : 1]!),
  });
  const get = async (path: string, account = 'a') =>
    (await api.request(path, { headers: { 'x-account': account } })).json();
  const save = async (account: string, day = 0) => {
    const edition = editions[day]!;
    const sequence = solve(
      boardById(edition.puzzleId, edition.boardVersion)
    )[0];
    const response = await api.request('/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-account': account,
        'x-post': day ? 't3_daytwo' : 't3_dayone',
      },
      body: JSON.stringify({
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence,
        favorite: 'fox',
        personalUndos: 0,
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.equal((await get('/daily-goal')).target, 4);
  target = 2;
  await Promise.all([save('a'), save('a')]);
  assert.equal((await get('/daily-goal')).count, 1);
  assert.equal((await get('/crossings')).cards[0].goldenLeaf, undefined);
  await Promise.all([save('b'), save('c')]);
  const reached = await save('d');
  assert.equal(reached.goal.reached, true);
  assert.equal(reached.goal.position, 4);
  assert.equal(reached.goal.streak, 1);
  assert.equal((await get('/crossings')).cards[0].goldenLeaf, true);
  now = new Date('2026-11-19T00:00:00Z');
  assert.equal((await get('/daily-goal')).target, 2);
  assert.equal((await get('/daily-goal')).count, 0);
  assert.equal((await save('late')).goal, undefined);
  assert.equal(
    (await get('/crossings', 'late')).cards[0].goldenLeaf,
    undefined
  );
  const next = await Promise.all([save('a', 1), save('b', 1)]);
  assert.ok(next.some((record) => record.goal.streak === 2));
});
