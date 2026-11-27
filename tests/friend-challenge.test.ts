import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/server/app.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import { complete } from '../src/server/core/completions.ts';
import { bindingFor, EDITIONS } from '../src/server/core/schedule.ts';
import { parseFriendChallenge } from '../src/shared/friend-challenge.ts';
import type { AnimalId } from '../src/shared/engine.ts';

const first = EDITIONS[0]!;
const next = EDITIONS[1]!;
const dayOne = new Date(`${first.date}T12:00:00Z`);
const players = new Map([
  ['FernKeeper', { id: 't2_fern', name: 'FernKeeper' }],
  ['OakKeeper', { id: 't2_oak', name: 'OakKeeper' }],
  ['MossKeeper', { id: 't2_moss', name: 'MossKeeper' }],
]);
function fixture() {
  const store = new MemoryStore();
  let now = dayOne;
  const api = createApi({
    store,
    mode: 'reddit',
    now: () => now,
    getContext: async (c) => {
      const name = c.req.header('x-test-player');
      const player = name ? players.get(name) : undefined;
      return {
        userId: player?.id,
        username: player?.name,
        postId: c.req.header('x-test-post'),
      };
    },
    readPost: async (id) => bindingFor(id === 't3_next' ? next : first),
    findChallengePlayer: async (name) =>
      [...players.values()].find(
        (player) => player.name.toLowerCase() === name.toLowerCase()
      ),
  });
  const call = (
    name: string,
    path: string,
    body?: unknown,
    post = 't3_first'
  ) =>
    api.request(`/challenge${path}`, {
      headers: {
        'x-test-player': name,
        'x-test-post': post,
        'content-type': 'application/json',
      },
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const finish = async (
    name: string,
    sequence: string[],
    undos: number,
    firstMove?: AnimalId
  ) =>
    complete(
      store,
      first,
      players.get(name)!.id,
      {
        editionId: first.id,
        puzzleId: first.puzzleId,
        boardVersion: first.boardVersion,
        sequence,
        personalUndos: undos,
        favorite: 'fox',
      },
      now,
      firstMove
    );
  return {
    call,
    finish,
    advance: () => {
      now = new Date(`${next.date}T12:00:00Z`);
    },
  };
}

test('named invites are edition and account bound, hide trails until mutual completion, and reserve one rematch', async () => {
  const { call, finish, advance } = fixture();
  assert.equal(
    (await call('FernKeeper', '', { username: 'oakkeeper' })).status,
    403
  );
  await finish(
    'FernKeeper',
    ['fox', 'rabbit', 'badger', 'turtle'],
    2,
    'turtle'
  );
  assert.equal(
    (await call('FernKeeper', '', { username: 'FernKeeper' })).status,
    400
  );
  const created = await call('FernKeeper', '', { username: 'oakkeeper' });
  assert.equal(created.status, 200);
  const invite = parseFriendChallenge(await created.json())!;
  assert.equal(invite.guest, 'OakKeeper');
  assert.equal(invite.target, 2);
  assert.equal(invite.comparison, null);
  const query = `?code=${invite.code}`;
  const join = `/${invite.code}/join`;
  const rematch = `/${invite.code}/rematch`;
  assert.equal(
    (await call('OakKeeper', query, undefined, 't3_next')).status,
    404
  );
  assert.equal((await call('MossKeeper', query)).status, 403);
  assert.equal((await call('MossKeeper', join, {})).status, 403);
  const offered = parseFriendChallenge(
    await (await call('OakKeeper', query)).json()
  )!;
  assert.equal(offered.canJoin, true);
  assert.equal(offered.comparison, null);
  const joined = parseFriendChallenge(
    await (await call('OakKeeper', join, {})).json()
  )!;
  assert.equal(joined.role, 'guest');
  assert.equal(joined.comparison, null);
  assert.equal((await call('OakKeeper', rematch, {})).status, 403);
  await finish('OakKeeper', ['fox', 'badger', 'rabbit', 'turtle'], 0);
  const result = parseFriendChallenge(
    await (await call('FernKeeper', '')).json()
  )!;
  assert.deepEqual(result.comparison, {
    host: {
      undos: 2,
      hint: false,
      firstChoice: 'turtle',
      trail: ['fox', 'rabbit', 'badger', 'turtle'],
    },
    guest: {
      undos: 0,
      hint: false,
      firstChoice: 'fox',
      trail: ['fox', 'badger', 'rabbit', 'turtle'],
    },
  });
  assert.deepEqual(await (await call('OakKeeper', rematch, {})).json(), {
    day: next.number,
  });
  advance();
  assert.deepEqual(await (await call('FernKeeper', rematch, {})).json(), {
    day: next.number,
  });
  const host = parseFriendChallenge(
    await (await call('FernKeeper', '', undefined, 't3_next')).json()
  )!;
  const guest = parseFriendChallenge(
    await (await call('OakKeeper', '', undefined, 't3_next')).json()
  )!;
  assert.equal(host.code, guest.code);
  assert.equal(host.rematch, true);
  assert.equal(guest.role, 'guest');
  assert.equal(guest.comparison, null);
});

test('one open invitation is reused and simultaneous attempts can only claim it once', async () => {
  const { call, finish } = fixture();
  await finish('FernKeeper', ['fox', 'rabbit', 'turtle', 'badger'], 0);
  const invitations = await Promise.all(
    Array.from({ length: 3 }, () => call('FernKeeper', '', { username: null }))
  );
  const codes = await Promise.all(
    invitations.map(
      async (response) => parseFriendChallenge(await response.json())!.code
    )
  );
  assert.equal(new Set(codes).size, 1);
  const join = `/${codes[0]}/join`;
  const both = await Promise.all([
    call('OakKeeper', join, {}),
    call('MossKeeper', join, {}),
  ]);
  assert.deepEqual(both.map((response) => response.status).sort(), [200, 409]);
  const joined = parseFriendChallenge(
    await both.find((response) => response.ok)!.json()
  )!;
  assert.equal(joined.role, 'guest');
  assert.equal(joined.comparison, null);
});
