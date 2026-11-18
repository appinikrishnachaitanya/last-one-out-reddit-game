import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeDraft, restoreDraft } from '../src/client/draft.ts';
import { MOONROOT } from '../src/shared/boards.ts';
import { Session, trace } from '../src/shared/engine.ts';
import { EDITIONS } from '../src/server/core/schedule.ts';
const edition = EDITIONS[0]!;
test('changing play view restores the exact partial run, undo count and bridge state', () => {
  const session = new Session(MOONROOT);
  session.send('turtle');
  session.undo();
  session.send('fox');
  const restored = restoreDraft(
    edition,
    MOONROOT,
    serializeDraft(edition, session)
  )!;
  assert.deepEqual(restored.state, session.state);
  assert.equal(restored.undos, 1);
  assert.equal(trace(MOONROOT, restored.state, 'badger').legal, true);
  assert.equal(restored.undo(), true);
  assert.equal(trace(MOONROOT, restored.state, 'badger').legal, false);
});
test('invalid or different-version local drafts never corrupt the canonical daily', () => {
  const session = new Session(MOONROOT),
    data = JSON.parse(serializeDraft(edition, session));
  for (const bad of [
    'not-json',
    JSON.stringify({ ...data, boardVersion: 2 }),
    JSON.stringify({ ...data, editionId: 'wrong' }),
    JSON.stringify({ ...data, sequence: ['badger'] }),
    JSON.stringify({ ...data, undos: -1 }),
  ])
    assert.equal(restoreDraft(edition, MOONROOT, bad), null);
});
