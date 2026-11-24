import { parseCommunityReplay } from '../../shared/community-replay.ts';
import type { ReplayMove } from '../../shared/community-replay.ts';
import { boardById } from '../../shared/boards.ts';
import type {
  CommunityBoard,
  CommunityMove,
  CommunityVotes,
} from '../../shared/community-board.ts';
import { leadingAnimals } from '../../shared/community-board.ts';
import type { AnimalId } from '../../shared/engine.ts';
import { isObject } from '../../shared/daily.ts';
import type { Edition } from '../../shared/daily.ts';
import { isAnimalId, move, solve, trace, won } from '../../shared/engine.ts';
import { strandedBy } from './attempts.ts';

export type CommunityStorage = {
  get(key: string): Promise<string | undefined>;
  commit(
    key: string,
    expected: string | undefined,
    value: string,
    archive?: { key: string; value: string }
  ): Promise<boolean>;
};
type Player = { id: string; username: string };
type RecordedMove = ReplayMove & { userId: string };
type Stored = Omit<
  CommunityBoard,
  'channel' | 'canMove' | 'signedIn' | 'contributors' | 'votes'
> & {
  contributors: Player[];
  lastActor?: string;
  attemptMoves?: RecordedMove[];
  replayRevision?: number;
  ballots?: Record<string, { animal: AnimalId; at: number }>;
  ballotVersion?: number;
};
export class CommunityMoveError extends Error {
  readonly status: 400 | 403 | 409 | 429;
  constructor(message: string, status: 400 | 403 | 409 | 429) {
    super(message);
    this.status = status;
  }
}
export const communityKey = (post: string, edition: Edition) =>
  `community:v1:${post}:${edition.date}:${edition.puzzleId}:${edition.boardVersion}`;
export const communityReplayKey = (
  post: string,
  edition: Edition,
  revision: number
) => `${communityKey(post, edition)}:replay:${revision}`;
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
const MAX_COMMIT_ATTEMPTS = 5;
const VOTE_INTERVAL_MS = 1000;

function voteTally(state: Stored): CommunityVotes['tally'] {
  const tally: CommunityVotes['tally'] = {};
  for (const { animal } of Object.values(state.ballots ?? {}))
    tally[animal] = (tally[animal] ?? 0) + 1;
  return tally;
}

export async function submitCommunityVote(
  storage: CommunityStorage,
  post: string,
  edition: Edition,
  userId: string,
  input: unknown,
  now: Date
) {
  if (!userId) throw new CommunityMoveError('Sign in to vote.', 403);
  if (
    !isObject(input) ||
    !isAnimalId(input.animal) ||
    typeof input.moveNumber !== 'number' ||
    !Number.isSafeInteger(input.moveNumber) ||
    typeof input.attempts !== 'number' ||
    !Number.isSafeInteger(input.attempts)
  )
    throw new CommunityMoveError(
      'Choose an animal from the current crossing.',
      400
    );
  const key = communityKey(post, edition);
  const board = boardById(edition.puzzleId, edition.boardVersion);
  const at = now.getTime();
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
    const raw = await storage.get(key);
    const state = raw ? (JSON.parse(raw) as Stored) : empty();
    if (
      state.moveNumber !== input.moveNumber ||
      state.attempts !== input.attempts
    )
      throw new CommunityMoveError(
        'The board changed. Vote on the new crossing.',
        409
      );
    const route = trace(board, state, input.animal);
    if (!route.legal)
      throw new CommunityMoveError(
        route.obstacle?.reason ?? 'That animal is already home.',
        400
      );
    const previous = state.ballots?.[userId];
    if (previous?.animal === input.animal)
      return { state: publicBoard(state, post, userId), changed: false };
    if (previous && at - previous.at < VOTE_INTERVAL_MS)
      throw new CommunityMoveError(
        'Give your vote a second before changing it.',
        429
      );
    const updated: Stored = {
      ...state,
      ballotVersion: (state.ballotVersion ?? 0) + 1,
      ballots: { ...state.ballots, [userId]: { animal: input.animal, at } },
    };
    if (await storage.commit(key, raw, JSON.stringify(updated)))
      return { state: publicBoard(updated, post, userId), changed: true };
  }
  throw new CommunityMoveError('The tally is busy. Try voting again.', 409);
}

function publicBoard(state: Stored, post: string, id?: string): CommunityBoard {
  const {
    contributors,
    lastActor,
    attemptMoves,
    replayRevision,
    ballots,
    ballotVersion,
    ...view
  } = state;
  const own = id ? ballots?.[id]?.animal : undefined;
  return {
    ...view,
    votes: {
      version: ballotVersion ?? 0,
      tally: voteTally(state),
      ...(own ? { own } : {}),
    },
    replayAvailable: replayRevision !== undefined,
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
export async function readCommunityReplay(
  storage: CommunityStorage,
  post: string,
  edition: Edition
) {
  const current = await storage.get(communityKey(post, edition));
  const revision = current
    ? (JSON.parse(current) as Stored).replayRevision
    : undefined;
  if (revision === undefined) return undefined;
  const raw = await storage.get(communityReplayKey(post, edition, revision));
  if (!raw) throw new Error('Saved replay is missing');
  return parseCommunityReplay(
    boardById(edition.puzzleId, edition.boardVersion),
    JSON.parse(raw)
  );
}
export async function submitCommunity(
  storage: CommunityStorage,
  post: string,
  edition: Edition,
  player: Player,
  input: unknown,
  now = new Date()
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
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
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
    const attemptMoves = [
      ...(state.attemptMoves ?? []),
      {
        userId: player.id,
        username: player.username,
        animal: input.animal,
        timestamp: now.toISOString(),
      },
    ];
    const archive =
      rescued && attemptMoves.length === board.animals.length
        ? {
            key: communityReplayKey(post, edition, entry.number),
            value: JSON.stringify({
              puzzleId: board.id,
              boardVersion: board.version,
              moves: attemptMoves,
            }),
          }
        : undefined;
    const leaders = leadingAnimals(voteTally(state));
    const updated: Stored = {
      ...(leaders.length
        ? {
            voteOutcome: leaders.includes(input.animal)
              ? 'chosen'
              : 'different',
          }
        : {}),
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
      attemptMoves: reset ? [] : attemptMoves,
      ...(archive
        ? { replayRevision: entry.number }
        : state.replayRevision !== undefined
          ? { replayRevision: state.replayRevision }
          : {}),
    };
    if (await storage.commit(key, raw, JSON.stringify(updated), archive))
      return publicBoard(updated, post, player.id);
  }
  throw new CommunityMoveError('The shared crossing is busy. Try again.', 409);
}
