import { bridgeOpen, Session, titleCase, trace, won } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import { remixBoard, remixDirections, remixTemplates } from '../shared/remix';
import type { RemixDraft, RemixSpec } from '../shared/remix';
import type { DailyApi } from './daily-api';

const arrows = { N: '↑', E: '→', S: '↓', W: '←' };
const names = { N: 'Up', E: 'Right', S: 'Down', W: 'Left' };

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function button(text: string, run: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = text;
  control.addEventListener('click', run);
  return control;
}
function option(value: string, label: string): HTMLOptionElement {
  return new Option(label, value);
}

export function setupRemix(api: DailyApi): void {
  const dialog = element<HTMLDialogElement>('remix-dialog');
  const status = element('remix-status');
  const template = element<HTMLSelectElement>('remix-template');
  const slots = element('remix-slots');
  const grid = element('remix-grid');
  const playActions = element('remix-play');
  const creator = element('remix-creator');
  const reviews = element('remix-reviews');
  const submit = element<HTMLButtonElement>('remix-submit');
  let spec: RemixSpec;
  let sandbox: Session;
  let testing = false;
  let selected: RemixDraft | undefined;
  let cursor: string | undefined;
  let loading = false;
  const tell = (text: string) => {
    status.textContent = text;
  };

  function showBoard(): void {
    const { board, state } = sandbox;
    grid.style.setProperty('--remix-size', String(board.size));
    const cells: HTMLElement[] = [];
    for (let y = 0; y < board.size; y++) {
      for (let x = 0; x < board.size; x++) {
        const cell = document.createElement('span');
        const onCell = (point: { x: number; y: number }) =>
          point.x === x && point.y === y;
        const animal = board.animals.find(onCell);
        const bridge = board.bridges.find(onCell);
        const slot = animal && board.animals.indexOf(animal) + 1;
        cell.className = board.paths.some(onCell)
          ? 'remix-path'
          : 'remix-forest';
        if (bridge) {
          cell.className = bridgeOpen(state, bridge)
            ? 'remix-bridge'
            : 'remix-gap';
          cell.textContent = bridge.symbol;
          cell.title = `${titleCase(bridge.holder)} holds this bridge`;
        }
        if (animal && !state.home.includes(animal.id)) {
          cell.textContent =
            testing || selected
              ? `${titleCase(animal.id)[0]} ${arrows[animal.direction]}`
              : `${slot} ${arrows[animal.direction]}`;
          cell.title = `${titleCase(animal.id)} · ${names[animal.direction]}`;
        }
        cells.push(cell);
      }
    }
    grid.replaceChildren(...cells);
    playActions.replaceChildren();
    if (!testing) return;
    for (const animal of board.animals) {
      if (state.home.includes(animal.id)) continue;
      playActions.append(
        button(
          `Send ${titleCase(animal.id)} ${arrows[animal.direction]}`,
          () => {
            const route = trace(board, sandbox.state, animal.id);
            if (!route.legal) {
              tell(route.obstacle?.reason ?? 'That path is blocked.');
              return;
            }
            sandbox.send(animal.id);
            tell(
              won(board, sandbox.state)
                ? 'Everyone home. Test play complete.'
                : `${sandbox.state.home.length}/4 home · ${titleCase(animal.id)} rescued.`
            );
            showBoard();
            playActions.querySelector('button')?.focus();
          }
        )
      );
    }
    if (state.home.length)
      playActions.append(
        button('Undo', () => {
          sandbox.undo();
          tell(`${sandbox.state.home.length}/4 home · Move undone.`);
          showBoard();
          playActions.querySelector('button')?.focus();
        })
      );
    playActions.append(
      button('Exit test play', () => {
        preview();
        element<HTMLButtonElement>('remix-test').focus();
      })
    );
  }

  function preview(): void {
    testing = false;
    const draft = selected;
    sandbox = new Session(
      remixBoard(
        draft?.spec ?? spec,
        draft ? `remix-${draft.id}` : undefined,
        draft?.creator
      )
    );
    showBoard();
  }

  function renderSlots(): void {
    slots.replaceChildren(
      ...spec.slots.map((slot, index) => {
        const row = document.createElement('label');
        row.append(`Slot ${index + 1}`);
        const animal = document.createElement('select');
        animal.setAttribute('aria-label', `Slot ${index + 1} animal`);
        animal.append(...spec.slots.map(({ id }) => option(id, titleCase(id))));
        animal.value = slot.id;
        animal.addEventListener('change', () => {
          const other = spec.slots.findIndex(({ id }) => id === animal.value);
          if (other < 0 || other === index) return;
          spec.slots[other]!.id = slot.id;
          slot.id = animal.value as AnimalId;
          renderSlots();
          slots.querySelectorAll('select')[index * 2]?.focus();
          preview();
        });
        const arrow = document.createElement('select');
        arrow.setAttribute('aria-label', `Slot ${index + 1} direction`);
        arrow.append(
          ...remixDirections.map((dir) =>
            option(dir, `${arrows[dir]} ${names[dir]}`)
          )
        );
        arrow.value = slot.direction;
        arrow.addEventListener('change', () => {
          slot.direction = arrow.value as typeof slot.direction;
          preview();
        });
        row.append(animal, arrow);
        return row;
      })
    );
  }
  function chooseTemplate(): void {
    const original =
      remixTemplates.find(({ id }) => id === template.value) ??
      remixTemplates[0];
    spec = {
      template: original.id,
      slots: original.animals.map(({ id, direction }) => ({ id, direction })),
    };
    selected = undefined;
    renderSlots();
    preview();
  }

  function reviewDetails(draft: RemixDraft): void {
    selected = draft;
    creator.hidden = true;
    preview();
    const box = element('remix-review-detail');
    box.hidden = false;
    box.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = `Sunday Remix by u/${draft.creator}`;
    const difficulty = document.createElement('p');
    difficulty.textContent = `${draft.difficulty.label} · ${draft.difficulty.decisionDepth} forced decisions · ${draft.status}`;
    box.append(heading, difficulty);
    if (draft.note) {
      const note = document.createElement('p');
      note.textContent = draft.note;
      box.append(note);
    }
    if (draft.status === 'draft') {
      const note = document.createElement('textarea');
      note.setAttribute('aria-label', 'Moderator review note');
      note.placeholder = 'Review note (required to reject)';
      note.maxLength = 240;
      const review = async (decision: 'approved' | 'rejected') => {
        if (loading) return;
        loading = true;
        approve.disabled = reject.disabled = true;
        tell('Saving review…');
        try {
          const updated = (await api.request('remix/queue/review', {
            id: draft.id,
            status: decision,
            note: note.value,
          })) as RemixDraft;
          reviewDetails(updated);
          tell(
            decision === 'approved'
              ? 'Approved for manual publication.'
              : 'Draft rejected with your note.'
          );
        } catch (error) {
          tell(
            error instanceof Error ? error.message : 'Review failed. Try again.'
          );
        } finally {
          loading = false;
          approve.disabled = reject.disabled = false;
        }
      };
      const approve = button('Approve', () => void review('approved'));
      const reject = button('Reject', () => void review('rejected'));
      box.append(note, approve, reject);
    } else if (draft.status === 'approved') {
      box.append(
        button('Download approved board', () => {
          const board = remixBoard(
            draft.spec,
            `remix-${draft.id}`,
            draft.creator
          );
          const url = URL.createObjectURL(
            new Blob(
              [
                JSON.stringify(
                  {
                    ...board,
                    subtitle: `${draft.difficulty.label} · ${draft.difficulty.decisionDepth} forced decisions`,
                  },
                  null,
                  2
                ),
              ],
              {
                type: 'application/json',
              }
            )
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = `${board.id}.json`;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        })
      );
    }
    box.append(
      button('Back to creator', () => {
        creator.hidden = false;
        box.hidden = true;
        chooseTemplate();
        template.focus();
      })
    );
  }

  async function loadQueue(append = false): Promise<void> {
    if (loading) return;
    loading = true;
    const list = element('remix-queue');
    const more = element<HTMLButtonElement>('remix-more');
    more.disabled = true;
    tell('Loading drafts…');
    try {
      const path =
        append && cursor
          ? `remix/queue/list?after=${encodeURIComponent(cursor)}`
          : 'remix/queue/list';
      const response = (await api.request(path)) as {
        drafts: RemixDraft[];
        next?: string;
      };
      if (!append) list.replaceChildren();
      for (const draft of response.drafts) {
        const row = document.createElement('li');
        row.append(
          button(
            `Preview u/${draft.creator} · ${draft.difficulty.label} · ${draft.status}`,
            () => {
              reviewDetails(draft);
              element('remix-review-detail').scrollIntoView({
                block: 'nearest',
              });
              element<HTMLButtonElement>('remix-test').focus();
              tell('Preview loaded. Use Test play to try the crossing.');
            }
          )
        );
        list.append(row);
      }
      cursor = response.next;
      more.hidden = !cursor;
      tell(
        list.childElementCount
          ? 'Select a draft to preview.'
          : 'No drafts to review yet.'
      );
    } catch (error) {
      tell(
        error instanceof Error
          ? error.message
          : 'Could not load the queue. Try again.'
      );
    } finally {
      loading = false;
      more.disabled = false;
    }
  }

  template.append(...remixTemplates.map(({ id, title }) => option(id, title)));
  template.addEventListener('change', chooseTemplate);
  element('remix-test').addEventListener('click', () => {
    preview();
    testing = true;
    showBoard();
    tell('Test play · send an animal to try its route.');
    playActions.querySelector('button')?.focus();
  });
  submit.addEventListener('click', async () => {
    if (loading) return;
    loading = true;
    submit.disabled = true;
    tell('Checking the crossing and saving your draft…');
    try {
      const draft = (await api.request('remix', spec)) as RemixDraft;
      tell(
        draft.status === 'draft'
          ? `Draft submitted for moderator review · ${draft.difficulty.label}.`
          : `This draft was already ${draft.status}.${draft.note ? ` ${draft.note}` : ''}`
      );
    } catch (error) {
      tell(
        error instanceof Error ? error.message : 'Could not submit. Try again.'
      );
    } finally {
      loading = false;
      submit.disabled = false;
    }
  });
  element('remix-queue-open').addEventListener('click', () => void loadQueue());
  element('remix-more').addEventListener('click', () => void loadQueue(true));
  element('remix-open').addEventListener('click', async () => {
    element<HTMLDialogElement>('help-dialog').close();
    dialog.showModal();
    creator.hidden = true;
    reviews.hidden = true;
    grid.hidden = true;
    element('remix-test').hidden = true;
    element('remix-review-detail').hidden = true;
    playActions.replaceChildren();
    tell('Loading Remix Sunday…');
    try {
      const access = (await api.request('remix')) as {
        enabled: boolean;
        signedIn: boolean;
        canReview: boolean;
      };
      if (!access.enabled || !access.signedIn) {
        tell(
          access.enabled
            ? 'Sign in to Reddit to create a remix.'
            : 'Open the game on Reddit to submit a remix.'
        );
        return;
      }
      creator.hidden = false;
      grid.hidden = false;
      element('remix-test').hidden = false;
      reviews.hidden = !access.canReview;
      chooseTemplate();
      tell('Choose a template, then assign animals and arrows.');
    } catch {
      tell('Remix Sunday is unavailable. Close and try again.');
    }
  });
}
