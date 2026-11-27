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
    route.fulfill({ json: { kind: 'today', url: daily } })
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
  await expect(
    page.getByRole('heading', { name: 'Rabbit and Badger are stranded.' })
  ).toBeVisible();
  expect(
    (await page.locator('#river-board canvas').boundingBox())?.width
  ).toBeGreaterThan(200);
  await page.screenshot({ path: 'artifacts/callback-firefly-opening.png' });
  await page.getByRole('button', { name: 'Call back Fox' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Fox raised the bridge. Rabbit can cross.'
  );
  await expect(
    page.getByRole('button', { name: 'Path blocked Badger' })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Send home Rabbit' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Badger: ✦ bridge is folded.'
  );
  const retry = page.getByRole('button', { name: 'Try another keeper' });
  await expect(retry).toBeEnabled();
  const box = await retry.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(512);
  await page.screenshot({ path: 'artifacts/callback-firefly-decision.png' });
  await retry.click();
  await expect(page.locator('#crossing-count')).toHaveText(
    '2 home · 2 on the board'
  );

  await call.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText(
    'Turtle raised both bridges. Rabbit and Badger can cross.'
  );
  for (const animal of ['Rabbit', 'Badger']) {
    await expect(
      page.getByRole('button', { name: `Send home ${animal}` })
    ).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(
    page.getByRole('button', { name: 'Send home Turtle' })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', {
      name: 'Turtle went back for Rabbit and Badger.',
    })
  ).toBeFocused();
  await page.getByRole('link', { name: 'Play today’s crossing' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-navigation', daily);
  expect(writes).toEqual([]);
});

test('the showcase labels an older playable crossing honestly', async ({
  page,
}) => {
  const url = 'https://www.reddit.com/comments/lastplayable/';
  await page.route('**/api/callback/destination', (route) =>
    route.fulfill({ json: { kind: 'latest', url } })
  );
  await page.goto('http://127.0.0.1:5175/callback.html');
  await expect(
    page.getByRole('link', { name: 'Latest crossing' })
  ).toHaveAttribute('href', url);
});
