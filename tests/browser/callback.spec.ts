import { expect, test } from '@playwright/test';

test('a visitor calls one keeper back, tries a harder crossing, and opens the daily', async ({
  page,
}) => {
  await page.setViewportSize({ width: 288, height: 512 });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') writes.push(request.url());
  });
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.navigateToUrl)
        document.documentElement.dataset.navigation =
          event.data.navigateToUrl.url;
    });
  });
  const daily = 'https://www.reddit.com/comments/judgepost/';
  await page.route('**/api/callback/destination', (route) =>
    route.fulfill({ json: { daily: true, url: daily } })
  );
  await page.goto('http://127.0.0.1:5175/callback.html');
  const call = page.getByRole('button', { name: 'Call back Turtle' });
  await expect(call).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole('heading', { name: 'Rabbit is stranded.' })
  ).toBeVisible();
  await expect(page.locator('#crossing-count')).toHaveText(
    '3 home · 1 on the board'
  );
  for (const control of [
    call,
    page.getByRole('link', { name: 'Daily crossing' }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(512);
  }
  await page.screenshot({ path: 'artifacts/callback-opening.png' });
  await call.click();
  await expect(page.getByRole('status')).toHaveText(
    'Turtle raised the bridge. Rabbit can cross.'
  );
  await expect(page.locator('#crossing-count')).toHaveText(
    '2 home · 2 on the board'
  );
  await page.screenshot({ path: 'artifacts/callback-bridge-open.png' });
  await page.getByRole('button', { name: 'Send home Rabbit' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Rabbit is safe. Bring the keeper home.'
  );
  await page.getByRole('button', { name: 'Send home Turtle' }).click();
  await expect(
    page.getByRole('heading', { name: 'Turtle went back for Rabbit.' })
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/callback-reunion.png' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Try Firefly Commons' }).click();
  await page.getByRole('button', { name: 'Call back Fox' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Rabbit still needs another bridge.'
  );
  await expect(
    page.getByRole('button', { name: 'Path blocked Rabbit' })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#crossing-count')).toHaveText(
    '3 home · 1 on the board'
  );
  await call.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Send home Rabbit' })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Send home Turtle' })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Turtle went back for Rabbit.' })
  ).toBeFocused();
  await page.getByRole('link', { name: 'Play today’s crossing' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-navigation', daily);
  expect(writes).toEqual([]);
});
