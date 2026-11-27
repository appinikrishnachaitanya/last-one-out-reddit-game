import * as Phaser from 'phaser';
import { navigateTo } from '@devvit/web/client';
import {
  callbackCrossings,
  callbackStart,
  recallKeeper,
} from '../shared/callback';
import { isObject } from '../shared/daily';
import { isHome, move, titleCase, trace, won } from '../shared/engine';
import type { AnimalId, State } from '../shared/engine';
import { Crossing } from './scenes/Crossing';

declare const __LOCAL_DEMO__: boolean;

type Position = { state: State; keeper?: AnimalId };
let episode = 0;
let crossing = callbackCrossings[episode]!;
let position: Position = { state: callbackStart(crossing) };
const history: Position[] = [];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let busy = false;
let ready = false;
const dispatch = document.querySelector<HTMLElement>('#dispatch')!;
const prompt = document.querySelector<HTMLElement>('#prompt')!;
const board = document.querySelector<HTMLElement>('#river-board')!;
const actions = document.querySelector<HTMLElement>('#animals')!;
const undo = document.querySelector<HTMLButtonElement>('#undo')!;
const play = document.querySelector<HTMLElement>('#crossing')!;
const reunion = document.querySelector<HTMLElement>('#reunion')!;
const finish = document.querySelector<HTMLElement>('#reunion-title')!;
const next = document.querySelector<HTMLButtonElement>('#next')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const daily = document.querySelector<HTMLAnchorElement>('#daily')!;
const skip = document.querySelector<HTMLAnchorElement>('#skip')!;
const chapter = document.querySelector<HTMLElement>('#chapter')!;
const count = document.querySelector<HTMLElement>('#crossing-count')!;
const shore = document.querySelector<HTMLElement>('#shore-label')!;

const scene = new Crossing(
  { board: crossing.board, state: position.state },
  (id) => {
    if (position.keeper) void act(id, false);
  }
);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: board,
  width: 840,
  height: 840,
  backgroundColor: '#102f35',
  render: { antialias: true, roundPixels: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene],
  audio: { noAudio: true },
});

const controls = new Map<AnimalId, HTMLButtonElement>();
for (const { id } of crossing.board.animals) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'animal';
  button.dataset.animal = id;
  const art = document.createElement('span');
  art.className = 'portrait';
  art.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = titleCase(id);
  const detail = document.createElement('small');
  button.append(art, label, detail);
  button.addEventListener('click', (event) => void act(id, event.detail === 0));
  controls.set(id, button);
}
actions.append(...controls.values());

function renderBoard(): void {
  scene.session = { board: crossing.board, state: position.state };
  scene.previewRoutes = [crossing.stranded];
  scene.refresh();
  game.scale.updateBounds();
}

function renderControls(): void {
  const { state, keeper } = position;
  const total = state.home.length;
  const remaining = crossing.board.animals.length - total;
  const stranded = titleCase(crossing.stranded);
  const finished = won(crossing.board, state);
  prompt.textContent = keeper
    ? 'Finish the rescue.'
    : `${stranded} is stranded.`;
  count.textContent = `${total} home · ${remaining} on the board`;
  const route = trace(crossing.board, state, crossing.stranded);
  board.setAttribute(
    'aria-label',
    `${crossing.board.title}. ${count.textContent}.${route.obstacle ? ` ${stranded}: ${route.obstacle.reason}.` : ''}`
  );
  chapter.textContent = `${episode + 1} / ${callbackCrossings.length} · ${crossing.board.title}`;
  shore.textContent = keeper ? 'Still at the river' : 'At the campfire';
  for (const [id, button] of controls) {
    const home = isHome(state, id);
    const bridge = crossing.board.bridges.find((entry) => entry.holder === id);
    const shown = keeper ? !home : home;
    const legal = keeper
      ? trace(crossing.board, state, id).legal
      : Boolean(recallKeeper(crossing.board, state, id));
    const action = keeper ? 'Send home' : 'Call back';
    const detail = legal ? action : keeper ? 'Path blocked' : 'Safe at home';
    button.hidden = !shown;
    button.disabled = !ready || busy || !legal;
    button.classList.toggle(
      'priority',
      legal &&
        (!keeper ||
          id === crossing.stranded ||
          isHome(state, crossing.stranded))
    );
    button.querySelector('small')!.textContent =
      !keeper && legal && bridge ? `${detail} ${bridge.symbol}` : detail;
    button.setAttribute('aria-label', `${detail} ${titleCase(id)}`);
  }
  undo.disabled = busy || history.length === 0;
  play.hidden = finished;
  reunion.hidden = !finished;
  if (finished && keeper) {
    finish.textContent = `${titleCase(keeper)} went back for ${stranded}.`;
    next.hidden = episode + 1 >= callbackCrossings.length;
    daily.classList.toggle('primary', next.hidden);
  }
}

function restore(message: string): void {
  dispatch.textContent = message;
  renderControls();
  renderBoard();
}

async function act(id: AnimalId, keyboard: boolean): Promise<void> {
  if (!ready || busy || won(crossing.board, position.state)) return;
  const previous = position;
  const { state, keeper } = previous;
  const reduced = motion.matches;
  const name = titleCase(id);
  const stranded = titleCase(crossing.stranded);
  const recalled = keeper ? undefined : recallKeeper(crossing.board, state, id);
  if (keeper ? !trace(crossing.board, state, id).legal : !recalled) return;
  busy = scene.busy = true;
  renderControls();
  history.push(previous);
  if (recalled) {
    dispatch.textContent = `${name} is coming back.`;
    await scene.animateReturn(id, recalled, reduced);
    position = { state: recalled, keeper: id };
    renderBoard();
    await scene.raiseBridges(id, reduced);
    const route = trace(crossing.board, recalled, crossing.stranded);
    dispatch.textContent = route.legal
      ? `${name} raised the bridge. ${stranded} can cross.`
      : `${stranded} still needs another bridge. Undo to try another keeper.`;
  } else {
    dispatch.textContent = `${name} is crossing.`;
    await scene.animateHome(id, reduced);
    position = {
      state: move(crossing.board, state, id),
      ...(keeper ? { keeper } : {}),
    };
    await scene.fold(
      crossing.board.bridges
        .filter((bridge) => bridge.holder === id)
        .map((bridge) => bridge.id),
      reduced
    );
    dispatch.textContent = isHome(position.state, crossing.stranded)
      ? `${stranded} is safe. Bring the keeper home.`
      : `${stranded} is still stranded. Undo to try another keeper.`;
    renderBoard();
  }
  busy = scene.busy = false;
  renderControls();
  if (won(crossing.board, position.state)) {
    finish.focus({ preventScroll: true });
  } else if (keyboard) {
    (
      actions.querySelector<HTMLButtonElement>(
        'button.priority:not([hidden]):not(:disabled)'
      ) ?? undo
    ).focus({ preventScroll: true });
  }
}

undo.addEventListener('click', () => {
  const previous = history.pop();
  if (!previous) return;
  position = previous;
  restore(
    previous.keeper
      ? 'The keeper is back at the bridge.'
      : 'Call one bridge keeper back.'
  );
});

function begin(index: number): void {
  episode = index;
  crossing = callbackCrossings[index]!;
  position = { state: callbackStart(crossing) };
  history.length = 0;
  restore('Call one bridge keeper back.');
}
next.addEventListener('click', () => {
  begin(episode + 1);
  actions
    .querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')
    ?.focus({ preventScroll: true });
});
document.querySelector('#again')!.addEventListener('click', () => {
  begin(episode);
  actions
    .querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')
    ?.focus({ preventScroll: true });
});
game.events.once('board-ready', () => {
  ready = true;
  begin(0);
});
renderControls();

async function findDaily(): Promise<void> {
  retry.disabled = true;
  try {
    let href = '/game.html';
    let isDaily = true;
    if (!__LOCAL_DEMO__) {
      const response = await fetch('/api/callback/destination', {
        signal: AbortSignal.timeout(5000),
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !isObject(data) ||
        typeof data.url !== 'string' ||
        !/^https:\/\/www\.reddit\.com\/(comments\/[a-z0-9]+|r\/[a-z0-9_]+)\/$/i.test(
          data.url
        )
      )
        throw new Error('Daily crossing unavailable');
      href = data.url;
      isDaily = data.daily === true;
    }
    daily.href = skip.href = href;
    daily.textContent = isDaily
      ? 'Play today’s crossing'
      : 'Visit the rescue community';
    skip.textContent = isDaily ? 'Daily crossing' : 'Rescue community';
    daily.hidden = skip.hidden = false;
    retry.hidden = true;
  } catch {
    retry.hidden = false;
    retry.disabled = false;
  }
}
for (const link of [daily, skip]) {
  link.addEventListener('click', (event) => {
    if (__LOCAL_DEMO__) return;
    event.preventDefault();
    navigateTo(link.href);
  });
}
retry.addEventListener('click', () => void findDaily());
void findDaily();
