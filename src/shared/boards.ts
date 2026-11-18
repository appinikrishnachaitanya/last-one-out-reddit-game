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

export const WILLOW = crossing(
  'willow-v1',
  'Willow Weave',
  'Make a little room for each other.',
  [
    { id: 'turtle', x: 1, y: 5, direction: 'E' },
    { id: 'rabbit', x: 5, y: 1, direction: 'S' },
    { id: 'fox', x: 3, y: 2, direction: 'S' },
    { id: 'badger', x: 1, y: 2, direction: 'E' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 4, y: 2, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 3, y: 4, holder: 'badger' },
  ]
);
export const LANTERN = crossing(
  'lantern-v1',
  'Lantern Fork',
  'An open path is only the beginning.',
  [
    { id: 'turtle', x: 1, y: 1, direction: 'E' },
    { id: 'rabbit', x: 3, y: 5, direction: 'N' },
    { id: 'fox', x: 2, y: 3, direction: 'E' },
    { id: 'badger', x: 5, y: 1, direction: 'S' },
  ],
  [
    { id: 'star', symbol: '✦', x: 3, y: 3, holder: 'turtle' },
    { id: 'moon', symbol: '☾', x: 3, y: 2, holder: 'fox' },
  ]
);
export const REEDLIGHT = crossing(
  'reedlight-v1',
  'Reedlight Relay',
  'Leave a lantern for the next friend.',
  [
    { id: 'turtle', x: 1, y: 5, direction: 'N' },
    { id: 'rabbit', x: 4, y: 5, direction: 'N' },
    { id: 'fox', x: 1, y: 2, direction: 'E' },
    { id: 'badger', x: 5, y: 5, direction: 'N' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 4, y: 3, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 3, y: 2, holder: 'rabbit' },
    { id: 'leaf', symbol: '◆', x: 5, y: 4, holder: 'fox' },
  ]
);
export const TWINBANK = crossing(
  'twinbank-v1',
  'Twinbank Lanterns',
  'One friend can hold more than one crossing.',
  [
    { id: 'turtle', x: 5, y: 5, direction: 'E' },
    { id: 'rabbit', x: 2, y: 5, direction: 'N' },
    { id: 'fox', x: 4, y: 4, direction: 'N' },
    { id: 'badger', x: 1, y: 4, direction: 'E' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 2, y: 4, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 4, y: 2, holder: 'turtle' },
  ]
);
export const ALDER = crossing(
  'alder-v1',
  'Alder Passage',
  'Make room, one friend at a time.',
  [
    { id: 'turtle', x: 2, y: 1, direction: 'S' },
    { id: 'rabbit', x: 2, y: 3, direction: 'E' },
    { id: 'fox', x: 5, y: 3, direction: 'N' },
    { id: 'badger', x: 5, y: 1, direction: 'E' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 5, y: 2, holder: 'rabbit' },
    { id: 'star', symbol: '✦', x: 3, y: 3, holder: 'turtle' },
  ]
);
export const FIREFLY = crossing(
  'firefly-v1',
  'Firefly Commons',
  'Two crossings, many ways to be kind.',
  [
    { id: 'turtle', x: 1, y: 1, direction: 'W' },
    { id: 'rabbit', x: 4, y: 1, direction: 'S' },
    { id: 'fox', x: 1, y: 5, direction: 'W' },
    { id: 'badger', x: 5, y: 5, direction: 'N' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 4, y: 2, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 5, y: 3, holder: 'fox' },
  ]
);
export const BOARDS: readonly Board[] = [
  MOONROOT,
  WILLOW,
  LANTERN,
  REEDLIGHT,
  TWINBANK,
  ALDER,
  FIREFLY,
];
export function boardById(id: string, version: number): Board {
  const board = BOARDS.find((b) => b.id === id && b.version === version);
  if (!board) throw new Error('This puzzle version is unavailable');
  return board;
}
