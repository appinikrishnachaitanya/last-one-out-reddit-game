import type { Edition } from '../../shared/daily.ts';
import { isObject } from '../../shared/daily.ts';
// Published entries and board versions are immutable. Add new dated editions; never rotate by array index.
export const EDITIONS: readonly Edition[] = [
  {
    id: 'loo-2026-11-18',
    number: 1,
    date: '2026-11-18',
    puzzleId: 'moonroot-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-19',
    number: 2,
    date: '2026-11-19',
    puzzleId: 'willow-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-20',
    number: 3,
    date: '2026-11-20',
    puzzleId: 'lantern-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-21',
    number: 4,
    date: '2026-11-21',
    puzzleId: 'reedlight-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-22',
    number: 5,
    date: '2026-11-22',
    puzzleId: 'twinbank-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-23',
    number: 6,
    date: '2026-11-23',
    puzzleId: 'alder-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-24',
    number: 7,
    date: '2026-11-24',
    puzzleId: 'firefly-v1',
    boardVersion: 1,
  },
];
export const editionAt = (date: Date): Edition | undefined =>
  EDITIONS.find((e) => e.date === date.toISOString().slice(0, 10));
export function editionById(id: string): Edition {
  const edition = EDITIONS.find((e) => e.id === id);
  if (!edition) throw new Error('No edition is scheduled for this ID');
  return edition;
}
export const bindingFor = (edition: Edition) => ({
  editionId: edition.id,
  puzzleId: edition.puzzleId,
  boardVersion: edition.boardVersion,
  date: edition.date,
});
export function editionFromPost(data: unknown): Edition {
  if (!isObject(data)) throw new Error('This post has no puzzle binding');
  // Preserve any posts made by Milestone 1, regardless of the current date.
  if (
    data.editionId === undefined &&
    data.boardId === 'moonroot-v1' &&
    data.boardVersion === 1
  )
    return editionById('loo-2026-11-18');
  if (typeof data.editionId !== 'string')
    throw new Error('This post has no edition');
  const edition = editionById(data.editionId);
  if (
    data.puzzleId !== edition.puzzleId ||
    data.boardVersion !== edition.boardVersion ||
    data.date !== edition.date
  )
    throw new Error(
      'This post’s puzzle version does not match its published edition'
    );
  return edition;
}
