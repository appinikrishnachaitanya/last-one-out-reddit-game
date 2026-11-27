import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARDS,
  CHALLENGES,
  EXPERT_CROSSINGS,
  CONFLUENCE,
  LAST_LIGHT,
  HUSHWATER,
  LANTERN,
  MOONROOT,
  WILLOW,
} from '../src/shared/boards.ts';
import {
  initialState,
  move,
  replay,
  samePoint,
  solve,
  trace,
} from '../src/shared/engine.ts';
import {
  callbackCrossings,
  callbackStart,
  recallKeeper,
} from '../src/shared/callback.ts';
import {
  editionAt,
  editionFromPost,
  bindingFor,
  EDITIONS,
  challengeTotal,
} from '../src/server/core/schedule.ts';
test('every edition is solvable; Day 2 combines animals and bridges', () => {
  for (const board of BOARDS) assert.ok(solve(board).length > 0, board.title);
  assert.equal(
    trace(WILLOW, initialState(), 'badger').obstacle?.kind,
    'animal'
  );
  const earlyBadger = move(
    WILLOW,
    move(WILLOW, initialState(), 'fox'),
    'badger'
  );
  assert.equal(trace(WILLOW, initialState(), 'fox').legal, true);
  assert.ok(solve(WILLOW, earlyBadger).length > 0);
});
test('Day 3 has at least two safe legal openings and a tempting dead end', () => {
  const legal = LANTERN.animals.filter(
    (a) => trace(LANTERN, initialState(), a.id).legal
  );
  const safe = legal
    .filter(
      (a) => solve(LANTERN, move(LANTERN, initialState(), a.id)).length > 0
    )
    .map((a) => a.id);
  const dead = legal
    .filter(
      (a) => solve(LANTERN, move(LANTERN, initialState(), a.id)).length === 0
    )
    .map((a) => a.id);
  assert.deepEqual(safe, ['rabbit', 'badger']);
  assert.deepEqual(dead, ['fox']);
});
test('explicit UTC schedule has an empty date; old and legacy posts never rebind at midnight', () => {
  const day1 = editionAt(new Date('2026-11-18T23:59:59.999Z'))!;
  const day2 = editionAt(new Date('2026-11-19T00:00:00Z'))!;
  assert.equal(day1.number, 1);
  assert.equal(day2.number, 2);
  assert.equal(editionAt(new Date('2026-11-17T00:00:00Z')), undefined);
  assert.deepEqual(editionFromPost(bindingFor(day1)), day1);
  assert.equal(
    editionFromPost({ boardId: MOONROOT.id, boardVersion: 1 }).number,
    1
  );
  assert.throws(() =>
    editionFromPost({ ...bindingFor(day1), boardVersion: 2 })
  );
  assert.equal(new Set(EDITIONS.map((e) => e.date)).size, EDITIONS.length);
  assert.equal(new Set(EDITIONS.map((e) => e.id)).size, EDITIONS.length);
});
test('the opening run has ten immutable, distinct boards and expected solver counts', () => {
  assert.equal(EDITIONS.length, 10);
  assert.equal(BOARDS.length, 43);
  assert.deepEqual(
    BOARDS.slice(0, 10).map((b) => solve(b).length),
    [3, 4, 3, 1, 3, 1, 6, 2, 5, 3]
  );
  const layouts = BOARDS.map((b) => JSON.stringify([b.animals, b.bridges]));
  assert.equal(new Set(layouts).size, BOARDS.length);
  for (const edition of EDITIONS) {
    assert.ok(
      BOARDS.some(
        (b) => b.id === edition.puzzleId && b.version === edition.boardVersion
      )
    );
    assert.equal(
      editionAt(new Date(`${edition.date}T12:00:00Z`))?.id,
      edition.id
    );
  }
  const rotation = editionAt(new Date('2026-11-28T00:00:00Z'))!;
  assert.equal(rotation.number, 11);
  assert.ok(CHALLENGES.some((board) => board.id === rotation.puzzleId));
  assert.notEqual(rotation.id, EDITIONS[0]!.id);
  assert.deepEqual(editionFromPost(bindingFor(rotation)), rotation);
  assert.equal(editionAt(new Date('2026-12-08T00:00:00Z'))?.number, 21);
});

test('days 8–10 teach a shared bridge, a keeper crossing its own bridge, and a mid-rescue trap', () => {
  const state = initialState();
  const foxEarly = move(CONFLUENCE, state, 'fox');
  assert.equal(trace(CONFLUENCE, foxEarly, 'rabbit').obstacle?.kind, 'bridge');
  assert.equal(trace(CONFLUENCE, foxEarly, 'turtle').obstacle?.kind, 'bridge');
  const turtleReady = move(
    LAST_LIGHT,
    move(LAST_LIGHT, state, 'rabbit'),
    'fox'
  );
  assert.ok(
    trace(LAST_LIGHT, turtleReady, 'turtle').path.some(
      (p) => p.x === 3 && p.y === 3
    )
  );
  const afterFox = move(HUSHWATER, state, 'fox');
  assert.ok(solve(HUSHWATER, afterFox).length);
  assert.ok(trace(HUSHWATER, afterFox, 'turtle').legal);
  assert.equal(solve(HUSHWATER, move(HUSHWATER, afterFox, 'turtle')).length, 0);
});

test('21 challenge boards each have one solution and traps at two different points', () => {
  assert.equal(CHALLENGES.length, 21);
  for (const board of CHALLENGES) {
    const state = initialState();
    const orders = solve(board);
    assert.equal(orders.length, 1, board.title);
    assert.ok(
      board.animals.filter(({ id }) => trace(board, state, id).legal).length >=
        3,
      board.title
    );
    const next = move(board, state, orders[0]![0]!);
    assert.ok(
      board.animals.some(
        ({ id }) =>
          trace(board, next, id).legal &&
          solve(board, move(board, next, id)).length === 0
      ),
      board.title
    );
  }
});

test('expert boards have four active bridges, one solution and a trap at every decision point', () => {
  assert.equal(EXPERT_CROSSINGS.length, 12);
  const winningOrders = new Set<string>();
  for (const board of EXPERT_CROSSINGS) {
    const orders = solve(board);
    assert.equal(orders.length, 1, board.title);
    const order = orders[0]!;
    winningOrders.add(order.join(','));
    assert.equal(board.bridges.length, 4, board.title);
    for (const bridge of board.bridges)
      assert.ok(
        order.some(
          (id, i) =>
            id !== bridge.holder &&
            trace(board, replay(board, order.slice(0, i)), id).path.some(
              (point) => samePoint(point, bridge)
            )
        ),
        board.title
      );
    for (let i = 0; i < 3; i++) {
      const state = replay(board, order.slice(0, i));
      assert.ok(
        board.animals.some(
          ({ id }) =>
            id !== order[i] &&
            trace(board, state, id).legal &&
            solve(board, move(board, state, id)).length === 0
        ),
        `${board.title} at move ${i + 1}`
      );
    }
  }
  assert.equal(winningOrders.size, EXPERT_CROSSINGS.length);
});

test('UTC schedule keeps the first challenge cycle and spaces expert boards across new cycles', () => {
  const initial = editionAt(new Date('2026-11-28T00:00:00Z'))!;
  const boundary = editionAt(new Date('2026-12-18T23:59:59Z'))!;
  assert.equal(
    BOARDS.find((b) => b.id === initial.puzzleId)?.title,
    'Fernfall Narrows'
  );
  assert.equal(
    BOARDS.find((b) => b.id === boundary.puzzleId)?.title,
    'Juniper Locks'
  );
  const start = Date.parse('2026-12-19T00:00:00Z');
  const schedule = Array.from({ length: challengeTotal * 4 }, (_, day) =>
    editionAt(new Date(start + day * 86400000))!
  );
  for (let index = 0; index < schedule.length; index += challengeTotal) {
    const cycle = schedule.slice(index, index + challengeTotal);
    assert.equal(new Set(cycle.map((edition) => edition.puzzleId)).size, 33);
    const harder = cycle
      .map((edition, slot) =>
        edition.puzzleId.startsWith('expert-') ? slot : -1
      )
      .filter((slot) => slot >= 0);
    assert.equal(harder.length, 12);
    assert.equal(harder[0], 0);
    for (const [i, slot] of harder.entries()) {
      const next = harder[i + 1] ?? challengeTotal;
      assert.ok(next - slot >= 2 && next - slot <= 3);
    }
  }
  for (const [index, edition] of schedule.entries())
    assert.notEqual(
      edition.puzzleId,
      (schedule[index - 1] ?? boundary).puzzleId
    );
  assert.notDeepEqual(
    schedule.slice(0, challengeTotal).map((e) => e.puzzleId),
    schedule.slice(challengeTotal, challengeTotal * 2).map((e) => e.puzzleId)
  );
  for (const edition of schedule)
    assert.deepEqual(editionFromPost(bindingFor(edition)), edition);
});

test('animal starts are collision-free and the Rabbit showcase cannot rebind a daily', () => {
  for (const board of [
    ...BOARDS,
    ...callbackCrossings.map(({ board }) => board),
  ]) {
    assert.equal(
      new Set(board.animals.map(({ x, y }) => `${x},${y}`)).size,
      4,
      board.title
    );
    assert.ok(
      board.bridges.every((bridge) =>
        board.animals.every((animal) => !samePoint(animal, bridge))
      ),
      board.title
    );
  }
  const moonroot = callbackCrossings[0]!;
  const stranded = callbackStart(moonroot);
  assert.deepEqual(recallKeeper(moonroot.board, stranded, 'turtle')?.home, [
    'fox',
    'badger',
  ]);
  assert.deepEqual(stranded.home, ['turtle', 'fox', 'badger']);
  assert.deepEqual(initialState().home, []);
  const firefly = EDITIONS[6]!;
  const showcase = callbackCrossings[1]!;
  assert.throws(() =>
    editionFromPost({ ...bindingFor(firefly), puzzleId: showcase.board.id })
  );
  assert.deepEqual(editionFromPost(bindingFor(firefly)), firefly);
});
