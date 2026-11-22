import type { AnimalId } from './engine.ts';

export type CommunityMove = {
  number: number;
  username: string;
  animal: AnimalId;
  outcome: 'home' | 'stranded' | 'rescued';
  stranded?: AnimalId;
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
  canMove: boolean;
  signedIn: boolean;
};
