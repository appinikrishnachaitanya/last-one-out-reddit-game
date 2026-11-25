import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import { EDITIONS } from '../src/server/core/schedule.ts';
import { completionKey } from '../src/server/core/completions.ts';
import { solve } from '../src/shared/engine.ts';
import { boardById } from '../src/shared/boards.ts';
import {
  defaultCompanion,
  canWear,
  parseCompanion,
} from '../src/shared/companion.ts';

test('companion unlocks use saved rescues and persist per account', async () => {
  const store = new MemoryStore();
  const api = createApi({
    store,
    mode: 'reddit',
    now: () => new Date('2026-11-24'),
    getContext: async (c) => ({ userId: c.req.header('x-account') ?? 'a' }),
    readPost: async () => undefined,
  });
  const profile = { ...defaultCompanion, animal: 'owl', accessory: 'lantern' };
  const save = () =>
    api.request('/companion', {
      method: 'POST',
      body: JSON.stringify(profile),
      headers: { 'content-type': 'application/json' },
    });
  assert.equal((await save()).status, 403);
  for (const edition of EDITIONS.slice(0, 2)) {
    const sequence = solve(
      boardById(edition.puzzleId, edition.boardVersion)
    )[0]!;
    await store.hSetNX(
      completionKey(edition),
      'a',
      JSON.stringify({
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence,
        opening: sequence[0],
        personalUndos: 0,
        favorite: 'fox',
        completedAt: '2026-11-24T00:00:00Z',
      })
    );
  }
  assert.equal((await save()).status, 200);
  const response = await (await api.request('/companion')).json();
  assert.equal(response.rescues, 2);
  assert.deepEqual(response.profile, profile);
  const other = await (
    await api.request('/companion', { headers: { 'x-account': 'b' } })
  ).json();
  assert.deepEqual(other.profile, defaultCompanion);
  assert.equal(other.rescues, 0);
  assert.equal(parseCompanion({ ...profile, animal: 'unknown' }), undefined);
  assert.equal(canWear({ ...defaultCompanion, accessory: 'leaf' }, 2), false);
});

test('decorations follow the animal and require earned rescues', () => {
  assert.equal(
    parseCompanion({ ...defaultCompanion, animal: 'owl', accessory: 'coat' }),
    undefined
  );
  const tail = { ...defaultCompanion, accessory: 'signature' as const };
  assert.equal(canWear(tail, 2), false);
  assert.equal(canWear(tail, 3), true);
  assert.equal(canWear({ ...defaultCompanion, accessory: 'frame' }, 0), false);
  assert.equal(canWear({ ...defaultCompanion, accessory: 'frame' }, 1), true);
  assert.equal(canWear({ ...defaultCompanion, accessory: 'coat' }, 4), false);
  assert.equal(canWear({ ...defaultCompanion, accessory: 'coat' }, 5), true);
});
