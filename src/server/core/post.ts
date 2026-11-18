import { reddit } from '@devvit/web/server';
export const createPost = async () =>
  reddit.submitCustomPost({
    title: 'Last One Out · Moonroot Crossing',
    postData: { boardId: 'moonroot-v1', boardVersion: 1 },
    textFallback: {
      text: 'Send everyone home. Some animals are holding the bridges open. Open this post in the Reddit app or on reddit.com to play Moonroot Crossing.',
    },
  });
