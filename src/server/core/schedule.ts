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
  {
    id: 'loo-2026-11-25',
    number: 8,
    date: '2026-11-25',
    puzzleId: 'confluence-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-26',
    number: 9,
    date: '2026-11-26',
    puzzleId: 'last-light-v1',
    boardVersion: 1,
  },
  {
    id: 'loo-2026-11-27',
    number: 10,
    date: '2026-11-27',
    puzzleId: 'hushwater-v1',
    boardVersion: 1,
  },
];
const dayMs = 86_400_000;
const rotationStart = Date.parse('2026-11-28T00:00:00Z');
// This order is permanent. Future curated boards can be introduced by
// explicitly versioning a later rotation era, never by editing this pool.
const rotation = EDITIONS.slice();
export function editionAt(date: Date): Edition | undefined {
  const iso = date.toISOString().slice(0, 10);
  const original = EDITIONS.find((e) => e.date === iso);
  if (original) return original;
  const offset = Math.floor((date.getTime() - rotationStart) / dayMs);
  if (offset < 0) return undefined;
  const board = rotation[offset % rotation.length]!;
  return { ...board, id: `loo-${iso}`, date: iso, number: 11 + offset };
}
export function editionById(id: string): Edition {
  if (!/^loo-\d{4}-\d{2}-\d{2}$/.test(id))
    throw new Error('Invalid edition ID');
  const date = new Date(`${id.slice(4)}T00:00:00Z`);
  const edition = Number.isFinite(date.getTime()) ? editionAt(date) : undefined;
  if (edition?.id !== id)
    throw new Error('No edition is scheduled for this ID');
  return edition;
}
export function recentEditions(now: Date): Edition[] {
  return Array.from({ length: 30 }, (_, i) =>
    editionAt(new Date(now.getTime() - i * dayMs))
  ).filter((edition): edition is Edition => !!edition);
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
