import { boardById } from '../../shared/boards.ts';
import { isAnimalId, validateSolution } from '../../shared/engine.ts';
import { isObject, parseCompletion } from '../../shared/daily.ts';
import type { Completion, Community, Edition } from '../../shared/daily.ts';
export type CompletionStore = {
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
};
export const completionKey = (edition: Edition) =>
  `rescues:v1:${edition.id}:${edition.puzzleId}:${edition.boardVersion}`;
export async function loadCompletion(
  store: CompletionStore,
  edition: Edition,
  userId: string
): Promise<Completion | null> {
  const raw = await store.hGet(completionKey(edition), userId);
  return raw ? parseCompletion(JSON.parse(raw), edition) : null;
}
export async function community(
  store: CompletionStore,
  edition: Edition
): Promise<Community> {
  const rows = await store.hGetAll(completionKey(edition));
  const openings: Community['openings'] = {};
  let total = 0;
  for (const raw of Object.values(rows)) {
    const record = parseCompletion(JSON.parse(raw), edition);
    total++;
    openings[record.opening] = (openings[record.opening] ?? 0) + 1;
  }
  return { total, openings };
}
export async function complete(
  store: CompletionStore,
  edition: Edition,
  userId: string,
  input: unknown,
  now: Date
): Promise<{
  validated: true;
  firstCompletion: boolean;
  completion: Completion;
  community: Community;
}> {
  if (!userId) throw new Error('Sign in to Reddit to save your rescue');
  if (
    !isObject(input) ||
    input.editionId !== edition.id ||
    input.puzzleId !== edition.puzzleId ||
    input.boardVersion !== edition.boardVersion
  )
    throw new Error('Wrong edition or board version. Reopen this daily post.');
  if (
    !validateSolution(
      boardById(edition.puzzleId, edition.boardVersion),
      input.sequence
    )
  )
    throw new Error('The rescue sequence is illegal, incomplete, or malformed');
  if (
    typeof input.personalUndos !== 'number' ||
    !Number.isSafeInteger(input.personalUndos) ||
    input.personalUndos < 0 ||
    input.personalUndos > 1_000_000 ||
    !isAnimalId(input.favorite)
  )
    throw new Error('Invalid personal result');
  const opening = input.sequence[0];
  if (!opening) throw new Error('Missing opening');
  const record: Completion = {
    editionId: edition.id,
    puzzleId: edition.puzzleId,
    boardVersion: edition.boardVersion,
    sequence: [...input.sequence],
    opening,
    personalUndos: input.personalUndos,
    favorite: input.favorite,
    completedAt: now.toISOString(),
  };
  // One atomic record is also the community contribution. No separate increment can double-count or get lost.
  const firstCompletion =
    (await store.hSetNX(
      completionKey(edition),
      userId,
      JSON.stringify(record)
    )) === 1;
  const saved = await loadCompletion(store, edition, userId);
  if (!saved) throw new Error('Rescue was not confirmed. Please retry.');
  return {
    validated: true,
    firstCompletion,
    completion: saved,
    community: await community(store, edition),
  };
}
