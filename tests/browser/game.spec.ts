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
  await page.locator('#past-crossings summary').click();
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
  await open(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (
    (await page.locator('#motion-dialog').getAttribute('aria-pressed')) !==
    'true'
  )
    await toggleMotion(page);
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
    expect(copied).toContain('Rescued: 4/4');
    expect(copied).not.toContain('→');
    expect(copied).toMatch(/First move: (Fox|Rabbit)/);
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
  let posts = 0;
  await page.route('**/api/share', (route) => {
    posts++;
    return route.fulfill({ json: { shared: true } });
  });
  await page.goto('http://127.0.0.1:5175/splash.html');
  await expect(page.locator('#edition')).toHaveText(
    'Day 1 · Moonroot Crossing'
  );
  await expect(page.locator('#play')).toHaveText('View Your Rescue');
  await expect(page.locator('#badge')).toContainText('Badger card earned');
  await page.goto('http://127.0.0.1:5175/game.html');
  await expect(page.locator('#result')).toBeVisible();
  // This uses a production-shaped server response, not a claim of in-Reddit execution.
  await expect(page.locator('#preview-picker')).toBeHidden();
  await page.locator('#community-details').evaluate((el) => {
    el.setAttribute('open', '');
  });
  await expect(page.locator('#comparison')).toContainText(
    "You're among the first rescuers today"
  );
  await expect(page.locator('#card-animal')).toContainText('Badger');
  expect(posts).toBe(0);
  await page.locator('#post-rescue').click();
  await expect(page.locator('#post-rescue')).toHaveText('Shared to Comments ✓');
  await expect(page.locator('#post-rescue')).toBeDisabled();
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
  await expect(page.locator('#card-undos')).toHaveText('1 personal undo');
  await page.locator('#community-details').evaluate((el) => {
    el.setAttribute('open', '');
  });
  await expect(page.locator('#comparison')).toContainText(
    "You're among the first rescuers today"
  );
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
  expect(text).toContain('Last One Out - 2026-11-18');
  expect(text).toContain('Undos: 1');
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
test('the compact saved result keeps copy and comments inside one short frame', async ({
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
        edition,
        completion,
        community: { total: 3, openings: { fox: 2, rabbit: 1 } },
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
  for (const width of [288, 390, 640, 900]) {
    await page.setViewportSize({ width, height: 512 });
    await page.goto('http://127.0.0.1:5175/game.html');
    await expect(page.locator('#result')).toBeVisible();
    for (const id of ['copy-result', 'comments']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(512);
    }
    await expect(page.locator('#community-details')).not.toHaveAttribute(
      'open'
    );
    expect(
      await page
        .locator('#result')
        .evaluate((el) => el.getBoundingClientRect().bottom)
    ).toBeLessThanOrEqual(512);
  }
  await expect(page.locator('#clean-badge')).toBeVisible();
  await expect(page.locator('#next-crossing')).toContainText('1h');
  await page.locator('#past-crossings summary').click();
  await expect(
    page.getByRole('link', { name: 'Earlier crossing · Completed' })
  ).toBeVisible();
  await page.locator('#community-details summary').click();
  await expect(page.locator('#comparison')).toContainText(
    "You're among the first rescuers today"
  );
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
      expect(panel.y + panel.height).toBeLessThanOrEqual(512);
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
    await page.getByText('Who stayed for whom?', { exact: true }).click();
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
        commit: async (key, previous, next) => {
          if (sharedRows.get(key) !== previous) return false;
          sharedRows.set(key, next);
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
  await page.getByRole('button', { name: 'Community Rescue' }).click();
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
    'Rabbit needs a rethink'
  );
  await expect(page.locator('#shared-status')).toContainText('Waiting');
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
  await page.getByRole('button', { name: 'Solo Rescue' }).click();
  await expect(page.locator('#rescue-count')).toHaveText('1 / 4');
  await expect(page.locator('#undo')).toBeEnabled();
  await expect(page.locator('#shared-rescue')).toBeHidden();
});
