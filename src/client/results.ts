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
  return `Last One Out · Day ${edition.number}\nEveryone home\n${undos} personal undo${undos === 1 ? '' : 's'}\nCheering for ${titleCase(favorite)}${url ? `\n${url}` : ''}${demo ? '\nLocal preview · not a Reddit completion' : ''}`;
}
export class Results {
  edition: Edition | undefined;
  favorite: AnimalId = 'fox';
  undos = 0;
  url: string | null = null;
  demo: boolean;
  validated = false;
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
    el('copy-status').textContent = '';
    el('favorite-status').textContent = '';
    el('comments').hidden = !url;
    el('community').hidden = true;
    el('retry-save').hidden = true;
    this.status(
      saved
        ? 'Your first rescue is saved. You can replay without changing it.'
        : 'Everyone is home. Saving your rescue…'
    );
    this.renderCard();
  }
  renderCard(): void {
    const edition = this.edition;
    if (!edition) return;
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
    el('save-status').textContent = this.demo
      ? `${text} Local preview uses mock identity and local storage, not Reddit.`
      : text;
    el('retry-save').hidden = !retry;
  }
  saved(record: Completion, stats: Community, first: boolean): void {
    this.validated = true;
    this.undos = record.personalUndos;
    this.renderCard();
    this.status(
      first
        ? 'Rescue validated and saved. Undo count is a personal stat.'
        : 'Your first saved rescue is restored. Replays do not change your opening or total.'
    );
    this.community(stats);
  }
  community(stats: Community): void {
    const box = el('community');
    box.replaceChildren();
    box.hidden = false;
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
    if (stats.total < 2) {
      const p = document.createElement('p');
      p.textContent =
        'The forest is quiet. There aren’t enough completed rescues to compare yet.';
      box.append(p);
      return;
    }
    for (const id of animals) {
      const count = stats.openings[id] ?? 0;
      const row = document.createElement('div');
      row.className = 'opening-row';
      const name = document.createElement('span');
      name.textContent = titleCase(id);
      const bar = document.createElement('meter');
      bar.min = 0;
      bar.max = stats.total;
      bar.value = count;
      bar.setAttribute(
        'aria-label',
        `${titleCase(id)}: ${count} of ${stats.total}`
      );
      const label = document.createElement('span');
      label.textContent = `${count} / ${stats.total}`;
      row.append(name, bar, label);
      box.append(row);
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
      el('copy-status').textContent =
        'Copied. No rescue order or puzzle spoilers included.';
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
