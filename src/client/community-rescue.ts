import {
  connectRealtime,
  disconnectRealtime,
  isRealtimeConnected,
} from '@devvit/web/client';
import type { CommunityBoard, CommunityMove } from '../shared/community-board';
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
  private generation = 0;
  private poll?: number;
  private channel: string | undefined;

  constructor(
    private api: DailyApi,
    private update: (state: CommunityBoard) => void,
    private notice: (message: string) => void
  ) {}

  open(): void {
    this.active = true;
    this.generation++;
    this.notice('Loading the shared crossing…');
    void this.refresh();
    this.poll = window.setInterval(() => {
      if (
        !document.hidden &&
        (!this.channel || !isRealtimeConnected(this.channel))
      )
        void this.refresh();
    }, 5000);
  }

  close(): void {
    this.active = false;
    this.generation++;
    this.state = undefined;
    this.reading = false;
    window.clearInterval(this.poll);
    if (this.channel) disconnectRealtime(this.channel);
    this.channel = undefined;
  }

  private apply(state: CommunityBoard): void {
    const changed =
      this.state?.moveNumber !== state.moveNumber ||
      this.state.canMove !== state.canMove;
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
    this.notice(
      state.signedIn
        ? state.canMove
          ? 'Take one move this attempt.'
          : 'Your turn is in. Waiting for another rescuer.'
        : 'Sign in to Reddit to take a turn.'
    );
  }

  async refresh(): Promise<void> {
    if (!this.active || this.reading || this.moving) return;
    const current = this.generation;
    this.reading = true;
    try {
      const state = (await this.api.request('community')) as CommunityBoard;
      if (
        this.generation === current &&
        !this.moving &&
        (!this.state || state.moveNumber >= this.state.moveNumber)
      )
        this.apply(state);
    } catch (error) {
      if (this.generation === current)
        this.notice(
          error instanceof Error
            ? error.message
            : 'Could not refresh the shared board.'
        );
    } finally {
      if (this.generation === current) this.reading = false;
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
