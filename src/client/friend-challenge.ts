import { showLoginPrompt, showShareSheet } from '@devvit/web/client';
import { isObject, rescueAssists } from '../shared/daily';
import type { Edition } from '../shared/daily';
import { titleCase } from '../shared/engine';
import {
  challengePrompt,
  parseFriendChallenge,
  redditName,
} from '../shared/friend-challenge';
import type {
  ChallengeRun,
  FriendChallengeView,
} from '../shared/friend-challenge';
import { clearChallengeLink, readChallengeLink } from './challenge-link';
import type { DailyApi } from './daily-api';

function element<T extends HTMLElement>(id: string, kind: { new (): T }): T {
  const node = document.getElementById(`friend-challenge${id ? `-${id}` : ''}`);
  if (!(node instanceof kind))
    throw new Error(`Missing challenge control ${id}`);
  return node;
}

function trailRow(
  name: string,
  run: ChallengeRun,
  turn: number,
  showFirst: boolean
): HTMLElement {
  const row = document.createElement('section');
  row.className = 'challenge-trail';
  const heading = document.createElement('h3');
  heading.textContent = name;
  const score = document.createElement('p');
  score.textContent = `${run.undos} ${run.undos === 1 ? 'undo' : 'undos'}${run.hint ? ' · Hint used' : ''}`;
  const steps = document.createElement('ol');
  steps.setAttribute('aria-label', `${name}’s rescue order`);
  for (const [index, animal] of run.trail.entries()) {
    const step = document.createElement('li');
    step.dataset.animal = animal;
    step.classList.toggle('trail-turn', index === turn);
    const label = document.createElement('span');
    label.textContent = titleCase(animal);
    step.append(label);
    steps.append(step);
  }
  row.append(heading, score);
  if (showFirst) {
    const first = document.createElement('p');
    first.textContent = `First choice: ${titleCase(run.firstChoice)}`;
    row.append(first);
  }
  row.append(steps);
  return row;
}

export class FriendChallenge {
  private dialog = element('', HTMLDialogElement);
  private action = element('open', HTMLButtonElement);
  private form = element('invite', HTMLFormElement);
  private username = element('name', HTMLInputElement);
  private status = element('status', HTMLElement);
  private code: string | undefined;
  private view: FriendChallengeView | null = null;
  private signedIn = false;
  private saved = false;
  private version = 0;
  private busy = false;
  private rematchDay: number | undefined;

  constructor(
    private api: DailyApi,
    demo: boolean
  ) {
    if (!demo) this.code = readChallengeLink('game');
    this.action.addEventListener('click', () => {
      this.open();
      if (!this.view?.comparison) void this.load();
    });
    window.addEventListener('focus', () => {
      if (this.dialog.open && this.view && !this.view.comparison)
        void this.load();
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.invite();
    });
    element('join', HTMLButtonElement).addEventListener(
      'click',
      () => void this.join()
    );
    element('play', HTMLButtonElement).addEventListener('click', () =>
      this.dialog.close()
    );
    element('refresh', HTMLButtonElement).addEventListener(
      'click',
      () => void this.load()
    );
    element('rematch', HTMLButtonElement).addEventListener(
      'click',
      () => void this.rematch()
    );
    element('login', HTMLButtonElement).addEventListener('click', () => {
      try {
        showLoginPrompt();
      } catch {
        this.status.textContent =
          'Sign in from the Reddit post and reopen this challenge.';
      }
    });
  }

  enter(edition: Edition, username: string | undefined, saved: boolean): void {
    this.version++;
    this.signedIn = Boolean(username);
    this.saved = saved;
    this.rematchDay = undefined;
    this.view = null;
    this.dialog.close();
    this.username.value = '';
    this.status.textContent = '';
    element('day', HTMLElement).textContent =
      `Daily crossing · Day ${edition.number}`;
    this.render();
    if (this.signedIn || this.code) void this.load(true);
  }

  completed(): void {
    this.saved = true;
    this.render();
    if (this.view || this.code) void this.load();
  }

  private open(): void {
    if (!this.dialog.open) this.dialog.showModal();
  }

  private async load(arrival = false): Promise<void> {
    if (this.busy) return;
    const code = this.code ?? this.view?.code;
    const version = ++this.version;
    try {
      const next = parseFriendChallenge(
        await this.api.request(code ? `challenge?code=${code}` : 'challenge')
      );
      if (version !== this.version) return;
      this.view = next;
      this.status.textContent = '';
      this.render();
      if (arrival && (this.code || (next?.rematch && !this.saved))) this.open();
    } catch (error) {
      if (version !== this.version || (!this.code && !this.dialog.open)) return;
      if (arrival && this.code) this.open();
      this.status.textContent =
        this.code && !this.signedIn
          ? 'Sign in to open this challenge.'
          : error instanceof Error
            ? error.message
            : 'Could not open the challenge.';
      element('login', HTMLButtonElement).hidden = this.signedIn;
      element('refresh', HTMLButtonElement).hidden = !this.signedIn;
    }
  }

  private render(): void {
    const view = this.view;
    const title = view?.comparison
      ? 'Compare trails'
      : view?.rematch
        ? 'Daily rematch'
        : view?.target === 0 && view.role !== 'host'
          ? 'Match a clean rescue'
          : 'Beat my rescue';
    element('title', HTMLElement).textContent = title;
    this.action.textContent = view?.comparison
      ? 'Compare trails'
      : view?.joined
        ? 'Friend challenge'
        : 'Beat my rescue';
    this.action.hidden = !this.saved || !this.signedIn;
    const description = element('description', HTMLElement);
    if (view?.comparison) {
      const { host, guest } = view.comparison;
      const difference =
        rescueAssists(host.undos, host.hint) -
        rescueAssists(guest.undos, guest.hint);
      const winner = difference < 0 ? view.host : view.guest;
      description.textContent = !difference
        ? 'A draw. Same number of assists.'
        : `u/${winner} wins with fewer assists.`;
    } else if (view?.rematch) {
      description.textContent = `Your rematch with u/${view.role === 'host' ? view.guest : view.host} is ready. Fewer assists wins. Both trails are revealed after you both finish.`;
    } else if (view?.role === 'host') {
      description.textContent = view.joined
        ? `Waiting for u/${view.guest} to finish.`
        : view.guest
          ? `Invite ready for u/${view.guest}.`
          : 'Your open invite is ready to share.';
    } else if (view) {
      description.textContent =
        view.joined && this.saved
          ? `Waiting for u/${view.host} to finish.`
          : `u/${view.host} challenged you. ${view.target === null ? 'Fewer assists wins.' : challengePrompt(view.target)}`;
    } else {
      description.textContent = this.code
        ? 'A friend left you a challenge for this crossing.'
        : 'Same crossing. Fewer assists wins. Each undo adds one. Using a hint adds one more.';
    }
    this.form.hidden =
      !this.saved ||
      !this.signedIn ||
      !!view?.comparison ||
      (view ? view.role !== 'host' : !!this.code);
    element('join', HTMLButtonElement).hidden = !view?.canJoin;
    element('login', HTMLButtonElement).hidden = this.signedIn || !this.code;
    element('play', HTMLButtonElement).hidden = !view?.joined || this.saved;
    element('refresh', HTMLButtonElement).hidden =
      !view || !!view.comparison || (!view.joined && view.role !== 'host');
    const rematch = element('rematch', HTMLButtonElement);
    rematch.hidden = !view?.comparison;
    const rematchDay = this.rematchDay ?? view?.rematchDay;
    rematch.disabled = Boolean(rematchDay);
    rematch.textContent = rematchDay
      ? `Rematch set for Day ${rematchDay}`
      : 'Rematch next daily';
    const trails = element('trails', HTMLElement);
    trails.hidden = !view?.comparison;
    if (view?.comparison) {
      const { host, guest } = view.comparison;
      const turn = host.trail.findIndex(
        (animal, index) => animal !== guest.trail[index]
      );
      const differentStarts = host.firstChoice !== guest.firstChoice;
      const caption = document.createElement('p');
      caption.className = 'trail-caption';
      caption.textContent =
        turn >= 0
          ? `Your trails split at move ${turn + 1}.`
          : differentStarts
            ? 'You started with different animals and found the same way home.'
            : 'You took the same trail.';
      trails.replaceChildren(
        trailRow(`u/${view.host}`, host, turn, differentStarts),
        trailRow(`u/${view.guest}`, guest, turn, differentStarts),
        caption
      );
    } else trails.replaceChildren();
  }

  private async perform(task: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.version++;
    this.dialog.setAttribute('aria-busy', 'true');
    this.status.textContent = '';
    try {
      await task();
    } catch (error) {
      this.status.textContent =
        error instanceof Error ? error.message : 'Please try again.';
    } finally {
      this.busy = false;
      this.dialog.removeAttribute('aria-busy');
    }
  }

  private async invite(): Promise<void> {
    const username = this.username.value.trim().replace(/^\/?u\//i, '');
    if (username && !redditName(username)) {
      this.status.textContent = 'Enter a valid Reddit username.';
      this.username.focus();
      return;
    }
    await this.perform(async () => {
      const view = parseFriendChallenge(
        await this.api.request('challenge', { username: username || null })
      );
      if (!view || view.target === null)
        throw new Error('Could not make this invite.');
      this.view = view;
      this.render();
      await showShareSheet({
        title: 'Beat my rescue · Last One Out',
        text: `I finished this crossing. ${challengePrompt(view.target)}`,
        data: JSON.stringify({ type: 'friend-rescue', code: view.code }),
      });
      this.status.textContent = 'Invite ready in Reddit’s share options.';
    });
  }

  private async join(): Promise<void> {
    const code = this.view?.code;
    if (!code) return;
    await this.perform(async () => {
      this.view = parseFriendChallenge(
        await this.api.request(`challenge/${code}/join`, {})
      );
      this.code = undefined;
      clearChallengeLink();
      this.render();
      if (!this.view?.comparison && !this.saved) this.dialog.close();
    });
  }

  private async rematch(): Promise<void> {
    const code = this.view?.code;
    if (!code) return;
    await this.perform(async () => {
      const response = await this.api.request(`challenge/${code}/rematch`, {});
      if (!isObject(response) || typeof response.day !== 'number')
        throw new Error('Could not set the rematch.');
      this.rematchDay = response.day;
      this.render();
      this.status.textContent = `Open Day ${response.day} to play. Your friend will see the rematch there too.`;
    });
  }
}
