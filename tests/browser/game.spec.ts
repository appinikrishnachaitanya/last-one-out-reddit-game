import { test, expect } from '@playwright/test';
async function open(page: import('@playwright/test').Page) {
  await page.goto('/game.html');
  await expect(page.getByText('LOCAL PREVIEW', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
}
async function toggleMotion(page: import('@playwright/test').Page) {
  await page.locator('#help').click();
  await page.locator('#motion-dialog').click();
  await page.locator('#close-help').click();
}
async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page
) {
  const layout = await page.evaluate(() => {
    const width = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - width;
    const elements =
      overflow > 0
        ? Array.from(document.querySelectorAll('body *'))
            .flatMap((el) => {
              const box = el.getBoundingClientRect();
              return box.right > width + 0.5
                ? [
                    {
                      element: el.id || el.className || el.tagName,
                      right: Math.round(box.right),
                    },
                  ]
                : [];
            })
            .slice(0, 12)
        : [];
    return { width, overflow, elements };
  });
  expect(layout.overflow, JSON.stringify(layout)).toBeLessThanOrEqual(0);
}
async function send(page: import('@playwright/test').Page, name: string) {
  await page
    .locator('.animal-picker')
    .evaluate((el) => el.setAttribute('open', ''));
  await page.locator(`[data-animal=${name}]`).click();
  await page.locator('#send').click();
  await expect(page.locator('#restart')).toBeEnabled();
}
test('Moonroot tempting exit, exact blocked route feedback, Undo, real animation and reunion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.screenshot({ path: 'artifacts/moonroot-mobile.png' });
  await page.locator('#hint').click();
  await expect(page.locator('#hint-text')).toContainText('Who still needs it');
  await expect(page.locator('#hint')).toBeDisabled();
  await expect(page.locator('#lifeline-status')).toContainText('recharges in');
  await page.locator('.animal-picker summary').click();
  await page.locator('[data-animal=turtle]').click();
  await expect(page.locator('#feedback')).toContainText(
    'Leaving folds the ☾ bridge'
  );
  await page.screenshot({ path: 'artifacts/turtle-preview.png' });
  await page.locator('#send').click();
  await expect(page.locator('#send')).toBeDisabled();
  await expect(page.locator('#feedback')).toContainText(
    'Rabbit’s bridge just folded'
  );
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.screenshot({ path: 'artifacts/folded-bridge.png' });
  await page.locator('[data-animal=rabbit]').click();
  await expect(page.locator('#feedback')).toContainText('☾ bridge is folded');
  await expect(page.locator('#send')).toBeDisabled();
  await page.locator('#undo').click();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  await page.locator('[data-animal=rabbit]').click();
  await expect(page.locator('#send')).toBeEnabled();
  await page.locator('[data-animal=badger]').click();
  await expect(page.locator('#feedback')).toContainText(
    'Fox is still on this path'
  );
  for (const id of ['fox', 'rabbit', 'turtle', 'badger']) await send(page, id);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#rescue-count')).toHaveText('4 / 4');
  await expect(page.locator('#personal-stats')).toContainText(
    '1 personal undo'
  );
  await page.screenshot({
    path: 'artifacts/reunion-mobile.png',
    fullPage: true,
  });
  await expect(page.locator('#card-time')).toHaveText(/^Time \d+:\d{2}$/);
  await expect(page.locator('#past-crossings')).toBeHidden();
  await expect(page.locator('#card-collection')).toContainText(
    'Moonroot Crossing'
  );
  await page.locator('#help').click();
  await page.locator('#restart').click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  expect(errors).toEqual([]);
});
test('320px keyboard and reduced motion; board and primary controls fit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('#motion-dialog')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const sendBox = await page.locator('#send').boundingBox();
  expect(sendBox?.y).toBeLessThan(650);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  for (const id of ['fox', 'rabbit', 'turtle', 'badger']) {
    await page
      .locator('.animal-picker')
      .evaluate((el) => el.setAttribute('open', ''));
    await page.locator(`[data-animal=${id}]`).focus();
    await page.keyboard.press('Enter');
    await page.locator('#send').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#restart')).toBeEnabled();
  }
  await expect(page.locator('#result')).toBeVisible();
  await page.screenshot({ path: 'artifacts/keyboard-320.png', fullPage: true });
});
test('all animals and primary controls fit Reddit’s 512px inline frame', async ({
  page,
}) => {
  for (const width of [288, 320, 390, 640]) {
    await page.setViewportSize({ width, height: 512 });
    await open(page);
    const send = await page.locator('#send').boundingBox();
    expect(send).not.toBeNull();
    expect((send?.y ?? 1000) + (send?.height ?? 1000)).toBeLessThanOrEqual(512);
    const board = await page.locator('canvas').boundingBox();
    expect(board?.width).toBeGreaterThanOrEqual(240);
    if (width < 560) {
      const title = await page.locator('#board-title').boundingBox();
      expect(title!.y + title!.height).toBeLessThanOrEqual(board!.y);
    }
    await expectNoHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 390, height: 512 });
  await page.screenshot({ path: 'artifacts/reddit-inline-512.png' });
});
test('touch on Phaser pieces previews and commits; rapid taps cannot duplicate a rescue', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 512 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem('loo-guide-seen:v1', 'yes')
  );
  const page = await context.newPage();
  await open(page);
  // A canvas can appear before the daily load enables the board’s input.
  await expect(page.locator('[data-animal=turtle]')).toBeEnabled();
  await expect(page.locator('#first-move')).toBeVisible();
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Missing canvas');
  const x = canvas.x + (canvas.width * 106) / 420,
    y = canvas.y + (canvas.height * 104) / 420;
  await page.touchscreen.tap(x, y);
  await expect(page.locator('#feedback')).toContainText(
    'Turtle has a clear path'
  );
  await page.touchscreen.tap(x, y);
  await expect(page.locator('#undo')).toBeDisabled();
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
  await expect(page.locator('#feedback')).toContainText(
    'Rabbit’s bridge just folded'
  );
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.locator('#undo').tap();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  await context.close();
});
test('all first three editions solve, favorite art changes, saved result survives reload and copy is spoiler-free', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('#motion-dialog')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const editions = [
    [
      'loo-2026-11-18',
      'Moonroot Crossing',
      ['fox', 'rabbit', 'turtle', 'badger'],
    ],
    ['loo-2026-11-19', 'Willow Weave', ['fox', 'badger', 'turtle', 'rabbit']],
    ['loo-2026-11-20', 'Lantern Fork', ['rabbit', 'fox', 'badger', 'turtle']],
  ];
  for (const [id, title, order] of editions) {
    if (
      typeof id !== 'string' ||
      typeof title !== 'string' ||
      !Array.isArray(order)
    )
      throw new Error('Invalid fixture');
    await page.locator('#edition-picker').selectOption(id);
    await expect(page.locator('#board-title')).toHaveText(title);
    await expect(page.locator('#comparison')).toBeHidden();
    for (const animal of order) await send(page, animal);
    await expect(page.locator('#save-status')).toContainText(
      'validated and saved'
    );
    await page.locator('#help').click();
    await page.locator('#my-animal summary').click();
    await page
      .locator('#game-companion-editor button')
      .filter({ hasText: /^Rabbit$/ })
      .click();
    await page.getByRole('button', { name: 'Save my animal' }).click();
    await expect(page.locator('#game-companion-editor')).toContainText(
      'Animal saved'
    );
    await page.locator('#close-help').click();
    await page.reload();
    await expect(page.locator('#result')).toBeVisible();
    if (title === 'Moonroot Crossing') {
      await expect(page.locator('#result-title')).toHaveText('Bridge Keeper');
      await page.locator('#community-details summary').click();
      await expect(page.locator('#identity-explanation')).toBeVisible();
      await expect(page.locator('#rescue-hero')).toContainText(
        'Hero Who Stayed'
      );
      await page.locator('#community-details summary').click();
    }
    await expect(page.locator('#board-title')).toHaveText(title);
    await expect(page.locator('#rescue-count')).toHaveText('4 / 4');
    await expect(page.locator('#card-animal')).toContainText('Rabbit');
    await expect(page.getByLabel('Avatar scarf', { exact: true })).toHaveCount(
      0
    );
    await page.locator('#copy-result').click();
    await expect(page.locator('#result-share')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download image' }).click();
    const image = await download;
    expect(image.suggestedFilename()).toMatch(/^last-one-out-.*\.png$/);
    expect(await image.failure()).toBeNull();
    await page.getByRole('button', { name: 'Close sharing' }).click();
    await page.screenshot({
      path: `artifacts/${id}-saved.png`,
      fullPage: true,
    });
  }
});
test('save failure keeps reunion and exact submission available for retry without replay', async ({
  page,
}) => {
  await open(page);
  await toggleMotion(page);
  let attempts = 0;
  await page.route('**/api/complete*', async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary save failure' }),
      });
    else await route.continue();
  });
  for (const id of ['fox', 'rabbit', 'turtle', 'badger']) await send(page, id);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#save-status')).toContainText(
    'Temporary save failure'
  );
  await expect(page.locator('#rescue-count')).toHaveText('4 / 4');
  await page.locator('#retry-save').click();
  await expect(page.locator('#save-status')).toContainText(
    'validated and saved'
  );
  expect(attempts).toBe(2);
  const init = await page.request.get('/api/init');
  const data = await init.json();
  const retry = await page.request.post('/api/complete', {
    data: data.completion,
  });
  expect((await retry.json()).community.total).toBe(data.community.total);
});
test('the four added editions each complete on a narrow phone using their curated dependencies', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const editions = [
    {
      id: 'loo-2026-11-21',
      title: 'Reedlight Relay',
      order: ['badger', 'fox', 'rabbit', 'turtle'],
    },
    {
      id: 'loo-2026-11-22',
      title: 'Twinbank Lanterns',
      order: ['fox', 'badger', 'rabbit', 'turtle'],
    },
    {
      id: 'loo-2026-11-23',
      title: 'Alder Passage',
      order: ['badger', 'fox', 'rabbit', 'turtle'],
    },
    {
      id: 'loo-2026-11-24',
      title: 'Firefly Commons',
      order: ['rabbit', 'turtle', 'badger', 'fox'],
    },
  ];
  for (const e of editions) {
    await page.locator('#edition-picker').selectOption(e.id);
    await expect(page.locator('#board-title')).toHaveText(e.title);
    await page.screenshot({ path: `artifacts/${e.id}-board.png` });
    for (const id of e.order) await send(page, id);
    await expect(page.locator('#save-status')).toContainText(
      'validated and saved'
    );
    await page.reload();
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#board-title')).toHaveText(e.title);
  }
});
test('production-shaped response hides the preview picker, restores a saved post, shows honest stats, and routes comments to that post', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.navigateToUrl)
        document.documentElement.dataset.navigation =
          event.data.navigateToUrl.url;
    });
  });
  const edition = {
    id: 'loo-2026-11-18',
    number: 1,
    date: '2026-11-18',
    puzzleId: 'moonroot-v1',
    boardVersion: 1,
  };
  const completion = {
    editionId: edition.id,
    puzzleId: edition.puzzleId,
    boardVersion: 1,
    sequence: ['fox', 'rabbit', 'turtle', 'badger'],
    opening: 'fox',
    personalUndos: 1,
    favorite: 'badger',
    completedAt: '2026-11-18T10:00:00Z',
  };
  let solvedOnSplash = false;
  await page.route('**/api/init*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        mode: 'reddit',
        edition,
        username: 'trailtester',
        completion: solvedOnSplash ? completion : null,
        communityEnabled: true,
        community: { total: 1, openings: { fox: 1 } },
        commentsUrl: 'https://www.reddit.com/comments/judgetest/',
      }),
    })
  );
  await page.route('**/api/telemetry/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Telemetry unavailable in local test"}',
    })
  );
  let posts = 0;
  await page.route('**/api/share', (route) => {
    posts++;
    return route.fulfill({ json: { shared: true, commentId: 't1_example' } });
  });
  await page.goto('http://127.0.0.1:5175/splash.html');
  await expect(page.locator('#edition')).toHaveText(
    'Day 1 · Moonroot Crossing'
  );
  await page.setViewportSize({ width: 390, height: 512 });
  const playButton = page.getByRole('button', { name: 'Play Today’s Rescue' });
  await expect(playButton).toHaveAccessibleDescription(
    'Solo or take one shared turn'
  );
  await expect(page.locator('#welcome-hook')).toHaveText(
    'Turtle can leave. Should it?'
  );
  await page.setViewportSize({ width: 288, height: 320 });
  const play = await playButton.boundingBox();
  expect(play!.y + play!.height).toBeLessThanOrEqual(320);
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 512 });
  await expect(page.locator('#welcome-profile')).toHaveText(
    'Welcome, u/trailtester'
  );
  await page.screenshot({ path: 'artifacts/welcome-preview/01-welcome.png' });
  solvedOnSplash = true;
  await page.route('**/api/crossings', (route) =>
    route.fulfill({
      json: {
        cards: [
          {
            day: 1,
            title: 'Moonroot Crossing',
            favorite: 'badger',
            earnedAt: completion.completedAt,
          },
          { day: 2, title: 'Willow Bridge', favorite: 'rabbit' },
          { day: 3, title: 'Lantern Bend', favorite: 'fox' },
          {
            day: 11,
            title: 'Challenge crossing',
            favorite: 'fox',
            puzzleId: 'challenge-01-v1',
          },
          {
            day: 32,
            title: 'Expert crossing',
            favorite: 'turtle',
            puzzleId: 'expert-01-v1',
          },
          {
            day: 65,
            title: 'Expert crossing',
            favorite: 'turtle',
            puzzleId: 'expert-01-v1',
          },
        ],
        signedIn: true,
        owner: 'trailtester',
        totalEditions: 10,
        challengeTotal: 33,
        streak: 3,
        past: [],
      },
    })
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'View Your Rescue' })
  ).toHaveAccessibleDescription('Or take one shared turn');
  await expect(page.locator('#badge')).toBeHidden();
  await page.getByRole('button', { name: 'My Map', exact: true }).click();
  await expect(page.locator('.journey-heading')).toContainText('6 rescued');
  await expect(page.locator('.journey-node[aria-current=step]')).toContainText(
    'Moonroot Crossing'
  );
  await expect(page.locator('.journey-avatar svg')).toBeVisible();
  await expect(page.locator('.journey-here')).toHaveText('You are here');
  await page.screenshot({
    path: 'artifacts/welcome-preview/02-my-progress.png',
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await expect(page.locator('#panel-status')).toHaveText(
    '6 cards earned · Challenge set 2/33'
  );
  await expect(page.locator('.card-gallery li')).toHaveCount(6);
  await expect(page.locator('.card-gallery time')).toHaveAttribute(
    'datetime',
    completion.completedAt
  );
  await expect(page.locator('.card-gallery li').last()).toContainText(
    'u/trailtester'
  );
  await page.screenshot({
    path: 'artifacts/welcome-preview/03-card-collection.png',
  });
  await page.setViewportSize({ width: 288, height: 512 });
  await expectNoHorizontalOverflow(page);
  await page.locator('#personal-panel').evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight;
  });
  await expect(
    page.getByRole('button', { name: 'Close', exact: true })
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 512 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#personal-panel')).toBeHidden();
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.screenshot({ path: 'artifacts/welcome-preview/04-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('#result')).toBeVisible();
  // This uses a production-shaped server response, not a claim of in-Reddit execution.
  await expect(page.locator('#preview-picker')).toBeHidden();
  await page.locator('#community-details').evaluate((el) => {
    el.setAttribute('open', '');
  });
  await expect(page.locator('#card-opening')).toContainText(
    'You started with Fox.'
  );
  await expect(page.locator('#comparison')).toBeHidden();
  await expect(page.locator('#card-animal')).toContainText('Fox');
  expect(posts).toBe(0);
  await page.locator('#copy-result').click();
  await page.locator('#post-rescue').click();
  await expect(
    page.getByRole('button', { name: 'Copy result link' })
  ).toBeVisible();
  await expect(page.locator('#post-rescue')).toHaveText('Shared to Comments ✓');
  await expect(page.locator('#post-rescue')).toBeDisabled();
  await page.getByRole('button', { name: 'Close sharing' }).click();
  expect(posts).toBe(1);
  await page.locator('#comments').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-navigation',
    'https://www.reddit.com/comments/judgetest/'
  );
});
test('judge sequence on the production bundle uses the real validator: mistake, Undo, save, reload, copy, same-post comments', async ({
  page,
  context,
}) => {
  const { Hono } = await import('hono');
  const { createApi } = await import('../../src/server/app.ts');
  const { MemoryStore } = await import('../../src/server/core/memory-store.ts');
  const { bindingFor, EDITIONS } =
    await import('../../src/server/core/schedule.ts');
  const edition = EDITIONS[0];
  if (!edition) throw new Error('Missing Day 1');
  const store = new MemoryStore();
  let completedJourneys = 0,
    completionRequests = 0;
  const api = new Hono().route(
    '/api',
    createApi({
      store,
      mode: 'reddit',
      now: () => new Date('2026-11-18T23:01:00Z'),
      dailyGoalTarget: async () => 1,
      getContext: async () => ({ userId: 't2_judge', postId: 't3_judgepost' }),
      readPost: async () => bindingFor(edition),
      endJourney: async () => {
        completedJourneys++;
      },
    })
  );
  const events: string[] = [];
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() =>
    window.addEventListener('message', (event) => {
      if (event.data?.navigateToUrl)
        document.documentElement.dataset.navigation =
          event.data.navigateToUrl.url;
    })
  );
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.startsWith('/api/telemetry/')) {
      events.push(url.pathname.split('/').at(-1) ?? 'unknown');
      const data = url.pathname.endsWith('/start')
        ? {
            journeyId: 'local-judge-journey',
            receipt: {
              status: 'JOURNEY_RECEIPT_VALID',
              message: 'Local test fixture only',
            },
          }
        : {
            receipt: {
              status: 'JOURNEY_RECEIPT_VALID',
              message: 'Local test fixture only',
            },
          };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
      return;
    }
    if (url.pathname === '/api/complete') completionRequests++;
    const response = await api.request(url.pathname + url.search, {
      method: req.method(),
      headers: req.headers(),
      ...(req.postData() ? { body: req.postData() ?? '' } : {}),
    });
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: await response.text(),
    });
  });
  await page.setViewportSize({ width: 320, height: 512 });
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('#board-title')).toHaveText('Moonroot Crossing');
  await expect(page.locator('[data-animal=turtle]')).toBeEnabled();
  await expect(page.locator('#daily-goal')).toContainText('0/1');
  await expect(page.locator('#preview-picker')).toBeHidden();
  await expect(page.locator('#comparison')).toBeHidden();
  await send(page, 'turtle');
  await expect(page.locator('#feedback')).toContainText(
    'Rabbit’s bridge just folded'
  );
  await page.screenshot({ path: 'artifacts/judge-rabbit-stranded.png' });
  await page.locator('#undo').click();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  for (const id of ['fox', 'rabbit', 'turtle', 'badger']) await send(page, id);
  await expect(page.locator('#save-status')).toContainText(
    'validated and saved'
  );
  await expect(page.locator('#daily-goal')).toContainText(
    '1/1 · Streak: 1 day'
  );
  await expect(page.locator('#goal-toast')).toContainText(
    'You were rescuer #1 · Goal complete!'
  );
  await expect(page.locator('#card-undos')).toHaveText('1 undo');
  await expect(page.locator('#clean-badge')).toHaveText('A Rank');
  await page.locator('#community-details').evaluate((el) => {
    el.setAttribute('open', '');
  });
  await expect(page.locator('#card-opening')).toContainText(
    'You started with Turtle.'
  );
  await expect(page.locator('#comparison')).toBeHidden();
  expect(completedJourneys).toBe(1);
  expect(events.filter((e) => e === 'start')).toHaveLength(1);
  expect(events.filter((e) => e === 'progress')).toHaveLength(3);
  await page.reload();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#card-animal')).toContainText('Fox');
  await expect(page.locator('#past-crossings')).toBeHidden();
  await expect(page.locator('#card-collection')).toContainText('Golden Leaf');
  await expect(page.locator('#past-crossings')).toBeHidden();
  expect(completionRequests).toBe(1);
  await page.locator('#copy-result').click();
  await expect(page.locator('#result-share')).toBeVisible();
  await page.getByRole('button', { name: 'Close sharing' }).click();
  await page.locator('#comments').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-navigation',
    'https://www.reddit.com/comments/judgepost/'
  );
  expect(completedJourneys).toBe(1);
  await page.screenshot({
    path: 'artifacts/judge-saved-result.png',
    fullPage: true,
  });
});
test('storybook desktop board is large, fully visible, and does not overlap the heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 512 });
  await open(page);
  const board = await page.locator('canvas').boundingBox(),
    heading = await page.locator('header').boundingBox();
  expect(board?.width).toBeGreaterThan(350);
  expect(board?.y).toBeGreaterThanOrEqual(
    (heading?.y ?? 0) + (heading?.height ?? 0)
  );
  expect((board?.y ?? 0) + (board?.height ?? 0)).toBeLessThanOrEqual(512);
  await page.screenshot({ path: 'artifacts/storybook-desktop.png' });
});
test('first visit teaches the rules, guides a real practice, and never changes daily saves', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 800, height: 720 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  let saves = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/complete') saves++;
  });
  await page.goto('http://127.0.0.1:5173/game.html');
  await expect(page.locator('#first-move')).toBeVisible();
  await expect(page.locator('#help-dialog')).toBeHidden();
  await page.locator('#help').click();
  await page.locator('#help-practice').click();
  await expect(page.locator('#tour-title')).toHaveText('Preview Turtle.');
  await page.locator('#tour-action').click();
  await expect(page.locator('#tour-title')).toHaveText('Send Turtle.');
  await page.locator('#tour-action').click();
  await expect(page.locator('#tour-title')).toHaveText('Rabbit is stranded.');
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.screenshot({ path: 'artifacts/guide-stranded-rabbit.png' });
  await page.locator('#tour-action').click();
  await expect(page.locator('#tour-title')).toHaveText('The bridge is open.');
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  await page.locator('#tour-action').click();
  await expect(page.locator('#tour-panel')).toBeHidden();
  expect(saves).toBe(0);
  const data = await (
    await page.request.get('http://127.0.0.1:5173/api/init')
  ).json();
  expect(data.completion).toBeNull();
  await send(page, 'fox');
  await page.reload();
  await expect(page.locator('#first-move')).toBeHidden();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.locator('#help').click();
  await page.locator('#help-practice').click();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  await page.locator('#exit-tour').click();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  expect(saves).toBe(0);
  await context.close();
});
test('inline and expanded layouts use available space without overlaps at common Reddit and laptop sizes', async ({
  page,
}) => {
  for (const [width, height, minBoard] of [
    [288, 512, 240],
    [390, 512, 270],
    [560, 512, 260],
    [600, 512, 300],
    [640, 512, 320],
    [900, 512, 370],
    [1024, 720, 500],
    [1366, 768, 580],
  ]) {
    await page.setViewportSize({ width, height });
    await open(page);
    await expect(page.locator('[data-animal=turtle]')).toBeEnabled();
    const board = await page.locator('canvas').boundingBox(),
      controls = await page.locator('.control-column').boundingBox(),
      sendBox = await page.locator('#send').boundingBox();
    expect(board?.width).toBeGreaterThanOrEqual(minBoard);
    expect(board?.y).toBeGreaterThanOrEqual(0);
    expect((board?.y ?? 0) + (board?.height ?? 0)).toBeLessThanOrEqual(height);
    expect((sendBox?.y ?? 0) + (sendBox?.height ?? 0)).toBeLessThanOrEqual(
      height
    );
    if (width >= 560)
      expect((board?.x ?? 0) + (board?.width ?? 0)).toBeLessThanOrEqual(
        controls?.x ?? 0
      );
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `artifacts/layout-${width}x${height}.png` });
  }
});
test('Full screen emits the registered Reddit expanded-view effect and keeps a partial rescue', async ({
  page,
}) => {
  const edition = {
    id: 'loo-2026-11-18',
    number: 1,
    date: '2026-11-18',
    puzzleId: 'moonroot-v1',
    boardVersion: 1,
  };
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'devvit', {
      value: {
        entrypoints: { game: 'http://127.0.0.1:5175/game.html' },
        webViewMode: 1,
      },
      configurable: true,
    });
    window.addEventListener('message', (event) => {
      if (event.data?.immersiveMode)
        document.documentElement.dataset.expand = JSON.stringify(
          event.data.immersiveMode
        );
    });
  });
  await page.route('**/api/init*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        mode: 'reddit',
        edition,
        completion: null,
        community: null,
        commentsUrl: 'https://www.reddit.com/comments/judgepost/',
      }),
    })
  );
  await page.route('**/api/telemetry/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Local test only"}',
    })
  );
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('[data-animal=fox]')).toBeEnabled();
  await send(page, 'fox');
  await page.locator('#help').click();
  await page.locator('#expand').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-expand',
    /game.html/
  );
  await page.reload();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
});
test('the compact saved result keeps all actions inside mobile and desktop Reddit frames', async ({
  page,
}) => {
  const edition = {
    id: 'loo-2026-11-18',
    number: 1,
    date: '2026-11-18',
    puzzleId: 'moonroot-v1',
    boardVersion: 1,
  };
  const completion = {
    editionId: edition.id,
    puzzleId: edition.puzzleId,
    boardVersion: 1,
    sequence: ['fox', 'rabbit', 'turtle', 'badger'],
    opening: 'fox',
    personalUndos: 0,
    favorite: 'rabbit',
    completedAt: '2026-11-18T10:00:00Z',
  };
  await page.route('**/api/init*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        mode: 'reddit',
        username: 'FernKeeper',
        edition,
        completion,
        community: { total: 3, openings: { fox: 2, rabbit: 1 } },
        attemptStats: {
          players: 12,
          totalSolves: 3,
          perfectRuns: 1,
          firstMoves: { fox: 9, turtle: 3 },
          firstMistakes: { turtle: 2 },
        },
        commentsUrl: 'https://www.reddit.com/comments/judgepost/',
      }),
    })
  );
  await page.route('**/api/telemetry/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Local test only"}',
    })
  );
  await page.route('**/api/crossings', (route) =>
    route.fulfill({
      json: {
        serverTime: 0,
        nextAt: 3600000,
        past: [
          {
            title: 'Earlier crossing',
            url: 'https://www.reddit.com/comments/earlier/',
            completed: true,
          },
        ],
      },
    })
  );
  for (const [width, height] of [
    [288, 512],
    [375, 596],
    [724, 596],
    [900, 512],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5175/game.html');
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('.reunion-illustration')).toBeVisible();
    await expect(page.locator('#card-assists')).toHaveText('0 assists');
    await expect(page.locator('#next-crossing')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const id of [
      'copy-result',
      'open-leaderboard',
      'friend-challenge-open',
      'comments',
      'result-home',
    ]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect(
        (box?.y ?? 0) + (box?.height ?? 0),
        `${id} at ${width}×${height}`
      ).toBeLessThanOrEqual(height);
    }
    await expect(page.locator('#community-details')).not.toHaveAttribute(
      'open'
    );
    expect(
      await page
        .locator('#result')
        .evaluate((el) => el.getBoundingClientRect().bottom),
      `result at ${width}×${height}`
    ).toBeLessThanOrEqual(height);
    await expect(page.locator('#comparison')).toBeHidden();
  }
  await expect(page.locator('#clean-badge')).toBeVisible();
  await expect(page.locator('#next-crossing')).toContainText('1h');
  await expect(page.locator('#past-crossings')).toBeHidden();
  await expect(
    page.locator('#archive-result a').filter({ hasText: 'Earlier crossing' })
  ).toBeHidden();
  await page.locator('#community-details summary').click();
  await expect(page.locator('#card-opening')).toContainText(
    'You started with Fox.'
  );
  await expect(page.locator('#comparison')).toContainText('How players opened');
  await expect(page.locator('#comparison')).toContainText('75%');
  await page.screenshot({ path: 'artifacts/compact-result-desktop.png' });
});

test('first visit opens on a playable board with a contextual cue and a visible timer', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/game.html');
  await expect(page.locator('#first-move')).toBeVisible();
  await expect(page.locator('#help-dialog')).toBeHidden();
  await send(page, 'fox');
  await expect(page.locator('#first-move')).toBeHidden();
  await expect(page.locator('#run-clock')).toBeVisible();
  await expect(page.locator('#run-clock')).toHaveText(/^0:[0-9]{2}$/);
  await page.locator('#help').click();
  await page.locator('#show-timer').uncheck();
  await page.locator('#close-help').click();
  await expect(page.locator('#run-clock')).toBeHidden();
  await context.close();
});

for (const width of [288, 390, 640, 1024]) {
  test(`practice keeps its board and actions visible at ${width}×512`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height: 512 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/game.html');
    await page.locator('#help').click();
    await page.locator('#help-practice').click();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const action = page.locator('#tour-action');
    const board = page.locator('#game-container canvas');
    for (const label of [
      'Show Turtle’s path',
      'Send Turtle home',
      'Undo the move',
      'Play my daily crossing',
    ]) {
      await expect(action).toHaveText(label);
      const canvas = await board.boundingBox();
      const panel = await page.locator('#tour-panel').boundingBox();
      if (!canvas || !panel)
        throw new Error('Practice board or panel is missing');
      expect(canvas.width).toBeGreaterThanOrEqual(200);
      expect(canvas.y).toBeGreaterThanOrEqual(0);
      expect(
        panel.y + panel.height,
        `practice step: ${label}`
      ).toBeLessThanOrEqual(512);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
      if (width < 560)
        expect(canvas.y + canvas.height).toBeLessThanOrEqual(panel.y);
      else expect(canvas.x + canvas.width).toBeLessThanOrEqual(panel.x);
      await action.click();
    }
    await expect(page.locator('#tour-panel')).toBeHidden();
    await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
    await context.close();
  });
}

for (const puzzle of [
  {
    day: 25,
    title: 'Foxglove Confluence',
    order: ['badger', 'rabbit', 'turtle', 'fox'],
    recap: 'Fox kept the ☾ bridge open for Rabbit and Turtle.',
  },
  {
    day: 26,
    title: 'Last Light',
    order: ['rabbit', 'fox', 'turtle', 'badger'],
    recap: 'Turtle kept the ☾ bridge open for Rabbit.',
  },
  {
    day: 27,
    title: 'Hushwater Turn',
    order: ['fox', 'badger', 'rabbit', 'turtle'],
    recap: 'Turtle kept the ☾ bridge open for Rabbit.',
  },
]) {
  test(`solves ${puzzle.title} and explains the rescue on a narrow screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 512 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page
      .locator('#edition-picker')
      .selectOption(`loo-2026-11-${puzzle.day}`);
    await expect(page.locator('#board-title')).toHaveText(puzzle.title);
    await expect(page.locator('#bridge-recap')).toBeHidden();
    for (const animal of puzzle.order) await send(page, animal);
    await expect(page.locator('#save-status')).toContainText(
      'validated and saved'
    );
    await page.reload();
    await page.getByText('Rescue recap', { exact: true }).click();
    await expect(page.locator('#bridge-recap')).toContainText(puzzle.recap);
  });
}

test('Version 4 captures the playable screens and keeps scenery and sound preferences', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return play.call(this).then(() => {
        document.documentElement.dataset.soundPlaying = this.currentSrc;
      });
    };
  });
  await page.setViewportSize({ width: 390, height: 720 });
  await open(page);
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  await page.screenshot({ path: 'artifacts/version4/01-mobile-board.png' });
  await page.locator('.animal-picker summary').click();
  await page.locator('[data-animal=turtle]').click();
  await expect(page.locator('#feedback')).toContainText(
    'Leaving folds the ☾ bridge'
  );
  await page.locator('.animal-picker summary').click();
  await page.screenshot({ path: 'artifacts/version4/02-turtle-preview.png' });
  await page.locator('#send').click();
  await expect(page.locator('#feedback')).toContainText('Stranded!');
  await page.screenshot({ path: 'artifacts/version4/03-rabbit-stranded.png' });
  await page.locator('#undo').click();
  await page.locator('#help').click();
  await page.locator('#scenery').selectOption('dawn');
  await expect(page.locator('html')).toHaveAttribute('data-scenery', 'dawn');
  await page.locator('#close-help').click();
  await page.locator('#forest-sound').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-sound-playing',
    /dawn\.mp3/
  );
  await page.screenshot({ path: 'artifacts/version4/05-silver-dawn.png' });
  await page.locator('#help').click();
  await page.locator('#scenery').selectOption('autumn');
  await expect(page.locator('html')).toHaveAttribute(
    'data-sound-playing',
    /autumn\.mp3/
  );
  await page.locator('#soundtrack').selectOption('music');
  await expect(page.locator('html')).toHaveAttribute(
    'data-sound-playing',
    /woodland-music\.mp3/
  );
  await page.screenshot({ path: 'artifacts/version4/04-settings.png' });
  await page.locator('#close-help').click();
  await page.locator('#forest-sound').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-scenery', 'autumn');
  await expect(page.locator('#forest-sound')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await page.screenshot({ path: 'artifacts/version4/06-amber-creek.png' });
  for (const animal of ['fox', 'rabbit', 'turtle', 'badger'])
    await send(page, animal);
  await expect(page.locator('#save-status')).toContainText(
    'validated and saved'
  );
  const saved = await (await page.request.get('/api/init')).json();
  expect(saved.completion).toBeTruthy();
  await page.close();
  const production = await context.newPage();
  const init = {
    ...saved,
    mode: 'reddit',
    commentsUrl: 'https://www.reddit.com/comments/preview/',
  };
  let solved = false;
  await production.route('**/api/init', (route) =>
    route.fulfill({
      json: { ...init, completion: solved ? init.completion : null },
    })
  );
  await production.setViewportSize({ width: 390, height: 360 });
  await production.goto('http://127.0.0.1:5175/splash.html');
  await expect(production.locator('#edition')).toHaveText(
    'Day 1 · Moonroot Crossing'
  );
  await production.screenshot({
    path: 'artifacts/version4/08-reddit-feed.png',
  });
  solved = true;
  await production.setViewportSize({ width: 390, height: 720 });
  await production.goto('http://127.0.0.1:5175/game.html');
  await expect(production.locator('#result')).toBeVisible({ timeout: 15000 });
  await production.locator('#copy-result').click();
  await expect(production.locator('#post-rescue')).toBeVisible();
  await production.screenshot({ path: 'artifacts/version4/07-result.png' });
  await production.close();
  const desktop = await context.newPage();
  await desktop.setViewportSize({ width: 1280, height: 800 });
  await desktop.goto('/game.html');
  await expect(desktop.locator('#rescue-count')).toHaveText('4 / 4');
  await desktop.locator('#help').click();
  await desktop.locator('#restart').click();
  await expect(desktop.locator('#result')).toBeHidden();
  await desktop.screenshot({ path: 'artifacts/version4/09-desktop-board.png' });
});

test('daily victory opens a live leaderboard in a narrow Reddit frame', async ({
  page,
}) => {
  const { createApi } = await import('../../src/server/app.ts');
  const { MemoryStore } = await import('../../src/server/core/memory-store.ts');
  const { complete } = await import('../../src/server/core/completions.ts');
  const { bindingFor, EDITIONS } =
    await import('../../src/server/core/schedule.ts');
  const { Hono } = await import('hono');
  const edition = EDITIONS[0]!;
  const store = new MemoryStore();
  const now = new Date(`${edition.date}T12:00:00.000Z`);
  const sequence = ['fox', 'rabbit', 'turtle', 'badger'];
  const recordFinish = (id: string, offset: number) =>
    complete(
      store,
      edition,
      id,
      {
        editionId: edition.id,
        puzzleId: edition.puzzleId,
        boardVersion: edition.boardVersion,
        sequence,
        personalUndos: 1,
        favorite: 'fox',
      },
      new Date(now.getTime() + offset)
    );
  await recordFinish('t2_older', -1000);
  const app = new Hono().route(
    '/api',
    createApi({
      mode: 'reddit',
      store,
      now: () => now,
      getContext: async () => ({
        userId: 't2_me',
        username: 'FernKeeper',
        postId: 't3_test',
      }),
      readPost: async () => bindingFor(edition),
      resolveUsername: async (id) =>
        id === 't2_older' ? 'AlderKeeper' : 'OakKeeper',
    })
  );
  let leaderboardRequests = 0;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/leaderboard' && ++leaderboardRequests === 1) {
      await route.fulfill({
        status: 503,
        json: { error: 'Temporarily offline' },
      });
      return;
    }
    const response = await app.request(path, {
      method: req.method(),
      body: req.postData() ?? undefined,
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  await page.setViewportSize({ width: 288, height: 512 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('canvas')).toBeVisible();
  for (const animal of sequence) await send(page, animal);
  await expect(page.locator('#result')).toHaveClass(/victory-reveal/);
  await expect(page.locator('.victory-fireflies i').first()).toHaveCSS(
    'animation-name',
    'rescue-fireflies'
  );
  const action = page.getByRole('button', { name: 'Leaderboard', exact: true });
  await expect(action).toBeInViewport();
  expect(leaderboardRequests).toBe(0);
  await action.click();
  const dialog = page.getByRole('dialog', { name: 'Leaderboard' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Could not load the leaderboard.')
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.getByText('Your place: #1 of 2')).toBeVisible();
  await expect(dialog.locator('#leaderboard-your-score')).toHaveText('Clean');
  await expect(
    dialog.getByText('Live · updates every 15 seconds')
  ).toBeVisible();
  await expect(dialog.getByText('u/AlderKeeper')).toBeVisible();
  await expect(dialog.getByText('1 assist').first()).toBeVisible();
  await expect(dialog.locator('.leaderboard-you')).toContainText(
    'u/FernKeeper'
  );
  await expectNoHorizontalOverflow(page);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => recordFinish(`t2_new${i}`, 1000 + i))
  );
  await page.bringToFront();
  await page.clock.fastForward(15000);
  await expect(dialog.getByText('Your place: #1 of 12')).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(10);
  await expect(
    dialog.getByText('Live · updates every 15 seconds')
  ).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(action).toBeFocused();
  await page.reload();
  await expect(action).toBeVisible();
  await expect(page.locator('#result')).not.toHaveClass(/victory-reveal/);
});

test('Community Rescue shows yesterday, prevents a repeat turn, and preserves the solo board', async ({
  page,
}) => {
  const { createApi } = await import('../../src/server/app.ts');
  const { MemoryStore } = await import('../../src/server/core/memory-store.ts');
  const { bindingFor, EDITIONS } =
    await import('../../src/server/core/schedule.ts');
  const { Hono } = await import('hono');
  const edition = EDITIONS[0]!;
  const sharedRows = new Map<string, string>();
  const app = new Hono().route(
    '/api',
    createApi({
      mode: 'reddit',
      store: new MemoryStore(),
      communityStorage: {
        get: async (key) => sharedRows.get(key),
        commit: async (key, previous, next, archive) => {
          if (sharedRows.get(key) !== previous) return false;
          sharedRows.set(key, next);
          if (archive) sharedRows.set(archive.key, archive.value);
          return true;
        },
      },
      getContext: async (c) => ({
        userId: c.req.header('x-test-player') ?? 't2_alder',
        username: c.req.header('x-test-player') ?? 'Alder',
        postId: 't3_sharedpost',
      }),
      readPost: async () => bindingFor(edition),
      now: () => new Date('2026-11-18'),
    })
  );
  await page.setViewportSize({ width: 390, height: 512 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith('/api/telemetry/')) {
      await route.fulfill({
        status: 503,
        json: { error: 'Telemetry is disabled for this test' },
      });
      return;
    }
    const response = await app.request(path, {
      method: req.method(),
      body: req.postData() ?? undefined,
    });
    const json = await response.json();
    if (path === '/api/init')
      json.previousRescues = {
        yesterday: true,
        totalSolves: 12,
        perfectRuns: 3,
        stranded: { rabbit: 6 },
      };
    await route.fulfill({ status: response.status, json });
  });
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('#first-move')).toHaveText(
    'Yesterday: 12 rescues • Most stranded: Rabbit • Perfect runs: 25%'
  );
  await send(page, 'fox');
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  const communityTab = page.getByRole('button', { name: 'Community Rescue' });
  await expect(communityTab.getByText('One move each')).toBeInViewport();
  await communityTab.click();
  await expect(page.locator('#shared-status')).toHaveText(
    'Take one move this attempt.'
  );
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  const panel = await page.locator('#shared-summary').boundingBox();
  expect((panel?.y ?? 512) + (panel?.height ?? 0)).toBeLessThanOrEqual(512);
  await page
    .locator('.animal-picker')
    .evaluate((el) => el.setAttribute('open', ''));
  await page.locator('[data-animal=turtle]').click();
  await page.locator('#send').click();
  await expect(page.locator('#feedback')).toContainText(
    'Rabbit lost their way home. A fresh attempt is ready!'
  );
  await expect(page.locator('#shared-status')).toContainText('Waiting');
  const blockedVote = page.locator('[data-vote=badger]');
  await expect(blockedVote).toHaveAttribute('aria-disabled', 'true');
  await expect(blockedVote).toHaveAttribute(
    'title',
    'Fox is still on this path'
  );
  let releaseVote = () => {};
  const pausedVote = new Promise<void>((resolve) => {
    releaseVote = resolve;
  });
  await page.route('**/api/community/vote', async (route) => {
    await pausedVote;
    await route.fallback();
  });
  const response = page.waitForResponse('**/api/community/vote');
  const foxVote = page.locator('[data-vote=fox]');
  // A signed-in player whose turn is over can vote while the request is pending.
  await foxVote.click();
  await expect(foxVote).toHaveAttribute('aria-pressed', 'true');
  await expect(foxVote).toContainText('1');
  releaseVote();
  expect((await response).ok()).toBe(true);

  await page.locator('#shared-history summary').click();
  await expect(page.locator('#shared-log')).toContainText('u/Alder');
  await app.request('/api/community', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-player': 'Birch' },
    body: JSON.stringify({ animal: 'fox', moveNumber: 1 }),
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText(
    'u/Birch brought Fox home'
  );
  await expect(page.locator('#vote-feedback')).toContainText(
    'Community’s pick was chosen.'
  );
  await expect(foxVote).toBeHidden();
  await expect(page.locator('#replay-empty')).toBeVisible();
  for (const [animal, moveNumber, player] of [
    ['rabbit', 2, 'Cedar'],
    ['turtle', 3, 'Dawn'],
    ['badger', 4, 'Elm'],
  ] as const) {
    const response = await app.request('/api/community', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-player': player },
      body: JSON.stringify({ animal, moveNumber }),
    });
    expect(response.ok).toBe(true);
  }
  await page.locator('#shared-refresh').click();
  await page.locator('#watch-replay').click();
  await expect(page.locator('#replay-warning')).toBeVisible();
  await expect(page.locator('#replay-controls')).toBeHidden();
  await page.locator('#replay-warning button[value=cancel]').click();
  await expect(page.locator('#replay-controls')).toBeHidden();
  await page.locator('#watch-replay').click();
  await page.locator('#replay-warning button[value=watch]').click();
  await expect(page.locator('#replay-controls')).toBeVisible();
  await expect(page.locator('#replay-play')).toBeHidden();
  await expect(page.locator('#replay-progress')).toHaveAttribute('value', '0');
  await page.locator('#replay-next').click();
  await expect(page.locator('#replay-caption')).toContainText(
    '1/4 · u/Birch moved Fox home'
  );
  await page.locator('#replay-prev').click();
  await expect(page.locator('#rescue-count')).toHaveText('0 / 4');
  const live = await app.request('/api/community', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-player': 'Fawn' },
    body: JSON.stringify({ animal: 'fox', moveNumber: 5 }),
  });
  expect(live.ok).toBe(true);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange'))
  );
  for (let move = 0; move < 4; move++)
    await page.locator('#replay-next').click();
  await expect(page.locator('#replay-caption')).toContainText(
    'Rescued together by 4 Redditors in 4 moves'
  );
  await expect(page.locator('#replay-caption')).toContainText('u/Elm');
  await page.locator('#replay-close').click();
  await expect(page.locator('#replay-controls')).toBeHidden();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#watch-replay').click();
  await page.locator('#replay-warning button[value=watch]').click();
  await expect(page.locator('#replay-play')).toHaveText('Pause');
  await page.locator('#replay-play').click();
  await expect(page.locator('#replay-play')).toHaveText('Play');
  await page.locator('#replay-play').click();
  await expect(page.locator('#replay-caption')).toContainText(
    'Rescued together by 4 Redditors',
    { timeout: 7000 }
  );
  await page.locator('#replay-close').click();
  const replayKey = [...sharedRows.keys()].find((key) =>
    key.endsWith(':replay:5')
  )!;
  sharedRows.set(replayKey, 'corrupted');
  await page.locator('#watch-replay').click();
  await page.locator('#replay-warning button[value=watch]').click();
  await expect(page.locator('#replay-feedback')).toContainText(
    'You can still play the shared crossing'
  );
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.getByRole('button', { name: 'Solo Rescue' }).click();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await expect(page.locator('#undo')).toBeEnabled();
  await expect(page.locator('#shared-rescue')).toBeHidden();
});

test('Undo stays available and the first Hint is separate for each daily', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.locator('#hint').click();
  await expect(page.locator('#hint')).toBeDisabled();
  const undo = page.locator('#undo');
  for (let i = 0; i < 3; i++) {
    await send(page, 'fox');
    await expect(undo).toBeEnabled();
    await undo.click();
  }
  await page.reload();
  await expect(page.locator('#hint')).toBeDisabled();
  for (const animal of ['fox', 'rabbit', 'turtle', 'badger'])
    await send(page, animal);
  await expect(page.locator('#clean-badge')).toHaveText('B Rank');
  await expect(page.locator('#card-undos')).toContainText('Hint used');
  await expect(page.locator('#back-to-board')).toHaveCount(0);
  await page.locator('#edition-picker').selectOption('loo-2026-11-19');
  await expect(page.locator('#hint')).toBeEnabled();
});

test('a Challenge edition fits the inline frame and can be completed', async ({
  page,
}) => {
  const { editionAt } = await import('../../src/server/core/schedule.ts');
  const { boardById } = await import('../../src/shared/boards.ts');
  const { solve } = await import('../../src/shared/engine.ts');
  const edition = editionAt(new Date('2026-11-28T00:00:00Z'))!;
  const board = boardById(edition.puzzleId, edition.boardVersion);
  await page.setViewportSize({ width: 390, height: 512 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.locator('#edition-picker').selectOption(edition.id);
  await expect(page.locator('#board-title')).toHaveText(board.title);
  await expect(page.locator('#run-clock')).toHaveText('0:00');
  await expect(page.locator('#undo')).toHaveText('↶ Undo');
  await expectNoHorizontalOverflow(page);
  const boardBox = await page.locator('#game-container').boundingBox();
  const actions = await page.locator('.actions').boundingBox();
  expect(boardBox).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(Math.abs(boardBox!.x - actions!.x)).toBeLessThan(1);
  expect(Math.abs(boardBox!.width - actions!.width)).toBeLessThan(1);
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(512);
  await page.screenshot({
    path: 'artifacts/challenge-preview/01-challenge.png',
  });
  for (const animal of solve(board)[0]!) await send(page, animal);
  await expect(page.locator('#save-status')).toContainText(
    'validated and saved'
  );
});

test('an expert crossing exposes a late trap and can be recovered on a small phone', async ({
  page,
}) => {
  const { editionAt } = await import('../../src/server/core/schedule.ts');
  const { boardById } = await import('../../src/shared/boards.ts');
  const { replay, solve, trace } = await import('../../src/shared/engine.ts');
  const edition = editionAt(new Date('2026-12-19T00:00:00Z'))!;
  const board = boardById(edition.puzzleId, edition.boardVersion);
  const [first, second, third, last] = solve(board)[0]!;
  expect(board.bridges).toHaveLength(4);
  expect(trace(board, replay(board, [first!, second!]), last!).legal).toBe(
    true
  );
  await page.setViewportSize({ width: 320, height: 512 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.locator('#edition-picker').selectOption(edition.id);
  await expect(page.locator('#board-title')).toHaveText(board.title);
  await expectNoHorizontalOverflow(page);
  const actions = await page.locator('.actions').boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(512);
  const canvas = page.locator('#game-container canvas');
  const sendFromBoard = async (id: string) => {
    const animal = board.animals.find((candidate) => candidate.id === id)!;
    const box = (await canvas.boundingBox())!;
    await canvas.click({
      position: {
        x: (box.width * (66 + animal.x * 48)) / 420,
        y: (box.height * (66 + animal.y * 48)) / 420,
      },
    });
    await expect(page.locator('#send')).toBeEnabled();
    await page.locator('#send').click();
    await expect(page.locator('#restart')).toBeEnabled();
  };
  await sendFromBoard(first!);
  await sendFromBoard(second!);
  await sendFromBoard(last!);
  await expect(page.locator('#feedback')).toContainText('Stranded!');
  await page.locator('#undo').click();
  await sendFromBoard(third!);
  await sendFromBoard(last!);
  await expect(page.locator('#save-status')).toContainText(
    'validated and saved'
  );
});

test('Remix Sunday rejects a broken crossing and lets a moderator test and export an approved draft', async ({
  page,
}) => {
  const { createApi } = await import('../../src/server/app.ts');
  const { MemoryStore } = await import('../../src/server/core/memory-store.ts');
  const { Hono } = await import('hono');
  const { bindingFor, EDITIONS } =
    await import('../../src/server/core/schedule.ts');
  const drafts = new Map<string, string>();
  const api = new Hono().route(
    '/api',
    createApi({
      mode: 'reddit',
      store: new MemoryStore(),
      now: () => new Date('2026-11-24'),
      readPost: async () => bindingFor(EDITIONS[0]!),
      getContext: async () => ({
        userId: 't2_creator',
        username: 'creator',
        postId: 't3_daily',
      }),
      canReviewRemix: async () => true,
      communityStorage: {
        get: async (key) => drafts.get(key),
        commit: async (key, expected, value) => {
          if (drafts.get(key) !== expected) return false;
          drafts.set(key, value);
          return true;
        },
      },
    })
  );
  await page.setViewportSize({ width: 320, height: 512 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const result = await api.request(url.pathname + url.search, {
      method: request.method(),
      body: request.postData(),
    });
    await route.fulfill({ status: result.status, body: await result.text() });
  });
  await page.goto('http://127.0.0.1:5175/game.html');
  await send(page, 'fox');
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await page.locator('#help').click();
  await page.getByRole('button', { name: 'Remix Sunday' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Remix Sunday' })
  ).toBeVisible();
  await page.getByLabel('Slot 1 direction').selectOption('N');
  await page.locator('#remix-submit').click();
  await expect(page.locator('#remix-status')).toContainText('Try changing');
  await page.getByLabel('Slot 1 direction').selectOption('W');
  await page.locator('#remix-submit').click();
  await expect(page.locator('#remix-status')).toContainText('Draft submitted');
  await page.getByRole('button', { name: 'Load review queue' }).click();
  await page.getByRole('button', { name: /Preview u\/creator/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Sunday Remix by u/creator' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Test play', exact: true }).click();
  for (const animal of ['Fox', 'Rabbit', 'Turtle', 'Badger'])
    await page
      .getByRole('button', { name: new RegExp(`^Send ${animal}`) })
      .click();
  await expect(page.locator('#remix-status')).toHaveText(
    'Everyone home. Test play complete.'
  );
  await page.getByRole('button', { name: 'Exit test play' }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('#remix-status')).toHaveText(
    'Approved for manual publication.'
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download approved board' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^remix-[a-f0-9]{64}\.json$/
  );
  await page.getByRole('button', { name: '← Close' }).click();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
});

test('forest map locates the chosen avatar, pages old crossings, and fits the Reddit frame', async ({
  page,
}) => {
  const { EDITIONS } = await import('../../src/server/core/schedule.ts');
  await page.route('**/api/init', (route) =>
    route.fulfill({
      json: {
        status: 'ready',
        mode: 'demo',
        edition: EDITIONS[9],
        completion: null,
        community: null,
        commentsUrl: null,
      },
    })
  );
  await page.route('**/api/companion', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        rescues: 12,
        profile: { animal: 'owl', scarf: 'none', accessory: 'none' },
      },
    })
  );
  await page.route('**/api/crossings', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        cards: [],
        past: Array.from({ length: 9 }, (_, index) => ({
          day: index + 1,
          title: `Earlier crossing ${index + 1}`,
          url: `https://www.reddit.com/comments/post${index + 1}/`,
          completed: true,
        })),
      },
    })
  );
  await page.goto('/splash.html');
  await page.getByRole('button', { name: 'My Map', exact: true }).click();
  const marker = page.locator('.journey-node[aria-current=step]');
  await expect(marker).toContainText('You are here');
  await expect(marker.locator('svg')).toHaveAttribute(
    'aria-label',
    'owl by a lantern'
  );
  for (const size of [
    { width: 320, height: 512 },
    { width: 390, height: 512 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    const continueButton = await page
      .locator('.journey-continue')
      .boundingBox();
    expect(continueButton).not.toBeNull();
    expect(continueButton!.y + continueButton!.height).toBeLessThanOrEqual(
      size.height
    );
    const footer = await page.locator('.journey-nav').boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(size.height);
    await expectNoHorizontalOverflow(page);
  }
  await page.getByRole('button', { name: '← Earlier', exact: true }).click();
  await expect(page.locator('.journey-node').first()).toContainText(
    'Earlier crossing 1'
  );
  await page.getByRole('button', { name: 'Later →', exact: true }).click();
  await expect(marker).toBeVisible();
  await expect(
    page.locator('.journey-node[aria-disabled=true]').first()
  ).toHaveAttribute('aria-label', /upcoming/);
  await page
    .locator('.journey-nav')
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await expect(page.locator('#personal-panel')).toBeHidden();
});

test('welcome Settings leaves space above the animal choices in a narrow frame', async ({
  page,
}) => {
  await page.setViewportSize({ width: 288, height: 512 });
  await page.goto('/splash.html');
  await page.locator('.welcome-toolbar [data-settings]').click();
  await page.locator('#welcome-my-animal summary').click();
  const back = await page
    .locator('#welcome-companion-editor .companion-back')
    .boundingBox();
  const choices = await page
    .getByRole('group', { name: 'Favorite animal avatar' })
    .boundingBox();
  expect(
    back && choices ? choices.y - (back.y + back.height) : 0
  ).toBeGreaterThanOrEqual(10);
  await expectNoHorizontalOverflow(page);
});

test('animal decorations offer natural styles for each species and save the chosen look', async ({
  page,
}) => {
  let profile = { animal: 'fox', scarf: 'none', accessory: 'none' };
  await page.route('**/api/companion*', async (route) => {
    if (route.request().method() === 'POST') {
      profile = route.request().postDataJSON();
      await route.fulfill({ json: profile });
    } else
      await route.fulfill({ json: { profile, rescues: 5, signedIn: true } });
  });
  await page.setViewportSize({ width: 390, height: 512 });
  await open(page);
  await page.locator('#help').click();
  await page.locator('#my-animal summary').click();
  const decorations = page.getByRole('group', { name: 'Animal decorations' });
  await expect(
    decorations.getByRole('button', { name: 'Full tail' })
  ).toBeVisible();
  await expect(
    decorations.getByRole('button', { name: 'Spread wings' })
  ).toHaveCount(0);
  await decorations.getByRole('button', { name: 'Silver coat' }).click();
  await expect(page.locator('.companion-preview image')).toHaveAttribute(
    'filter',
    'url(#fox-coat)'
  );
  await page
    .locator('#game-companion-editor .companion-options button')
    .filter({ hasText: /^Owl$/ })
    .click();
  await expect(
    decorations.getByRole('button', { name: 'Silver coat' })
  ).toHaveCount(0);
  await decorations.getByRole('button', { name: 'Spread wings' }).click();
  await page.getByRole('button', { name: 'Save my animal' }).click();
  await expect(page.locator('#game-companion-editor')).toContainText(
    'Animal saved.'
  );
  expect(profile.animal).toBe('owl');
  expect(profile.accessory).toBe('signature');
  const save = await page
    .getByRole('button', { name: 'Save my animal' })
    .boundingBox();
  expect(save!.y + save!.height).toBeLessThanOrEqual(512);
  await page.screenshot({ path: 'artifacts/avatar-preview/owl-wings.png' });
});
