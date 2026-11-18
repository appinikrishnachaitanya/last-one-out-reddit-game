import { boardById } from './boards.ts';
import { isAnimalId, validateSolution } from './engine.ts';
import type { AnimalId } from './engine.ts';
export type Edition = Readonly<{
  id: string;
  number: number;
  date: string;
  puzzleId: string;
  boardVersion: number;
}>;
export type Completion = Readonly<{
  editionId: string;
  puzzleId: string;
  boardVersion: number;
  sequence: readonly AnimalId[];
  opening: AnimalId;
  personalUndos: number;
  favorite: AnimalId;
  completedAt: string;
}>;
export type Community = Readonly<{
  total: number;
  openings: Partial<Record<AnimalId, number>>;
}>;
export type Init =
  | {
      status: 'ready';
      edition: Edition;
      completion: Completion | null;
      community: Community | null;
      commentsUrl: string | null;
      mode: 'reddit' | 'demo';
    }
  | { status: 'empty'; message: string; mode: 'reddit' | 'demo' };
export type SaveResult = {
  validated: true;
  firstCompletion: boolean;
  completion: Completion;
  community: Community;
  telemetry: 'not-requested' | 'attempted' | 'unavailable';
};
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export function parseEdition(value: unknown): Edition {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.number !== 'number' ||
    !Number.isInteger(value.number) ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    typeof value.puzzleId !== 'string' ||
    typeof value.boardVersion !== 'number'
  )
    throw new Error('Invalid edition');
  boardById(value.puzzleId, value.boardVersion);
  return {
    id: value.id,
    number: value.number,
    date: value.date,
    puzzleId: value.puzzleId,
    boardVersion: value.boardVersion,
  };
}
export function parseCompletion(value: unknown, edition: Edition): Completion {
  if (
    !isObject(value) ||
    value.editionId !== edition.id ||
    value.puzzleId !== edition.puzzleId ||
    value.boardVersion !== edition.boardVersion ||
    !validateSolution(
      boardById(edition.puzzleId, edition.boardVersion),
      value.sequence
    ) ||
    !isAnimalId(value.opening) ||
    value.opening !== value.sequence[0] ||
    !Number.isSafeInteger(value.personalUndos) ||
    typeof value.personalUndos !== 'number' ||
    value.personalUndos < 0 ||
    !isAnimalId(value.favorite) ||
    typeof value.completedAt !== 'string'
  )
    throw new Error('Invalid saved completion');
  return {
    editionId: edition.id,
    puzzleId: edition.puzzleId,
    boardVersion: edition.boardVersion,
    sequence: [...value.sequence],
    opening: value.opening,
    personalUndos: value.personalUndos,
    favorite: value.favorite,
    completedAt: value.completedAt,
  };
}
export function parseCommunity(value: unknown): Community {
  if (
    !isObject(value) ||
    !Number.isSafeInteger(value.total) ||
    typeof value.total !== 'number' ||
    value.total < 0 ||
    !isObject(value.openings)
  )
    throw new Error('Invalid community response');
  const openings: Partial<Record<AnimalId, number>> = {};
  let total = 0;
  for (const [key, n] of Object.entries(value.openings)) {
    if (
      !isAnimalId(key) ||
      typeof n !== 'number' ||
      !Number.isSafeInteger(n) ||
      n < 0
    )
      throw new Error('Invalid community count');
    openings[key] = n;
    total += n;
  }
  if (total !== value.total) throw new Error('Inconsistent community totals');
  return { total, openings };
}
export function parseInit(value: unknown): Init {
  if (!isObject(value) || (value.mode !== 'reddit' && value.mode !== 'demo'))
    throw new Error('Invalid response');
  if (value.status === 'empty' && typeof value.message === 'string')
    return { status: 'empty', message: value.message, mode: value.mode };
  if (value.status !== 'ready') throw new Error('Missing daily');
  const edition = parseEdition(value.edition);
  return {
    status: 'ready',
    edition,
    mode: value.mode,
    completion: value.completion
      ? parseCompletion(value.completion, edition)
      : null,
    community: value.community ? parseCommunity(value.community) : null,
    commentsUrl:
      typeof value.commentsUrl === 'string' ? value.commentsUrl : null,
  };
}
export function parseSave(value: unknown, edition: Edition): SaveResult {
  if (
    !isObject(value) ||
    value.validated !== true ||
    typeof value.firstCompletion !== 'boolean'
  )
    throw new Error('Rescue validation was incomplete');
  return {
    validated: true,
    firstCompletion: value.firstCompletion,
    completion: parseCompletion(value.completion, edition),
    community: parseCommunity(value.community),
    telemetry:
      value.telemetry === 'attempted'
        ? 'attempted'
        : value.telemetry === 'unavailable'
          ? 'unavailable'
          : 'not-requested',
  };
}
