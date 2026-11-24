import {
  initialState,
  isAnimalId,
  move,
  samePoint,
  solve,
  titleCase,
  trace,
  won,
} from './engine.ts';
import type { AnimalId, Board } from './engine.ts';

export type RecoveryEvidence = {
  route: readonly AnimalId[];
  blocked?: AnimalId;
};

export function verifyRecovery(
  board: Board,
  input: unknown,
  undos: number
): boolean {
  if (
    !input ||
    typeof input !== 'object' ||
    !('route' in input) ||
    !Array.isArray(input.route) ||
    input.route.length === 0 ||
    input.route.length >= board.animals.length
  )
    return false;
  let state = initialState();
  for (const animal of input.route) {
    if (!isAnimalId(animal) || !trace(board, state, animal).legal) return false;
    state = move(board, state, animal);
  }
  if ('blocked' in input)
    return (
      undos > 0 &&
      isAnimalId(input.blocked) &&
      Boolean(trace(board, state, input.blocked).obstacle)
    );
  return solve(board, state).length === 0;
}

export function rescueIdentity(
  board: Board,
  sequence: readonly AnimalId[],
  options: {
    recovered?: boolean;
    elapsedSeconds?: number | undefined;
    parSeconds?: number | undefined;
  } = {}
) {
  let state = initialState();
  const crossings: { bridge: string; holder: AnimalId; traveler: AnimalId }[] =
    [];
  const beneficiaries = new Map<AnimalId, Set<AnimalId>>();
  for (const animal of sequence) {
    const route = trace(board, state, animal);
    if (!route.legal) return undefined;
    for (const bridge of board.bridges) {
      if (
        bridge.holder === animal ||
        !route.path.some((point) => samePoint(point, bridge))
      )
        continue;
      crossings.push({
        bridge: bridge.id,
        holder: bridge.holder,
        traveler: animal,
      });
      const friends = beneficiaries.get(bridge.holder) ?? new Set<AnimalId>();
      friends.add(animal);
      beneficiaries.set(bridge.holder, friends);
    }
    state = move(board, state, animal);
  }
  if (!won(board, state)) return undefined;
  const hero = [...beneficiaries].sort(
    (a, b) =>
      b[1].size - a[1].size || sequence.indexOf(b[0]) - sequence.indexOf(a[0])
  )[0];
  const crossing = crossings.find(({ holder }) => holder === hero?.[0]);
  const award = crossing
    ? {
        title: 'Bridge Keeper',
        explanation: `You let ${titleCase(crossing.traveler)} cross ${titleCase(crossing.holder)}’s bridge before ${titleCase(crossing.holder)} left.`,
      }
    : options.recovered
      ? {
          title: 'Second-Chance Rescuer',
          explanation:
            'You recovered from a blocked crossing and brought everyone home.',
        }
      : options.parSeconds !== undefined &&
          options.parSeconds > 0 &&
          options.elapsedSeconds !== undefined &&
          options.elapsedSeconds <= options.parSeconds
        ? {
            title: 'Swift Scout',
            explanation:
              'You finished within this crossing’s playtested par time.',
          }
        : {
            title: 'Gentle Rescuer',
            explanation: 'You found a safe way home for every animal.',
          };
  return {
    ...award,
    crossing,
    hero: hero ? { animal: hero[0], friends: hero[1].size } : undefined,
  };
}
