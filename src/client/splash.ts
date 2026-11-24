import {
  avatarPortrait,
  companionProfile,
  loadCompanion,
  setupCompanionEditor,
} from './companion';
import { navigateTo } from '@devvit/web/client';
import { companions } from '../shared/companion';
import { cardStamp } from './card-stamp';
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
  panelTitle.textContent = view === 'progress' ? 'My Map' : 'Card collection';
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
          ? [
              {
                day: entry.day,
                title: entry.title,
                favorite: entry.favorite,
                puzzleId: entry.puzzleId,
                earnedAt: entry.earnedAt,
              },
            ]
          : []
      )
      .sort((a, b) => b.day - a.day);
    status.textContent =
      payload.signedIn === false ? 'Sign in to see your rescues.' : '';
    if (payload.signedIn === false) return;

    const challengeTotal =
      typeof payload.challengeTotal === 'number' && payload.challengeTotal > 0
        ? payload.challengeTotal
        : 0;
    const launchTotal =
      typeof payload.totalEditions === 'number' && payload.totalEditions > 0
        ? payload.totalEditions
        : 0;
    const setTotal = challengeTotal || launchTotal;
    const setCount = challengeTotal
      ? new Set(
          cards.flatMap(({ puzzleId }) =>
            typeof puzzleId === 'string' &&
            /^challenge-\d{2}-v1$/.test(puzzleId)
              ? [puzzleId]
              : []
          )
        ).size
      : cards.filter(({ day }) => day <= launchTotal).length;
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
      if (setTotal)
        score(
          challengeTotal ? 'Challenge set' : 'Launch cards',
          `${setCount} / ${setTotal}`
        );
      score(
        'Day streak',
        typeof payload.streak === 'number' ? payload.streak : 0
      );
      content.append(scores);
      const map = document.createElement('ol');
      map.className = 'forest-map';
      map.setAttribute('aria-label', 'Rescue trail');
      const past = Array.isArray(payload.past) ? payload.past : [];
      const today = document.createElement('li');
      const playToday = document.createElement('button');
      playToday.textContent = completion
        ? 'Today · Everyone home ✓'
        : 'Today · Continue the crossing';
      playToday.addEventListener('click', () => {
        panel.close();
        play.click();
      });
      today.append(playToday);
      map.append(today);
      for (const crossing of past) {
        if (
          !isObject(crossing) ||
          typeof crossing.url !== 'string' ||
          !/^https:\/\/www\.reddit\.com\/comments\/[a-z0-9]+\/$/.test(
            crossing.url
          ) ||
          typeof crossing.title !== 'string'
        )
          continue;
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.href = crossing.url;
        link.textContent = `${crossing.completed ? '✓' : '○'} ${crossing.title}`;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          navigateTo(link.href);
        });
        row.append(link);
        map.append(row);
      }
      const next = document.createElement('li');
      next.textContent = 'Next crossing · Tomorrow';
      map.append(next);
      for (const animal of companions.filter(({ rescues }) => rescues > 0)) {
        const reward = document.createElement('li');
        reward.className = 'map-reward';
        reward.innerHTML = portrait(animal.id);
        const label = document.createElement('span');
        label.textContent = `${animal.name} · ${cards.length >= animal.rescues ? 'Unlocked' : `${cards.length}/${animal.rescues} rescues`}`;
        reward.append(label);
        map.append(reward);
      }
      content.append(map);
      status.textContent = completion
        ? `This crossing · ${completion.personalUndos} ${completion.personalUndos === 1 ? 'undo' : 'undos'}${completion.elapsedSeconds === undefined ? '' : ` · ${formatElapsed(completion.elapsedSeconds)}`}`
        : 'Finish a rescue to see your time and undos here.';
      return;
    }

    status.textContent = cards.length
      ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} earned${setTotal ? ` · ${challengeTotal ? 'Challenge' : 'Launch'} set ${setCount}/${setTotal}` : ''}`
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
      item.append(art, name, crossing, cardStamp(payload.owner, card.earnedAt));
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

const settingsPanel =
  document.querySelector<HTMLDialogElement>('#welcome-settings')!;
const settingsStatus = document.querySelector<HTMLElement>(
  '#welcome-settings-status'
)!;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const controls = [
  {
    id: 'welcome-sound',
    key: 'loo-forest-sound',
    defaultValue: 'off',
    yes: 'on',
    no: 'off',
  },
  {
    id: 'welcome-motion',
    key: 'loo-skip-animations',
    defaultValue: 'false',
    yes: 'true',
    no: 'false',
  },
  {
    id: 'welcome-timer',
    key: 'loo-live-timer',
    defaultValue: 'true',
    yes: 'true',
    no: 'false',
  },
  { id: 'welcome-scenery', key: 'loo-scenery', defaultValue: 'moon' },
  { id: 'welcome-track', key: 'loo-soundtrack', defaultValue: 'nature' },
];
function readSettings(): void {
  for (const setting of controls) {
    const control = document.getElementById(setting.id)! as
      HTMLInputElement | HTMLSelectElement;
    let value = setting.defaultValue;
    try {
      value = localStorage.getItem(setting.key) ?? value;
    } catch {
      /* Optional preferences. */
    }
    if (control instanceof HTMLInputElement) {
      control.checked = value === setting.yes;
      if (setting.id === 'welcome-motion') {
        control.checked ||= motion.matches;
        control.disabled = motion.matches;
      }
    } else control.value = value;
  }
}
for (const setting of controls) {
  document.getElementById(setting.id)!.addEventListener('change', (event) => {
    const control = event.currentTarget as HTMLInputElement | HTMLSelectElement;
    const value =
      control instanceof HTMLInputElement
        ? control.checked
          ? setting.yes!
          : setting.no!
        : control.value;
    try {
      localStorage.setItem(setting.key, value);
      settingsStatus.textContent = 'Preferences saved for your next rescue.';
    } catch {
      settingsStatus.textContent =
        'Preferences could not be saved on this device.';
    }
  });
}
for (const control of document.querySelectorAll<HTMLButtonElement>(
  '[data-settings]'
))
  control.addEventListener('click', () => {
    readSettings();
    setupCompanionEditor(
      api,
      document.querySelector<HTMLElement>('#welcome-companion-editor')!
    );
    settingsStatus.textContent = '';
    settingsPanel.showModal();
  });
motion.addEventListener('change', readSettings);
document.querySelector('#home-nav')!.addEventListener('click', () => {
  panel.close();
  settingsPanel.close();
  play.focus();
});

const homeAvatar = document.querySelector<HTMLElement>('#home-companion')!;
function renderHomeAvatar(): void {
  homeAvatar.innerHTML = avatarPortrait(companionProfile());
}
window.addEventListener('companion-change', renderHomeAvatar);
renderHomeAvatar();
void loadCompanion(api).catch(() => undefined);
