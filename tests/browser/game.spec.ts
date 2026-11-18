import { test, expect } from '@playwright/test';
async function open(page: import('@playwright/test').Page) {
  await page.goto('/game.html');
  await expect(page.getByText('LOCAL PREVIEW', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
}
async function send(page: import('@playwright/test').Page, name: string) {
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
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'true');
  const sendBox = await page.locator('#send').boundingBox();
  expect(sendBox?.y).toBeLessThan(650);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  for (const id of ['fox', 'rabbit', 'turtle', 'badger']) {
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
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
  const page = await context.newPage();
  await open(page);
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Missing canvas');
  const x = canvas.x + (canvas.width * 114) / 420,
    y = canvas.y + (canvas.height * 114) / 420;
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
  await open(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if ((await page.locator('#motion').getAttribute('aria-pressed')) !== 'true')
    await page.locator('#motion').click();
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
    await expect(page.locator('#community')).toBeHidden();
    for (const animal of order) await send(page, animal);
    await expect(page.locator('#save-status')).toContainText(
      'validated and saved'
    );
    await page.locator('[data-favorite=rabbit]').click();
    await expect(page.locator('#card-portrait svg')).toHaveAttribute(
      'aria-label',
      'rabbit by a lantern'
    );
    await expect(page.locator('#favorite-status')).toContainText(
      'Card art saved'
    );
    await page.reload();
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#board-title')).toHaveText(title);
    await expect(page.locator('#rescue-count')).toHaveText('4 / 4');
    await expect(page.locator('#card-animal')).toContainText('Rabbit');
    await page.locator('#copy-result').click();
    await expect(page.locator('#copy-status')).toContainText('Copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Everyone home');
    expect(copied).not.toContain('→');
    expect(copied).not.toContain('Fox');
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
  await page.locator('#motion').click();
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
  await page.route('**/api/init*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        mode: 'reddit',
        edition,
        completion,
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
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('#result')).toBeVisible();
  // This uses a production-shaped server response, not a claim of in-Reddit execution.
  await expect(page.locator('#preview-picker')).toBeHidden();
  await expect(page.locator('#community')).toContainText('aren’t enough');
  await expect(page.locator('#card-animal')).toContainText('Badger');
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
      now: () => new Date('2026-11-19T00:01:00Z'),
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
  await expect(page.locator('#preview-picker')).toBeHidden();
  await expect(page.locator('#community')).toBeHidden();
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
  await expect(page.locator('#card-undos')).toHaveText('1 personal undo');
  await expect(page.locator('#community')).toContainText('aren’t enough');
  expect(completedJourneys).toBe(1);
  expect(events.filter((e) => e === 'start')).toHaveLength(1);
  expect(events.filter((e) => e === 'progress')).toHaveLength(3);
  await page.locator('[data-favorite=badger]').click();
  await expect(page.locator('#favorite-status')).toContainText(
    'Card art saved'
  );
  await page.reload();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#card-animal')).toContainText('Badger');
  expect(completionRequests).toBe(1);
  await page.locator('#copy-result').click();
  await expect(page.locator('#copy-status')).toContainText('Copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Day 1');
  expect(text).toContain('1 personal undo');
  expect(text).not.toContain('→');
  expect(text).not.toContain('Rabbit');
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
