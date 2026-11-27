import { isObject } from './daily.ts';
import { isAnimalId } from './engine.ts';
import type { AnimalId } from './engine.ts';

export const challengeCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const redditName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{3,20}$/.test(value);

export type ChallengeRun = {
  undos: number;
  hint: boolean;
  firstChoice: AnimalId;
  trail: AnimalId[];
};
export type FriendChallengeView = {
  code: string;
  host: string;
  guest: string | null;
  role: 'host' | 'guest' | 'visitor';
  canJoin: boolean;
  joined: boolean;
  rematch: boolean;
  rematchDay: number | null;
  target: number | null;
  comparison: { host: ChallengeRun; guest: ChallengeRun } | null;
};

function parseRun(value: unknown): ChallengeRun {
  if (
    !isObject(value) ||
    typeof value.undos !== 'number' ||
    !Number.isSafeInteger(value.undos) ||
    value.undos < 0 ||
    typeof value.hint !== 'boolean' ||
    !isAnimalId(value.firstChoice) ||
    !Array.isArray(value.trail) ||
    !value.trail.every(isAnimalId)
  )
    throw new Error('Invalid rescue trail');
  return {
    undos: value.undos,
    hint: value.hint,
    firstChoice: value.firstChoice,
    trail: value.trail,
  };
}

export function parseFriendChallenge(
  value: unknown
): FriendChallengeView | null {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !challengeCode(value.code) ||
    !redditName(value.host) ||
    !(value.guest === null || redditName(value.guest)) ||
    !(
      value.role === 'host' ||
      value.role === 'guest' ||
      value.role === 'visitor'
    ) ||
    typeof value.canJoin !== 'boolean' ||
    typeof value.joined !== 'boolean' ||
    typeof value.rematch !== 'boolean' ||
    !(
      value.rematchDay === null ||
      (typeof value.rematchDay === 'number' &&
        Number.isSafeInteger(value.rematchDay) &&
        value.rematchDay > 0)
    ) ||
    !(
      value.target === null ||
      (typeof value.target === 'number' &&
        Number.isSafeInteger(value.target) &&
        value.target >= 0)
    )
  )
    throw new Error('Invalid challenge response');
  const compared = value.comparison;
  if (compared !== null && !isObject(compared))
    throw new Error('Invalid trail comparison');
  return {
    code: value.code,
    host: value.host,
    guest: value.guest,
    role: value.role,
    canJoin: value.canJoin,
    joined: value.joined,
    rematch: value.rematch,
    rematchDay: value.rematchDay,
    target: value.target,
    comparison:
      compared === null
        ? null
        : { host: parseRun(compared.host), guest: parseRun(compared.guest) },
  };
}

export function challengePrompt(target: number): string {
  if (target === 0) return 'Can you match a clean rescue?';
  if (target === 1) return 'Can you finish without an undo or hint?';
  return `Can you finish with fewer than ${target} assists? Each undo adds one. Using a hint adds one more.`;
}
