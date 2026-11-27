import assert from 'node:assert/strict';
import test from 'node:test';
import { findShowcaseCrossing } from '../src/server/core/posts.ts';

test('showcase prefers today, skips stale records, and falls back to the latest playable crossing', async () => {
  const now = new Date('2026-12-03T12:00:00Z');
  const registry = new Map([
    ['edition-post:v1:loo-2026-12-03', 't3_today'],
    ['edition-post:v1:loo-2026-12-02', 'malformed'],
    ['edition-post:v1:loo-2026-12-01', 't3_removed'],
    ['edition-post:v1:loo-2026-11-30', 't3_latest'],
    ['edition-post:v1:loo-2026-11-28', 't3_older'],
    ['edition-post:v1:loo-2026-12-04', 't3_future'],
  ]);
  const store = { hGet: async (key: string) => registry.get(key) };
  const visited: string[] = [];
  const isPlayable = async (id: string) => {
    visited.push(id);
    return id !== 't3_removed';
  };
  assert.deepEqual(await findShowcaseCrossing(store, now, isPlayable), {
    kind: 'today',
    url: 'https://www.reddit.com/comments/today/',
  });
  assert.deepEqual(visited, ['t3_today']);

  registry.delete('edition-post:v1:loo-2026-12-03');
  visited.length = 0;
  assert.deepEqual(await findShowcaseCrossing(store, now, isPlayable), {
    kind: 'latest',
    url: 'https://www.reddit.com/comments/latest/',
  });
  assert.deepEqual(visited, ['t3_removed', 't3_latest']);

  assert.equal(
    await findShowcaseCrossing(store, now, async () => false),
    undefined
  );
});
