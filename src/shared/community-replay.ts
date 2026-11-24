import { isAnimalId, validateSolution } from './engine.ts';
import type { AnimalId, Board } from './engine.ts';

export type ReplayMove = {
  animal: AnimalId;
  username: string;
  timestamp: string;
};
export type CommunityReplay = {
  puzzleId: string;
  boardVersion: number;
  moves: ReplayMove[];
};

export function parseCommunityReplay(
  board: Board,
  input: unknown
): CommunityReplay {
  if (
    !input ||
    typeof input !== 'object' ||
    !('puzzleId' in input) ||
    input.puzzleId !== board.id ||
    !('boardVersion' in input) ||
    input.boardVersion !== board.version ||
    !('moves' in input) ||
    !Array.isArray(input.moves) ||
    input.moves.length !== board.animals.length
  )
    throw new Error('Replay does not match this crossing.');
  const moves = input.moves.map((candidate: unknown): ReplayMove => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('animal' in candidate) ||
      !isAnimalId(candidate.animal) ||
      !('username' in candidate) ||
      typeof candidate.username !== 'string' ||
      !candidate.username.trim() ||
      !('timestamp' in candidate) ||
      typeof candidate.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(candidate.timestamp))
    )
      throw new Error('Replay move is incomplete.');
    return {
      animal: candidate.animal,
      username: candidate.username,
      timestamp: candidate.timestamp,
    };
  });
  if (
    !validateSolution(
      board,
      moves.map(({ animal }) => animal)
    )
  )
    throw new Error('Replay route could not be verified.');
  return { puzzleId: board.id, boardVersion: board.version, moves };
}
