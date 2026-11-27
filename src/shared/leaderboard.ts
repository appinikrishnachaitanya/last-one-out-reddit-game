import { isObject } from './daily.ts';

export const LEADERBOARD_LIMIT = 10;

type LeaderboardRow = { place: number; username: string | null; you: boolean };

export type Leaderboard = {
  total: number;
  yourPlace: number | null;
  leaders: LeaderboardRow[];
};

export function parseLeaderboard(value: unknown): Leaderboard {
  const validPlace = (place: unknown): place is number =>
    typeof place === 'number' && Number.isSafeInteger(place) && place > 0;
  if (
    !isObject(value) ||
    typeof value.total !== 'number' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    (value.yourPlace !== null &&
      (!validPlace(value.yourPlace) || value.yourPlace > value.total)) ||
    !Array.isArray(value.leaders) ||
    value.leaders.length !== Math.min(value.total, LEADERBOARD_LIMIT)
  )
    throw new Error('Invalid leaderboard response');
  const total = value.total;
  const leaders = value.leaders.map((row: unknown) => {
    if (
      !isObject(row) ||
      !validPlace(row.place) ||
      row.place > total ||
      (row.username !== null && typeof row.username !== 'string') ||
      typeof row.you !== 'boolean'
    )
      throw new Error('Invalid leaderboard row');
    return { place: row.place, username: row.username, you: row.you };
  });
  return { total, yourPlace: value.yourPlace, leaders };
}
