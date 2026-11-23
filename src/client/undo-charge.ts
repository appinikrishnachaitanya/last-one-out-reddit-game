export const UNDO_MAX = 2;
export const UNDO_REFILL_MS = 45_000;

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
