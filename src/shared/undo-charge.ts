export const UNDO_MAX = 2;
export const HINT_REFILL_MS = 15 * 60_000;
export const UNDO_REFILL_MS = 8 * 60_000;

export function undoRecharge(now: number, nextAt: number, missing: number) {
  const elapsed =
    missing > 0 && nextAt <= now
      ? Math.min(missing, Math.floor((now - nextAt) / UNDO_REFILL_MS) + 1)
      : 0;
  const remaining = missing - elapsed;
  return {
    available: UNDO_MAX - remaining,
    nextAt: remaining ? nextAt + elapsed * UNDO_REFILL_MS : 0,
  };
}

export type UndoState = {
  nextAt: number;
  missing: number;
  lastSync: number;
};

export function parseUndoState(value: unknown): UndoState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as Partial<UndoState>;
  if (
    typeof state.nextAt !== 'number' ||
    !Number.isSafeInteger(state.nextAt) ||
    state.nextAt < 0 ||
    typeof state.missing !== 'number' ||
    !Number.isInteger(state.missing) ||
    state.missing < 0 ||
    state.missing > UNDO_MAX ||
    typeof state.lastSync !== 'number' ||
    !Number.isSafeInteger(state.lastSync) ||
    state.lastSync < 0
  )
    return undefined;
  return {
    nextAt: state.nextAt,
    missing: state.missing,
    lastSync: state.lastSync,
  };
}
