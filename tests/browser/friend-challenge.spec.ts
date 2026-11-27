import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Hono } from 'hono';
import { createApi } from '../../src/server/app.ts';
import { complete } from '../../src/server/core/completions.ts';
import { MemoryStore } from '../../src/server/core/memory-store.ts';
import { bindingFor, EDITIONS } from '../../src/server/core/schedule.ts';

test('a named challenge goes from native sharing to a private trail comparison and rematch', async ({
  browser,
}) => {
  const day = EDITIONS[0]!;
  const next = EDITIONS[1]!;
  const store = new MemoryStore();
  const now = new Date(`${day.date}T12:00:00Z`);
  const host = { id: 't2_robin', name: 'RobinKeeper' };
  const guest = { id: 't2_fern', name: 'FernKeeper' };
  const app = new Hono().route(
    '/api',
    createApi({
      store,
      mode: 'reddit',
      now: () => now,
      getContext: async (c) => {
        const player = c.req.header('x-player') === guest.name ? guest : host;
        return {
          userId: player.id,
          username: player.name,
          postId: c.req.header('x-post'),
        };
      },
      readPost: async (id) => bindingFor(id === 't3_next' ? next : day),
      findChallengePlayer: async (name) =>
        name.toLowerCase() === guest.name.toLowerCase() ? guest : undefined,
    })
  );
  await complete(
    store,
    day,
    host.id,
    {
      editionId: day.id,
      puzzleId: day.puzzleId,
      boardVersion: day.boardVersion,
      sequence: ['fox', 'rabbit', 'badger', 'turtle'],
      personalUndos: 2,
      favorite: 'fox',
    },
    now
  );
  const viewport = { width: 288, height: 512 };
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
  });
  const origin = 'http://127.0.0.1:5175';
  async function configure(page: Page, name: string, shared?: string) {
    await page.addInitScript(
      ({ shared, origin }) => {
        const feed = location.pathname.endsWith('/splash.html');
        Object.defineProperty(globalThis, 'devvit', {
          value: {
            context: { postId: location.search ? 't3_next' : 't3_today' },
            share: feed && shared ? { userData: shared } : undefined,
            entrypoints: { game: `${origin}/game.html` },
            webViewMode: 1,
          },
        });
        window.addEventListener('message', (event) => {
          if (event.data?.share?.userData)
            document.documentElement.dataset.invite = event.data.share.userData;
          if (event.data?.immersiveMode)
            document.documentElement.dataset.expanded = 'true';
        });
      },
      { shared, origin }
    );
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const post = page.url().includes('?next') ? 't3_next' : 't3_today';
      const response = await app.request(url.pathname + url.search, {
        method: req.method(),
        body: req.postData() ?? undefined,
        headers: {
          'content-type': 'application/json',
          'x-player': name,
          'x-post': post,
        },
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
  }
  const owner = await context.newPage();
  await configure(owner, host.name);
  await owner.goto(`${origin}/game.html`);
  const challenge = owner.getByRole('button', { name: 'Beat my rescue' });
  await expect(challenge).toBeInViewport();
  await expect(
    owner.getByRole('button', { name: 'Home', exact: true })
  ).toBeInViewport();
  await challenge.click();
  const invitation = owner.getByRole('dialog', { name: 'Beat my rescue' });
  await invitation.getByLabel('Reddit username').fill('u/FernKeeper');
  await invitation.getByRole('button', { name: 'Share challenge' }).click();
  await expect(
    invitation.getByText('Invite ready for u/FernKeeper.')
  ).toBeVisible();
  await expect(owner.locator('html')).toHaveAttribute(
    'data-invite',
    /friend-rescue/
  );
  const shared = await owner.locator('html').getAttribute('data-invite');
  await owner.close();
  const guestContext = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
  });
  const challenger = await guestContext.newPage();
  await configure(challenger, guest.name, shared ?? undefined);
  await challenger.goto(`${origin}/splash.html`);
  await challenger
    .getByRole('button', { name: 'Open Friend Challenge' })
    .click();
  await expect(challenger.locator('html')).toHaveAttribute(
    'data-expanded',
    'true'
  );
  await challenger.bringToFront();
  await challenger.goto(`${origin}/game.html`);
  const landing = challenger.getByRole('dialog', { name: 'Beat my rescue' });
  await expect(landing.getByText(/u\/RobinKeeper challenged you/)).toBeVisible({
    timeout: 15000,
  });
  await expect(landing.locator('#friend-challenge-trails')).toBeHidden();
  await landing.getByRole('button', { name: 'Accept challenge' }).click();
  await expect(landing).toBeHidden();
  for (const animal of ['fox', 'badger', 'rabbit', 'turtle']) {
    await challenger
      .locator('.animal-picker')
      .evaluate((el) => el.setAttribute('open', ''));
    await challenger.locator(`button[data-animal=${animal}]`).click();
    await challenger.locator('#send').click();
    await expect(challenger.locator('#restart')).toBeEnabled();
  }
  await challenger.getByRole('button', { name: 'Compare trails' }).click();
  const comparison = challenger.getByRole('dialog', { name: 'Compare trails' });
  await expect(
    comparison.getByText('Your trails split at move 2.')
  ).toBeVisible();
  await expect(
    comparison.getByText('u/FernKeeper wins with fewer assists.')
  ).toBeVisible();
  await expect(comparison.locator('.trail-turn')).toHaveCount(2);
  const rematch = comparison.getByRole('button', {
    name: 'Rematch next daily',
  });
  await expect(rematch).toBeInViewport();
  await rematch.click();
  await expect(
    comparison.getByRole('button', { name: 'Rematch set for Day 2' })
  ).toBeDisabled();
  await challenger.goto(`${origin}/game.html?next`);
  await expect(
    challenger
      .getByRole('dialog', { name: 'Daily rematch' })
      .getByText(/Your rematch with u\/RobinKeeper is ready/)
  ).toBeVisible({ timeout: 15000 });
  await guestContext.close();
  const returning = await context.newPage();
  await configure(returning, host.name);
  await returning.goto(`${origin}/game.html`);
  await returning.getByRole('button', { name: 'Compare trails' }).click();
  await expect(
    returning.getByRole('button', { name: 'Rematch set for Day 2' })
  ).toBeDisabled();
  await context.close();
});
