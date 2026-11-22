import { requestExpandedMode } from '@devvit/web/client';
import { DailyApi } from './daily-api';
import { boardById } from '../shared/boards';
import { isAnimalId, titleCase } from '../shared/engine';
import { formatElapsed, isObject } from '../shared/daily';
import type { Completion } from '../shared/daily';
import { portrait } from './portraits';

declare const __LOCAL_DEMO__: boolean;
const api = new DailyApi();
const play = document.querySelector<HTMLButtonElement>('#play')!;
const edition = document.querySelector<HTMLElement>('#edition')!;
const profile = document.querySelector<HTMLElement>('#welcome-profile')!;
const badge = document.querySelector<HTMLElement>('#badge')!;
const panel = document.querySelector<HTMLDialogElement>('#personal-panel')!;
const panelTitle = document.querySelector<HTMLElement>('#panel-title')!;
const status = document.querySelector<HTMLElement>('#panel-status')!;
const content = document.querySelector<HTMLElement>('#panel-content')!;
let title = 'Last One Out';
let completion: Completion | null = null;
let request = 0;

play.addEventListener('click', (event) => {
  if (__LOCAL_DEMO__) {
    window.location.assign('/game.html');
    return;
  }
  try {
    requestExpandedMode(event, 'game', { title });
  } catch {
    badge.textContent = 'Open this post in Reddit to play.';
    badge.hidden = false;
  }
});

const daily = api
  .init()
  .then((data) => {
    if (data.status !== 'ready') return;
    if (data.username) profile.textContent = `Welcome, u/${data.username}`;
    title = boardById(data.edition.puzzleId, data.edition.boardVersion).title;
    edition.textContent = `Day ${data.edition.number} · ${title}`;
    completion = data.completion;
    if (!completion) return;
    play.textContent = 'View Your Rescue';
    badge.textContent = `Everyone home · ${titleCase(completion.favorite)} card earned`;
    badge.hidden = false;
  })
  .catch(() => {
    // The board can still be opened if the welcome screen cannot fetch progress.
  });

async function show(view: 'progress' | 'collection'): Promise<void> {
  const current = ++request;
  panelTitle.textContent =
    view === 'progress' ? 'My progress' : 'Card collection';
  content.replaceChildren();
  status.textContent = 'Loading your rescues…';
  if (!panel.open) panel.showModal();
  try {
    const [payload] = await Promise.all([api.request('crossings'), daily]);
    if (current !== request || !panel.open) return;
    if (!isObject(payload) || !Array.isArray(payload.cards))
      throw new Error('Could not load progress');
    const cards = payload.cards
      .flatMap((entry: unknown) =>
        isObject(entry) &&
        typeof entry.day === 'number' &&
        typeof entry.title === 'string' &&
        isAnimalId(entry.favorite)
          ? [{ day: entry.day, title: entry.title, favorite: entry.favorite }]
          : []
      )
      .sort((a, b) => b.day - a.day);
    status.textContent =
      payload.signedIn === false ? 'Sign in to see your rescues.' : '';
    if (payload.signedIn === false) return;

    const launchTotal =
      typeof payload.totalEditions === 'number' && payload.totalEditions > 0
        ? payload.totalEditions
        : undefined;
    const launchCount = launchTotal
      ? cards.filter(({ day }) => day <= launchTotal).length
      : 0;
    if (view === 'progress') {
      const scores = document.createElement('dl');
      scores.className = 'score-grid';
      const score = (label: string, value: number | string) => {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        term.textContent = label;
        const amount = document.createElement('dd');
        amount.textContent = String(value);
        item.append(term, amount);
        scores.append(item);
      };
      score('Crossings rescued', cards.length);
      if (launchTotal) score('Launch cards', `${launchCount} / ${launchTotal}`);
      score(
        'Day streak',
        typeof payload.streak === 'number' ? payload.streak : 0
      );
      content.append(scores);
      status.textContent = completion
        ? `This crossing · ${completion.personalUndos} ${completion.personalUndos === 1 ? 'undo' : 'undos'}${completion.elapsedSeconds === undefined ? '' : ` · ${formatElapsed(completion.elapsedSeconds)}`}`
        : 'Finish a rescue to see your time and undos here.';
      return;
    }

    status.textContent = cards.length
      ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} earned${launchTotal ? ` · Launch set ${launchCount}/${launchTotal}` : ''}`
      : 'Finish a rescue to earn your first card.';
    const grid = document.createElement('ul');
    grid.className = 'card-gallery';
    for (const card of cards) {
      const item = document.createElement('li');
      item.dataset.animal = card.favorite;
      const art = document.createElement('div');
      art.className = 'card-art';
      art.innerHTML = portrait(card.favorite);
      const name = document.createElement('strong');
      name.textContent = titleCase(card.favorite);
      const crossing = document.createElement('span');
      crossing.textContent = `Day ${card.day} · ${card.title}`;
      item.append(art, name, crossing);
      grid.append(item);
    }
    if (cards.length) content.append(grid);
  } catch {
    if (current === request && panel.open)
      status.textContent =
        'Progress is unavailable. Close and reopen to retry.';
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-view]'
))
  button.addEventListener(
    'click',
    () =>
      void show(button.dataset.view === 'progress' ? 'progress' : 'collection')
  );
