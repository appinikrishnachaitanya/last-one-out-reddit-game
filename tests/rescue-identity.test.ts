import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOONROOT } from '../src/shared/boards.ts';
import { rescueRank } from '../src/shared/daily.ts';
import { solve } from '../src/shared/engine.ts';
import {
  rescueIdentity,
  verifyRecovery,
} from '../src/shared/rescue-identity.ts';

test('Bridge Keeper takes priority and identifies the verified crossing and hero', () => {
  const award = rescueIdentity(
    MOONROOT,
    ['fox', 'rabbit', 'badger', 'turtle'],
    {
      recovered: true,
      parSeconds: 3,
      elapsedSeconds: 2,
    }
  );
  assert.equal(award?.title, 'Bridge Keeper');
  assert.deepEqual(award?.hero, { animal: 'turtle', friends: 1 });
  assert.equal(award?.crossing?.holder, 'turtle');
  assert.equal(award?.crossing?.traveler, 'rabbit');
  assert.match(award?.explanation ?? '', /Rabbit cross Turtle/);
  assert.equal(
    rescueIdentity(MOONROOT, ['turtle', 'rabbit', 'fox', 'badger']),
    undefined
  );
});

test('Second-Chance requires reproducible recovery and Swift Scout requires a board par', () => {
  assert.equal(verifyRecovery(MOONROOT, { route: ['turtle'] }, 0), true);
  assert.equal(
    verifyRecovery(MOONROOT, { route: ['turtle'], blocked: 'rabbit' }, 1),
    true
  );
  assert.equal(
    verifyRecovery(MOONROOT, { route: ['turtle'], blocked: 'rabbit' }, 0),
    false
  );
  assert.equal(verifyRecovery(MOONROOT, { route: ['fox'] }, 2), false);
  assert.equal(
    verifyRecovery(MOONROOT, { route: ['fox', 'fox'], blocked: 'rabbit' }, 1),
    false
  );
  const board = { ...MOONROOT, bridges: [] };
  const route = solve(board)[0]!;
  assert.equal(
    rescueIdentity(board, route, {
      recovered: true,
      parSeconds: 30,
      elapsedSeconds: 5,
    })?.title,
    'Second-Chance Rescuer'
  );
  assert.equal(
    rescueIdentity(board, route, { elapsedSeconds: 5 })?.title,
    'Gentle Rescuer'
  );
  assert.equal(
    rescueIdentity(board, route, { parSeconds: 30, elapsedSeconds: 5 })?.title,
    'Swift Scout'
  );
  assert.equal(rescueRank(0, true), 'A');
});
