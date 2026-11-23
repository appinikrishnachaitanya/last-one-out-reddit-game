import { parseUndoState } from './undo-charge.ts';
import type { UndoState } from './undo-charge.ts';
import { boardById } from './boards.ts';
import { isAnimalId, titleCase, validateSolution } from './engine.ts';
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
  firstMove?: AnimalId;
  personalUndos: number;
  elapsedSeconds?: number;
  openingTrap?: AnimalId;
  favorite: AnimalId;
  completedAt: string;
}>;
export type Community = Readonly<{
  total: number;
  openings: Partial<Record<AnimalId, number>>;
  traps?: Partial<Record<AnimalId, number>>;
}>;
export type AttemptStats = {
  players: number;
  firstMoves: Partial<Record<AnimalId, number>>;
  firstMistakes: Partial<Record<AnimalId, number>>;
  stranded: Partial<Record<AnimalId, number>>;
  totalSolves: number;
  perfectRuns: number;
};
export function rescueShare(
  edition: Edition,
  undos: number,
  opening?: AnimalId,
  stats?: AttemptStats
): string {
  const total = boardById(edition.puzzleId, edition.boardVersion).animals
    .length;
  const percent = opening && openingPercent(stats, opening);
  const club =
    typeof percent === 'number' && percent > 0 ? ` (${percent}% club)` : '';
  return `Last One Out - ${edition.date}\nRescued: ${total}/${total} | Undos: ${undos} | First move: ${opening ? titleCase(opening) : '—'}${club}\nCan Reddit rescue today's Community Crossing?`;
}
export type PreviousRescues = Pick<
  AttemptStats,
  'totalSolves' | 'perfectRuns' | 'stranded'
> & { yesterday: boolean };
export function highestCount(counts: Partial<Record<AnimalId, number>>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}
export function openingPercent(
  stats: AttemptStats | undefined,
  animal: AnimalId
): number | undefined {
  if (!stats || stats.players < 10) return undefined;
  const total = Object.values(stats.firstMoves).reduce(
    (sum, count) => sum + count,
    0
  );
  return total
    ? Math.round(((stats.firstMoves[animal] ?? 0) / total) * 100)
    : undefined;
}
export type CommentHint = { text: string; url: string };
export function parseCommentHint(value: unknown): CommentHint | undefined {
  if (
    isObject(value) &&
    typeof value.text === 'string' &&
    value.text.length <= 160 &&
    typeof value.url === 'string' &&
    /^https:\/\/www\.reddit\.com\/r\/[a-z0-9_]+\/comments\/[a-z0-9]+\/[a-z0-9_]+\/[a-z0-9]+\/?$/i.test(
      value.url
    )
  )
    return { text: value.text, url: value.url };
}
export type Init =
  | {
      status: 'ready';
      edition: Edition;
      completion: Completion | null;
      community: Community | null;
      previousRescues?: PreviousRescues;
      attemptStats?: AttemptStats | undefined;
      communityEnabled?: boolean;
      shareStatus?: string;
      refillAt?: number;
      undoState?: UndoState;
      undoSync?: boolean;
      hintSync?: boolean;
      commentsUrl: string | null;
      username?: string;
      mode: 'reddit' | 'demo';
    }
  | { status: 'empty'; message: string; mode: 'reddit' | 'demo' };
export type SaveResult = {
  validated: true;
  firstCompletion: boolean;
  completion: Completion;
  community: Community;
  attemptStats?: AttemptStats | undefined;
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
export function validElapsed(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 31_536_000
  );
}
export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
    ...(isAnimalId(value.firstMove) ? { firstMove: value.firstMove } : {}),
    personalUndos: value.personalUndos,
    ...(validElapsed(value.elapsedSeconds)
      ? { elapsedSeconds: value.elapsedSeconds }
      : {}),
    ...(isAnimalId(value.openingTrap)
      ? { openingTrap: value.openingTrap }
      : {}),
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
  const traps: NonNullable<Community['traps']> = {};
  if (isObject(value.traps))
    for (const [id, count] of Object.entries(value.traps))
      if (
        isAnimalId(id) &&
        typeof count === 'number' &&
        Number.isSafeInteger(count) &&
        count > 0 &&
        count <= total
      )
        traps[id] = count;
  return { total, openings, ...(Object.keys(traps).length ? { traps } : {}) };
}
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function counts(value: unknown): Partial<Record<AnimalId, number>> {
  const out: Partial<Record<AnimalId, number>> = {};
  if (isObject(value))
    for (const [id, count] of Object.entries(value))
      if (isAnimalId(id) && isCount(count) && count > 0) out[id] = count;
  return out;
}
export function parseAttemptStats(value: unknown): AttemptStats | undefined {
  if (
    !isObject(value) ||
    !isCount(value.players) ||
    !isCount(value.totalSolves) ||
    !isCount(value.perfectRuns)
  )
    return undefined;
  return {
    players: value.players,
    totalSolves: value.totalSolves,
    perfectRuns: value.perfectRuns,
    firstMoves: counts(value.firstMoves),
    firstMistakes: counts(value.firstMistakes),
    stranded: counts(value.stranded),
  };
}
export function parseInit(value: unknown): Init {
  if (!isObject(value) || (value.mode !== 'reddit' && value.mode !== 'demo'))
    throw new Error('Invalid response');
  if (value.status === 'empty' && typeof value.message === 'string')
    return { status: 'empty', message: value.message, mode: value.mode };
  const undoState = parseUndoState(value.undoState);
  if (value.status !== 'ready') throw new Error('Missing daily');
  const edition = parseEdition(value.edition);
  const previous = value.previousRescues;
  const previousRescues =
    isObject(previous) &&
    typeof previous.yesterday === 'boolean' &&
    isCount(previous.totalSolves) &&
    isCount(previous.perfectRuns) &&
    previous.perfectRuns <= previous.totalSolves
      ? {
          yesterday: previous.yesterday,
          totalSolves: previous.totalSolves,
          perfectRuns: previous.perfectRuns,
          stranded: counts(previous.stranded),
        }
      : undefined;
  return {
    status: 'ready',
    edition,
    ...(previousRescues ? { previousRescues } : {}),
    communityEnabled: value.communityEnabled === true,
    attemptStats: parseAttemptStats(value.attemptStats),
    mode: value.mode,
    ...(typeof value.username === 'string' &&
    /^[a-z0-9_-]{1,32}$/i.test(value.username)
      ? { username: value.username }
      : {}),
    completion: value.completion
      ? parseCompletion(value.completion, edition)
      : null,
    community: value.community ? parseCommunity(value.community) : null,
    ...(typeof value.shareStatus === 'string'
      ? { shareStatus: value.shareStatus }
      : {}),
    ...(typeof value.refillAt === 'number' ? { refillAt: value.refillAt } : {}),
    ...(undoState ? { undoState } : {}),
    undoSync: value.undoSync === true,
    hintSync: value.hintSync === true,
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
    attemptStats: parseAttemptStats(value.attemptStats),
    telemetry:
      value.telemetry === 'attempted'
        ? 'attempted'
        : value.telemetry === 'unavailable'
          ? 'unavailable'
          : 'not-requested',
  };
}
