import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import { EDITIONS, bindingFor } from '../src/server/core/schedule.ts';

test('concurrent sessions share Undo and Hint limits and reconcile at refill', async () => {
  const data = new Map<string, string>();
  const hints = new Map<string, number>();
  const store = new MemoryStore();
  let now = Date.parse('2026-11-23T10:30:00Z');
  const api = new Hono().route(
    '/api',
    createApi({
      store,
      mode: 'reddit',
      now: () => new Date(now),
      getContext: async (c) => ({
        ...(c.req.header('x-account')
          ? { userId: c.req.header('x-account') }
          : {}),
        postId: 't3_example',
      }),
      readPost: async () => bindingFor(EDITIONS[0]!),
      communityStorage: {
        get: async (key) => data.get(key),
        commit: async (key, expected, next) => {
          if (data.get(key) !== expected) return false;
          data.set(key, next);
          return true;
        },
      },
      hintRefill: async (id, consume) => {
        const current = hints.get(id) ?? 0;
        const granted = consume && current <= now;
        if (granted) hints.set(id, now + 900_000);
        return { granted, refillAt: hints.get(id) ?? 0 };
      },
    })
  );
  const session = (account: string, endpoint: string, method = 'GET') =>
    api.request(`/api/${endpoint}`, {
      method,
      headers: { 'x-account': account },
    });
  const both = async (endpoint: string, count: number) =>
    Promise.all(
      Array.from({ length: count }, () =>
        session('t2_same', endpoint, 'POST').then((r) => r.json())
      )
    );
  assert.equal((await session('', 'undo', 'POST')).status, 403);
  assert.equal(
    (await both('undo', 6)).filter((state) => state.granted).length,
    2
  );
  assert.equal(
    (await both('hint', 2)).filter((state) => state.granted).length,
    1
  );
  const lifelines = await (await session('t2_same', 'lifelines')).json();
  assert.deepEqual(lifelines, {
    undo: { missing: 2, nextAt: now + 480_000, lastSync: now, granted: false },
    refillAt: now + 900_000,
  });
  assert.equal(
    (await (await session('t2_other', 'lifelines')).json()).undo.missing,
    0
  );
  now += 480_000;
  assert.equal(
    (await (await session('t2_same', 'lifelines')).json()).undo.missing,
    1
  );
  assert.equal(
    (await both('undo', 2)).filter((state) => state.granted).length,
    1
  );
  assert.equal(
    (await both('hint', 2)).filter((state) => state.granted).length,
    0
  );
  now += 420_000;
  assert.equal(
    (await both('hint', 2)).filter((state) => state.granted).length,
    1
  );
});
