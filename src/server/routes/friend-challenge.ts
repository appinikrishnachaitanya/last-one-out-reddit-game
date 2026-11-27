import { createHmac, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Dependencies, GameContext } from '../app.ts';
import { editionAt, editionById, editionFromPost } from '../core/schedule.ts';
import { loadCompletion } from '../core/completions.ts';
import { isObject, rescueAssists } from '../../shared/daily.ts';
import type { Completion, Edition } from '../../shared/daily.ts';
import { challengeCode, redditName } from '../../shared/friend-challenge.ts';
import type { FriendChallengeView } from '../../shared/friend-challenge.ts';

type Player = { id: string; name: string };
type Invite = {
  code: string;
  host: Player;
  target: Player | null;
  rematch: boolean;
};
class ChallengeError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409;
  constructor(message: string, status: ChallengeError['status']) {
    super(message);
    this.status = status;
  }
}
const editionKey = (edition: Edition) =>
  `friend-challenges:v1:${edition.id}:${edition.puzzleId}:${edition.boardVersion}`;
const isPlayer = (value: unknown): value is Player =>
  isObject(value) &&
  typeof value.id === 'string' &&
  /^t2_[a-z0-9]+$/.test(value.id) &&
  redditName(value.name);
const asPlayer = (viewer: GameContext): Player | undefined => {
  const player = { id: viewer.userId, name: viewer.username };
  return isPlayer(player) ? player : undefined;
};
function parseInvite(raw: string, code: string): Invite {
  const value: unknown = JSON.parse(raw);
  if (
    !isObject(value) ||
    !isPlayer(value.host) ||
    !(value.target === null || isPlayer(value.target)) ||
    typeof value.rematch !== 'boolean'
  )
    throw new Error('Invalid stored challenge');
  return {
    code,
    host: value.host,
    target: value.target,
    rematch: value.rematch,
  };
}
const trail = (run: Completion) => ({
  undos: run.personalUndos,
  hint: run.hintUsed === true,
  firstChoice: run.firstMove ?? run.openingTrap ?? run.opening,
  trail: [...run.sequence],
});

export function friendChallengeRoutes(deps: Dependencies) {
  const routes = new Hono();
  const { store } = deps;
  async function request(c: Context) {
    if (deps.mode !== 'reddit')
      throw new ChallengeError(
        'Open the Reddit daily to challenge a friend.',
        404
      );
    const viewer = await deps.getContext(c);
    if (!viewer.postId)
      throw new ChallengeError(
        'Open the Reddit daily to challenge a friend.',
        404
      );
    const edition = editionFromPost(await deps.readPost(viewer.postId));
    return { edition, viewer };
  }
  function failure(c: Context, error: unknown) {
    return error instanceof ChallengeError
      ? c.json({ error: error.message }, error.status)
      : c.json({ error: 'The challenge could not be loaded. Try again.' }, 503);
  }
  async function create(
    edition: Edition,
    host: Player,
    target: Player | null,
    rematch: boolean
  ) {
    const key = editionKey(edition);
    const secretKey = 'friend-challenges:v1:secret';
    let secret = await store.hGet(secretKey, 'key');
    if (!secret) {
      await store.hSetNX(secretKey, 'key', randomUUID());
      secret = await store.hGet(secretKey, 'key');
    }
    if (!secret) throw new Error('No challenge key');
    const pair = [host.id, target?.id ?? 'open'];
    const scope = rematch ? ['rematch', ...pair.sort()] : ['invite', ...pair];
    const code = createHmac('sha256', secret)
      .update([key, ...scope].join(':'))
      .digest('hex')
      .slice(0, 32);
    await store.hSetNX(
      key,
      `invite:${code}`,
      JSON.stringify({ host, target, rematch })
    );
    await store.hSet(key, {
      [`latest:${host.id}`]: code,
      ...(rematch && target ? { [`latest:${target.id}`]: code } : {}),
    });
    return code;
  }
  async function read(edition: Edition, code: string, viewer: GameContext) {
    const key = editionKey(edition);
    const raw = await store.hGet(key, `invite:${code}`);
    if (!raw)
      throw new ChallengeError(
        'This challenge is unavailable on this crossing.',
        404
      );
    const invite = parseInvite(raw, code);
    if (
      invite.target &&
      viewer.userId !== invite.host.id &&
      viewer.userId !== invite.target.id
    )
      throw new ChallengeError(
        'This challenge was addressed to another Reddit account.',
        403
      );
    const claim = invite.rematch
      ? null
      : await store.hGet(key, `guest:${code}`);
    const claimed: unknown = claim ? JSON.parse(claim) : null;
    const guest = invite.rematch
      ? invite.target
      : isPlayer(claimed)
        ? claimed
        : null;
    if (guest && viewer.userId !== invite.host.id && viewer.userId !== guest.id)
      throw new ChallengeError('This challenge already has a challenger.', 409);
    return { invite, guest };
  }
  async function view(
    edition: Edition,
    viewer: GameContext,
    invite: Invite,
    guest: Player | null
  ): Promise<FriendChallengeView> {
    const role =
      viewer.userId === invite.host.id
        ? 'host'
        : viewer.userId === guest?.id && guest
          ? 'guest'
          : 'visitor';
    const [hostRun, guestRun] = await Promise.all([
      loadCompletion(store, edition, invite.host.id),
      guest ? loadCompletion(store, edition, guest.id) : null,
    ]);
    const comparison =
      hostRun && guestRun
        ? { host: trail(hostRun), guest: trail(guestRun) }
        : null;
    const rematchDay = comparison
      ? await store.hGet(editionKey(edition), `scheduled:${invite.code}`)
      : undefined;
    return {
      code: invite.code,
      host: invite.host.name,
      guest:
        guest?.name ?? (role === 'host' ? invite.target?.name : null) ?? null,
      role,
      canJoin: role === 'visitor' && Boolean(asPlayer(viewer)) && !guest,
      joined: Boolean(guest),
      rematch: invite.rematch,
      target:
        !invite.rematch && hostRun
          ? rescueAssists(hostRun.personalUndos, hostRun.hintUsed)
          : null,
      comparison,
      rematchDay: rematchDay ? editionById(rematchDay).number : null,
    };
  }
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  routes.get('/', async (c) => {
    try {
      const { edition, viewer } = await request(c);
      const code =
        c.req.query('code') ??
        (viewer.userId
          ? await store.hGet(editionKey(edition), `latest:${viewer.userId}`)
          : undefined);
      if (code === undefined) return c.json(null);
      if (!challengeCode(code))
        throw new ChallengeError('That challenge link is invalid.', 400);
      const { invite, guest } = await read(edition, code, viewer);
      return c.json(await view(edition, viewer, invite, guest));
    } catch (error) {
      return failure(c, error);
    }
  });
  routes.post('/', async (c) => {
    try {
      const { edition, viewer } = await request(c);
      const host = asPlayer(viewer);
      if (!host)
        throw new ChallengeError('Sign in to Reddit to invite a friend.', 401);
      if (!(await loadCompletion(store, edition, host.id)))
        throw new ChallengeError(
          'Save your rescue before inviting a friend.',
          403
        );
      const body: unknown = await c.req.json().catch(() => null);
      if (
        !isObject(body) ||
        !(body.username === null || redditName(body.username))
      )
        throw new ChallengeError(
          'Enter a Reddit username or leave it blank.',
          400
        );
      let target: Player | null = null;
      if (body.username) {
        const found = await deps.findChallengePlayer?.(body.username);
        if (!isPlayer(found))
          throw new ChallengeError('We couldn’t find that Reddit player.', 404);
        if (found.id === host.id)
          throw new ChallengeError('Choose another Reddit player.', 400);
        target = found;
      }
      const code = await create(edition, host, target, false);
      const stored = await read(edition, code, viewer);
      return c.json(await view(edition, viewer, stored.invite, stored.guest));
    } catch (error) {
      return failure(c, error);
    }
  });
  routes.post('/:code/join', async (c) => {
    try {
      const { edition, viewer } = await request(c);
      const guest = asPlayer(viewer);
      if (!guest)
        throw new ChallengeError(
          'Sign in to Reddit to accept this challenge.',
          401
        );
      const code = c.req.param('code');
      if (!challengeCode(code))
        throw new ChallengeError('That challenge link is invalid.', 400);
      const stored = await read(edition, code, viewer);
      if (stored.invite.host.id === guest.id)
        throw new ChallengeError('Share this invite with another player.', 400);
      if (!stored.guest)
        await store.hSetNX(
          editionKey(edition),
          `guest:${code}`,
          JSON.stringify(guest)
        );
      const accepted = await read(edition, code, viewer);
      await store.hSet(editionKey(edition), { [`latest:${guest.id}`]: code });
      return c.json(
        await view(edition, viewer, accepted.invite, accepted.guest)
      );
    } catch (error) {
      return failure(c, error);
    }
  });
  routes.post('/:code/rematch', async (c) => {
    try {
      const { edition, viewer } = await request(c);
      const code = c.req.param('code');
      if (!challengeCode(code))
        throw new ChallengeError('That challenge link is invalid.', 400);
      const { invite, guest } = await read(edition, code, viewer);
      const challenge = await view(edition, viewer, invite, guest);
      if (!guest || !challenge.comparison)
        throw new ChallengeError('Both players need to finish first.', 403);
      if (challenge.rematchDay !== null)
        return c.json({ day: challenge.rematchDay });
      const now = deps.now().toISOString().slice(0, 10);
      const day = now > edition.date ? now : edition.date;
      const next = editionAt(
        new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
      );
      if (!next)
        throw new ChallengeError(
          'The next crossing hasn’t been scheduled yet.',
          404
        );
      const key = editionKey(edition);
      await store.hSetNX(key, `schedule:${code}`, next.id);
      const selected = await store.hGet(key, `schedule:${code}`);
      if (!selected) throw new Error('No rematch reservation');
      const reserved = editionById(selected);
      await create(reserved, invite.host, guest, true);
      await store.hSetNX(key, `scheduled:${code}`, reserved.id);
      return c.json({ day: reserved.number });
    } catch (error) {
      return failure(c, error);
    }
  });
  return routes;
}
