import { context, getShareData } from '@devvit/web/client';
import { isObject } from '../shared/daily';
import { challengeCode } from '../shared/friend-challenge';

const keyFor = (post: string) => `loo-challenge-link:${post}`;

export function readChallengeLink(view: 'feed' | 'game'): string | undefined {
  let post: string | undefined;
  let code: unknown;
  try {
    post = context.postId;
    const raw = getShareData();
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (isObject(data) && data.type === 'friend-rescue') code = data.code;
  } catch {
    // No Reddit context in local previews.
  }
  try {
    if (post) {
      const key = keyFor(post);
      if (challengeCode(code)) sessionStorage.setItem(key, code);
      if (view === 'game' && !challengeCode(code))
        code = sessionStorage.getItem(key);
    }
  } catch {
    // The native share data still works when storage is unavailable.
  }
  return challengeCode(code) ? code : undefined;
}

export function clearChallengeLink(): void {
  try {
    if (context.postId) sessionStorage.removeItem(keyFor(context.postId));
  } catch {
    // Accepted challenges can also be restored by account on the server.
  }
}
