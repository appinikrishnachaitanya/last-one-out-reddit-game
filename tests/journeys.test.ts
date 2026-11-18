import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyFlow } from '../src/client/journeys.ts';
test('ready, first commitment, monotonic rescue milestones; completion stays server-only', async () => {
  const calls: string[] = [];
  const client = {
    appReady: async () => {
      calls.push('ready');
    },
    startJourney: async () => {
      calls.push('start');
    },
    progress: async ({ progress }: { progress: number }) => {
      calls.push(`progress:${progress}`);
    },
    endJourney: async () => {
      calls.push('abandon');
    },
    getActiveJourneyId: () => 'journey-1',
    clearJourneyId: () => {
      calls.push('clear');
    },
  };
  const flow = new JourneyFlow(client, true);
  flow.ready();
  flow.commit();
  flow.commit();
  flow.rescue(1);
  flow.rescue(2);
  flow.rescue(1);
  flow.rescue(3);
  flow.rescue(4);
  assert.equal(await flow.correlation(), 'journey-1');
  flow.validated();
  assert.deepEqual(calls, [
    'ready',
    'start',
    'progress:0.25',
    'progress:0.5',
    'progress:0.75',
    'clear',
  ]);
});
test('telemetry errors are isolated, and local previews never call Reddit analytics', async () => {
  let calls = 0;
  const client = {
    appReady: async () => {
      calls++;
      throw new Error('offline');
    },
    startJourney: async () => {
      calls++;
      throw new Error('offline');
    },
    progress: async () => {
      throw new Error('offline');
    },
    endJourney: async () => {},
    getActiveJourneyId: () => undefined,
    clearJourneyId: () => {},
  };
  const flow = new JourneyFlow(client, true);
  flow.ready();
  flow.commit();
  flow.rescue(1);
  assert.equal(await flow.correlation(), undefined);
  assert.equal(calls, 2);
  const preview = new JourneyFlow(client, false);
  preview.ready();
  preview.commit();
  await preview.correlation();
  assert.equal(calls, 2);
});
