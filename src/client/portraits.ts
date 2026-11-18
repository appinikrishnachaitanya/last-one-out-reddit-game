import type { AnimalId } from '../shared/engine';
export function portrait(id: AnimalId): string {
  const positions = {
    turtle: [0, 0],
    rabbit: [-100, 0],
    fox: [0, -100],
    badger: [-100, -100],
  };
  const p = positions[id];
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${id} by a lantern"><defs><clipPath id="portrait-clip"><circle cx="50" cy="50" r="49"/></clipPath></defs><circle cx="50" cy="50" r="49" fill="#e4cfa2"/><g clip-path="url(#portrait-clip)"><image href="/art/animals.webp" x="${p[0]}" y="${p[1]}" width="200" height="200" preserveAspectRatio="none"/></g></svg>`;
}
