import {
  connectRealtime,
  disconnectRealtime,
  isRealtimeConnected,
} from '@devvit/web/client';
import type {
  CommunityBoard,
  CommunityMove,
  CommunityVotes,
} from '../shared/community-board';
import { titleCase } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import type { DailyApi } from './daily-api';

export function describeMove(move: CommunityMove): string {
  const animal = titleCase(move.animal);
  if (move.outcome === 'rescued')
    return `u/${move.username} brought ${animal} home. Everyone made it!`;
  if (move.outcome === 'stranded') {
    const friend = move.stranded ? titleCase(move.stranded) : 'a friend';
    return `u/${move.username} sent ${animal} home, but ${friend} needs a rethink. Fresh crossing!`;
  }
  return `u/${move.username} brought ${animal} home.`;
}

export class CommunityRescue {
  state: CommunityBoard | undefined;
  active = false;
  moving = false;
  private reading = false;
  private refreshQueued = false;
  private lastRefresh = 0;
  private generation = 0;
  private poll?: number;
  private channel: string | undefined;
  private pendingVote?: { revision: number; animal: AnimalId };
  voteFeedback = '';

  constructor(
    private api: DailyApi,
    private update: (state: CommunityBoard) => void,
    private notice: (message: string) => void,
    private updateVotes: () => void
  ) {}

  open(): void {
    this.active = true;
    this.generation++;
    this.notice('Loading the shared crossing…');
    void this.refresh();
    this.poll = window.setInterval(() => {
      if (
        !document.hidden &&
        (!this.channel ||
          !isRealtimeConnected(this.channel) ||
          Date.now() - this.lastRefresh >= 30_000)
      )
        void this.refresh();
    }, 5000);
  }

  close(): void {
    this.active = false;
    this.generation++;
    this.state = undefined;
    delete this.pendingVote;
    this.voteFeedback = '';
    this.reading = false;
    this.refreshQueued = false;
    this.lastRefresh = 0;
    window.clearInterval(this.poll);
    if (this.channel) disconnectRealtime(this.channel);
    this.channel = undefined;
  }

  private apply(state: CommunityBoard): void {
    if (
      this.state &&
      (state.moveNumber < this.state.moveNumber ||
        (state.moveNumber === this.state.moveNumber &&
          (state.votes?.version ?? 0) < (this.state.votes?.version ?? 0)))
    )
      return;
    const changed =
      this.state?.moveNumber !== state.moveNumber ||
      this.state.canMove !== state.canMove;
    if (changed) this.voteFeedback = '';
    this.state = state;
    if (!this.channel) {
      try {
        const channel = state.channel;
        connectRealtime({
          channel,
          onConnect: () => {
            void this.refresh();
          },
          onMessage: () => {
            void this.refresh();
          },
        });
        this.channel = channel;
      } catch {
        // The private playtest and browser fallback can poll.
      }
    }
    if (changed) this.update(state);
    this.updateVotes();
    this.notice(
      state.signedIn
        ? state.canMove
          ? 'Take one move this attempt.'
          : 'Your turn is in. Waiting for another rescuer.'
        : 'Sign in to Reddit to take a turn.'
    );
  }

  async refresh(): Promise<void> {
    if (!this.active) return;
    if (this.reading || this.moving) {
      this.refreshQueued = true;
      return;
    }
    this.refreshQueued = false;
    const current = this.generation;
    this.reading = true;
    try {
      const state = (await this.api.request('community')) as CommunityBoard;
      if (
        this.generation === current &&
        !this.moving &&
        (!this.state || state.moveNumber >= this.state.moveNumber)
      ) {
        this.lastRefresh = Date.now();
        this.apply(state);
      }
    } catch (error) {
      if (this.generation === current)
        this.notice(
          error instanceof Error
            ? error.message
            : 'Could not refresh the shared board.'
        );
    } finally {
      if (this.generation === current) {
        this.reading = false;
        if (this.refreshQueued && !this.moving) void this.refresh();
      }
    }
  }

  get voting(): boolean {
    return (
      this.pendingVote?.revision === this.state?.moveNumber &&
      Boolean(this.pendingVote)
    );
  }

  displayedVotes(): CommunityVotes | undefined {
    const votes = this.state?.votes;
    if (!votes || !this.voting || !this.pendingVote) return votes;
    const { animal } = this.pendingVote;
    if (animal === votes.own) return votes;
    const tally = { ...votes.tally };
    if (votes.own) tally[votes.own] = Math.max(0, (tally[votes.own] ?? 0) - 1);
    tally[animal] = (tally[animal] ?? 0) + 1;
    return { version: votes.version, tally, own: animal };
  }

  async vote(animal: AnimalId): Promise<void> {
    const state = this.state;
    if (
      !this.active ||
      this.moving ||
      this.pendingVote ||
      !state?.signedIn ||
      !state.votes ||
      state.votes.own === animal
    )
      return;
    const current = this.generation;
    this.pendingVote = { revision: state.moveNumber, animal };
    this.voteFeedback = '';
    this.updateVotes();
    try {
      const updated = (await this.api.request('community/vote', {
        animal,
        moveNumber: state.moveNumber,
        attempts: state.attempts,
      })) as CommunityBoard;
      if (current === this.generation && !this.moving) this.apply(updated);
    } catch (error) {
      if (current === this.generation)
        this.voteFeedback =
          error instanceof Error
            ? error.message
            : 'Could not save your vote. Try again.';
    } finally {
      if (current === this.generation) {
        delete this.pendingVote;
        this.updateVotes();
        void this.refresh();
      }
    }
  }

  async move(animal: AnimalId, animate: () => Promise<void>): Promise<void> {
    if (!this.state?.canMove || this.moving || !this.active) return;
    this.moving = true;
    try {
      const next = (await this.api.request('community', {
        animal,
        moveNumber: this.state.moveNumber,
      })) as CommunityBoard;
      await animate();
      this.apply(next);
    } catch (error) {
      this.notice(
        error instanceof Error
          ? error.message
          : 'Could not send this animal home.'
      );
    } finally {
      this.moving = false;
      await this.refresh();
    }
  }
}
