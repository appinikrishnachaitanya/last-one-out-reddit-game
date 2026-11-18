import type { AnimalId } from '../shared/engine';
// These portraits are card art, independent of puzzle position/order. All strings are fixed SVG markup.
export function portrait(id: AnimalId): string {
  const faces = {
    turtle:
      '<ellipse cx="50" cy="53" rx="29" ry="24" fill="#5d8769" stroke="#b8cf98" stroke-width="3"/><path d="M33 39L65 39L50 68Z" fill="none" stroke="#b8cf98" stroke-width="2"/><ellipse cx="20" cy="53" rx="12" ry="10" fill="#a5c896"/><circle cx="16" cy="50" r="2" fill="#142d30"/><ellipse cx="37" cy="78" rx="8" ry="4" fill="#a5c896"/><ellipse cx="66" cy="78" rx="8" ry="4" fill="#a5c896"/>',
    rabbit:
      '<ellipse cx="35" cy="23" rx="8" ry="21" fill="#e4d3bd"/><ellipse cx="62" cy="23" rx="8" ry="21" fill="#e4d3bd"/><ellipse cx="35" cy="21" rx="3" ry="14" fill="#c89689"/><ellipse cx="62" cy="21" rx="3" ry="14" fill="#c89689"/><ellipse cx="49" cy="58" rx="27" ry="26" fill="#e4d3bd"/><circle cx="39" cy="54" r="3"/><circle cx="59" cy="54" r="3"/><path d="M45 65L53 65L49 70Z" fill="#b67f78"/>',
    fox: '<path d="M20 45L20 13L43 32M80 45L80 13L57 32" fill="#d79268"/><path d="M24 33L24 20L35 34M76 33L76 20L65 34" fill="#4d4540"/><path d="M16 37Q50 21 84 37L50 88Z" fill="#d79268"/><path d="M22 55L50 67L50 82M78 55L50 67L50 82" fill="#f0ddbc"/><circle cx="37" cy="49" r="3"/><circle cx="63" cy="49" r="3"/><path d="M45 70L55 70L50 77Z" fill="#213839"/>',
    badger:
      '<circle cx="28" cy="31" r="10" fill="#526567"/><circle cx="72" cy="31" r="10" fill="#526567"/><ellipse cx="50" cy="57" rx="30" ry="30" fill="#d4d7c8"/><ellipse cx="34" cy="53" rx="8" ry="25" fill="#364c50"/><ellipse cx="66" cy="53" rx="8" ry="25" fill="#364c50"/><ellipse cx="50" cy="72" rx="13" ry="12" fill="#e5dfc9"/><circle cx="36" cy="52" r="3" fill="#111f23"/><circle cx="64" cy="52" r="3" fill="#111f23"/><path d="M45 70L55 70L50 77Z" fill="#213839"/>',
  };
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${id} by a lantern"><circle cx="50" cy="50" r="48" fill="#23443e"/>${faces[id]}<rect x="82" y="66" width="10" height="14" rx="2" fill="#f3cd86"/><path d="M82 65Q87 56 92 65" fill="none" stroke="#ba9d68" stroke-width="2"/></svg>`;
}
