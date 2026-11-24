import type { Edition, DailyGoal } from '../../shared/daily.ts';
import { completionKey } from './completions.ts';
import type { CompletionStore } from './completions.ts';

export const goalTargetsKey = 'daily-goal-targets:v1';
export const goldenLeavesKey = 'daily-goal-leaves:v1';
export const defaultGoalTarget = 4;

export function validGoalTarget(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 10_000
  );
}

function previousDate(date: string): string {
  return new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
}

export function goalStreaks(days: readonly string[], today: string) {
  const earned = [...new Set(days.filter((day) => day <= today))].sort();
  let best = 0;
  let run = 0;
  let last = '';
  for (const day of earned) {
    run = previousDate(day) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  const streak = last === today || last === previousDate(today) ? run : 0;
  return { streak, best };
}

export async function readDailyGoal(
  store: CompletionStore,
  edition: Edition,
  configuredTarget?: (() => Promise<unknown>) | undefined,
  userId?: string
): Promise<DailyGoal> {
  const date = edition.date;
  let target = Number(await store.hGet(goalTargetsKey, date));
  if (!validGoalTarget(target)) {
    const configured = await configuredTarget?.();
    const setting = validGoalTarget(configured)
      ? configured
      : defaultGoalTarget;
    await store.hSetNX(goalTargetsKey, date, String(setting));
    target = Number(await store.hGet(goalTargetsKey, date));
    if (!validGoalTarget(target))
      throw new Error('Daily goal target unavailable');
  }
  const rows = await store.hGetAll(completionKey(edition));
  const contributors = Object.entries(rows)
    .flatMap(([account, record]) => {
      const row = JSON.parse(record) as { completedAt?: unknown };
      return typeof row.completedAt === 'string' &&
        row.completedAt.slice(0, 10) === date
        ? [{ account, time: row.completedAt }]
        : [];
    })
    .sort(
      (a, b) =>
        a.time.localeCompare(b.time) || a.account.localeCompare(b.account)
    );
  const count = contributors.length;
  const reached = count >= target;
  if (reached) await store.hSetNX(goldenLeavesKey, date, 'earned');
  const days = await store.hGetAll(goldenLeavesKey);
  const position = userId
    ? contributors.findIndex(({ account }) => account === userId) + 1
    : 0;
  return {
    date,
    count,
    target,
    reached,
    position,
    ...goalStreaks(Object.keys(days), date),
  };
}
