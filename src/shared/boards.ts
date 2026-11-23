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
export const CONFLUENCE = crossing(
  'confluence-v1',
  'Foxglove Confluence',
  'Two paths meet at one bridge.',
  [
    { id: 'turtle', x: 1, y: 3, direction: 'E' },
    { id: 'rabbit', x: 3, y: 1, direction: 'S' },
    { id: 'fox', x: 1, y: 5, direction: 'W' },
    { id: 'badger', x: 5, y: 3, direction: 'N' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 3, y: 3, holder: 'fox' },
    { id: 'leaf', symbol: '◆', x: 5, y: 2, holder: 'rabbit' },
  ]
);

export const LAST_LIGHT = crossing(
  'last-light-v1',
  'Last Light',
  'A keeper might need its own bridge.',
  [
    { id: 'turtle', x: 1, y: 3, direction: 'E' },
    { id: 'rabbit', x: 3, y: 1, direction: 'S' },
    { id: 'fox', x: 5, y: 3, direction: 'N' },
    { id: 'badger', x: 1, y: 5, direction: 'W' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 3, y: 3, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 3, y: 4, holder: 'badger' },
  ]
);

export const HUSHWATER = crossing(
  'hushwater-v1',
  'Hushwater Turn',
  'The first move can change what looks safe.',
  [
    { id: 'turtle', x: 1, y: 3, direction: 'E' },
    { id: 'rabbit', x: 3, y: 1, direction: 'S' },
    { id: 'fox', x: 4, y: 3, direction: 'N' },
    { id: 'badger', x: 4, y: 5, direction: 'E' },
  ],
  [
    { id: 'moon', symbol: '☾', x: 3, y: 4, holder: 'turtle' },
    { id: 'star', symbol: '✦', x: 5, y: 5, holder: 'rabbit' },
  ]
);

type ChallengeLayout = [
  string,
  [number, number, Animal['direction']][],
  [number, number, Animal['id']][],
];

// Each fixed layout has one complete rescue order and traps both on the
// opening and after the first correct move. The daily schedule only shuffles IDs.
const challengeLayouts: ChallengeLayout[] = [
  [
    'Moth Hollow',
    [
      [2, 3, 'W'],
      [3, 1, 'N'],
      [1, 2, 'E'],
      [5, 3, 'W'],
    ],
    [
      [2, 2, 'rabbit'],
      [0, 3, 'rabbit'],
      [6, 2, 'turtle'],
    ],
  ],
  [
    'Bracken Lock',
    [
      [1, 1, 'S'],
      [2, 2, 'S'],
      [3, 1, 'S'],
      [5, 2, 'S'],
    ],
    [
      [5, 6, 'fox'],
      [3, 3, 'turtle'],
      [2, 5, 'badger'],
    ],
  ],
  [
    'Stillwater Switch',
    [
      [3, 3, 'S'],
      [2, 3, 'E'],
      [5, 5, 'S'],
      [3, 2, 'W'],
    ],
    [
      [3, 6, 'rabbit'],
      [0, 2, 'fox'],
      [5, 6, 'turtle'],
    ],
  ],
  [
    'Three Lanterns',
    [
      [1, 2, 'W'],
      [3, 4, 'W'],
      [4, 2, 'N'],
      [3, 2, 'E'],
    ],
    [
      [0, 2, 'fox'],
      [4, 0, 'rabbit'],
      [1, 4, 'badger'],
    ],
  ],
  [
    'Owl Gate',
    [
      [3, 1, 'E'],
      [1, 1, 'S'],
      [2, 5, 'S'],
      [3, 5, 'N'],
    ],
    [
      [2, 6, 'rabbit'],
      [1, 3, 'badger'],
      [1, 2, 'turtle'],
    ],
  ],
  [
    'Hazel Weir',
    [
      [1, 4, 'N'],
      [4, 1, 'W'],
      [5, 5, 'S'],
      [1, 5, 'N'],
    ],
    [
      [3, 1, 'fox'],
      [0, 1, 'turtle'],
      [1, 3, 'fox'],
    ],
  ],
  [
    'Fernfall Narrows',
    [
      [4, 3, 'S'],
      [1, 1, 'S'],
      [2, 5, 'S'],
      [1, 2, 'S'],
    ],
    [
      [1, 6, 'turtle'],
      [1, 3, 'fox'],
      [2, 6, 'turtle'],
    ],
  ],
  [
    'Slate Ferry',
    [
      [4, 4, 'E'],
      [1, 3, 'S'],
      [3, 4, 'N'],
      [5, 1, 'N'],
    ],
    [
      [1, 5, 'fox'],
      [5, 0, 'rabbit'],
      [3, 3, 'turtle'],
    ],
  ],
  [
    'Copper Brook',
    [
      [1, 3, 'S'],
      [1, 1, 'W'],
      [2, 3, 'N'],
      [2, 5, 'S'],
    ],
    [
      [0, 1, 'turtle'],
      [2, 6, 'fox'],
      [2, 1, 'rabbit'],
    ],
  ],
  [
    'Wildmint Run',
    [
      [1, 2, 'S'],
      [4, 5, 'E'],
      [1, 1, 'S'],
      [2, 4, 'S'],
    ],
    [
      [2, 6, 'rabbit'],
      [1, 6, 'badger'],
      [1, 3, 'rabbit'],
    ],
  ],
  [
    'Mossglass Ford',
    [
      [2, 5, 'S'],
      [4, 3, 'N'],
      [2, 3, 'S'],
      [2, 4, 'W'],
    ],
    [
      [4, 1, 'badger'],
      [4, 0, 'badger'],
      [0, 4, 'turtle'],
    ],
  ],
  [
    'Juniper Locks',
    [
      [1, 1, 'S'],
      [5, 1, 'N'],
      [2, 4, 'W'],
      [3, 1, 'E'],
    ],
    [
      [5, 0, 'turtle'],
      [1, 4, 'badger'],
      [1, 3, 'fox'],
    ],
  ],
  [
    'Cloudberry Creek',
    [
      [4, 3, 'S'],
      [5, 4, 'E'],
      [1, 3, 'S'],
      [5, 2, 'N'],
    ],
    [
      [5, 1, 'turtle'],
      [6, 4, 'fox'],
      [1, 5, 'badger'],
    ],
  ],
  [
    'Emberbank Tangle',
    [
      [4, 3, 'E'],
      [2, 5, 'E'],
      [3, 3, 'N'],
      [1, 1, 'N'],
    ],
    [
      [4, 5, 'fox'],
      [1, 0, 'rabbit'],
      [5, 3, 'badger'],
    ],
  ],
  [
    'Echo Pools',
    [
      [3, 1, 'E'],
      [1, 4, 'S'],
      [2, 4, 'S'],
      [4, 1, 'S'],
    ],
    [
      [1, 6, 'badger'],
      [5, 1, 'fox'],
      [4, 6, 'turtle'],
    ],
  ],
  [
    'Wren’s Passage',
    [
      [5, 3, 'N'],
      [5, 1, 'W'],
      [1, 5, 'E'],
      [1, 3, 'W'],
    ],
    [
      [5, 2, 'badger'],
      [2, 5, 'rabbit'],
      [4, 5, 'turtle'],
    ],
  ],
  [
    'Alderlock Crossing',
    [
      [1, 3, 'E'],
      [5, 2, 'S'],
      [5, 1, 'W'],
      [1, 4, 'S'],
    ],
    [
      [4, 3, 'fox'],
      [5, 6, 'turtle'],
      [1, 6, 'rabbit'],
    ],
  ],
  [
    'Thistle Run',
    [
      [3, 4, 'E'],
      [1, 3, 'N'],
      [2, 4, 'N'],
      [1, 2, 'E'],
    ],
    [
      [2, 0, 'turtle'],
      [5, 2, 'rabbit'],
      [5, 4, 'badger'],
    ],
  ],
  [
    'Willowglass Bend',
    [
      [4, 5, 'S'],
      [5, 4, 'E'],
      [3, 5, 'W'],
      [3, 1, 'E'],
    ],
    [
      [2, 5, 'rabbit'],
      [6, 1, 'fox'],
      [4, 6, 'badger'],
    ],
  ],
  [
    'Hearthwater Gate',
    [
      [4, 1, 'W'],
      [1, 2, 'E'],
      [2, 3, 'E'],
      [1, 5, 'N'],
    ],
    [
      [1, 4, 'fox'],
      [2, 1, 'rabbit'],
      [3, 1, 'rabbit'],
    ],
  ],
  [
    'Moonlit Last Call',
    [
      [4, 3, 'S'],
      [1, 1, 'W'],
      [2, 1, 'W'],
      [5, 4, 'W'],
    ],
    [
      [4, 5, 'fox'],
      [4, 6, 'rabbit'],
      [0, 1, 'badger'],
    ],
  ],
];
const challengeAnimals = ['turtle', 'rabbit', 'fox', 'badger'] as const;
const challengeBridgeIds = ['moon', 'star', 'leaf'] as const;
const challengeBridgeMarks = ['☾', '✦', '◆'] as const;
export const CHALLENGES: readonly Board[] = challengeLayouts.map(
  ([title, animals, bridges], index) =>
    crossing(
      `challenge-${String(index + 1).padStart(2, '0')}-v1`,
      title,
      'Several ways out. One order gets everyone home.',
      animals.map(([x, y, direction], i) => ({
        id: challengeAnimals[i]!,
        x,
        y,
        direction,
      })),
      bridges.map(([x, y, holder], i) => ({
        id: challengeBridgeIds[i]!,
        symbol: challengeBridgeMarks[i]!,
        x,
        y,
        holder,
      }))
    )
);

export const BOARDS: readonly Board[] = [
  MOONROOT,
  WILLOW,
  LANTERN,
  REEDLIGHT,
  TWINBANK,
  ALDER,
  FIREFLY,
  CONFLUENCE,
  LAST_LIGHT,
  HUSHWATER,
  ...CHALLENGES,
];
export function boardById(id: string, version: number): Board {
  const board = BOARDS.find((b) => b.id === id && b.version === version);
  if (!board) throw new Error('This puzzle version is unavailable');
  return board;
}
