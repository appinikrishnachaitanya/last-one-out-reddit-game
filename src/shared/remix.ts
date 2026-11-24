import { MOONROOT, WILLOW, LANTERN } from './boards.ts';
import {
  initialState,
  isAnimalId,
  move,
  solve,
  titleCase,
  trace,
} from './engine.ts';
import type { Animal, AnimalId, Board, State } from './engine.ts';

export const remixTemplates = [MOONROOT, WILLOW, LANTERN] as const;
export const remixDirections = ['N', 'E', 'S', 'W'] as const;
export type RemixSpec = {
  template: string;
  slots: { id: AnimalId; direction: Animal['direction'] }[];
};
export type RemixDraft = {
  id: string;
  spec: RemixSpec;
  creator: string;
  createdAt: string;
  status: 'draft' | 'approved' | 'rejected';
  note?: string;
  difficulty: { label: 'Easy' | 'Medium' | 'Hard'; decisionDepth: number };
};

export function parseRemix(input: unknown): RemixSpec {
  if (
    !input ||
    typeof input !== 'object' ||
    !('template' in input) ||
    !remixTemplates.some(({ id }) => id === input.template) ||
    !('slots' in input) ||
    !Array.isArray(input.slots) ||
    input.slots.length !== 4
  )
    throw new Error('Choose a template and fill its four slots.');
  const slots = input.slots.map((slot: unknown) => {
    if (
      !slot ||
      typeof slot !== 'object' ||
      !('id' in slot) ||
      !isAnimalId(slot.id) ||
      !('direction' in slot) ||
      !remixDirections.some((direction) => direction === slot.direction)
    )
      throw new Error('Each slot needs an animal and an arrow.');
    return { id: slot.id, direction: slot.direction as Animal['direction'] };
  });
  if (new Set(slots.map(({ id }) => id)).size !== 4)
    throw new Error('Use Turtle, Rabbit, Fox, and Badger once each.');
  return { template: input.template as string, slots };
}

export function remixBoard(
  spec: RemixSpec,
  id = 'remix-preview',
  creator?: string
): Board {
  const template = remixTemplates.find((board) => board.id === spec.template);
  if (!template) throw new Error('This template is unavailable.');
  return {
    ...template,
    id,
    title: creator ? `Sunday Remix by u/${creator}` : `${template.title} Remix`,
    animals: template.animals.map((slot, index) => ({
      ...slot,
      ...spec.slots[index]!,
    })),
  };
}

export function checkRemix(board: Board): RemixDraft['difficulty'] {
  const solutions = solve(board);
  if (!solutions.length) {
    let best: State = initialState();
    const visit = (state: State) => {
      if (state.home.length > best.home.length) best = state;
      for (const { id } of board.animals)
        if (trace(board, state, id).legal) visit(move(board, state, id));
    };
    visit(best);
    const animal = board.animals.find(({ id }) => !best.home.includes(id))!;
    const obstacle = trace(board, best, animal.id).obstacle;
    const blocker: AnimalId | undefined =
      obstacle?.kind === 'animal'
        ? board.animals.find(
            ({ x, y }) => x === obstacle.at.x && y === obstacle.at.y
          )?.id
        : undefined;
    throw new Error(
      `${titleCase(animal.id)} has no route after the furthest rescue${obstacle ? `: ${obstacle.reason}` : ''}. Try changing ${titleCase(blocker ?? animal.id)}’s arrow.`
    );
  }
  const decisionDepth = Math.min(
    ...solutions.map((solution) => {
      let forced = 0;
      let state = initialState();
      for (const animal of solution.slice(0, -1)) {
        if (new Set(solve(board, state).map(([first]) => first)).size === 1)
          forced++;
        state = move(board, state, animal);
      }
      return forced;
    })
  );
  return {
    decisionDepth,
    label: decisionDepth >= 3 ? 'Hard' : decisionDepth >= 1 ? 'Medium' : 'Easy',
  };
}
