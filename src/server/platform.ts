import { context, reddit, redis } from '@devvit/web/server';
import { isT3 } from '@devvit/web/shared';
import type { Edition } from '../shared/daily';
import { bindingFor, editionFromPost } from './core/schedule';
import { createOrRetrievePost, recoverPost } from './core/posts';
export async function requireModerator(): Promise<void> {
  if (!context.userId || !context.username)
    throw new Error('Sign in as a moderator to manage daily posts');
  const mods = await reddit
    .getModerators({
      subredditName: context.subredditName,
      username: context.username,
    })
    .all();
  const authorized = mods.some(
    (mod) =>
      mod.id === context.userId &&
      (mod.moderatorInfo.modPermissions.includes('all') ||
        mod.moderatorInfo.modPermissions.includes('posts'))
  );
  if (!authorized) throw new Error('Moderator post permissions are required');
  const info = await reddit.getSubredditInfoByName(context.subredditName);
  const smallPublicTest =
    info.type === 'public' &&
    typeof info.subscribersCount === 'number' &&
    info.subscribersCount < 200;
  if (info.type !== 'private' && !smallPublicTest)
    throw new Error(
      'Use a private or under-200-member public playtest community'
    );
}
export async function readBoundPost(postId: string): Promise<unknown> {
  if (!isT3(postId)) throw new Error('Invalid Reddit post ID');
  const post = await reddit.getPostById(postId);
  if (
    post.subredditName.toLowerCase() !== context.subredditName.toLowerCase() ||
    post.authorName.toLowerCase() !== context.appSlug.toLowerCase()
  )
    throw new Error('This is not a puzzle post from this app and community');
  return post.getPostData();
}
export async function createPost(edition: Edition): Promise<string> {
  return createOrRetrievePost(redis, edition, async () => {
    const post = await reddit.submitCustomPost({
      entry: 'splash',
      title: `Last One Out · Day ${edition.number} · ${edition.date}`,
      postData: bindingFor(edition),
      textFallback: {
        text: 'Send everyone home. Some animals are holding the bridges open. Open this post in the Reddit app or on reddit.com to play.',
      },
    });
    return post.id;
  });
}
export async function recoverEditionPost(postId: string): Promise<string> {
  const edition = editionFromPost(await readBoundPost(postId));
  return recoverPost(redis, edition, postId);
}
