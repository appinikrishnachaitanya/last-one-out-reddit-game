import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARDS,
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
  assert.equal(editionAt(new Date('2030-01-01T00:00:00Z')), undefined);
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
  assert.equal(BOARDS.length, 10);
  assert.deepEqual(
    BOARDS.map((b) => solve(b).length),
    [3, 4, 3, 1, 3, 1, 6, 2, 5, 3]
  );
  const layouts = BOARDS.map((b) => JSON.stringify([b.animals, b.bridges]));
  assert.equal(new Set(layouts).size, 10);
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
  assert.equal(editionAt(new Date('2026-11-28T00:00:00Z')), undefined);
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
