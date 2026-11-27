import * as Phaser from 'phaser';
import { navigateTo } from '@devvit/web/client';
import {
  callbackCrossings,
  callbackStart,
  recallKeeper,
} from '../shared/callback';
import { isObject } from '../shared/daily';
import {
  bridgeOpen,
  canHoldBridge,
  isHome,
  move,
  titleCase,
  trace,
  won,
} from '../shared/engine';
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
const recallAgain = document.querySelector<HTMLButtonElement>('#recall-again')!;
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
    if (!ready || busy) return;
    const route = trace(crossing.board, position.state, id);
    if (position.keeper && route.legal) {
      void act(id, false);
    } else if (route.obstacle) {
      dispatch.textContent = `${titleCase(id)} is waiting. ${route.obstacle.reason}.`;
    }
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

function waitingAnimals(state: State): AnimalId[] {
  return crossing.board.animals
    .map(({ id }) => id)
    .filter((id) => !crossing.departures.includes(id) && !isHome(state, id));
}

function names(animals: AnimalId[]): string {
  return animals.map(titleCase).join(' and ');
}

function invitation(): string {
  return waitingAnimals(position.state).length > 1
    ? 'One call. Which keeper can help both?'
    : 'Call one bridge keeper back.';
}

function renderBoard(showRoutes = true): void {
  scene.session = { board: crossing.board, state: position.state };
  scene.previewRoutes = showRoutes ? waitingAnimals(position.state) : [];
  scene.refresh();
  // The reunion hides the canvas. Restore its size immediately on the next puzzle.
  if (game.scale.getParentBounds()) game.scale.refresh();
  else game.scale.updateBounds();
}

function renderControls(): void {
  const { state, keeper } = position;
  const total = state.home.length;
  const remaining = crossing.board.animals.length - total;
  const finished = won(crossing.board, state);
  const waiting = waitingAnimals(state);
  const routes = waiting.map((id) => {
    const obstacle = trace(crossing.board, state, id).obstacle;
    return obstacle
      ? `${titleCase(id)}: ${obstacle.reason}.`
      : `${titleCase(id)} has a clear path.`;
  });
  const needsUndo =
    !!keeper &&
    waiting.length > 0 &&
    waiting.every((id) => !trace(crossing.board, state, id).legal);
  prompt.textContent = keeper
    ? needsUndo
      ? 'One friend is stuck.'
      : 'Finish the rescue.'
    : `${names(waiting)} ${waiting.length === 1 ? 'is' : 'are'} stranded.`;
  count.textContent = `${total} home · ${remaining} on the board`;
  board.setAttribute(
    'aria-label',
    [`${crossing.board.title}. ${count.textContent}.`, ...routes].join(' ')
  );
  chapter.textContent = `${episode + 1} / ${callbackCrossings.length} · ${crossing.board.title}`;
  shore.textContent = keeper ? 'Still at the river' : 'At the campfire';
  for (const [id, button] of controls) {
    const home = isHome(state, id);
    const symbols = crossing.board.bridges
      .filter((bridge) => canHoldBridge(bridge, id))
      .map(({ symbol }) => symbol);
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
      legal && (!keeper || waiting.includes(id) || waiting.length === 0)
    );
    button.querySelector('small')!.textContent =
      !keeper && legal && symbols.length
        ? `${detail} ${symbols.join(' ')}`
        : detail;
    button.setAttribute('aria-label', `${detail} ${titleCase(id)}`);
  }
  undo.disabled = busy || history.length === 0;
  recallAgain.hidden = !needsUndo;
  recallAgain.disabled = busy;
  dispatch.classList.toggle('blocked', needsUndo);
  play.hidden = finished;
  reunion.hidden = !finished;
  if (finished && keeper) {
    finish.textContent = `${titleCase(keeper)} went back for ${names(waitingAnimals(callbackStart(crossing)))}.`;
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
  const recalled = keeper ? undefined : recallKeeper(crossing.board, state, id);
  if (keeper ? !trace(crossing.board, state, id).legal : !recalled) return;
  busy = scene.busy = true;
  renderControls();
  history.push(previous);
  if (recalled) {
    dispatch.textContent = `${name} is coming back.`;
    await scene.animateReturn(id, recalled, reduced);
    position = { state: recalled, keeper: id };
    const opened = crossing.board.bridges
      .filter(
        (bridge) => !bridgeOpen(state, bridge) && bridgeOpen(recalled, bridge)
      )
      .map(({ id }) => id);
    renderBoard(false);
    await scene.raiseBridges(opened, reduced);
    renderBoard();
    const clear = waitingAnimals(recalled).filter(
      (animal) => trace(crossing.board, recalled, animal).legal
    );
    dispatch.textContent = clear.length
      ? `${name} raised ${opened.length === 1 ? 'the bridge' : 'both bridges'}. ${names(clear)} can cross.`
      : 'The route is still blocked. Undo to try another keeper.';
  } else {
    dispatch.textContent = `${name} is crossing.`;
    await scene.animateHome(id, reduced);
    const nextState = move(crossing.board, state, id);
    position = { state: nextState, ...(keeper ? { keeper } : {}) };
    await scene.fold(
      crossing.board.bridges
        .filter(
          (bridge) =>
            bridgeOpen(state, bridge) && !bridgeOpen(nextState, bridge)
        )
        .map((bridge) => bridge.id),
      reduced
    );
    const waiting = waitingAnimals(nextState);
    const clear = waiting.filter(
      (animal) => trace(crossing.board, nextState, animal).legal
    );
    const firstBlocked = waiting[0];
    const obstacle = firstBlocked
      ? trace(crossing.board, nextState, firstBlocked).obstacle
      : undefined;
    dispatch.textContent =
      waiting.length === 0
        ? `${name} is safe. Bring the keeper home.`
        : clear.length
          ? `${name} is safe. ${names(clear)} can cross next.`
          : firstBlocked && obstacle
            ? `${titleCase(firstBlocked)}: ${obstacle.reason}.`
            : 'Undo to try again.';
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
      ) ?? (recallAgain.hidden ? undo : recallAgain)
    ).focus({ preventScroll: true });
  }
}

undo.addEventListener('click', () => {
  const previous = history.pop();
  if (!previous) return;
  position = previous;
  restore(previous.keeper ? 'The keeper is back at the bridge.' : invitation());
});

function begin(index: number, focusChoice = false): void {
  episode = index;
  crossing = callbackCrossings[index]!;
  position = { state: callbackStart(crossing) };
  history.length = 0;
  restore(invitation());
  if (focusChoice)
    actions
      .querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')
      ?.focus({ preventScroll: true });
}
next.addEventListener('click', () => begin(episode + 1, true));
document
  .querySelector('#again')!
  .addEventListener('click', () => begin(episode, true));
recallAgain.addEventListener('click', () => begin(episode, true));
game.events.once('board-ready', () => {
  ready = true;
  begin(0);
});
renderControls();

async function findDaily(): Promise<void> {
  retry.disabled = true;
  try {
    let href = '/game.html';
    let kind = 'today';
    if (!__LOCAL_DEMO__) {
      const response = await fetch('/api/callback/destination', {
        signal: AbortSignal.timeout(5000),
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !isObject(data) ||
        typeof data.url !== 'string' ||
        (data.kind !== 'today' &&
          data.kind !== 'latest' &&
          data.kind !== 'community') ||
        !/^https:\/\/www\.reddit\.com\/(comments\/[a-z0-9]+|r\/[a-z0-9_]+)\/$/i.test(
          data.url
        )
      )
        throw new Error('Daily crossing unavailable');
      href = data.url;
      kind = data.kind;
    }
    daily.href = skip.href = href;
    daily.textContent =
      kind === 'today'
        ? 'Play today’s crossing'
        : kind === 'latest'
          ? 'Play the latest crossing'
          : 'Visit the rescue community';
    skip.textContent =
      kind === 'today'
        ? 'Daily crossing'
        : kind === 'latest'
          ? 'Latest crossing'
          : 'Rescue community';
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
