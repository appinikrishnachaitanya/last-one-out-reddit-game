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
