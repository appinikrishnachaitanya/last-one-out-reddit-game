# Journeys implementation and verification

SDK: `@devvit/analytics` **0.15.4**, matching `@devvit/web` and the installed CLI.

Official references checked during implementation:

- https://developers.reddit.com/docs/capabilities/analytics/devvit-journeys
- https://developers.reddit.com/docs/capabilities/analytics/journeys-receipts
- Installed public declarations under `@devvit/analytics/client/reddit` and `@devvit/analytics/server/reddit`.

The installed SDK's `createTelemetryRouter()` returns an **Express** router. This project retains the official Phaser starter's **Hono** backend and supplies small Hono adapters using the documented public server methods instead of mounting an incompatible router or importing private telemetry internals.

| Moment                                                 | Event              | Implementation                                                                    |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------- |
| Bound board/result loaded and controls interactive     | `App.Ready`        | `telemetry.appReady()` through `/api/telemetry/journey/app-ready`                 |
| First committed animal move, after click/touch release | `Journey.Start`    | `startJourney()` once per run; preview taps do not count                          |
| First arrival at 1, 2, 3 rescued animals               | `Journey.Progress` | 0.25, 0.5, 0.75 with `action: animal_home`; Undo cannot duplicate a milestone     |
| Valid final sequence persisted                         | `Journey.End`      | Server `endJourney({ journeyId, complete: true, game: { win: true, score: 4 } })` |
| Restart or switching local run                         | `Journey.End`      | `complete: false` if a journey had started                                        |

The frontend threads the active SDK journey ID in `x-devvit-journey-id`. `/api/complete` replays the canonical, post-bound board, persists the completion with atomic `HSETNX`, and only then attempts telemetry. A separate atomic claim per player/edition/journey prevents request retries from producing extra completion calls. A new replay journey can finish without adding another community contribution. The public telemetry end route cannot claim a successful solve.

Ready/start/progress calls are queued in order, bounded, and isolated from gameplay. Saving waits at most 300ms for available correlation; an unavailable telemetry service must not prevent saving. Backend completion telemetry is bounded to 800ms after storage succeeds. Errors do not hide the reunion, roll back the rescue, or inflate totals. No names, Reddit IDs, or personal undo counts are put in custom telemetry fields. Local previews send **no Reddit telemetry**.

## Approval and evidence

`permissions.journeys` is enabled in `devvit.json`. Official documentation requires review/approval of the journey map and server-side app allowlisting before ingestion. Private playtests can also return `JOURNEY_RECEIPT_DENIED_PLAYTEST`. SDK calls and permission declarations do not establish ingestion.

Local tests verify event order, first-commit behavior, monotonic progress, failure isolation, server-validated completion correlation, and duplicate protection. The backend logs only the completion **receipt status**, never tokens. Actual Reddit ingestion is **not claimed**. Check the receipt and analytics dashboard after Reddit approves the map/allowlist. Do not publish publicly just to enable analytics.
