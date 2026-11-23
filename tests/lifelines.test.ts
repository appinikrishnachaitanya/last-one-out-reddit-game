import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import { EDITIONS, bindingFor } from '../src/server/core/schedule.ts';

test('concurrent sessions share a daily Hint and reconcile at refill', async () => {
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
        postId: c.req.header('x-post') ?? 't3_example',
      }),
      readPost: async (post) =>
        bindingFor(EDITIONS[post === 't3_next' ? 1 : 0]!),
      hintRefill: async (id, consume, edition) => {
        const key = `${id}:${edition.id}`;
        const current = hints.get(key) ?? 0;
        const granted = consume && current <= now;
        if (granted) hints.set(key, now + 900_000);
        return { granted, refillAt: hints.get(key) ?? 0 };
      },
    })
  );
  const session = (
    account: string,
    endpoint: string,
    method = 'GET',
    post = 't3_example'
  ) =>
    api.request(`/api/${endpoint}`, {
      method,
      headers: { 'x-account': account, 'x-post': post },
    });
  const both = async (endpoint: string, count: number) =>
    Promise.all(
      Array.from({ length: count }, () =>
        session('t2_same', endpoint, 'POST').then((r) => r.json())
      )
    );
  assert.equal((await session('', 'hint', 'POST')).status, 403);
  assert.equal(
    (await both('hint', 2)).filter((state) => state.granted).length,
    1
  );
  assert.deepEqual(await (await session('t2_same', 'lifelines')).json(), {
    refillAt: now + 900_000,
  });
  assert.deepEqual(await (await session('t2_other', 'lifelines')).json(), {
    refillAt: 0,
  });
  assert.equal(
    (await both('hint', 2)).filter((state) => state.granted).length,
    0
  );
  assert.equal(
    (await (await session('t2_same', 'hint', 'POST', 't3_next')).json())
      .granted,
    true
  );
  now += 900_000;
  assert.equal(
    (await both('hint', 2)).filter((state) => state.granted).length,
    1
  );
});
