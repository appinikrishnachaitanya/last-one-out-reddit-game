import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';
import { serializeDraft, restoreDraft } from './draft';
import * as Phaser from 'phaser';
import { MOONROOT, boardById } from '../shared/boards';
import { DailyApi } from './daily-api';
import { Results } from './results';
import { JourneyFlow } from './journeys';
import { createTelemetryClient } from '@devvit/analytics/client/reddit';
import type { Edition } from '../shared/daily';
import {
  Session,
  isHome,
  titleCase,
  trace,
  won,
  solve,
} from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import { ANIMAL_COLORS, Crossing } from './scenes/Crossing';
declare const __LOCAL_DEMO__: boolean;
const localDemo = __LOCAL_DEMO__;
function element<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const value = document.getElementById(id);
  if (!(value instanceof ctor)) throw new Error(`Missing UI: ${id}`);
  return value;
}
const button = (id: string) => element(id, HTMLButtonElement);
const feedback = element('feedback', HTMLParagraphElement);
const result = element('result', HTMLElement);
let session = new Session(MOONROOT);
const api = new DailyApi();
let edition: Edition | undefined;
let commentsUrl: string | null = null;
let epoch = 0;
const saving = new Set<number>();
let submission: unknown;
const journeyClient = (id: string) =>
  createTelemetryClient({ storageKey: `loo-journey:${id}` });
let flow = new JourneyFlow(journeyClient('loading'), !localDemo);
const results = new Results(
  localDemo,
  () => {
    void persistFavorite();
  },
  () => {
    void saveResult();
  }
);
let selected: AnimalId | undefined;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;
try {
  const savedMotion = localStorage.getItem('loo-skip-animations');
  if (savedMotion !== null) reduced = savedMotion === 'true';
} catch {
  /* Play with the device preference if storage is unavailable. */
}
let busy = true;
type TourPhase = 'preview' | 'send' | 'undo' | 'finish';
let tourActive = false;
let tourPhase: TourPhase = 'preview';
let dailyRun: Session | undefined;
let dailyResultVisible = false;
const scene = new Crossing(session, choose);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 840,
  height: 840,
  backgroundColor: '#102f35',
  render: { antialias: true, roundPixels: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene],
  input: { activePointers: 2 },
  audio: { noAudio: true },
});
function say(text: string, warning = false): void {
  feedback.textContent = text;
  feedback.classList.toggle('warning', warning);
}
function rememberRun(): void {
  if (!edition || busy || tourActive || session.board.id !== edition.puzzleId)
    return;
  try {
    localStorage.setItem(
      `loo-run:${edition.id}`,
      serializeDraft(edition, session)
    );
  } catch {
    /* storage is optional */
  }
}
function refresh(): void {
  element('app', HTMLElement).classList.toggle('touring', tourActive);
  element('app', HTMLElement).classList.toggle(
    'solved',
    won(session.board, session.state) && !result.hidden
  );
  scene.session = session;
  scene.selected = selected;
  scene.refresh();
  element('rescue-count', HTMLSpanElement).textContent =
    `${session.state.home.length} / 4`;
  element('board-title', HTMLHeadingElement).textContent = session.board.title;
  document.title = `Last One Out · ${session.board.title}`;
  element('game-container', HTMLDivElement).setAttribute(
    'aria-label',
    `${session.board.title}. ${session.state.home.length} of 4 animals home. Use the animal buttons to preview routes.`
  );
  const controls = element('animal-controls', HTMLDivElement);
  controls.replaceChildren();
  for (const a of session.board.animals) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.animal = a.id;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = ANIMAL_COLORS[a.id];
    b.append(dot);
    const badge = session.board.bridges
      .filter((bridge) => bridge.holder === a.id)
      .map((bridge) => bridge.symbol)
      .join('');
    b.append(`${titleCase(a.id)} ${isHome(session.state, a.id) ? '✓' : badge}`);
    b.setAttribute('aria-pressed', String(selected === a.id));
    b.setAttribute(
      'aria-label',
      `${titleCase(a.id)}${badge ? `, holds ${badge} bridge` : ''}${isHome(session.state, a.id) ? ', home' : ''}`
    );
    b.disabled = busy || isHome(session.state, a.id);
    b.classList.toggle('home', isHome(session.state, a.id));
    b.addEventListener('click', () => choose(a.id));
    controls.append(b);
  }
  button('undo').disabled = busy || !session.history.length;
  button('restart').disabled = busy;
  button('motion-dialog').disabled = busy;
  button('expand').disabled = busy;
  button('tour-action').disabled = busy;
  button('send').disabled =
    busy || !selected || !trace(session.board, session.state, selected).legal;
  button('send').textContent = busy
    ? 'On the way…'
    : selected
      ? `Send ${titleCase(selected)} →`
      : 'Send home →';
  button('motion-dialog').setAttribute('aria-pressed', String(reduced));
  element('app', HTMLElement).classList.toggle('skip-animations', reduced);
  rememberRun();
  element('personal-stats', HTMLSpanElement).textContent = session.undos
    ? `${session.undos} personal undo${session.undos === 1 ? '' : 's'} · no penalty`
    : 'No timer. Take your time.';
}
function choose(id: AnimalId): void {
  if (
    tourActive &&
    (id !== 'turtle' || tourPhase === 'undo' || tourPhase === 'finish')
  )
    return;
  if (busy || isHome(session.state, id)) return;
  if (selected === id && trace(session.board, session.state, id).legal) {
    void send();
    return;
  }
  const restoreButtonFocus = document.activeElement?.matches(
    '#animal-controls button'
  );
  selected = id;
  if (tourActive) tourPhase = 'send';
  scene.blocked = [];
  refresh();
  const route = trace(session.board, session.state, id);
  const bridges = session.board.bridges.filter((b) => b.holder === id);
  say(
    route.legal
      ? `${titleCase(id)} has a clear path.${bridges.length ? ` Leaving folds the ${bridges.map((b) => b.symbol).join(' ')} bridge. Tap again to send.` : ' Tap again to send home.'}`
      : `${titleCase(id)} is blocked: ${route.obstacle?.reason ?? 'no route'}.`,
    !route.legal
  );
  if (tourActive) renderTour();
  // The DOM is rebuilt after every state change; preserve keyboard focus on selection.
  if (restoreButtonFocus)
    element('animal-controls', HTMLDivElement)
      .querySelector<HTMLButtonElement>(`[data-animal="${id}"]`)
      ?.focus({ preventScroll: true });
}
async function send(): Promise<void> {
  if (busy || !selected || !trace(session.board, session.state, selected).legal)
    return;
  const id = selected;
  if (!tourActive) flow.commit();
  busy = true;
  scene.busy = true;
  const previouslyClear = session.board.animals
    .filter((a) => trace(session.board, session.state, a.id).legal)
    .map((a) => a.id);
  refresh();
  say(`${titleCase(id)} is on the way home…`);
  await scene.animateHome(id, reduced);
  session.send(id);
  if (!tourActive) flow.rescue(session.state.home.length);
  selected = undefined;
  scene.selected = undefined;
  const blocked = previouslyClear.filter(
    (animal) =>
      !isHome(session.state, animal) &&
      !trace(session.board, session.state, animal).legal
  );
  scene.blocked = [];
  const closed = session.board.bridges.filter((b) => b.holder === id);
  await scene.fold(
    closed.map((b) => b.id),
    reduced
  );
  scene.blocked = blocked;
  if (tourActive) tourPhase = 'undo';
  busy = false;
  scene.busy = false;
  refresh();
  if (blocked.length)
    say(
      `${blocked.map(titleCase).join(' and ')}’s bridge just folded. Undo to reopen it.`,
      true
    );
  else
    say(
      `${titleCase(id)} is home.${closed.length ? ` The ${closed.map((b) => b.symbol).join(' ')} bridge folded.` : ' One step closer.'}`
    );
  if (tourActive) {
    renderTour();
    return;
  }
  if (won(session.board, session.state)) {
    scene.celebrate(reduced);
    say('Everyone home. The forest can rest.');
    if (edition) {
      results.show(edition, session.undos, commentsUrl, null);
      submission = {
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence: [...session.state.home],
        personalUndos: session.undos,
        favorite: results.favorite,
      };
      void saveResult();
    }
  } else button('undo').focus({ preventScroll: true });
}
button('send').addEventListener('click', () => {
  void send();
});
button('undo').addEventListener('click', () => {
  if (busy || !session.undo()) return;
  if (tourActive) {
    tourPhase = 'finish';
    selected = undefined;
    scene.blocked = [];
    refresh();
    renderTour();
    return;
  }
  epoch++;
  submission = undefined;
  selected = undefined;
  scene.blocked = [];
  result.hidden = true;
  refresh();
  say('One step back. Every bridge is exactly as it was.');
});
button('restart').addEventListener('click', () => {
  if (busy || tourActive) return;
  flow.abandon();
  flow = new JourneyFlow(journeyClient(edition?.id ?? 'loading'), !localDemo);
  session.restart();
  epoch++;
  submission = undefined;
  selected = undefined;
  scene.blocked = [];
  result.hidden = true;
  refresh();
  say('A fresh look. Everyone is back at the crossing.');
});
button('motion-dialog').addEventListener('click', () => {
  if (busy) return;
  reduced = !reduced;
  try {
    localStorage.setItem('loo-skip-animations', String(reduced));
  } catch {
    /* Settings still apply for this session. */
  }
  refresh();
});
const help = element('help-dialog', HTMLDialogElement);
button('help').addEventListener('click', () => {
  element('hint-text', HTMLParagraphElement).hidden = true;
  button('hint').hidden =
    busy || tourActive || won(session.board, session.state);
  help.showModal();
});
button('hint').addEventListener('click', () => {
  const tip = element('hint-text', HTMLParagraphElement);
  const safe = new Set(
    solve(session.board, session.state).map(([first]) => first)
  );
  const risky = session.board.animals.find(
    ({ id }) =>
      !safe.has(id) &&
      trace(session.board, session.state, id).legal &&
      session.board.bridges.some((bridge) => bridge.holder === id)
  );
  const bridge = session.board.bridges.find(
    ({ holder }) => holder === risky?.id
  );
  tip.hidden = false;
  tip.textContent =
    safe.size === 0
      ? 'This position has no route to a full rescue. Undo a move and look at which crossing it restores.'
      : bridge
        ? `Look at the ${bridge.symbol} bridge. Who still needs it before its holder leaves?`
        : 'Preview a blocked animal’s path. See which friend is in the way, then check what that friend is holding open.';
});
button('close-help').addEventListener('click', () => help.close());
async function persistFavorite(): Promise<void> {
  if (!results.validated || !edition) return;
  const current = epoch,
    favorite = results.favorite;
  try {
    await api.request('favorite', { favorite });
    if (current === epoch)
      element('favorite-status', HTMLParagraphElement).textContent =
        'Card art saved.';
  } catch (error) {
    if (current !== epoch) return;
    element('favorite-status', HTMLParagraphElement).textContent =
      error instanceof Error ? error.message : 'Card art could not be saved.';
    button('retry-save').hidden = false;
  }
}
async function saveResult(): Promise<void> {
  if (!edition || !submission || saving.has(epoch)) return;
  const current = epoch,
    savingEdition = edition,
    payload = submission,
    savingFlow = flow;
  saving.add(current);
  results.status('Everyone is home. Saving your rescue…');
  try {
    const saved = await api.save(
      savingEdition,
      payload,
      await savingFlow.correlation()
    );
    savingFlow.validated();
    if (current !== epoch) return;
    results.saved(saved.completion, saved.community, saved.firstCompletion);
    if (results.favorite !== saved.completion.favorite) await persistFavorite();
  } catch (error) {
    if (current === epoch)
      results.status(
        error instanceof Error
          ? error.message
          : 'Saving failed. You can retry without replaying.',
        true
      );
  } finally {
    saving.delete(current);
  }
}
function playable(show: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-play]').forEach((el) => {
    el.hidden = !show;
  });
  element('empty-state', HTMLElement).hidden = show;
}
async function load(previewId?: string): Promise<void> {
  if (scene.busy || tourActive) return;
  const current = ++epoch;
  flow.abandon();
  flow = new JourneyFlow(journeyClient(edition?.id ?? 'loading'), !localDemo);
  busy = true;
  submission = undefined;
  result.hidden = true;
  if (localDemo && previewId) {
    api.previewId = previewId;
    try {
      sessionStorage.setItem('loo-preview-edition', previewId);
    } catch {
      /* optional */
    }
  }
  playable(true);
  refresh();
  say('Finding your crossing…');
  button('retry-load').hidden = true;
  try {
    const data = await api.init();
    if (current !== epoch) return;
    if (data.status === 'empty') {
      playable(false);
      element('empty-message', HTMLParagraphElement).textContent = data.message;
      return;
    }
    edition = data.edition;
    commentsUrl = data.commentsUrl;
    flow = new JourneyFlow(journeyClient(edition.id), !localDemo);
    const board = boardById(edition.puzzleId, edition.boardVersion);
    let draft: string | null = null;
    try {
      draft = localStorage.getItem(`loo-run:${edition.id}`);
    } catch {
      /* optional */
    }
    session = data.completion
      ? new Session(board)
      : (restoreDraft(edition, board, draft) ?? new Session(board));
    selected = undefined;
    scene.blocked = [];
    element('daily-label', HTMLSpanElement).textContent =
      `DAY ${edition.number} · ${edition.date} UTC`;
    const brandCaption = document.querySelector('.brand p');
    if (brandCaption)
      brandCaption.textContent = localDemo
        ? 'LOCAL PREVIEW'
        : `DAILY ${edition.number} · A LITTLE FOREST LOGIC`;
    element('mode-label', HTMLSpanElement).textContent = localDemo
      ? 'MOCK IDENTITY · LOCAL STORAGE'
      : 'A QUIET WAY HOME';
    if (data.completion) {
      for (const id of data.completion.sequence) session.send(id);
      session.undos = data.completion.personalUndos;
      submission = { ...data.completion };
      results.show(edition, session.undos, commentsUrl, data.completion);
      if (data.community)
        results.community(data.community, data.completion.opening);
    }
    busy = false;
    refresh();
    if (!data.completion && won(session.board, session.state)) {
      results.show(edition, session.undos, commentsUrl, null);
      submission = {
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence: [...session.state.home],
        personalUndos: session.undos,
        favorite: results.favorite,
      };
      refresh();
      void saveResult();
    }
    if (data.completion) {
      scene.celebrate(reduced);
      say('Your saved rescue. Everyone is still home.');
    } else say('Tap an animal to see its path.');
    flow.ready();
  } catch (error) {
    if (current !== epoch) return;
    playable(false);
    element('empty-message', HTMLParagraphElement).textContent =
      error instanceof Error ? error.message : 'This daily could not load.';
    button('retry-load').hidden = false;
  }
}
button('retry-load').addEventListener('click', () => {
  void load(api.previewId);
});
async function initialize(): Promise<void> {
  if (localDemo) {
    element('preview-picker', HTMLElement).hidden = false;
    try {
      const editions = await api.previews();
      const picker = element('edition-picker', HTMLSelectElement);
      for (const e of editions) {
        const option = document.createElement('option');
        option.value = e.id;
        option.textContent = `Day ${e.number} · ${boardById(e.puzzleId, e.boardVersion).title}`;
        picker.append(option);
      }
      let restored: string | null = null;
      try {
        restored = sessionStorage.getItem('loo-preview-edition');
      } catch {
        /* optional */
      }
      const first = editions.find((e) => e.id === restored) ?? editions[0];
      if (first) {
        picker.value = first.id;
        api.previewId = first.id;
      }
      picker.addEventListener('change', () => {
        if (!scene.busy) void load(picker.value);
      });
    } catch (error) {
      say(
        error instanceof Error ? error.message : 'Preview picker unavailable',
        true
      );
    }
  }
  await load(api.previewId);
  if (!busy) {
    let resumed: string | null = null;
    try {
      resumed = localStorage.getItem('loo-tour-resume:v1');
      localStorage.removeItem('loo-tour-resume:v1');
    } catch {
      /* optional */
    }
    if (
      resumed === 'preview' ||
      resumed === 'send' ||
      resumed === 'undo' ||
      resumed === 'finish'
    ) {
      startTour();
      if (resumed === 'send') choose('turtle');
      if (resumed === 'undo' || resumed === 'finish') {
        session.send('turtle');
        scene.blocked = ['rabbit'];
        if (resumed === 'finish') {
          session.undo();
          scene.blocked = [];
        }
        tourPhase = resumed;
        refresh();
        renderTour();
      }
    } else maybeShowGuide();
  }
}
const welcome = element('welcome-dialog', HTMLDialogElement);
function markGuideSeen(): void {
  try {
    localStorage.setItem('loo-guide-seen:v1', 'yes');
  } catch {
    /* optional */
  }
}
function startTour(): void {
  if (busy || tourActive) return;
  if (saving.has(epoch)) {
    welcome.close();
    help.close();
    say('Your rescue is still saving. Try the practice once it finishes.');
    return;
  }
  markGuideSeen();
  welcome.close();
  help.close();
  rememberRun();
  dailyRun = session;
  dailyResultVisible = !result.hidden;
  tourActive = true;
  tourPhase = 'preview';
  session = new Session(MOONROOT);
  selected = undefined;
  scene.blocked = [];
  result.hidden = true;
  refresh();
  renderTour();
}
function renderTour(): void {
  const panel = element('tour-panel', HTMLElement);
  panel.hidden = !tourActive;
  if (!tourActive) return;
  const steps = {
    preview: [
      '1 / 4 · PRACTICE',
      'Look before you leave.',
      'Turtle has a clear exit. Tap Turtle to preview its path and the ☾ bridge it is holding open.',
      'Show Turtle’s path',
    ],
    send: [
      '2 / 4 · PRACTICE',
      'A clear path. A consequence.',
      'The ☾ symbol connects Turtle to Rabbit’s bridge. Send Turtle and watch what happens after it reaches home.',
      'Send Turtle home',
    ],
    undo: [
      '3 / 4 · PRACTICE',
      'Rabbit still needs that bridge.',
      'Turtle is safe, but the ☾ bridge folded. Rabbit’s highlighted route stops at the gap. Bring Turtle and its bridge back together.',
      'Undo the move',
    ],
    finish: [
      '4 / 4 · PRACTICE',
      'That’s the crossing.',
      'Undo restored everyone and the bridge. In the daily, look for who needs a friend to stay. You can preview freely and Undo any move.',
      'Play my daily crossing',
    ],
  };
  const step = steps[tourPhase];
  element('tour-step', HTMLParagraphElement).textContent = step[0] ?? '';
  element('tour-title', HTMLHeadingElement).textContent = step[1] ?? '';
  element('tour-copy', HTMLParagraphElement).textContent = step[2] ?? '';
  button('tour-action').textContent = step[3] ?? '';
  button('tour-action').disabled = busy;
}
function finishTour(): void {
  if (busy || !dailyRun) return;
  tourActive = false;
  let latest: Session | null = null;
  if (!dailyResultVisible && edition) {
    try {
      latest = restoreDraft(
        edition,
        dailyRun.board,
        localStorage.getItem(`loo-run:${edition.id}`)
      );
    } catch {
      /* optional */
    }
  }
  session = latest ?? dailyRun;
  dailyRun = undefined;
  selected = undefined;
  scene.blocked = [];
  result.hidden = !dailyResultVisible;
  element('tour-panel', HTMLElement).hidden = true;
  refresh();
  if (won(session.board, session.state)) scene.celebrate(reduced);
  say('Your daily crossing. Practice did not change your result.');
}
function beginPractice(event: MouseEvent): void {
  startTour();
  if (!localDemo && tourActive) {
    try {
      if (getWebViewMode() !== 'expanded') {
        persistTour();
        requestExpandedMode(event, 'game', {
          title: 'Learn the crossing · guided practice',
        });
      }
    } catch {
      /* practice still works inline */
    }
  }
}
button('welcome-practice').addEventListener('click', beginPractice);
button('welcome-skip').addEventListener('click', () => {
  markGuideSeen();
  welcome.close();
});
button('help-practice').addEventListener('click', beginPractice);
button('exit-tour').addEventListener('click', finishTour);
button('tour-action').addEventListener('click', () => {
  if (busy) return;
  if (tourPhase === 'preview') choose('turtle');
  else if (tourPhase === 'send') void send();
  else if (tourPhase === 'undo') button('undo').click();
  else finishTour();
});
function maybeShowGuide(): void {
  try {
    if (localStorage.getItem('loo-guide-seen:v1') === 'yes') return;
  } catch {
    /* first visit */
  }
  welcome.showModal();
  welcome.scrollTop = 0;
  const title = element('welcome-title', HTMLHeadingElement);
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}
function persistTour(): void {
  if (tourActive) {
    try {
      localStorage.setItem('loo-tour-resume:v1', tourPhase);
    } catch {
      /* optional */
    }
  }
}
function syncPresentation(): void {
  let expanded = false;
  if (!localDemo) {
    try {
      expanded = getWebViewMode() === 'expanded';
    } catch {
      /* local production test lacks host globals */
    }
  }
  button('expand').hidden = expanded;
  button('expand').textContent = localDemo
    ? document.fullscreenElement
      ? 'Exit full screen'
      : 'Full screen'
    : 'Full screen';
}
button('expand').addEventListener('click', (event) => {
  rememberRun();
  persistTour();
  if (localDemo) {
    const operation = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void operation
      .then(syncPresentation)
      .catch(() =>
        say(
          'Full screen is unavailable here. You can enlarge the browser window.',
          true
        )
      );
  } else {
    try {
      requestExpandedMode(event, 'game', {
        title: edition
          ? `${session.board.title} · Last One Out`
          : 'Last One Out',
      });
    } catch {
      say('Use Reddit’s expand control to open a larger play view.', true);
    }
  }
});
window.addEventListener('focus', () => {
  syncPresentation();
  if (busy || tourActive || !edition || !result.hidden) return;
  try {
    const latest = restoreDraft(
      edition,
      session.board,
      localStorage.getItem(`loo-run:${edition.id}`)
    );
    if (
      latest &&
      (JSON.stringify(latest.state.home) !==
        JSON.stringify(session.state.home) ||
        latest.undos !== session.undos)
    )
      void load(api.previewId);
  } catch {
    /* optional draft storage */
  }
});
document.addEventListener('fullscreenchange', syncPresentation);
syncPresentation();
game.events.once('board-ready', () => {
  void initialize();
});
