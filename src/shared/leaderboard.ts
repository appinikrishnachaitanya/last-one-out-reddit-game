import { isObject } from './daily.ts';

export const LEADERBOARD_LIMIT = 10;

type LeaderboardRow = {
  place: number;
  username: string | null;
  you: boolean;
  assists: number;
};

export type Leaderboard = {
  total: number;
  yourPlace: number | null;
  yourAssists: number | null;
  leaders: LeaderboardRow[];
};

export function parseLeaderboard(value: unknown): Leaderboard {
  const validPlace = (place: unknown): place is number =>
    typeof place === 'number' && Number.isSafeInteger(place) && place > 0;
  const validAssists = (assists: unknown): assists is number =>
    typeof assists === 'number' &&
    Number.isSafeInteger(assists) &&
    assists >= 0;
  if (
    !isObject(value) ||
    typeof value.total !== 'number' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    (value.yourPlace !== null &&
      (!validPlace(value.yourPlace) || value.yourPlace > value.total)) ||
    (value.yourAssists !== null && !validAssists(value.yourAssists)) ||
    (value.yourPlace === null) !== (value.yourAssists === null) ||
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
      typeof row.you !== 'boolean' ||
      !validAssists(row.assists)
    )
      throw new Error('Invalid leaderboard row');
    return {
      place: row.place,
      username: row.username,
      you: row.you,
      assists: row.assists,
    };
  });
  return {
    total,
    yourPlace: value.yourPlace,
    yourAssists: value.yourAssists,
    leaders,
  };
}
