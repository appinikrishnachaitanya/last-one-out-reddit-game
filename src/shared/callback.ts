import { FIREFLY, MOONROOT } from './boards.ts';
import { isHome, replay, trace } from './engine.ts';
import type { AnimalId, Board, State } from './engine.ts';

type Crossing = {
  board: Board;
  departures: readonly AnimalId[];
  stranded: AnimalId;
};

export const callbackCrossings: readonly Crossing[] = [
  {
    board: MOONROOT,
    departures: ['turtle', 'fox', 'badger'],
    stranded: 'rabbit',
  },
  {
    board: FIREFLY,
    departures: ['turtle', 'badger', 'fox'],
    stranded: 'rabbit',
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
    !board.bridges.some((bridge) => bridge.holder === keeper)
  )
    return undefined;
  const restored = { home: state.home.filter((animal) => animal !== keeper) };
  if (!trace(board, restored, keeper).legal) return undefined;
  return restored;
}
