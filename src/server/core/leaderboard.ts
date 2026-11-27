import { isObject } from '../../shared/daily.ts';
import type { Edition } from '../../shared/daily.ts';
import { LEADERBOARD_LIMIT } from '../../shared/leaderboard.ts';
import type { Leaderboard } from '../../shared/leaderboard.ts';
import { completionKey } from './completions.ts';
import type { CompletionStore } from './completions.ts';

export async function readLeaderboard(
  store: CompletionStore,
  edition: Edition,
  viewer: { userId?: string; username?: string },
  resolveUsername?: (userId: string) => Promise<string | undefined>
): Promise<Leaderboard> {
  const saved = await store.hGetAll(completionKey(edition));
  const finishes: { userId: string; time: number }[] = [];
  for (const [userId, raw] of Object.entries(saved)) {
    try {
      // This hash only receives server-validated rescues. Ranking needs their timestamps.
      const record: unknown = JSON.parse(raw);
      if (!isObject(record) || typeof record.completedAt !== 'string') continue;
      const time = Date.parse(record.completedAt);
      if (Number.isFinite(time)) finishes.push({ userId, time });
    } catch {
      // Skip an unreadable record without losing the rest of the board.
    }
  }
  finishes.sort((a, b) => a.time - b.time || a.userId.localeCompare(b.userId));
  let place = 0;
  let yourPlace = null;
  const leaders: Promise<Leaderboard['leaders'][number]>[] = [];
  for (const [index, { userId, time }] of finishes.entries()) {
    if (finishes[index - 1]?.time !== time) place = index + 1;
    const you = viewer.userId === userId;
    if (you) yourPlace = place;
    if (index >= LEADERBOARD_LIMIT) continue;
    const username =
      you && viewer.username
        ? Promise.resolve(viewer.username)
        : resolveUsername?.(userId).catch(() => undefined);
    const rowPlace = place;
    leaders.push(
      Promise.resolve(username).then((name) => ({
        place: rowPlace,
        username: name ?? null,
        you,
      }))
    );
  }
  return {
    total: finishes.length,
    yourPlace,
    leaders: await Promise.all(leaders),
  };
}
