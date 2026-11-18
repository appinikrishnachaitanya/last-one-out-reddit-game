import { isObject } from '../shared/daily';
import { navigateTo, showShareSheet } from '@devvit/web/client';
import type { Edition, Completion, Community } from '../shared/daily';
import { isAnimalId, titleCase } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
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
  demo: boolean
): string {
  return `Last One Out · Day ${edition.number}\nEveryone home\n${undos} personal undo${undos === 1 ? '' : 's'}\n${undos === 0 ? 'Clean crossing\n' : ''}Cheering for ${titleCase(favorite)}${url ? `\n${url}` : ''}${demo ? '\nLocal preview · not a Reddit completion' : ''}`;
}
export class Results {
  edition: Edition | undefined;
  favorite: AnimalId = 'fox';
  undos = 0;
  url: string | null = null;
  demo: boolean;
  validated = false;
  countdown?: number;
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
    el('comments').addEventListener('click', () => {
      if (this.url) navigateTo(this.url);
    });
  }
  show(
    edition: Edition,
    undos: number,
    url: string | null,
    saved: Completion | null
  ): void {
    this.edition = edition;
    this.undos = saved?.personalUndos ?? undos;
    this.url = url;
    this.validated = !!saved;
    this.favorite = saved?.favorite ?? 'fox';
    try {
      const local = localStorage.getItem(`loo-card:${edition.id}`);
      if (isAnimalId(local)) this.favorite = local;
    } catch {
      /* storage is optional */
    }
    el('result').hidden = false;
    el('app').classList.add('solved');
    el('copy-status').textContent = '';
    el('favorite-status').textContent = '';
    el('comments').hidden = !url;
    el('community').hidden = true;
    el('community-details').hidden = true;
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
    this.undos = record.personalUndos;
    this.renderCard();
    this.status(
      first
        ? 'Rescue validated and saved.'
        : 'Your first saved rescue is restored.'
    );
    this.community(stats, record.opening);
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
    if (total < 2) {
      const p = document.createElement('p');
      p.textContent =
        'The forest is quiet. There aren’t enough completed rescues to compare yet.';
      box.append(p);
      return;
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
    clearInterval(this.countdown);
    const next = el('next-crossing');
    const archive = el('archive-result');
    const details = el('past-crossings');
    next.hidden = true;
    details.hidden = this.demo;
    archive.textContent = 'Loading past crossings…';
    if (this.demo) return;
    try {
      const response = await fetch('/api/crossings', {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Archive unavailable');
      const data: unknown = await response.json();
      if (!isObject(data) || !Array.isArray(data.past))
        throw new Error('Invalid archive');
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
      archive.textContent = 'Past crossings are unavailable right now.';
    }
  }
  async copy(): Promise<void> {
    if (!this.edition) return;
    const text = shareText(
      this.edition,
      this.undos,
      this.favorite,
      this.url,
      this.demo
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
