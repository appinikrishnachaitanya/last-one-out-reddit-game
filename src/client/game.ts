import { HINT_REFILL_MS } from '../shared/hint-refill';
import { CommunityRescue, describeMove } from './community-rescue';
import type { CommunityBoard } from '../shared/community-board';
import { setupAtmosphere } from './atmosphere';
import {
  formatElapsed,
  isObject,
  highestCount,
  parseCommentHint,
  validElapsed,
} from '../shared/daily';
import {
  getWebViewMode,
  navigateTo,
  requestExpandedMode,
} from '@devvit/web/client';
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
  isAnimalId,
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
let startedAt = 0;
let openingTrap: AnimalId | undefined;
let firstAttempt = false;
let attemptId: string | undefined;
let firstMistakeSeen = false;
const attemptWrites = new Set<Promise<unknown>>();
function startAttempt(restore: boolean): void {
  if (localDemo || !edition) return;
  attemptId = crypto.randomUUID();
  firstMistakeSeen = false;
  const key = `loo-attempt:${edition.id}`;
  try {
    if (restore) attemptId = localStorage.getItem(key) ?? attemptId;
    localStorage.setItem(key, attemptId);
    firstMistakeSeen =
      localStorage.getItem(`loo-mistake:${edition.id}`) === attemptId;
  } catch {
    /* This session can still report its attempt. */
  }
}
function recordAttempt(
  event: 'firstMove' | 'firstMistake',
  animal: AnimalId,
  before: readonly AnimalId[]
): void {
  if (!attemptId || localDemo || tourActive) return;
  if (event === 'firstMistake') {
    if (firstMistakeSeen) return;
    firstMistakeSeen = true;
    try {
      if (edition) localStorage.setItem(`loo-mistake:${edition.id}`, attemptId);
    } catch {
      /* optional */
    }
  }
  const write = api
    .request('attempt', { event, animal, before, attemptId })
    .catch(() => undefined);
  attemptWrites.add(write);
  void write.finally(() => attemptWrites.delete(write));
}
let hintSyncEnabled = false;
let hintRequest = false;
let showTimer = true;
try {
  showTimer = localStorage.getItem('loo-live-timer') !== 'false';
} catch {
  /* use default */
}
const timerSetting = element('show-timer', HTMLInputElement);
timerSetting.checked = showTimer;
timerSetting.addEventListener('change', () => {
  showTimer = timerSetting.checked;
  try {
    localStorage.setItem('loo-live-timer', String(showTimer));
  } catch {
    /* optional */
  }
  updateRunIndicators();
});
let finishedSeconds: number | undefined;

let refillAt = 0;
let hintKey = '';
let hintUsed = false;
function readTimestamp(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
function storeTimestamp(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* optional */
  }
}
let hintRevision = 0;
async function refreshHint(): Promise<void> {
  if (!hintSyncEnabled || !edition || hintRequest || busy) return;
  const current = edition;
  const revision = ++hintRevision;
  try {
    const data = await api.request('lifelines');
    if (
      edition === current &&
      revision === hintRevision &&
      isObject(data) &&
      typeof data.refillAt === 'number'
    ) {
      refillAt = data.refillAt;
      updateRunIndicators();
    }
  } catch {
    /* Keep the current hint state until the next refresh. */
  }
}
function updateRunIndicators(): void {
  const clock = element('run-clock', HTMLElement);
  const clockGroup = element('play-clock', HTMLElement);
  clockGroup.hidden =
    !showTimer || tourActive || shared.active || !result.hidden;
  if (!clockGroup.hidden)
    clock.textContent = formatElapsed(
      startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
    );
  const undo = button('undo');
  undo.disabled =
    busy ||
    shared.active ||
    !session.history.length ||
    (!tourActive && won(session.board, session.state));
  undo.title = 'Restore the previous move';
  const left = Math.max(0, Math.ceil((refillAt - Date.now()) / 1000));
  button('hint').disabled =
    !!left ||
    hintRequest ||
    busy ||
    tourActive ||
    !result.hidden ||
    won(session.board, session.state);
  button('hint').title = left ? 'Hint recharging' : 'Use one hint';
  element('lifeline-status', HTMLElement).textContent = left
    ? `Hint recharges in ${Math.ceil(left / 60)} min`
    : 'One hint ready · recharges after 15 minutes';
}
window.setInterval(updateRunIndicators, 1000);
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
let reduced = false;
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
  element('app', HTMLElement).classList.toggle(
    'stranded',
    scene.blocked.length > 0 && !busy
  );
}
function rememberRun(): void {
  if (
    !edition ||
    busy ||
    tourActive ||
    shared.active ||
    session.board.id !== edition.puzzleId
  )
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
let savedSolo:
  | {
      session: Session;
      selected: AnimalId | undefined;
      showResult: boolean;
      showCue: boolean;
      pickerOpen: boolean;
      feedback: string;
      warning: boolean;
      blocked: AnimalId[];
    }
  | undefined;

const sharedRules =
  'One shared board. One move per player. The board resets if a friend gets stranded.';
function applyShared(state: CommunityBoard): void {
  session = new Session(session.board);
  for (const animal of state.home) session.send(animal);
  selected = undefined;
  scene.blocked = [];
  const latest = state.log.at(-1);
  say(
    latest?.outcome === 'stranded'
      ? `${latest.stranded ? titleCase(latest.stranded) : 'An animal'} lost their way home. A fresh attempt is ready!`
      : latest
        ? describeMove(latest)
        : sharedRules
  );
  element('shared-summary', HTMLElement).textContent =
    `Attempt ${state.attempts + 1} · ${state.successfulRescues} shared wins · Move log`;
  const log = element('shared-log', HTMLOListElement);
  log.replaceChildren(
    ...state.log
      .slice()
      .reverse()
      .map((move) => {
        const row = document.createElement('li');
        row.textContent = describeMove(move);
        return row;
      })
  );
  const celebration = element('shared-celebration', HTMLElement);
  celebration.hidden = latest?.outcome !== 'rescued';
  celebration.textContent = celebration.hidden
    ? ''
    : `Rescued together by ${state.lastRescue.map((name) => `u/${name}`).join(', ')}.`;
  refresh();
}
const shared = new CommunityRescue(api, applyShared, (message) => {
  element('shared-status', HTMLElement).textContent = message;
});
button('community-tab').addEventListener('click', () => {
  if (busy || tourActive || shared.active || saving.has(epoch) || !edition)
    return;
  savedSolo = {
    session,
    selected,
    showResult: !result.hidden,
    showCue: !element('first-move', HTMLElement).hidden,
    pickerOpen:
      document.querySelector<HTMLDetailsElement>('.animal-picker')?.open ??
      false,
    feedback: feedback.textContent ?? '',
    warning: feedback.classList.contains('warning'),
    blocked: [...scene.blocked],
  };
  result.hidden = true;
  element('first-move', HTMLElement).hidden = true;
  session = new Session(session.board);
  selected = undefined;
  scene.blocked = [];
  document.querySelector('.animal-picker')?.removeAttribute('open');
  element('shared-rescue', HTMLElement).hidden = false;
  shared.open();
  say(sharedRules);
  refresh();
});
button('solo-tab').addEventListener('click', () => {
  if (!savedSolo || busy || shared.moving) return;
  shared.close();
  session = savedSolo.session;
  selected = savedSolo.selected;
  result.hidden = !savedSolo.showResult;
  scene.blocked = savedSolo.blocked;
  element('first-move', HTMLElement).hidden = !savedSolo.showCue;
  document
    .querySelector('.animal-picker')
    ?.toggleAttribute('open', savedSolo.pickerOpen);
  element('shared-rescue', HTMLElement).hidden = true;
  say(savedSolo.feedback, savedSolo.warning);
  savedSolo = undefined;
  refresh();
});
button('shared-refresh').addEventListener('click', () => {
  void shared.refresh();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void shared.refresh();
});
function refresh(): void {
  element('app', HTMLElement).classList.toggle('community-mode', shared.active);
  button('solo-tab').setAttribute('aria-pressed', String(!shared.active));
  button('community-tab').setAttribute('aria-pressed', String(shared.active));
  button('community-tab').disabled = busy || tourActive;
  button('solo-tab').disabled = busy;
  element('app', HTMLElement).classList.toggle('touring', tourActive);
  element('app', HTMLElement).classList.toggle(
    'solved',
    won(session.board, session.state) && !result.hidden
  );
  button('view-result').hidden =
    tourActive ||
    shared.active ||
    !result.hidden ||
    !won(session.board, session.state) ||
    results.edition !== edition;
  scene.session = session;
  scene.selected = selected;
  scene.practiceTarget =
    tourActive && tourPhase === 'preview' ? 'turtle' : undefined;
  scene.refresh();
  element('rescue-count', HTMLSpanElement).textContent =
    `${session.state.home.length} / 4`;
  element('board-title', HTMLHeadingElement).textContent = tourActive
    ? 'Practice crossing'
    : session.board.title;
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
    const home = isHome(session.state, a.id);
    const obstacle = home
      ? undefined
      : trace(session.board, session.state, a.id).obstacle;
    b.setAttribute(
      'aria-label',
      [
        titleCase(a.id),
        home ? 'home' : obstacle ? `waiting: ${obstacle.reason}` : 'path clear',
        badge && !home ? `holds the ${badge} bridge` : '',
      ]
        .filter(Boolean)
        .join(', ')
    );
    b.disabled = busy || isHome(session.state, a.id);
    b.classList.toggle('home', isHome(session.state, a.id));
    b.addEventListener('click', () => choose(a.id));
    controls.append(b);
  }
  updateRunIndicators();
  button('restart').disabled = busy || shared.active;
  button('help-practice').disabled = shared.active;
  button('motion-dialog').disabled = busy || motionPreference.matches;
  button('expand').disabled = busy;
  button('tour-action').disabled = busy;
  button('send').disabled =
    busy ||
    (shared.active && !shared.state?.canMove) ||
    !selected ||
    !trace(session.board, session.state, selected).legal;
  button('send').textContent = busy
    ? 'On the way…'
    : selected
      ? `Send ${titleCase(selected)} →`
      : 'Send home →';
  button('motion-dialog').setAttribute(
    'aria-pressed',
    String(reduced || motionPreference.matches)
  );
  element('app', HTMLElement).classList.toggle(
    'skip-animations',
    reduced || motionPreference.matches
  );
  rememberRun();
  element('personal-stats', HTMLSpanElement).textContent = session.undos
    ? `${session.undos} personal undo${session.undos === 1 ? '' : 's'}`
    : '';
  updateRunIndicators();
  // A cue or mode change can move the canvas without resizing it.
  game.scale.updateBounds();
}
function choose(id: AnimalId): void {
  if (
    tourActive &&
    (id !== 'turtle' || tourPhase === 'undo' || tourPhase === 'finish')
  )
    return;
  if (busy || isHome(session.state, id)) return;
  if (shared.active && !shared.state?.canMove) {
    const message = !shared.state
      ? 'The shared board is loading.'
      : shared.state.signedIn
        ? 'You can watch the board while another player takes a turn.'
        : 'Sign in to Reddit to take your turn.';
    say(message);
    return;
  }
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
  if (shared.active) {
    if (!shared.state?.canMove) return;
    busy = true;
    scene.busy = true;
    refresh();
    await shared.move(id, () =>
      scene.animateHome(id, reduced || motionPreference.matches)
    );
    busy = false;
    scene.busy = false;
    refresh();
    return;
  }
  const openingMove = !firstAttempt && !tourActive;
  const before = session.state.home;
  if (openingMove) recordAttempt('firstMove', id, before);
  if (!tourActive) {
    firstAttempt = true;
    element('first-move', HTMLElement).hidden = true;
    element('hint-text', HTMLElement).hidden = true;
    flow.commit();
    if (!startedAt && edition) {
      startedAt = Date.now();
      storeTimestamp(`loo-start:${edition.id}`, startedAt);
    }
    updateRunIndicators();
  }
  busy = true;
  scene.busy = true;
  const previouslyClear = session.board.animals
    .filter((a) => trace(session.board, session.state, a.id).legal)
    .map((a) => a.id);
  refresh();
  say(`${titleCase(id)} is on the way home…`);
  await scene.animateHome(id, reduced || motionPreference.matches);
  session.send(id);
  if (
    session.board.animals.some(
      ({ id: friend }) =>
        !isHome(session.state, friend) &&
        trace(session.board, { home: before }, friend).obstacle?.kind !==
          'bridge' &&
        trace(session.board, session.state, friend).obstacle?.kind === 'bridge'
    )
  )
    recordAttempt('firstMistake', id, before);
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
    reduced || motionPreference.matches
  );
  scene.blocked = blocked;
  if (openingMove && blocked.length) {
    openingTrap = id;
    try {
      if (edition) localStorage.setItem(`loo-trap:${edition.id}`, id);
    } catch {
      /* optional */
    }
  }
  if (tourActive) tourPhase = 'undo';
  busy = false;
  scene.busy = false;
  refresh();
  if (blocked.length)
    say(
      `Stranded! ${blocked.map(titleCase).join(' and ')}’s bridge just folded. Undo to reopen it.`,
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
    scene.celebrate(reduced || motionPreference.matches);
    say('Everyone home. The forest can rest.');
    if (edition) {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      finishedSeconds =
        startedAt && validElapsed(seconds) ? seconds : undefined;
      results.show(
        edition,
        session.undos,
        commentsUrl,
        null,
        session.state.home,
        finishedSeconds,
        hintUsed
      );
      submission = {
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence: [...session.state.home],
        personalUndos: session.undos,
        hintUsed,
        attemptId,
        ...(openingTrap ? { openingTrap } : {}),
        elapsedSeconds: finishedSeconds,
        favorite: results.favorite,
      };
      void saveResult();
    }
  } else button('undo').focus({ preventScroll: true });
}
button('back-to-board').addEventListener('click', () => {
  result.hidden = true;
  refresh();
  button('view-result').focus();
});
button('view-result').addEventListener('click', () => {
  result.hidden = false;
  refresh();
  button('copy-result').focus();
});
button('send').addEventListener('click', () => {
  void send();
});
button('undo').addEventListener('click', () => {
  if (
    busy ||
    shared.active ||
    (!tourActive && won(session.board, session.state))
  )
    return;
  if (!session.undo()) return;
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
  if (busy || tourActive || shared.active) return;
  flow.abandon();
  flow = new JourneyFlow(journeyClient(edition?.id ?? 'loading'), !localDemo);
  session.restart();
  help.close();
  openingTrap = undefined;
  try {
    if (edition) localStorage.removeItem(`loo-trap:${edition.id}`);
  } catch {
    /* optional */
  }
  firstAttempt = false;
  startAttempt(false);
  startedAt = 0;
  finishedSeconds = undefined;
  if (edition) storeTimestamp(`loo-start:${edition.id}`, 0);
  epoch++;
  submission = undefined;
  selected = undefined;
  scene.blocked = [];
  result.hidden = true;
  refresh();
  say('A fresh look. Everyone is back at the crossing.');
});
motionPreference.addEventListener('change', () => {
  if (!busy) refresh();
});
button('motion-dialog').addEventListener('click', () => {
  if (busy || motionPreference.matches) return;
  reduced = !reduced;
  try {
    localStorage.setItem('loo-skip-animations', String(reduced));
  } catch {
    /* Settings still apply for this session. */
  }
  refresh();
});
const help = element('help-dialog', HTMLDialogElement);
button('help').addEventListener('click', () => help.showModal());
button('archive-open').addEventListener('click', async () => {
  const archive = element('settings-archive', HTMLElement);
  archive.hidden = !archive.hidden;
  if (archive.hidden) return;
  await results.loadCrossings();
  archive.replaceChildren();
  for (const id of ['card-collection', 'archive-result']) {
    const copy = element(id, HTMLElement).cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.querySelectorAll('a').forEach((link) =>
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigateTo(link.href);
      })
    );
    archive.append(copy);
  }
});
button('hint').addEventListener('click', async () => {
  if (!hintSyncEnabled) refillAt = Math.max(refillAt, readTimestamp(hintKey));
  if (
    hintRequest ||
    busy ||
    tourActive ||
    won(session.board, session.state) ||
    Date.now() < refillAt
  )
    return;
  const currentEpoch = epoch;
  let commentHint: ReturnType<typeof parseCommentHint>;
  if (hintSyncEnabled) {
    hintRequest = true;
    hintRevision++;
    updateRunIndicators();
    try {
      const data = await api.request('hint', {});
      if (isObject(data) && typeof data.refillAt === 'number') {
        if (currentEpoch !== epoch) return;
        refillAt = data.refillAt;
        if (data.granted !== true) return;
        if (data.granted === true) commentHint = parseCommentHint(data.hint);
      } else return;
    } catch {
      say('Could not confirm your hint charge. Try again in a moment.', true);
      return;
    } finally {
      hintRequest = false;
      updateRunIndicators();
    }
  }
  if (!hintSyncEnabled) {
    refillAt = Date.now() + HINT_REFILL_MS;
    storeTimestamp(hintKey, refillAt);
  }
  updateRunIndicators();
  if (currentEpoch !== epoch || busy || tourActive || !result.hidden) return;
  hintUsed = true;
  storeTimestamp(`${hintKey}:used`, 1);
  const tip = element('hint-text', HTMLParagraphElement);
  if (commentHint) {
    const link = document.createElement('a');
    link.href = commentHint.url;
    link.textContent = 'Read the comment';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigateTo(link.href);
    });
    tip.replaceChildren(`Community hint: ${commentHint.text} `, link);
    tip.hidden = false;
    return;
  }
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
    await Promise.all(attemptWrites);
    const saved = await api.save(
      savingEdition,
      payload,
      await savingFlow.correlation()
    );
    savingFlow.validated();
    if (current !== epoch) return;
    results.saved(saved.completion, saved.attemptStats, saved.firstCompletion);
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
  if (scene.busy || tourActive || shared.active) return;
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
      element('rescue-modes', HTMLElement).hidden = true;
      playable(false);
      element('empty-message', HTMLParagraphElement).textContent = data.message;
      return;
    }
    edition = data.edition;
    element('rescue-modes', HTMLElement).hidden = !data.communityEnabled;
    startAttempt(true);
    openingTrap = undefined;
    try {
      const trap = localStorage.getItem(`loo-trap:${edition.id}`);
      if (isAnimalId(trap)) openingTrap = trap;
    } catch {
      /* optional */
    }
    hintSyncEnabled =
      data.hintSync === true || typeof data.refillAt === 'number';
    hintKey = `loo-daily-hint:v2:${edition.id}:${data.username?.toLowerCase() ?? 'guest'}`;
    refillAt = hintSyncEnabled ? (data.refillAt ?? 0) : readTimestamp(hintKey);
    hintUsed =
      Boolean(readTimestamp(`${hintKey}:used`)) || refillAt > Date.now();
    element('hint-text', HTMLElement).hidden = true;
    startedAt = readTimestamp(`loo-start:${edition.id}`);
    finishedSeconds = data.completion?.elapsedSeconds;
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
    firstAttempt = session.state.home.length > 0 || session.undos > 0;
    const firstCue = element('first-move', HTMLElement);
    const stats = data.previousRescues;
    const mostStranded = stats && highestCount(stats.stranded)[0];
    firstCue.textContent =
      stats && !localDemo && (stats.totalSolves > 0 || stats.yesterday)
        ? stats.yesterday
          ? `Yesterday: ${stats.totalSolves.toLocaleString()} rescues • Most stranded: ${mostStranded ? titleCase(mostStranded[0]) : '—'} • Perfect runs: ${stats.totalSolves ? `${Math.round((stats.perfectRuns / stats.totalSolves) * 100)}%` : '—'}`
          : `Today: ${stats.totalSolves.toLocaleString()} rescues`
        : 'Tap to preview a path. Watch who holds the bridges.';
    firstCue.hidden = firstAttempt || !!data.completion;
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
      results.show(
        edition,
        session.undos,
        commentsUrl,
        data.completion,
        session.state.home,
        finishedSeconds,
        hintUsed
      );
      results.sharing(data.shareStatus);
      if (data.community)
        results.community(
          data.attemptStats,
          data.completion.firstMove ?? data.completion.opening
        );
    }
    busy = false;
    refresh();
    if (!data.completion && won(session.board, session.state)) {
      results.show(
        edition,
        session.undos,
        commentsUrl,
        null,
        session.state.home,
        finishedSeconds,
        hintUsed
      );
      submission = {
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence: [...session.state.home],
        personalUndos: session.undos,
        hintUsed,
        attemptId,
        ...(openingTrap ? { openingTrap } : {}),
        elapsedSeconds: finishedSeconds,
        favorite: results.favorite,
      };
      refresh();
      void saveResult();
    }
    if (data.completion) {
      scene.celebrate(reduced || motionPreference.matches);
      say('Your saved rescue. Everyone is still home.');
    } else say(firstAttempt ? 'Tap an animal to see its path.' : '');
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
    }
  }
}
function startTour(): void {
  if (busy || tourActive || shared.active) return;
  if (saving.has(epoch)) {
    help.close();
    say('Your rescue is still saving. Try the practice once it finishes.');
    return;
  }
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
      'Preview Turtle.',
      'Tap the highlighted Turtle or use the button to see its route.',
      'Show Turtle’s path',
    ],
    send: [
      '2 / 4 · PRACTICE',
      'Send Turtle.',
      'Turtle holds the ☾ bridge open. Send Turtle and watch the bridge.',
      'Send Turtle home',
    ],
    undo: [
      '3 / 4 · PRACTICE',
      'Rabbit is stranded.',
      'The ☾ bridge folded. Rabbit’s route ends at the gap. Undo to reopen it.',
      'Undo the move',
    ],
    finish: [
      '4 / 4 · PRACTICE',
      'The bridge is open.',
      'The bridge is open again. Before sending an animal, check who still needs its bridge.',
      'Play my daily crossing',
    ],
  };
  const step = steps[tourPhase];
  element('tour-step', HTMLParagraphElement).textContent = step[0] ?? '';
  element('tour-title', HTMLHeadingElement).textContent = step[1] ?? '';
  element('tour-copy', HTMLParagraphElement).textContent = step[2] ?? '';
  button('tour-action').textContent = step[3] ?? '';
  button('tour-action').disabled = busy;
  if (!busy) button('tour-action').focus({ preventScroll: true });
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
  if (won(session.board, session.state))
    scene.celebrate(reduced || motionPreference.matches);
  say('Your daily crossing. Practice did not change your result.');
  button('help').focus({ preventScroll: true });
}
button('help-practice').addEventListener('click', startTour);
button('exit-tour').addEventListener('click', finishTour);
button('tour-action').addEventListener('click', () => {
  if (busy) return;
  if (tourPhase === 'preview') choose('turtle');
  else if (tourPhase === 'send') void send();
  else if (tourPhase === 'undo') button('undo').click();
  else finishTour();
});
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
window.setInterval(() => {
  if (!document.hidden) void refreshHint();
}, 15000);
window.addEventListener('focus', () => {
  void refreshHint();
  syncPresentation();
  if (busy || tourActive || shared.active || !edition || !result.hidden) return;
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
  setupAtmosphere((id) => scene.setScenery(id));
  void initialize();
});
