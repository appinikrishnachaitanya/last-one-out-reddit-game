import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARDS,
  CHALLENGES,
  CONFLUENCE,
  LAST_LIGHT,
  HUSHWATER,
  LANTERN,
  MOONROOT,
  WILLOW,
} from '../src/shared/boards.ts';
import { initialState, move, solve, trace } from '../src/shared/engine.ts';
import {
  editionAt,
  editionFromPost,
  bindingFor,
  EDITIONS,
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
  assert.equal(BOARDS.length, 31);
  assert.deepEqual(
    BOARDS.slice(0, 10).map((b) => solve(b).length),
    [3, 4, 3, 1, 3, 1, 6, 2, 5, 3]
  );
  const layouts = BOARDS.map((b) => JSON.stringify([b.animals, b.bridges]));
  assert.equal(new Set(layouts).size, 31);
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

test('UTC daily rotation shuffles complete 21-board cycles without a boundary repeat', () => {
  const start = Date.parse('2026-11-28T00:00:00Z');
  const schedule = Array.from({ length: 84 }, (_, day) =>
    editionAt(new Date(start + day * 86400000))!
  );
  for (let index = 0; index < schedule.length; index += 21) {
    const cycle = schedule.slice(index, index + 21);
    assert.equal(new Set(cycle.map((edition) => edition.puzzleId)).size, 21);
    if (index)
      assert.notEqual(schedule[index - 1]!.puzzleId, cycle[0]!.puzzleId);
  }
  assert.notDeepEqual(
    schedule.slice(0, 21).map((e) => e.puzzleId),
    schedule.slice(21, 42).map((e) => e.puzzleId)
  );
  for (const edition of schedule)
    assert.deepEqual(editionFromPost(bindingFor(edition)), edition);
});
