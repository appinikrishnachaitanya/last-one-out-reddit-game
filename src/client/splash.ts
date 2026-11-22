import { requestExpandedMode } from '@devvit/web/client';
import { DailyApi } from './daily-api';
import { boardById } from '../shared/boards';
import { titleCase } from '../shared/engine';

const play = document.querySelector<HTMLButtonElement>('#play')!;
const edition = document.querySelector<HTMLElement>('#edition')!;
const badge = document.querySelector<HTMLElement>('#badge')!;
let title = 'Last One Out';

play.addEventListener('click', (event) => {
  try {
    requestExpandedMode(event, 'game', { title });
  } catch {
    badge.textContent = 'Open this post in Reddit to play.';
    badge.hidden = false;
  }
});

void new DailyApi()
  .init()
  .then((data) => {
    if (data.status !== 'ready') return;
    title = boardById(data.edition.puzzleId, data.edition.boardVersion).title;
    edition.textContent = `Day ${data.edition.number} · ${title}`;
    if (!data.completion) return;
    play.textContent = 'View Your Rescue';
    badge.textContent = `Everyone home · ${titleCase(data.completion.favorite)} card earned`;
    badge.hidden = false;
  })
  .catch(() => {
    /* Opening the board remains available. */
  });
