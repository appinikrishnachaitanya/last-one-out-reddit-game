import { avatarPortrait, companionProfile, loadCompanion } from './companion';
import { companions } from '../shared/companion';
import { rescueIdentity } from '../shared/rescue-identity';
import { cardStamp } from './card-stamp';
import { boardById } from '../shared/boards';
import { initialState, samePoint, trace } from '../shared/engine';
import {
  formatElapsed,
  highestCount,
  isObject,
  openingPercent,
  parseAttemptStats,
  rescueRank,
} from '../shared/daily';
import { navigateTo, showShareSheet } from '@devvit/web/client';
import type { Edition, Completion, AttemptStats } from '../shared/daily';
import { isAnimalId, titleCase } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import { DailyApi } from './daily-api';
import { portrait } from './portraits';
function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing ${id}`);
  return e;
}
export class Results {
  edition: Edition | undefined;
  favorite: AnimalId = 'fox';
  undos = 0;
  hintUsed = false;
  private identity: ReturnType<typeof rescueIdentity>;
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
    window.addEventListener('companion-change', () => {
      if (this.edition) this.renderCard();
    });
    el('retry-save').addEventListener('click', () => this.onRetry());
    el('copy-result').addEventListener('click', () => {
      (el('result-share') as HTMLDialogElement).showModal();
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
    elapsedSeconds?: number,
    hintUsed = false,
    recovered = false
  ): void {
    this.edition = edition;
    this.undos = saved?.personalUndos ?? undos;
    this.hintUsed = saved ? saved.hintUsed === true : hintUsed;
    this.elapsedSeconds = saved ? saved.elapsedSeconds : elapsedSeconds;
    this.url = url;
    this.validated = !!saved;
    this.opening = saved?.firstMove ?? saved?.opening ?? sequence[0];
    this.stats = undefined;
    this.favorite = saved?.favorite ?? 'fox';
    try {
      const local =
        localStorage.getItem(`loo-card:${edition.id}`) ??
        localStorage.getItem('loo-companion');
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
    (el('result-share') as HTMLDialogElement).close();
    void loadCompanion(this.api).catch(() => undefined);
    el('comparison').hidden = true;
    this.setIdentity(
      saved?.sequence ?? sequence,
      saved ? Boolean(saved.recovered || saved.openingTrap) : recovered
    );
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
    const rank = rescueRank(this.undos, this.hintUsed);
    el('clean-badge').hidden = false;
    el('clean-badge').textContent =
      rank === 'S' ? 'S Rank · Clean Crossing' : `${rank} Rank`;
    el('card-portrait').innerHTML = avatarPortrait(companionProfile());
    el('card-day').textContent = `DAY ${edition.number} · ${edition.date} UTC`;
    el('card-undos').textContent =
      `${this.undos} undo${this.undos === 1 ? '' : 's'}${this.hintUsed ? ' · Hint used' : ''}`;
    el('card-animal').textContent =
      `${companions.find(({ id }) => id === companionProfile().animal)!.name}’s lantern is lit.`;
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
    this.hintUsed = record.hintUsed === true;
    this.renderCard();
    this.status(
      first
        ? 'Rescue validated and saved.'
        : 'Your first saved rescue is restored.'
    );
    this.setIdentity(
      record.sequence,
      Boolean(record.recovered || record.openingTrap)
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
  private setIdentity(sequence: readonly AnimalId[], recovered: boolean): void {
    if (!this.edition) return;
    const board = boardById(this.edition.puzzleId, this.edition.boardVersion);
    this.identity = rescueIdentity(board, sequence, { recovered });
    el('result-title').textContent = this.identity?.title ?? 'Everyone home.';
    el('identity-explanation').textContent = this.identity?.explanation ?? '';
    const hero = this.identity?.hero;
    el('rescue-hero').textContent = hero
      ? `Hero Who Stayed: ${titleCase(hero.animal)} waited for ${hero.friends} ${hero.friends === 1 ? 'animal' : 'animals'}.`
      : '';
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
    el('community-details').hidden =
      !this.identity && list.childElementCount === 0;
  }
  community(stats: AttemptStats | undefined, ownOpening: AnimalId): void {
    this.opening = ownOpening;
    this.stats = stats;
    if (this.demo) return;
    const box = el('comparison');
    box.replaceChildren();
    box.hidden = false;
    const intro = document.createElement('p');
    intro.textContent = `You started with ${titleCase(ownOpening)}.`;
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
    el('card-streak').hidden = true;
    next.hidden = true;
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
        if (card.goldenLeaf === true) {
          const mark = document.createElement('small');
          mark.className = 'golden-leaf';
          mark.textContent = '✦ Golden Leaf';
          item.append(mark);
        }
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
    const { elapsedSeconds, undos } = this;
    const profile = companionProfile();
    const favorite = profile.animal;
    const identity = this.identity?.title;
    if (!identity) return;
    try {
      const source = ['owl', 'deer', 'panda', 'otter'].includes(favorite)
        ? '/art/companion-unlocks.webp'
        : '/art/animals.webp';
      const response = await fetch(source);
      if (!response.ok) throw new Error('Avatar art unavailable');
      const artBlob = await response.blob();
      const artData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read avatar art'));
        reader.readAsDataURL(artBlob);
      });
      const svg = avatarPortrait(profile)
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
        .replace(source, artData);
      const svgUrl = URL.createObjectURL(
        new Blob([svg], { type: 'image/svg+xml' })
      );
      const art = new Image();
      try {
        art.src = svgUrl;
        await art.decode();
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
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
      ctx.drawImage(art, 638, 127, 346, 346);
      ctx.fillStyle = '#132f28';
      ctx.font = 'bold 58px Georgia';
      ctx.fillText(identity, 72, 240, 540);
      ctx.font = '32px system-ui';
      ctx.fillText(`Puzzle ${edition.number}`, 72, 320, 540);
      ctx.fillText(`${undos} ${undos === 1 ? 'undo' : 'undos'}`, 72, 376, 540);
      if (elapsedSeconds !== undefined)
        ctx.fillText(`Time ${formatElapsed(elapsedSeconds)}`, 72, 432, 540);
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
