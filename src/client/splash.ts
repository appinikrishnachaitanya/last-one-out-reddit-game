import { createForestMap } from './forest-map';
import type { Edition } from '../shared/daily';
import {
  avatarPortrait,
  companionProfile,
  loadCompanion,
  setupCompanionEditor,
} from './companion';
import { cardStamp } from './card-stamp';
import { requestExpandedMode } from '@devvit/web/client';
import { DailyApi } from './daily-api';
import { MOONROOT, boardById } from '../shared/boards';
import { isAnimalId, titleCase } from '../shared/engine';
import { isObject } from '../shared/daily';
import type { Completion } from '../shared/daily';
import { portrait } from './portraits';
import { readChallengeLink } from './challenge-link';

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
let mapEdition: Edition | undefined;
let request = 0;
const challenge = !__LOCAL_DEMO__ && readChallengeLink('feed');
if (challenge) {
  play.textContent = 'Open Friend Challenge';
  document.querySelector<HTMLElement>('#welcome-hook')!.textContent =
    'A friend left you a rescue challenge.';
}

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
    if (!challenge && data.edition.puzzleId === MOONROOT.id && !data.completion)
      document.querySelector<HTMLElement>('#welcome-hook')!.textContent =
        'Turtle can leave. Should it?';
    completion = data.completion;
    mapEdition = data.edition;
    if (!completion) return;
    if (!challenge) play.textContent = 'View Your Rescue';
    badge.hidden = true;
  })
  .catch(() => {
    // The board can still be opened if the welcome screen cannot fetch progress.
  });

async function show(view: 'progress' | 'collection'): Promise<void> {
  const current = ++request;
  panelTitle.textContent = view === 'progress' ? 'My Map' : 'Card collection';
  panel.classList.toggle('map-panel', view === 'progress');
  panel.querySelector('form button')!.textContent =
    view === 'progress' ? 'Back' : '×';
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
      status.textContent = '';
      content.append(
        createForestMap({
          edition: mapEdition,
          title,
          completed: Boolean(completion),
          past: payload.past,
          rescues: cards.length,
          onContinue: () => {
            panel.close();
            play.click();
          },
          onHome: () => {
            panel.close();
            play.focus();
          },
          onCollection: () => {
            void show('collection');
          },
        })
      );
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
    document.querySelector<HTMLDetailsElement>('#welcome-my-animal')!.open =
      false;
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
