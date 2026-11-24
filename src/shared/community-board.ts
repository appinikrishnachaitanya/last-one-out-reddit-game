import type { AnimalId } from './engine.ts';

export type CommunityMove = {
  number: number;
  username: string;
  animal: AnimalId;
  outcome: 'home' | 'stranded' | 'rescued';
  stranded?: AnimalId;
};
export type CommunityVotes = {
  version: number;
  tally: Partial<Record<AnimalId, number>>;
  own?: AnimalId;
};
export type CommunityBoard = {
  channel: string;
  home: AnimalId[];
  moveNumber: number;
  attempts: number;
  successfulRescues: number;
  log: CommunityMove[];
  contributors: string[];
  lastRescue: string[];
  replayAvailable?: boolean;
  votes?: CommunityVotes;
  voteOutcome?: 'chosen' | 'different';
  canMove: boolean;
  signedIn: boolean;
};

export function leadingAnimals(tally: CommunityVotes['tally']): AnimalId[] {
  const candidates = Object.entries(tally) as [AnimalId, number][];
  const highest = Math.max(0, ...candidates.map(([, count]) => count));
  return highest > 0
    ? candidates
        .filter(([, count]) => count === highest)
        .map(([animal]) => animal)
    : [];
}
