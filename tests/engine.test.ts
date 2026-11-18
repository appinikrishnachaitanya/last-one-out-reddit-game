import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOONROOT } from '../src/shared/boards.ts';
import {
  Session,
  bridgeOpen,
  initialState,
  move,
  replay,
  solve,
  trace,
  validateSolution,
} from '../src/shared/engine.ts';
test('Moonroot exhaustive solver returns exactly three orders, including the intended rescue', () => {
  const orders = solve(MOONROOT).map((s) => s.join(','));
  assert.deepEqual(
    new Set(orders),
    new Set([
      'fox,rabbit,turtle,badger',
      'fox,rabbit,badger,turtle',
      'fox,badger,rabbit,turtle',
    ])
  );
  for (const order of solve(MOONROOT))
    assert.equal(validateSolution(MOONROOT, order), true);
  assert.equal(
    replay(MOONROOT, ['fox', 'rabbit', 'turtle', 'badger']).home.length,
    4
  );
  console.log('Verified rescue orders:', orders.join('; '));
});
test('Turtle is legal but strands Rabbit at the exact bridge; Undo restores the entire crossing', () => {
  const game = new Session(MOONROOT),
    before = structuredClone(game.state);
  assert.equal(trace(MOONROOT, game.state, 'turtle').legal, true);
  game.send('turtle');
  const route = trace(MOONROOT, game.state, 'rabbit');
  assert.equal(route.legal, false);
  assert.deepEqual(route.obstacle?.at, { x: 4, y: 2 });
  assert.equal(solve(MOONROOT, game.state).length, 0);
  assert.equal(game.undo(), true);
  assert.deepEqual(game.state, before);
  assert.equal(bridgeOpen(game.state, MOONROOT.bridges[0]!), true);
  assert.equal(trace(MOONROOT, game.state, 'rabbit').legal, true);
  assert.equal(game.state.home.length, 0);
});
test('Fox blocks Badger; Rabbit leaving early closes Fox’s bridge', () => {
  assert.throws(() => move(MOONROOT, initialState(), 'badger'));
  assert.deepEqual(trace(MOONROOT, initialState(), 'badger').obstacle?.at, {
    x: 2,
    y: 4,
  });
  assert.equal(
    trace(MOONROOT, initialState(), 'badger').obstacle?.reason,
    'Fox is still on this path'
  );
  const state = move(MOONROOT, initialState(), 'rabbit');
  assert.equal(trace(MOONROOT, state, 'fox').obstacle?.kind, 'bridge');
  assert.equal(solve(MOONROOT, state).length, 0);
});
test('solid terrain stops a route before its marked exit', () => {
  const board = {
    ...MOONROOT,
    paths: MOONROOT.paths.filter((p) => p.x !== 0 || p.y !== 1),
  };
  const route = trace(board, initialState(), 'turtle');
  assert.equal(route.legal, false);
  assert.equal(route.obstacle?.kind, 'terrain');
  assert.deepEqual(route.obstacle?.at, { x: 0, y: 1 });
});
test('each reachable legal move increases rescue count exactly once; no home animal moves again', () => {
  let visited = 0;
  const visit = (state = initialState()) => {
    visited++;
    for (const animal of MOONROOT.animals) {
      if (!trace(MOONROOT, state, animal.id).legal) continue;
      const next = move(MOONROOT, state, animal.id);
      assert.equal(next.home.length, state.home.length + 1);
      assert.throws(() => move(MOONROOT, next, animal.id));
      visit(next);
    }
  };
  visit();
  assert.ok(visited > 10);
});
test('Undo each rescue and Restart return animals, bridges and count; no undo penalty', () => {
  const game = new Session(MOONROOT);
  for (const id of ['fox', 'rabbit', 'turtle', 'badger']) {
    if (id === 'fox' || id === 'rabbit' || id === 'turtle' || id === 'badger')
      game.send(id);
  }
  for (let i = 4; i > 0; i--) {
    assert.equal(game.state.home.length, i);
    assert.equal(game.undo(), true);
  }
  assert.deepEqual(game.state, initialState());
  assert.equal(game.undos, 4);
  assert.equal(game.undo(), false);
  game.send('turtle');
  game.restart();
  assert.deepEqual(game.state, initialState());
  assert.equal(game.history.length, 0);
  for (const bridge of MOONROOT.bridges)
    assert.equal(bridgeOpen(game.state, bridge), true);
});
test('reject malformed, blocked, partial and duplicate rescue sequences', () => {
  for (const input of [
    null,
    {},
    [],
    ['fox'],
    ['fox', 'rabbit', 'turtle', 'fox'],
    ['turtle', 'rabbit', 'fox', 'badger'],
    ['fox', 'rabbit', 'turtle', 'hacker'],
  ])
    assert.equal(validateSolution(MOONROOT, input), false);
});
