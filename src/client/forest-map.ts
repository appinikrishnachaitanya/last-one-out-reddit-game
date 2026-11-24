import { navigateTo } from '@devvit/web/client';
import { isObject } from '../shared/daily';
import type { Edition } from '../shared/daily';
import { avatarPortrait, companionProfile } from './companion';

type Landmark = {
  day: number;
  title: string;
  completed: boolean;
  current?: boolean;
  url?: string;
};
const places = [
  [25, 82],
  [66, 62],
  [30, 50],
  [70, 40],
  [40, 25],
  [68, 12],
] as const;
const safePost = (url: unknown): url is string =>
  typeof url === 'string' &&
  /^https:\/\/www\.reddit\.com\/comments\/[a-z0-9]+\/$/.test(url);

export function createForestMap(options: {
  edition: Edition | undefined;
  title: string;
  completed: boolean;
  past: unknown;
  rescues: number;
  onContinue: () => void;
  onHome: () => void;
  onCollection: () => void;
}): HTMLElement {
  const root = document.createElement('section');
  root.className = 'journey';
  root.setAttribute('aria-label', 'Your forest rescue map');
  const nodes: Landmark[] = [];
  if (Array.isArray(options.past))
    for (const row of options.past) {
      if (
        isObject(row) &&
        typeof row.day === 'number' &&
        typeof row.title === 'string' &&
        safePost(row.url) &&
        (!options.edition || row.day < options.edition.number)
      ) {
        nodes.push({
          day: row.day,
          title: row.title,
          completed: row.completed === true,
          url: row.url,
        });
      }
    }
  nodes.sort((a, b) => a.day - b.day);
  const day = options.edition?.number ?? (nodes.at(-1)?.day ?? 0) + 1;
  nodes.push({
    day,
    title: options.title,
    completed: options.completed,
    current: true,
  });
  const currentIndex = nodes.length - 1;
  nodes.push({ day: day + 1, title: 'Next crossing', completed: false });
  while (nodes.length % 6 !== 0) {
    nodes.push({
      day: nodes.at(-1)!.day + 1,
      title: 'Trail ahead',
      completed: false,
    });
  }
  let page = Math.floor(currentIndex / 6);
  const map = document.createElement('div');
  map.className = 'journey-landscape';
  const heading = document.createElement('p');
  heading.className = 'journey-heading';
  heading.textContent = `${options.rescues} rescued · Your journey through the forest`;
  const caption = document.createElement('p');
  caption.className = 'journey-caption';
  const controls = document.createElement('nav');
  controls.className = 'journey-pages';
  controls.setAttribute('aria-label', 'Map chapters');
  function control(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }
  const previous = control('← Earlier', () => {
    page--;
    render();
    previous.focus();
  });
  const next = control('Later →', () => {
    page++;
    render();
    next.focus();
  });
  controls.append(previous, caption, next);
  const continueButton = control(
    options.completed ? 'View your rescue' : 'Continue rescue',
    options.onContinue
  );
  continueButton.className = 'journey-continue';
  const footer = document.createElement('nav');
  footer.className = 'journey-nav';
  footer.setAttribute('aria-label', 'Map navigation');
  const active = control('My Map', () => {
    page = Math.floor(currentIndex / 6);
    render();
  });
  active.setAttribute('aria-current', 'page');
  footer.append(
    control('Home', options.onHome),
    active,
    control('Collection', options.onCollection)
  );
  function render(): void {
    map.replaceChildren();
    const chapter = nodes.slice(page * 6, page * 6 + 6);
    for (let index = 0; index < 6; index++) {
      const entry = chapter[index];
      if (!entry) continue;
      const [x, y] = places[index]!;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `journey-node${entry.current ? ' is-current' : ''}${entry.completed ? ' is-complete' : ''}`;
      button.style.left = `${x}%`;
      button.style.top = `${y}%`;
      button.dataset.day = String(entry.day);
      const marker = document.createElement('span');
      marker.className = 'journey-marker';
      marker.textContent = entry.completed
        ? '✓'
        : entry.current
          ? String(entry.day)
          : entry.url
            ? String(entry.day)
            : '◇';
      const sign = document.createElement('span');
      sign.className = 'journey-sign';
      sign.textContent = entry.title;
      button.append(marker, sign);
      if (entry.current) {
        button.setAttribute('aria-current', 'step');
        const avatar = document.createElement('span');
        avatar.className = 'journey-avatar';
        avatar.innerHTML = avatarPortrait(companionProfile());
        const here = document.createElement('span');
        here.className = 'journey-here';
        here.textContent = 'You are here';
        button.append(avatar, here);
        button.addEventListener('click', options.onContinue);
      } else if (entry.url) {
        const url = entry.url;
        button.addEventListener('click', () => navigateTo(url));
      } else {
        button.setAttribute('aria-disabled', 'true');
        button.addEventListener('click', () => {
          caption.textContent = 'This crossing opens with the next daily.';
        });
      }
      button.setAttribute(
        'aria-label',
        `Crossing ${entry.day}, ${entry.title}, ${entry.current ? 'you are here' : entry.completed ? 'completed' : entry.url ? 'available' : 'upcoming'}`
      );
      map.append(button);
    }
    previous.disabled = page === 0;
    next.disabled = (page + 1) * 6 >= nodes.length;
    controls.hidden = nodes.length <= 6;
    caption.textContent = `Trail ${page + 1} of ${Math.ceil(nodes.length / 6)}`;
  }
  render();
  const syncAvatar = () => {
    if (!root.isConnected) {
      window.removeEventListener('companion-change', syncAvatar);
      return;
    }
    root.querySelectorAll<HTMLElement>('.journey-avatar').forEach((avatar) => {
      avatar.innerHTML = avatarPortrait(companionProfile());
    });
  };
  window.addEventListener('companion-change', syncAvatar);
  root.append(heading, map, controls, continueButton, footer);
  return root;
}
