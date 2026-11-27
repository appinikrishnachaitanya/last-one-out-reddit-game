import type { DailyApi } from './daily-api';
import { parseLeaderboard } from '../shared/leaderboard';
import type { Leaderboard } from '../shared/leaderboard';

function score(assists: number): string {
  return assists === 0
    ? 'Clean'
    : `${assists.toLocaleString()} ${assists === 1 ? 'assist' : 'assists'}`;
}

function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing ${id}`);
  return node;
}

export class LeaderboardDialog {
  private dialog;
  private timer: number | undefined;
  private generation = 0;
  private loading = false;
  private lastBoard: string | undefined;

  constructor(private api: DailyApi) {
    const dialog = element('leaderboard');
    if (!(dialog instanceof HTMLDialogElement))
      throw new Error('Expected leaderboard dialog');
    this.dialog = dialog;
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      window.clearInterval(this.timer);
      this.generation++;
    });
    element('leaderboard-retry').addEventListener('click', () =>
      this.refresh()
    );
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refresh();
    });
  }

  open(day: number): void {
    if (this.dialog.open) return;
    window.clearInterval(this.timer);
    this.generation++;
    this.loading = false;
    this.lastBoard = undefined;
    element('leaderboard-day').textContent = `Daily crossing · Day ${day}`;
    for (const id of ['place', 'rows', 'retry', 'live'])
      element(`leaderboard-${id}`).hidden = true;
    element('leaderboard-status').textContent = 'Loading rescues…';
    this.dialog.showModal();
    this.refresh();
    this.timer = window.setInterval(() => {
      if (!document.hidden) this.refresh();
    }, 15000);
  }

  close(): void {
    this.dialog.close();
  }

  refresh(): void {
    if (this.dialog.open && !this.loading) void this.load();
  }

  private async load(): Promise<void> {
    const generation = this.generation;
    const isCurrent = () => this.dialog.open && this.generation === generation;
    this.loading = true;
    try {
      const board = parseLeaderboard(await this.api.request('leaderboard'));
      if (!isCurrent()) return;
      const snapshot = JSON.stringify(board);
      if (snapshot !== this.lastBoard) {
        this.render(board);
        this.lastBoard = snapshot;
      }
      element('leaderboard-status').textContent = board.total
        ? ''
        : 'No rescues saved for this crossing yet.';
      element('leaderboard-live').hidden = false;
      element('leaderboard-retry').hidden = true;
    } catch {
      if (!isCurrent()) return;
      element('leaderboard-status').textContent = this.lastBoard
        ? 'Live updates are temporarily unavailable.'
        : 'Could not load the leaderboard.';
      element('leaderboard-live').hidden = true;
      element('leaderboard-retry').hidden = false;
    } finally {
      if (isCurrent()) this.loading = false;
    }
  }

  private render(board: Leaderboard): void {
    const place = element('leaderboard-place');
    const field = board.total === 1 ? 'rescuer' : 'rescuers';
    place.hidden = board.total === 0;
    element('leaderboard-position').textContent = board.yourPlace
      ? `Your place: #${board.yourPlace} of ${board.total.toLocaleString()}`
      : `${board.total.toLocaleString()} ${field} so far`;
    const yourScore = element('leaderboard-your-score');
    yourScore.textContent =
      board.yourAssists === null ? '' : score(board.yourAssists);
    const rows = element('leaderboard-rows');
    rows.hidden = board.total === 0;
    rows.replaceChildren(
      ...board.leaders.map((leader) => {
        const row = document.createElement('li');
        if (leader.you) row.classList.add('leaderboard-you');
        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        if (leader.place === 1) rank.classList.add('leaderboard-first');
        rank.textContent = `#${leader.place}`;
        const name = document.createElement('span');
        name.className = 'leaderboard-name';
        name.textContent = leader.username ? `u/${leader.username}` : 'Rescuer';
        if (leader.you) {
          const label = document.createElement('span');
          label.className = 'leaderboard-you-label';
          label.textContent = 'You';
          name.append(label);
        }
        const assists = document.createElement('span');
        assists.className = 'leaderboard-score';
        assists.textContent = score(leader.assists);
        row.append(rank, name, assists);
        return row;
      })
    );
  }
}
