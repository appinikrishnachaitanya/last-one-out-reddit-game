import * as Phaser from 'phaser';
import { MOONROOT, boardById } from '../shared/boards';
import { DailyApi } from './daily-api';
import { Results } from './results';
import { JourneyFlow } from './journeys';
import { createTelemetryClient } from '@devvit/analytics/client/reddit';
import type { Edition } from '../shared/daily';
import { Session, isHome, titleCase, trace, won } from '../shared/engine';
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
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let busy = true;
const scene = new Crossing(session, choose);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 420,
  height: 420,
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
function refresh(): void {
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
  button('motion').disabled = busy;
  button('send').disabled =
    busy || !selected || !trace(session.board, session.state, selected).legal;
  button('send').textContent = busy
    ? 'On the way…'
    : selected
      ? `Send ${titleCase(selected)} →`
      : 'Send home →';
  button('motion').setAttribute('aria-pressed', String(reduced));
  button('motion').textContent = reduced ? 'Motion reduced' : 'Reduce motion';
  element('personal-stats', HTMLSpanElement).textContent = session.undos
    ? `${session.undos} personal undo${session.undos === 1 ? '' : 's'} · no penalty`
    : 'No timer. Take your time.';
}
function choose(id: AnimalId): void {
  if (busy || isHome(session.state, id)) return;
  if (selected === id && trace(session.board, session.state, id).legal) {
    void send();
    return;
  }
  selected = id;
  scene.blocked = [];
  refresh();
  const route = trace(session.board, session.state, id);
  const bridges = session.board.bridges.filter((b) => b.holder === id);
  say(
    route.legal
      ? `${titleCase(id)} has a clear path.${bridges.length ? ` Leaving folds the ${bridges.map((b) => b.symbol).join(' ')} bridge.` : ' Tap again to send home.'}`
      : `${titleCase(id)} is blocked: ${route.obstacle?.reason ?? 'no route'}.`,
    !route.legal
  );
  // The DOM is rebuilt after every state change; preserve keyboard focus on selection.
  element('animal-controls', HTMLDivElement)
    .querySelector<HTMLButtonElement>(`[data-animal="${id}"]`)
    ?.focus({ preventScroll: true });
}
async function send(): Promise<void> {
  if (busy || !selected || !trace(session.board, session.state, selected).legal)
    return;
  const id = selected;
  flow.commit();
  busy = true;
  scene.busy = true;
  const previouslyClear = session.board.animals
    .filter((a) => trace(session.board, session.state, a.id).legal)
    .map((a) => a.id);
  refresh();
  say(`${titleCase(id)} is on the way home…`);
  await scene.animateHome(id, reduced);
  session.send(id);
  flow.rescue(session.state.home.length);
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
  busy = false;
  scene.busy = false;
  refresh();
  if (blocked.length)
    say(
      `${blocked.map(titleCase).join(' and ')}’s bridge just folded. Undo is here if you need it.`,
      true
    );
  else
    say(
      `${titleCase(id)} is home.${closed.length ? ` The ${closed.map((b) => b.symbol).join(' ')} bridge folded.` : ' One step closer.'}`
    );
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
  epoch++;
  submission = undefined;
  selected = undefined;
  scene.blocked = [];
  result.hidden = true;
  refresh();
  say('One step back. Every bridge is exactly as it was.');
});
button('restart').addEventListener('click', () => {
  if (busy) return;
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
button('motion').addEventListener('click', () => {
  if (busy) return;
  reduced = !reduced;
  refresh();
});
const help = element('help-dialog', HTMLDialogElement);
button('help').addEventListener('click', () => help.showModal());
button('close-help').addEventListener('click', () => help.close());
async function persistFavorite(): Promise<void> {
  if (!results.validated || !edition) return;
  const current = epoch,
    favorite = results.favorite;
  try {
    await api.request('favorite', { favorite });
    if (current === epoch)
      element('favorite-status', HTMLParagraphElement).textContent =
        'Card art saved. Your rescue order is unchanged.';
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
  if (scene.busy) return;
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
    session = new Session(boardById(edition.puzzleId, edition.boardVersion));
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
      if (data.community) results.community(data.community);
    }
    busy = false;
    refresh();
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
}
game.events.once('board-ready', () => {
  void initialize();
});
