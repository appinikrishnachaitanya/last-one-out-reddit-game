import { createHmac, randomUUID } from 'node:crypto';
import { boardById } from '../../shared/boards.ts';
import { isObject } from '../../shared/daily.ts';
import type { AttemptStats, Edition } from '../../shared/daily.ts';
import { isAnimalId, move, replay, trace } from '../../shared/engine.ts';
import type { AnimalId, Board, State } from '../../shared/engine.ts';
import { completionKey } from './completions.ts';
import type { CompletionStore } from './completions.ts';

const saltKey = 'stats:v1:identity';
export const attemptsKey = (edition: Edition) =>
  `stats:v1:${edition.date}:${edition.puzzleId}:${edition.boardVersion}:attempts`;
const attemptId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

async function anonymousField(
  store: CompletionStore,
  edition: Edition,
  userId: string,
  id: string
) {
  let salt = await store.hGet(saltKey, 'salt');
  if (!salt) {
    await store.hSetNX(saltKey, 'salt', randomUUID());
    salt = await store.hGet(saltKey, 'salt');
  }
  if (!salt) throw new Error('Attempt storage unavailable.');
  return `${createHmac('sha256', salt).update(`${edition.id}:${userId}`).digest('hex')}:${id.toLowerCase()}`;
}

export function strandedBy(
  board: Board,
  before: State,
  after: State,
  moved: AnimalId
): AnimalId | undefined {
  return board.animals.find(
    ({ id }) =>
      id !== moved &&
      !after.home.includes(id) &&
      trace(board, before, id).obstacle?.kind !== 'bridge' &&
      trace(board, after, id).obstacle?.kind === 'bridge'
  )?.id;
}

export async function recordAttempt(
  store: CompletionStore,
  edition: Edition,
  userId: string,
  input: unknown
) {
  if (
    !isObject(input) ||
    !attemptId(input.attemptId) ||
    !isAnimalId(input.animal) ||
    !Array.isArray(input.before) ||
    !input.before.every(isAnimalId) ||
    (input.event !== 'firstMove' && input.event !== 'firstMistake')
  )
    throw new Error('Invalid attempt event.');
  const board = boardById(edition.puzzleId, edition.boardVersion);
  if (input.before.length >= board.animals.length)
    throw new Error('Invalid move history.');
  const before = replay(board, input.before);
  const after = move(board, before, input.animal);
  const stranded = strandedBy(board, before, after, input.animal);
  if (input.event === 'firstMove' ? before.home.length !== 0 : !stranded)
    throw new Error('The attempt event does not match the move.');
  const field = await anonymousField(store, edition, userId, input.attemptId);
  await store.hSetNX(
    attemptsKey(edition),
    `${field}:${input.event}`,
    input.event === 'firstMove' ? input.animal : `${input.animal}:${stranded}`
  );
}
export async function readFirstMove(
  store: CompletionStore,
  edition: Edition,
  userId: string,
  id: unknown
) {
  if (!attemptId(id)) return undefined;
  const field = await anonymousField(store, edition, userId, id);
  const first = await store.hGet(attemptsKey(edition), `${field}:firstMove`);
  return isAnimalId(first) ? first : undefined;
}
export async function readAttemptStats(
  store: CompletionStore,
  edition: Edition
): Promise<AttemptStats> {
  const [attempts, rescues] = await Promise.all([
    store.hGetAll(attemptsKey(edition)),
    store.hGetAll(completionKey(edition)),
  ]);
  const players = new Set<string>();
  const firstMoves: AttemptStats['firstMoves'] = {};
  const firstMistakes: AttemptStats['firstMistakes'] = {};
  const stranded: AttemptStats['stranded'] = {};
  for (const [field, value] of Object.entries(attempts)) {
    const [player, , event] = field.split(':');
    if (event === 'firstMove' && player && isAnimalId(value)) {
      players.add(player);
      firstMoves[value] = (firstMoves[value] ?? 0) + 1;
    }
    if (event === 'firstMistake') {
      const [actor, victim] = value.split(':');
      if (isAnimalId(actor) && isAnimalId(victim)) {
        firstMistakes[actor] = (firstMistakes[actor] ?? 0) + 1;
        stranded[victim] = (stranded[victim] ?? 0) + 1;
      }
    }
  }
  const records = Object.values(rescues);
  return {
    players: players.size,
    firstMoves,
    firstMistakes,
    stranded,
    totalSolves: records.length,
    perfectRuns: records.filter((raw) => JSON.parse(raw).personalUndos === 0)
      .length,
  };
}
