import { Session, isAnimalId } from '../shared/engine.ts';
import type { Board } from '../shared/engine.ts';
import type { Edition } from '../shared/daily.ts';
import { isObject } from '../shared/daily.ts';
export function serializeDraft(edition: Edition, session: Session): string {
  return JSON.stringify({
    editionId: edition.id,
    puzzleId: session.board.id,
    boardVersion: session.board.version,
    sequence: session.state.home,
    undos: session.undos,
  });
}
export function restoreDraft(
  edition: Edition,
  board: Board,
  raw: string | null
): Session | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !isObject(data) ||
      data.editionId !== edition.id ||
      data.puzzleId !== board.id ||
      data.boardVersion !== board.version ||
      !Array.isArray(data.sequence) ||
      data.sequence.length > board.animals.length ||
      !data.sequence.every(isAnimalId) ||
      typeof data.undos !== 'number' ||
      !Number.isSafeInteger(data.undos) ||
      data.undos < 0
    )
      return null;
    const session = new Session(board);
    for (const id of data.sequence) session.send(id);
    session.undos = data.undos;
    return session;
  } catch {
    return null;
  }
}
