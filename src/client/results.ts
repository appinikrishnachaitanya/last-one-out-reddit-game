import { boardById } from '../shared/boards';
import { initialState, samePoint, trace } from '../shared/engine';
import { formatElapsed, isObject } from '../shared/daily';
import { navigateTo, showShareSheet } from '@devvit/web/client';
import type { Edition, Completion, Community } from '../shared/daily';
import { isAnimalId, titleCase } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import { DailyApi } from './daily-api';
import { portrait } from './portraits';
const animals: readonly AnimalId[] = ['turtle', 'rabbit', 'fox', 'badger'];
function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing ${id}`);
  return e;
}
export function shareText(
  edition: Edition,
  undos: number,
  favorite: AnimalId,
  url: string | null,
  demo: boolean,
  elapsedSeconds?: number
): string {
  return `Last One Out · Day ${edition.number}\n${boardById(edition.puzzleId, edition.boardVersion).title}\nEveryone home\n${elapsedSeconds === undefined ? '' : `Time ${formatElapsed(elapsedSeconds)}\n`}${undos} personal undo${undos === 1 ? '' : 's'}\n${undos === 0 ? 'Clean crossing\n' : ''}Cheering for ${titleCase(favorite)}${url ? `\n${url}` : ''}${demo ? '\nLocal preview · not a Reddit completion' : ''}`;
}
export class Results {
  edition: Edition | undefined;
  favorite: AnimalId = 'fox';
  undos = 0;
  elapsedSeconds: number | undefined;
  collectionRequest = 0;
  url: string | null = null;
  demo: boolean;
  validated = false;
  countdown?: number;
  api = new DailyApi();
  shareState: 'ready' | 'busy' | 'done' | 'pending' = 'ready';
  onFavorite: (id: AnimalId) => void;
  onRetry: () => void;
  constructor(
    demo: boolean,
    onFavorite: (id: AnimalId) => void,
    onRetry: () => void
  ) {
    this.demo = demo;
    this.onFavorite = onFavorite;
    this.onRetry = onRetry;
    const favorites = el('favorites');
    for (const id of animals) {
      const b = document.createElement('button');
      b.textContent = titleCase(id);
      b.dataset.favorite = id;
      b.addEventListener('click', () => {
        this.favorite = id;
        this.renderCard();
        this.onFavorite(id);
      });
      favorites.append(b);
    }
    el('retry-save').addEventListener('click', () => this.onRetry());
    el('copy-result').addEventListener('click', () => {
      void this.copy();
    });
    el('post-rescue').addEventListener('click', () => void this.post());
    el('apply-flair').addEventListener('click', () => void this.flair());
    el('comments').addEventListener('click', () => {
      if (this.url) navigateTo(this.url);
    });
  }
  show(
    edition: Edition,
    undos: number,
    url: string | null,
    saved: Completion | null,
    sequence: readonly AnimalId[],
    elapsedSeconds?: number
  ): void {
    this.edition = edition;
    this.undos = saved?.personalUndos ?? undos;
    this.elapsedSeconds = saved ? saved.elapsedSeconds : elapsedSeconds;
    this.url = url;
    this.validated = !!saved;
    this.favorite = saved?.favorite ?? 'fox';
    try {
      const local = localStorage.getItem(`loo-card:${edition.id}`);
      if (!saved && isAnimalId(local)) this.favorite = local;
    } catch {
      /* storage is optional */
    }
    el('result').hidden = false;
    el('app').classList.add('solved');
    el('copy-status').textContent = '';
    el('copy-fallback').hidden = true;
    el('flair-status').hidden = true;
    const flair = el('apply-flair') as HTMLButtonElement;
    flair.disabled = false;
    this.sharing();
    el('favorite-status').textContent = '';
    el('comments').hidden = !url;
    el('community').hidden = true;
    el('community-details').removeAttribute('open');
    this.renderRecap(saved?.sequence ?? sequence);
    el('retry-save').hidden = true;
    this.status(
      saved
        ? 'Your first rescue is saved.'
        : 'Everyone is home. Saving your rescue…'
    );
    this.renderCard();
    void this.loadCrossings();
  }
  renderCard(): void {
    const edition = this.edition;
    if (!edition) return;
    const time = el('card-time');
    time.hidden = this.elapsedSeconds === undefined;
    time.textContent =
      this.elapsedSeconds === undefined
        ? ''
        : `Time ${formatElapsed(this.elapsedSeconds)}`;
    el('clean-badge').hidden = this.undos !== 0;
    el('card-portrait').innerHTML = portrait(this.favorite);
    el('card-day').textContent = `DAY ${edition.number} · ${edition.date} UTC`;
    el('card-undos').textContent =
      `${this.undos} personal undo${this.undos === 1 ? '' : 's'}`;
    el('card-animal').textContent =
      `${titleCase(this.favorite)}’s lantern is lit.`;
    for (const b of el('favorites').querySelectorAll<HTMLButtonElement>(
      'button'
    ))
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.favorite === this.favorite)
      );
    try {
      localStorage.setItem(`loo-card:${edition.id}`, this.favorite);
    } catch {
      /* optional preference */
    }
  }
  status(text: string, retry = false): void {
    el('save-status').textContent = this.demo ? `${text} Preview only.` : text;
    el('retry-save').hidden = !retry;
  }
  saved(record: Completion, stats: Community, first: boolean): void {
    this.validated = true;
    this.sharing();
    this.undos = record.personalUndos;
    this.elapsedSeconds = record.elapsedSeconds;
    this.renderCard();
    this.status(
      first
        ? 'Rescue validated and saved.'
        : 'Your first saved rescue is restored.'
    );
    this.renderRecap(record.sequence);
    this.community(stats, record.opening);
    void this.loadCrossings();
  }
  sharing(status?: string): void {
    this.shareState =
      status === 'pending' ? 'pending' : status ? 'done' : 'ready';
    const button = el('post-rescue') as HTMLButtonElement;
    button.hidden = !this.validated || this.demo || !this.url;
    el('apply-flair').hidden = button.hidden;
    button.disabled = this.shareState !== 'ready';
    button.textContent =
      this.shareState === 'done'
        ? 'Shared to Comments ✓'
        : this.shareState === 'pending'
          ? 'Share unconfirmed'
          : 'Post Rescue to Comments';
    const note = el('post-status');
    note.hidden = this.shareState !== 'pending';
    note.textContent = 'Check the comments or copy your result.';
  }
  async post(): Promise<void> {
    if (this.shareState !== 'ready' || !this.validated || this.demo) return;
    const button = el('post-rescue') as HTMLButtonElement;
    this.shareState = 'busy';
    button.disabled = true;
    button.textContent = 'Posting…';
    try {
      await this.api.request('share', { favorite: this.favorite });
      this.sharing('sent');
    } catch {
      this.sharing('pending');
    }
  }
  async flair(): Promise<void> {
    if (!this.validated || this.demo) return;
    const button = el('apply-flair') as HTMLButtonElement;
    button.disabled = true;
    const note = el('flair-status');
    try {
      await this.api.request('flair', {});
      note.textContent = 'Subreddit flair updated!';
    } catch {
      note.textContent = 'Flair is unavailable right now.';
      button.disabled = false;
    }
    note.hidden = false;
  }
  renderRecap(sequence: readonly AnimalId[]): void {
    if (!this.edition) return;
    const board = boardById(this.edition.puzzleId, this.edition.boardVersion);
    const crossings = new Map<string, AnimalId[]>();
    let state = initialState();
    for (const id of sequence) {
      const route = trace(board, state, id);
      if (!route.legal) return;
      for (const bridge of board.bridges) {
        if (
          bridge.holder === id ||
          !route.path.some((point) => samePoint(point, bridge))
        )
          continue;
        const animals = crossings.get(bridge.id) ?? [];
        animals.push(id);
        crossings.set(bridge.id, animals);
      }
      state = { home: [...state.home, id] };
    }
    const list = el('bridge-recap');
    list.replaceChildren();
    for (const bridge of board.bridges) {
      const guests = crossings.get(bridge.id);
      if (!guests?.length) continue;
      const item = document.createElement('li');
      const names = new Intl.ListFormat('en').format(guests.map(titleCase));
      item.textContent = `${titleCase(bridge.holder)} kept the ${bridge.symbol} bridge open for ${names}.`;
      list.append(item);
    }
    el('community-details').hidden = list.childElementCount === 0;
  }
  community(stats: Community, ownOpening: AnimalId): void {
    const box = el('community');
    box.replaceChildren();
    box.hidden = false;
    el('community-details').hidden = false;
    const heading = document.createElement('h3');
    heading.textContent = 'How others started their successful rescue';
    box.append(heading);
    const description = document.createElement('p');
    description.textContent =
      'First move of each player’s recorded successful run.';
    box.append(description);
    if (this.demo) {
      const p = document.createElement('p');
      p.textContent =
        'Community data is available in Reddit after a validated rescue. No community participation is simulated here.';
      box.append(p);
      return;
    }
    const total = Math.max(0, stats.total - 1);
    if (total < 1) {
      const p = document.createElement('p');
      p.textContent =
        'The forest is quiet. There aren’t enough completed rescues to compare yet.';
      box.append(p);
      return;
    }
    const commonTrap = Object.entries(stats.traps ?? {}).sort(
      (a, b) => b[1] - a[1]
    )[0];
    if (commonTrap && commonTrap[1] >= 2) {
      const trap = document.createElement('p');
      trap.textContent = `${Math.round((commonTrap[1] / stats.total) * 100)}% of finishers reported sending ${titleCase(commonTrap[0])} first and stranding a friend.`;
      box.append(trap);
    }
    for (const id of animals) {
      const count = Math.max(
        0,
        (stats.openings[id] ?? 0) - Number(id === ownOpening)
      );
      const row = document.createElement('div');
      row.className = 'opening-row';
      const name = document.createElement('span');
      name.textContent = titleCase(id);
      const bar = document.createElement('meter');
      bar.min = 0;
      bar.max = total;
      bar.value = count;
      bar.setAttribute('aria-label', `${titleCase(id)}: ${count} of ${total}`);
      const label = document.createElement('span');
      label.textContent = `${count} / ${total}`;
      row.append(name, bar, label);
      box.append(row);
    }
  }
  async loadCrossings(): Promise<void> {
    const requestId = ++this.collectionRequest;
    clearInterval(this.countdown);
    const next = el('next-crossing');
    const archive = el('archive-result');
    const details = el('past-crossings');
    el('card-streak').hidden = true;
    next.hidden = true;
    details.hidden = false;
    archive.textContent = 'Loading past crossings…';
    el('card-collection').textContent = 'Loading collection…';
    try {
      const response = await fetch('/api/crossings', {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Archive unavailable');
      const data: unknown = await response.json();
      if (requestId !== this.collectionRequest) return;
      if (!isObject(data) || !Array.isArray(data.past))
        throw new Error('Invalid archive');
      const streak = el('card-streak');
      if (typeof data.streak === 'number' && data.streak > 1) {
        streak.textContent = `${data.streak}-day rescue streak`;
        streak.hidden = false;
      }
      const collection = el('card-collection');
      const grid = document.createElement('ul');
      grid.className = 'collection-grid';
      for (const card of Array.isArray(data.cards) ? data.cards : []) {
        if (
          !isObject(card) ||
          typeof card.day !== 'number' ||
          typeof card.title !== 'string' ||
          !isAnimalId(card.favorite)
        )
          continue;
        const item = document.createElement('li');
        const art = document.createElement('div');
        art.innerHTML = portrait(card.favorite);
        const name = document.createElement('strong');
        name.textContent = card.title;
        const day = document.createElement('small');
        day.textContent = `Day ${card.day}`;
        item.append(art, day, name);
        grid.append(item);
      }
      collection.textContent = grid.childElementCount
        ? `${grid.childElementCount} ${grid.childElementCount === 1 ? 'card' : 'cards'} collected`
        : 'Finish and save a daily rescue to earn its card.';
      if (grid.childElementCount) collection.append(grid);
      if (this.demo) {
        archive.textContent = '';
        return;
      }
      const list = document.createElement('ul');
      for (const entry of data.past) {
        if (
          !isObject(entry) ||
          typeof entry.title !== 'string' ||
          typeof entry.url !== 'string' ||
          !/^https:\/\/www\.reddit\.com\/comments\/[a-z0-9]+\/$/.test(entry.url)
        )
          continue;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = entry.url;
        link.textContent = `${entry.title}${entry.completed ? ' · Completed' : ''}`;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          navigateTo(link.href);
        });
        item.append(link);
        list.append(item);
      }
      if (list.childElementCount) archive.replaceChildren(list);
      else archive.textContent = 'No earlier crossings are available here yet.';
      if (
        typeof data.nextAt !== 'number' ||
        typeof data.serverTime !== 'number'
      )
        return;
      const availableAt = performance.now() + data.nextAt - data.serverTime;
      const tick = () => {
        const minutes = Math.ceil((availableAt - performance.now()) / 60000);
        if (minutes <= 0 || el('result').hidden) {
          next.hidden = true;
          clearInterval(this.countdown);
          return;
        }
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        next.textContent = `Next crossing scheduled in ${hours ? `${hours}h ` : ''}${remainder}m`;
        next.hidden = false;
      };
      this.countdown = window.setInterval(tick, 15000);
      tick();
    } catch {
      if (requestId !== this.collectionRequest) return;
      archive.textContent =
        'Collection and past crossings are unavailable right now.';
      el('card-collection').textContent = '';
    }
  }
  async copy(): Promise<void> {
    if (!this.edition) return;
    const text = shareText(
      this.edition,
      this.undos,
      this.favorite,
      this.url,
      this.demo,
      this.elapsedSeconds
    );
    try {
      await navigator.clipboard.writeText(text);
      el('copy-status').textContent = 'Copied. No puzzle spoilers.';
    } catch {
      if (!this.demo) {
        try {
          await showShareSheet({ text, title: 'Last One Out' });
          el('copy-status').textContent = 'Sharing options opened.';
          return;
        } catch {
          /* select text fallback */
        }
      }
      el('copy-fallback').textContent = text;
      el('copy-fallback').hidden = false;
      el('copy-status').textContent =
        'Copy is unavailable here. Select the result text below.';
    }
  }
}
