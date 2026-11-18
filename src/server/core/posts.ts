import type { Edition } from '../../shared/daily.ts';
import type { CompletionStore } from './completions.ts';
export const postRegistryKey = (edition: Edition) =>
  `edition-post:v1:${edition.id}`;
export async function createOrRetrievePost(
  store: CompletionStore,
  edition: Edition,
  submit: () => Promise<string>
): Promise<string> {
  const key = postRegistryKey(edition),
    existing = await store.hGet(key, 'post');
  if (existing) return existing;
  // A durable reservation deliberately has no expiring lease: a timed-out Reddit submission may still succeed.
  if (
    (await store.hSetNX(key, 'reservation', new Date().toISOString())) !== 1
  ) {
    const finished = await store.hGet(key, 'post');
    if (finished) return finished;
    throw new Error(
      'Creation is pending or needs recovery. Check the community, then use “Recover edition post” with its existing post ID.'
    );
  }
  let postId: string | undefined;
  try {
    postId = await submit();
    await store.hSetNX(key, 'post', postId);
    return (await store.hGet(key, 'post')) ?? postId;
  } catch {
    throw new Error(
      postId
        ? `Post ${postId} was created, but registration was interrupted. Use “Recover edition post” with ${postId}.`
        : 'Post creation could not be confirmed. Check the community before retrying. If a post exists, use “Recover edition post” with its ID; the reservation prevents duplicates.'
    );
  }
}
export async function recoverPost(
  store: CompletionStore,
  edition: Edition,
  postId: string
): Promise<string> {
  // Callers must verify moderator authorization, app authorship, community, and the post's exact binding first.
  await store.hSetNX(postRegistryKey(edition), 'post', postId);
  return (await store.hGet(postRegistryKey(edition), 'post')) ?? postId;
}
