import { boardById } from '../../shared/boards.ts';
import type {
  CommunityBoard,
  CommunityMove,
} from '../../shared/community-board.ts';
import { isObject } from '../../shared/daily.ts';
import type { Edition } from '../../shared/daily.ts';
import { isAnimalId, move, solve, trace, won } from '../../shared/engine.ts';
import { strandedBy } from './attempts.ts';

export type CommunityStorage = {
  get(key: string): Promise<string | undefined>;
  commit(
    key: string,
    expected: string | undefined,
    value: string
  ): Promise<boolean>;
};
type Player = { id: string; username: string };
type Stored = Omit<
  CommunityBoard,
  'channel' | 'canMove' | 'signedIn' | 'contributors'
> & {
  contributors: Player[];
  lastActor?: string;
};
export class CommunityMoveError extends Error {
  readonly status: 400 | 403 | 409;
  constructor(message: string, status: 400 | 403 | 409) {
    super(message);
    this.status = status;
  }
}
export const communityKey = (post: string, edition: Edition) =>
  `community:v1:${post}:${edition.date}:${edition.puzzleId}:${edition.boardVersion}`;
const channelFor = (post: string) => `rescue_${post}`;
const empty = (): Stored => ({
  home: [],
  moveNumber: 0,
  attempts: 0,
  successfulRescues: 0,
  log: [],
  contributors: [],
  lastRescue: [],
});
function publicBoard(state: Stored, post: string, id?: string): CommunityBoard {
  const { contributors, lastActor, ...view } = state;
  return {
    ...view,
    contributors: contributors.map(({ username }) => username),
    channel: channelFor(post),
    signedIn: Boolean(id),
    canMove: Boolean(
      id && id !== lastActor && contributors.every((p) => p.id !== id)
    ),
  };
}
export async function readCommunity(
  storage: CommunityStorage,
  post: string,
  edition: Edition,
  userId?: string
) {
  const raw = await storage.get(communityKey(post, edition));
  return publicBoard(raw ? (JSON.parse(raw) as Stored) : empty(), post, userId);
}
export async function submitCommunity(
  storage: CommunityStorage,
  post: string,
  edition: Edition,
  player: Player,
  input: unknown
) {
  if (
    !isObject(input) ||
    !isAnimalId(input.animal) ||
    typeof input.moveNumber !== 'number' ||
    !Number.isSafeInteger(input.moveNumber) ||
    input.moveNumber < 0
  )
    throw new CommunityMoveError(
      'Choose an animal from the current board.',
      400
    );
  const key = communityKey(post, edition);
  const raw = await storage.get(key);
  const state = raw ? (JSON.parse(raw) as Stored) : empty();
  if (state.moveNumber !== input.moveNumber)
    throw new CommunityMoveError(
      'Another rescuer moved first. Refreshing the board.',
      409
    );
  if (!publicBoard(state, post, player.id).canMove)
    throw new CommunityMoveError(
      'You’ve taken your turn. Give another rescuer a go.',
      403
    );
  const board = boardById(edition.puzzleId, edition.boardVersion);
  if (!trace(board, state, input.animal).legal)
    throw new CommunityMoveError('That path is blocked.', 400);
  const next = move(board, state, input.animal);
  const rescued = won(board, next);
  const stranded = strandedBy(board, state, next, input.animal);
  const failed =
    !rescued && (Boolean(stranded) || solve(board, next).length === 0);
  const entry: CommunityMove = {
    number: state.moveNumber + 1,
    username: player.username,
    animal: input.animal,
    outcome: rescued ? 'rescued' : failed ? 'stranded' : 'home',
    ...(stranded ? { stranded } : {}),
  };
  const contributors = [...state.contributors, player];
  const reset = rescued || failed;
  const updated: Stored = {
    home: reset ? [] : [...next.home],
    moveNumber: entry.number,
    attempts: state.attempts + Number(reset),
    successfulRescues: state.successfulRescues + Number(rescued),
    log: [...state.log, entry].slice(-10),
    contributors: reset ? [] : contributors,
    lastRescue: rescued
      ? contributors.map(({ username }) => username)
      : state.lastRescue,
    lastActor: player.id,
  };
  if (!(await storage.commit(key, raw, JSON.stringify(updated))))
    throw new CommunityMoveError(
      'Another rescuer moved first. Refreshing the board.',
      409
    );
  return publicBoard(updated, post, player.id);
}
