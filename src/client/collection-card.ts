import { showShareSheet } from '@devvit/web/client';
import { titleCase } from '../shared/engine';
import type { AnimalId } from '../shared/engine';
import { cardStamp } from './card-stamp';
import { portrait, portraitOffsets } from './portraits';

type EarnedCard = {
  day: number;
  title: string;
  favorite: AnimalId;
  earnedAt: unknown;
};

const dialog = document.querySelector<HTMLDialogElement>('#collection-card')!;
const preview = document.querySelector<HTMLElement>(
  '#collection-card-preview'
)!;
const heading = document.querySelector<HTMLElement>('#collection-card-title')!;
const shareButton = document.querySelector<HTMLButtonElement>(
  '#share-collection-card'
)!;
const status = document.querySelector<HTMLElement>('#collection-card-status')!;
const fallback = document.querySelector<HTMLTextAreaElement>(
  '#collection-card-copy'
)!;
let currentCard = 0;

async function cardImage(
  card: EarnedCard,
  owner: string
): Promise<File | null> {
  const art = new Image();
  art.src = '/art/animals.webp';
  await art.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const [x, y] = portraitOffsets[card.favorite];
  const width = art.naturalWidth / 2;
  const height = art.naturalHeight / 2;

  ctx.fillStyle = '#10332f';
  ctx.fillRect(0, 0, 800, 800);
  ctx.fillStyle = '#fff1d6';
  ctx.beginPath();
  ctx.roundRect(26, 26, 748, 748, 32);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(400, 321, 174, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    art,
    (-x / 100) * width,
    (-y / 100) * height,
    width,
    height,
    226,
    147,
    348,
    348
  );
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#16362e';
  ctx.font = 'bold 32px system-ui';
  ctx.fillText('LAST ONE OUT', 400, 101);
  ctx.font = 'bold 66px Georgia';
  ctx.fillText(titleCase(card.favorite), 400, 595, 640);
  ctx.font = '31px system-ui';
  ctx.fillText(`Day ${card.day} · ${card.title}`, 400, 654, 640);
  if (owner) {
    ctx.font = 'bold 24px system-ui';
    ctx.fillText(`Rescued by ${owner}`, 400, 716, 640);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  return (
    blob &&
    new File([blob], `last-one-out-day-${card.day}-card.png`, {
      type: 'image/png',
    })
  );
}

export function openCollectionCard(
  card: EarnedCard,
  owner: unknown,
  demo: boolean
): void {
  const number = ++currentCard;
  const active = () => number === currentCard && dialog.open;
  const stamp = cardStamp(owner, card.earnedAt);
  const username = stamp.querySelector('span')?.textContent ?? '';
  const animal = titleCase(card.favorite);
  const crossing = `Day ${card.day} · ${card.title}`;
  const text = `I earned the ${animal} rescue card in Last One Out. ${crossing}.`;

  const details = document.createElement('article');
  details.className = 'collection-card-art';
  details.dataset.animal = card.favorite;
  const art = document.createElement('div');
  art.className = 'card-art';
  art.innerHTML = portrait(card.favorite);
  const edition = document.createElement('p');
  edition.textContent = crossing;
  details.append(art, edition, stamp);
  heading.textContent = `${animal} rescue card`;
  preview.replaceChildren(details);
  status.textContent = '';
  fallback.hidden = true;
  shareButton.disabled = true;
  dialog.showModal();
  dialog.querySelector('.panel-body')?.scrollTo(0, 0);

  void cardImage(card, username)
    .catch(() => null)
    .then((file) => {
      if (!active()) return;
      shareButton.disabled = false;
      shareButton.onclick = async () => {
        shareButton.disabled = true;
        fallback.hidden = true;
        status.textContent = '';
        try {
          if (file && navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({
                title: 'Last One Out rescue card',
                files: [file],
              });
              return;
            } catch (error) {
              if (error instanceof DOMException && error.name === 'AbortError')
                return;
            }
          }
        if (!active()) return;
          if (file && typeof ClipboardItem !== 'undefined') {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': file }),
              ]);
              if (active())
                status.textContent =
                  'Card image copied. Paste it where you’d like to share it.';
              return;
            } catch {
              // Some embedded browsers allow text sharing only.
            }
          }
          if (!active()) return;
          if (!demo) {
            try {
              await showShareSheet({ title: 'Last One Out rescue card', text });
              if (active()) status.textContent = 'Sharing options opened.';
              return;
            } catch {
              // Reddit context is unavailable in some previews.
            }
          }
          try {
            await navigator.clipboard.writeText(text);
            if (active()) status.textContent = 'Card text copied.';
          } catch {
            if (!active()) return;
            fallback.value = text;
            fallback.hidden = false;
            fallback.select();
            status.textContent = 'Select and copy the card text to share it.';
          }
        } finally {
          if (active()) shareButton.disabled = false;
        }
      };
    });
}
