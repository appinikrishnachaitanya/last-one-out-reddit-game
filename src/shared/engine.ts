export type AnimalId = 'turtle' | 'rabbit' | 'fox' | 'badger';
export type Point = Readonly<{ x: number; y: number }>;
export type Animal = Point &
  Readonly<{ id: AnimalId; direction: 'N' | 'E' | 'S' | 'W' }>;
export type Bridge = Point &
  Readonly<{ id: string; symbol: string; holder: AnimalId }>;
export type Board = Readonly<{
  id: string;
  version: number;
  title: string;
  subtitle: string;
  size: number;
  animals: readonly Animal[];
  bridges: readonly Bridge[];
  paths: readonly Point[];
}>;
export type State = Readonly<{ home: readonly AnimalId[] }>;
export type Route = Readonly<{
  legal: boolean;
  path: readonly Point[];
  obstacle?: Readonly<{
    at: Point;
    reason: string;
    kind: 'animal' | 'bridge' | 'terrain';
  }>;
}>;
export const initialState = (): State => ({ home: [] });
export const samePoint = (a: Point, b: Point): boolean =>
  a.x === b.x && a.y === b.y;
export const isHome = (state: State, id: AnimalId): boolean =>
  state.home.includes(id);
export const bridgeOpen = (state: State, bridge: Bridge): boolean =>
  !isHome(state, bridge.holder);
export const isAnimalId = (value: unknown): value is AnimalId =>
  value === 'turtle' ||
  value === 'rabbit' ||
  value === 'fox' ||
  value === 'badger';
export const titleCase = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);
export function trace(board: Board, state: State, id: AnimalId): Route {
  const animal = board.animals.find((a) => a.id === id);
  if (!animal || isHome(state, id)) return { legal: false, path: [] };
  const vectors = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const vector = vectors[animal.direction];
  const dx = vector[0] ?? 0,
    dy = vector[1] ?? 0;
  const path: Point[] = [];
  let p: Point = { x: animal.x + dx, y: animal.y + dy };
  while (p.x >= 0 && p.y >= 0 && p.x < board.size && p.y < board.size) {
    const blocker = board.animals.find(
      (a) => a.id !== id && !isHome(state, a.id) && samePoint(a, p)
    );
    const bridge = board.bridges.find(
      (b) => samePoint(b, p) && !bridgeOpen(state, b)
    );
    const reason = blocker
      ? `${titleCase(blocker.id)} is still on this path`
      : bridge
        ? `${bridge.symbol} bridge is folded`
        : !board.paths.some((t) => samePoint(t, p))
          ? 'Solid forest blocks this path'
          : undefined;
    if (reason)
      return {
        legal: false,
        path,
        obstacle: {
          at: p,
          reason,
          kind: blocker ? 'animal' : bridge ? 'bridge' : 'terrain',
        },
      };
    path.push(p);
    p = { x: p.x + dx, y: p.y + dy };
  }
  return { legal: true, path };
}
export function move(board: Board, state: State, id: AnimalId): State {
  if (!trace(board, state, id).legal) throw new Error(`Illegal move: ${id}`);
  return { home: [...state.home, id] };
}
export const won = (board: Board, state: State): boolean =>
  state.home.length === board.animals.length;
export function solve(
  board: Board,
  state: State = initialState()
): AnimalId[][] {
  if (won(board, state)) return [[]];
  return board.animals.flatMap(({ id }) =>
    trace(board, state, id).legal
      ? solve(board, move(board, state, id)).map((suffix) => [id, ...suffix])
      : []
  );
}
export function replay(board: Board, sequence: readonly AnimalId[]): State {
  return sequence.reduce((state, id) => move(board, state, id), initialState());
}
export function validateSolution(
  board: Board,
  input: unknown
): input is AnimalId[] {
  if (
    !Array.isArray(input) ||
    input.length !== board.animals.length ||
    !input.every(isAnimalId)
  )
    return false;
  try {
    return won(board, replay(board, input));
  } catch {
    return false;
  }
}
export class Session {
  board: Board;
  state: State = initialState();
  history: State[] = [];
  undos = 0;
  constructor(board: Board) {
    this.board = board;
  }
  send(id: AnimalId): void {
    const next = move(this.board, this.state, id);
    this.history.push(this.state);
    this.state = next;
  }
  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.state = previous;
    this.undos++;
    return true;
  }
  restart(): void {
    this.state = initialState();
    this.history = [];
    this.undos = 0;
  }
}
