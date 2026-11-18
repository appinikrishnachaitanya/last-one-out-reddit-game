import type { Animal, Board, Bridge, Point } from './engine.ts';
function crossing(
  id: string,
  title: string,
  subtitle: string,
  animals: Animal[],
  bridges: Bridge[]
): Board {
  const points = new Map<string, Point>();
  for (const animal of animals) {
    const vectors = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    const v = vectors[animal.direction];
    let x = animal.x,
      y = animal.y;
    while (x >= 0 && y >= 0 && x < 7 && y < 7) {
      points.set(`${x},${y}`, { x, y });
      x += v[0] ?? 0;
      y += v[1] ?? 0;
    }
  }
  return {
    id,
    version: 1,
    title,
    subtitle,
    size: 7,
    animals,
    bridges,
    paths: [...points.values()],
  };
}
export const MOONROOT = crossing(
  'moonroot-v1',
  'Moonroot Crossing',
  'Some animals are holding the bridges open.',
  [
    { id: 'turtle', x: 1, y: 1, direction: 'W' },
    { id: 'rabbit', x: 4, y: 1, direction: 'S' },
    { id: 'fox', x: 2, y: 4, direction: 'E' },
    { id: 'badger', x: 2, y: 1, direction: 'S' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 4, y: 2, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 3, y: 4, holder: 'rabbit' },
  ]
);
