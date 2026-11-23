import {
  UNDO_MAX,
  UNDO_REFILL_MS,
  parseUndoState,
  undoRecharge,
} from '../../shared/undo-charge.ts';
import type { CommunityStorage } from './community-board.ts';

export async function undoState(
  storage: CommunityStorage,
  userId: string,
  now: number,
  consume: boolean
) {
  const key = `undo-refill:v1:${userId}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await storage.get(key);
    const saved = raw ? parseUndoState(JSON.parse(raw)) : undefined;
    const supply = undoRecharge(now, saved?.nextAt ?? 0, saved?.missing ?? 0);
    const state = {
      nextAt: supply.nextAt,
      missing: UNDO_MAX - supply.available,
      lastSync: now,
    };
    if (!consume || !supply.available) return { ...state, granted: false };
    const next = {
      nextAt: state.nextAt || now + UNDO_REFILL_MS,
      missing: state.missing + 1,
      lastSync: now,
    };
    if (await storage.commit(key, raw, JSON.stringify(next)))
      return { ...next, granted: true };
  }
  throw new Error('Undo changed in another session.');
}
