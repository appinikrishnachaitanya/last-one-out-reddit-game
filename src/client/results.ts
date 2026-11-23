import { cardStamp } from './card-stamp';
import { boardById } from '../shared/boards';
import { initialState, samePoint, trace } from '../shared/engine';
import {
  formatElapsed,
  highestCount,
  isObject,
  openingPercent,
  parseAttemptStats,
  rescueShare,
} from '../shared/daily';
import { navigateTo, showShareSheet } from '@devvit/web/client';
import type { Edition, Completion, AttemptStats } from '../shared/daily';
import { isAnimalId, titleCase } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import { DailyApi } from './daily-api';
import { portrait, portraitOffsets } from './portraits';
const animals: readonly AnimalId[] = ['turtle', 'rabbit', 'fox', 'badger'];
function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing ${id}`);
  return e;
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
  opening: AnimalId | undefined;
  stats: AttemptStats | undefined;
  countdown?: number;
  api = new DailyApi();
  private sharedLink: string | undefined;
  private refreshingComparison = false;
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
    el('save-image').addEventListener('click', () => void this.saveImage());
    el('copy-result-link').addEventListener('click', () => {
      if (this.sharedLink)
        void this.copyText(this.sharedLink, 'Result link copied.');
    });
    window.setInterval(() => {
      void this.refreshComparison();
    }, 12000);
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
    this.opening = saved?.firstMove ?? saved?.opening ?? sequence[0];
    this.stats = undefined;
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
    el('community-details').removeAttribute('open');
    el('comparison').hidden = true;
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
  saved(
    record: Completion,
    stats: AttemptStats | undefined,
    first: boolean
  ): void {
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
    this.community(stats, record.firstMove ?? record.opening);
    void this.loadCrossings();
  }
  private async refreshComparison(): Promise<void> {
    const edition = this.edition;
    if (
      this.demo ||
      !this.validated ||
      document.hidden ||
      el('result').hidden ||
      !edition ||
      !this.opening ||
      this.refreshingComparison
    )
      return;
    this.refreshingComparison = true;
    try {
      const stats = parseAttemptStats(await this.api.request('comparison'));
      if (
        stats &&
        this.validated &&
        this.edition === edition &&
        this.opening &&
        JSON.stringify(this.stats) !== JSON.stringify(stats)
      )
        this.community(stats, this.opening);
    } catch {
      /* Keep the last confirmed comparison visible. */
    } finally {
      this.refreshingComparison = false;
    }
  }

  sharing(status?: string): void {
    const receipt =
      status && /^t1_[a-z0-9]+$/.test(status) ? status.slice(3) : undefined;
    this.sharedLink =
      receipt &&
      this.url &&
      /^https:\/\/www\.reddit\.com\/comments\/[a-z0-9]+\/$/.test(this.url)
        ? `${this.url}comment/${receipt}/`
        : undefined;
    el('copy-result-link').hidden = !this.sharedLink;
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
      const result = await this.api.request('share', {
        favorite: this.favorite,
      });
      this.sharing(
        isObject(result) && typeof result.commentId === 'string'
          ? result.commentId
          : 'sent'
      );
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
  community(stats: AttemptStats | undefined, ownOpening: AnimalId): void {
    this.opening = ownOpening;
    this.stats = stats;
    if (this.demo) return;
    const box = el('comparison');
    box.replaceChildren();
    box.hidden = false;
    const intro = document.createElement('p');
    intro.textContent = `See how Reddit solved it · You started with ${titleCase(ownOpening)}.`;
    box.append(intro);
    if (!stats || stats.players < 10) {
      const early = document.createElement('p');
      early.textContent = `You're among the first rescuers today${stats ? ` · ${stats.players}/10 players` : ''}`;
      box.append(early);
      return;
    }
    for (const [animal] of highestCount(stats.firstMoves).slice(0, 3)) {
      if (!isAnimalId(animal)) continue;
      const percent = openingPercent(stats, animal) ?? 0;
      const row = document.createElement('div');
      row.className = 'opening-row';
      const name = document.createElement('span');
      name.textContent = titleCase(animal);
      const bar = document.createElement('meter');
      bar.max = 100;
      bar.value = percent;
      bar.setAttribute('aria-label', `${name.textContent}: ${percent}%`);
      const label = document.createElement('span');
      label.textContent = `${percent}%`;
      row.append(name, bar, label);
      box.append(row);
    }
    const common = highestCount(stats.firstMistakes)[0];
    if (common) {
      const note = document.createElement('p');
      note.textContent = `Most common first mistake: sending ${titleCase(common[0])}.`;
      box.append(note);
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
        item.append(art, day, name, cardStamp(data.owner, card.earnedAt));
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
  private async saveImage(): Promise<void> {
    const edition = this.edition;
    if (!edition) return;
    const { favorite, elapsedSeconds, undos } = this;
    const count = boardById(edition.puzzleId, edition.boardVersion).animals
      .length;
    try {
      const art = new Image();
      art.src = '/art/animals.webp';
      await art.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#132f28';
      ctx.fillRect(0, 0, 1080, 600);
      ctx.fillStyle = '#f3deb0';
      ctx.beginPath();
      ctx.roundRect(28, 28, 1024, 544, 30);
      ctx.fill();
      const [x, y] = portraitOffsets[favorite];
      ctx.save();
      ctx.beginPath();
      ctx.arc(811, 300, 166, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        art,
        (-x * art.width) / 200,
        (-y * art.height) / 200,
        art.width / 2,
        art.height / 2,
        645,
        134,
        332,
        332
      );
      ctx.restore();
      ctx.fillStyle = '#132f28';
      ctx.font = 'bold 27px system-ui';
      ctx.fillText('LAST ONE OUT · DAILY RESCUE', 72, 135);
      ctx.font = 'bold 66px Georgia';
      ctx.fillText('Everyone home.', 72, 232);
      ctx.font = '30px system-ui';
      ctx.fillText(`Day ${edition.number} · ${edition.date} UTC`, 72, 296);
      ctx.fillText(
        `${count}/${count} rescued · ${undos} ${undos === 1 ? 'undo' : 'undos'}`,
        72,
        354
      );
      if (elapsedSeconds !== undefined)
        ctx.fillText(`Time ${formatElapsed(elapsedSeconds)}`, 72, 402);
      ctx.font = 'italic 27px Georgia';
      ctx.fillText(`${titleCase(favorite)}’s lantern is lit.`, 72, 475);
      const image = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!image) throw new Error('Could not encode result');
      const url = URL.createObjectURL(image);
      const link = document.createElement('a');
      link.href = url;
      link.download = `last-one-out-${edition.date}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      el('copy-status').textContent = 'Result image ready.';
    } catch {
      el('copy-status').textContent =
        'Could not download the image. You can still copy your result.';
    }
  }

  async copy(): Promise<void> {
    if (!this.edition) return;
    const text = rescueShare(
      this.edition,
      this.undos,
      this.opening,
      this.stats
    );
    await this.copyText(text, 'Copied. No puzzle spoilers.');
  }

  private async copyText(text: string, confirmation: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      el('copy-status').textContent = confirmation;
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
