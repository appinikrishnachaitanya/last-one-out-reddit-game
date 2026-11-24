import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS } from '../src/server/core/schedule.ts';
import { MemoryStore } from '../src/server/core/memory-store.ts';
import {
  attemptsKey,
  readAttemptStats,
  readFirstMove,
  recordAttempt,
} from '../src/server/core/attempts.ts';
import { complete } from '../src/server/core/completions.ts';
import {
  communityReplayKey,
  readCommunityReplay,
  readCommunity,
  submitCommunity,
  submitCommunityVote,
} from '../src/server/core/community-board.ts';
import type { CommunityStorage } from '../src/server/core/community-board.ts';
import { rescueShare } from '../src/shared/daily.ts';

const edition = EDITIONS[0]!;
const attemptId = 'c9b43b00-88ec-4d26-ad6b-6ab77aa02361';
const sequence = ['fox', 'rabbit', 'turtle', 'badger'];

test('anonymous attempts preserve first events, count unique players, and report live percentages only after ten players', async () => {
  const store = new MemoryStore();
  const start = { attemptId, event: 'firstMove', animal: 'turtle', before: [] };
  await Promise.all([
    recordAttempt(store, edition, 't2_one', start),
    recordAttempt(store, edition, 't2_one', start),
  ]);
  await recordAttempt(store, edition, 't2_one', {
    ...start,
    event: 'firstMistake',
  });
  await assert.rejects(
    recordAttempt(store, edition, 't2_one', {
      ...start,
      event: 'firstMistake',
      animal: 'fox',
    })
  );
  assert.equal(
    await readFirstMove(store, edition, 't2_one', attemptId),
    'turtle'
  );
  const save = {
    editionId: edition.id,
    puzzleId: edition.puzzleId,
    boardVersion: 1,
    sequence,
    favorite: 'fox',
    personalUndos: 1,
  };
  await complete(store, edition, 't2_one', save, new Date(), 'turtle');
  await complete(store, edition, 't2_one', save, new Date());
  let stats = await readAttemptStats(store, edition);
  assert.deepEqual(stats, {
    players: 1,
    totalSolves: 1,
    perfectRuns: 0,
    firstMoves: { turtle: 1 },
    firstMistakes: { turtle: 1 },
    stranded: { rabbit: 1 },
  });
  assert.doesNotMatch(rescueShare(edition, 1, 'turtle', stats), /% club/);
  for (let n = 2; n <= 10; n++)
    await recordAttempt(store, edition, `t2_${n}`, { ...start, animal: 'fox' });
  stats = await readAttemptStats(store, edition);
  assert.match(
    rescueShare(edition, 1, 'turtle', stats),
    /First move: Turtle \(10% club\)/
  );
  assert.ok(
    Object.keys(await store.hGetAll(attemptsKey(edition))).every(
      (key) => !key.includes('t2_')
    )
  );
});

test('community crossing handles failed moves, repeat turns, concurrent commits and resets after a rescue', async () => {
  const data = new Map<string, string>();
  const storage: CommunityStorage = {
    get: async (key) => data.get(key),
    commit: async (key, expected, value, archive) => {
      if (data.get(key) !== expected) return false;
      data.set(key, value);
      if (archive) data.set(archive.key, archive.value);
      return true;
    },
  };
  const post = 't3_example';
  const turn = (id: string, animal: string, moveNumber: number) =>
    submitCommunity(
      storage,
      post,
      edition,
      { id, username: id },
      { animal, moveNumber }
    );
  assert.equal((await readCommunity(storage, post, edition)).canMove, false);
  const failed = await turn('playerA', 'turtle', 0);
  assert.deepEqual(failed.home, []);
  assert.equal(failed.attempts, 1);
  assert.equal(failed.log[0]?.stranded, 'rabbit');
  await assert.rejects(turn('playerA', 'fox', 1), /taken your turn/);
  const racing = await Promise.allSettled([
    turn('playerB', 'fox', 1),
    turn('playerC', 'fox', 1),
  ]);
  assert.equal(racing.filter((row) => row.status === 'fulfilled').length, 1);
  const current = await readCommunity(storage, post, edition);
  assert.deepEqual(current.home, ['fox']);
  const winner = current.contributors[0]!;
  await turn('playerD', 'rabbit', 2);
  await assert.rejects(turn(winner, 'turtle', 3), /taken your turn/);
  await turn('playerE', 'turtle', 3);
  const rescued = await turn('playerF', 'badger', 4);
  assert.equal(rescued.successfulRescues, 1);
  assert.equal(rescued.attempts, 2);
  assert.deepEqual(rescued.home, []);
  assert.deepEqual(rescued.lastRescue, [
    winner,
    'playerD',
    'playerE',
    'playerF',
  ]);
  assert.equal(rescued.replayAvailable, true);
  const key = communityReplayKey(post, edition, 5);
  const raw = data.get(key)!;
  const stored = JSON.parse(raw);
  assert.equal(stored.boardVersion, edition.boardVersion);
  assert.deepEqual(
    stored.moves.map(({ userId }: { userId: string }) => userId),
    [winner, 'playerD', 'playerE', 'playerF']
  );
  assert.ok(
    stored.moves.every(({ timestamp }: { timestamp: string }) =>
      Number.isFinite(Date.parse(timestamp))
    )
  );
  for (let revision = 5; revision < 17; revision++) {
    await turn(`later${revision}`, 'turtle', revision);
  }
  const replay = await readCommunityReplay(storage, post, edition);
  assert.deepEqual(
    replay?.moves.map(({ animal }) => animal),
    sequence
  );
  assert.equal(data.get(key), raw);
  assert.ok(replay?.moves.every((move) => !('userId' in move)));
  data.set(key, 'invalid json');
  await assert.rejects(readCommunityReplay(storage, post, edition));
  assert.equal((await readCommunity(storage, post, edition)).moveNumber, 17);
  assert.equal(
    (await readCommunity(storage, 't3_other', edition)).moveNumber,
    0
  );
});

test('advisory votes replace atomically, reject blocked and stale choices, and clear after a move', async () => {
  const data = new Map<string, string>();
  const storage: CommunityStorage = {
    get: async (key) => data.get(key),
    commit: async (key, expected, value) => {
      if (data.get(key) !== expected) return false;
      data.set(key, value);
      return true;
    },
  };
  const post = 't3_vote';
  let time = 10_000;
  const vote = (
    account: string,
    animal: string,
    moveNumber = 0,
    attempts = 0
  ) =>
    submitCommunityVote(
      storage,
      post,
      edition,
      account,
      { animal, moveNumber, attempts },
      new Date(time)
    );
  await assert.rejects(vote('', 'fox'), { status: 403 });
  await assert.rejects(
    vote('spectator', 'badger'),
    /Fox is still on this path/
  );
  const [first, second] = await Promise.all([
    vote('spectator', 'fox'),
    vote('another', 'fox'),
  ]);
  assert.equal(first.changed && second.changed, true);
  assert.equal((await vote('spectator', 'fox')).changed, false);
  await assert.rejects(vote('spectator', 'turtle'), { status: 429 });
  time += 1_000;
  const updated = await vote('spectator', 'turtle');
  assert.deepEqual(updated.state.votes?.tally, { turtle: 1, fox: 1 });
  assert.equal(updated.state.votes?.own, 'turtle');
  assert.equal(
    (await readCommunity(storage, post, edition, 'visitor')).votes?.own,
    undefined
  );
  await vote('third', 'fox');
  const moved = await submitCommunity(
    storage,
    post,
    edition,
    { id: 'player', username: 'Player' },
    { animal: 'turtle', moveNumber: 0 }
  );
  assert.equal(moved.voteOutcome, 'different');
  assert.deepEqual(moved.votes?.tally, {});
  await assert.rejects(vote('spectator', 'fox'), { status: 409 });
  await vote('spectator', 'fox', 1, 1);
  const agreed = await submitCommunity(
    storage,
    post,
    edition,
    { id: 'next', username: 'Next' },
    { animal: 'fox', moveNumber: 1 }
  );
  assert.equal(agreed.voteOutcome, 'chosen');
  assert.deepEqual(agreed.votes?.tally, {});
});
