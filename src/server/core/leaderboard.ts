import { isObject, rescueAssists } from '../../shared/daily.ts';
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
  const finishes: { userId: string; assists: number }[] = [];
  for (const [userId, raw] of Object.entries(saved)) {
    try {
      // These are the immutable first finishes. Use their saved assists.
      const record: unknown = JSON.parse(raw);
      if (
        !isObject(record) ||
        typeof record.personalUndos !== 'number' ||
        !Number.isSafeInteger(record.personalUndos) ||
        record.personalUndos < 0 ||
        record.personalUndos > 1_000_000
      )
        continue;
      finishes.push({
        userId,
        assists: rescueAssists(record.personalUndos, record.hintUsed === true),
      });
    } catch {
      // Skip an unreadable record without losing the rest of the board.
    }
  }
  finishes.sort(
    (a, b) => a.assists - b.assists || a.userId.localeCompare(b.userId)
  );
  let place = 0;
  let yourPlace = null;
  let yourAssists = null;
  const leaders: Promise<Leaderboard['leaders'][number]>[] = [];
  for (const [index, { userId, assists }] of finishes.entries()) {
    if (finishes[index - 1]?.assists !== assists) place = index + 1;
    const you = viewer.userId === userId;
    if (you) {
      yourPlace = place;
      yourAssists = assists;
    }
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
        assists,
      }))
    );
  }
  return {
    total: finishes.length,
    yourPlace,
    yourAssists,
    leaders: await Promise.all(leaders),
  };
}
