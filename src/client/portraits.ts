import type { CompanionId } from '../shared/companion';
export const portraitOffsets = {
  turtle: [0, 0],
  rabbit: [-100, 0],
  fox: [0, -100],
  badger: [-100, -100],
  owl: [0, 0],
  deer: [-100, 0],
  panda: [0, -100],
  otter: [-100, -100],
} as const;
export function portrait(id: CompanionId, scarf?: string): string {
  const p = portraitOffsets[id];
  const source = ['owl', 'deer', 'panda', 'otter'].includes(id)
    ? '/art/companion-unlocks.webp'
    : '/art/animals.webp';
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${id} by a lantern"><defs><clipPath id="portrait-clip"><circle cx="50" cy="50" r="49"/></clipPath></defs><circle cx="50" cy="50" r="49" fill="#e4cfa2"/><g clip-path="url(#portrait-clip)"><image href="${source}" x="${p[0]}" y="${p[1]}" width="200" height="200" preserveAspectRatio="none"/>${scarf ? `<path fill="${scarf}" d="M30 78h40a4 4 0 0 1 0 8h-3v10h-8V86H30a4 4 0 0 1 0-8"/>` : ''}</g></svg>`;
}
