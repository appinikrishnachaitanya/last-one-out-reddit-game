import { Hono } from 'hono';
import { isObject } from '../../shared/daily';
import { telemetry } from '@devvit/analytics/server/reddit';
// SDK 0.15.4's router is Express-only. These Hono adapters use its documented public server API.
export const telemetryRoutes = new Hono();
telemetryRoutes.post('/journey/app-ready', async (c) => {
  try {
    return c.json(await telemetry.appReady());
  } catch {
    return c.json({ error: 'Telemetry unavailable' }, 503);
  }
});
telemetryRoutes.post('/journey/start', async (c) => {
  try {
    return c.json(await telemetry.startJourney());
  } catch {
    return c.json({ error: 'Telemetry unavailable' }, 503);
  }
});
telemetryRoutes.post('/journey/progress', async (c) => {
  try {
    const body: unknown = await c.req.json();
    if (
      !isObject(body) ||
      typeof body.journeyId !== 'string' ||
      !body.journeyId ||
      typeof body.progress !== 'number' ||
      ![0.25, 0.5, 0.75].includes(body.progress)
    )
      return c.json({ error: 'Invalid rescue milestone' }, 400);
    return c.json(
      await telemetry.journeyProgress({
        journeyId: body.journeyId,
        progress: body.progress,
        action: 'animal_home',
      })
    );
  } catch {
    return c.json({ error: 'Telemetry unavailable' }, 503);
  }
});
telemetryRoutes.post('/journey/end', async (c) => {
  try {
    const body: unknown = await c.req.json();
    if (
      !isObject(body) ||
      typeof body.journeyId !== 'string' ||
      !body.journeyId ||
      body.complete !== false
    )
      return c.json(
        {
          error:
            'Successful completion is recorded by the validated rescue endpoint only',
        },
        400
      );
    return c.json(
      await telemetry.endJourney({ journeyId: body.journeyId, complete: false })
    );
  } catch {
    return c.json({ error: 'Telemetry unavailable' }, 503);
  }
});
