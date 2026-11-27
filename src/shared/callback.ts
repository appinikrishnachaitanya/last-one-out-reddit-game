import { FIREFLY, MOONROOT } from './boards.ts';
import { canHoldBridge, isHome, replay, trace } from './engine.ts';
import type { AnimalId, Board, State } from './engine.ts';

type Crossing = {
  board: Board;
  departures: readonly AnimalId[];
};

// Showcase-only variant. The shared moon bridge can be held from either
// bank, while the star bridge relies on Turtle alone.
const fireflyCallback: Board = {
  ...FIREFLY,
  id: 'firefly-callback-v1',
  subtitle: 'Either keeper can raise the moon bridge.',
  bridges: [
    {
      id: 'moon',
      symbol: '☾',
      x: 4,
      y: 2,
      holder: 'turtle',
      alternateHolder: 'fox',
    },
    { id: 'star', symbol: '✦', x: 5, y: 3, holder: 'turtle' },
  ],
};

export const callbackCrossings: readonly Crossing[] = [
  {
    board: MOONROOT,
    departures: ['turtle', 'fox', 'badger'],
  },
  {
    board: fireflyCallback,
    departures: ['turtle', 'fox'],
  },
];

export function callbackStart(crossing: Crossing): State {
  return replay(crossing.board, crossing.departures);
}

export function recallKeeper(
  board: Board,
  state: State,
  keeper: AnimalId
): State | undefined {
  if (
    !isHome(state, keeper) ||
    !board.bridges.some((bridge) => canHoldBridge(bridge, keeper))
  )
    return undefined;
  const restored = { home: state.home.filter((animal) => animal !== keeper) };
  if (!trace(board, restored, keeper).legal) return undefined;
  return restored;
}
