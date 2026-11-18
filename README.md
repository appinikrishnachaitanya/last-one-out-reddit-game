# Last One Out

A mobile-first daily rescue puzzle inside Reddit, built on the official **Devvit + Phaser + TypeScript** starter. Seven curated editions share a pure rule engine. Moonroot Crossing preserves the signature moment: Turtle can leave safely, but its moon bridge folds and strands Rabbit; Undo restores both.

The visual design follows the supplied storybook reference: painted animal sprites, a leafy turquoise river, parchment panels, warm gold controls, and a campfire reunion. Wide Reddit frames use a larger board beside the controls; phones retain a compact layout. See [art notes](docs/ART.md) for asset details. The four-animal rules and published board versions remain unchanged.

## Local preview

Node **24+** is required (`.nvmrc` pins the starter version).

```sh
npm ci
npm run demo
```

Open `http://localhost:5173/game.html`. The local-only picker offers all seven editions. Phaser renders the board and animations; HTML controls support keyboard play. Tap once to preview, again to send, or use Send home. Reduced motion respects the OS setting and can be toggled. All four animal choices, the board, Undo, and Send home fit a simulated 512px-high Reddit frame.

The preview uses the **same Hono API, canonical boards, validator, and completion service**, with an explicitly labeled mock identity and local storage adapter. Its cookie identifies a local mock player, and ignored `.local/demo-store.json` keeps results across reloads/server restarts. Community participation and Reddit telemetry are not simulated. Preview results are not Reddit completions. Use a new browser profile/context for a fresh mock player. The API runs on loopback port 5174, proxied by Vite on 5173.

In this cloud workspace, use `npm ci --cache /workspace/.npm-cache` if the default npm cache is unwritable.

## Current private build

The [Day 1 Reddit post](https://www.reddit.com/r/last_one_out_app_dev/comments/1xzazsj/last_one_out_day_1_20261118/) now uses the storybook redesign installed privately as **v0.0.2**, from source commit `22181c2`. GitHub push and Reddit upload succeeded after the earlier HTTP 503 connection failures cleared. Local checks passed (20 unit/API tests, 10 browser tests). A fresh in-Reddit solve/reload and physical-phone check remain to be confirmed. See [playtest evidence](docs/PLAYTEST.md).

## Private Reddit playtest

The official SDKs provide player context, Reddit post creation/navigation, and Devvit Redis. `devvit.json` defines the app `last-one-out-app`, inline Phaser entrypoint, Hono server, moderator actions, and permissions. Credentials are kept out of Git and configuration.

```sh
npm run login -- --copy-paste
npm run devvit -- whoami
npm run deploy
npm run dev
```

Use **`npm run login`**, not `npm login`. Complete the printed Reddit OAuth URL, then enter the returned code into the **CLI terminal**, never chat or source. The copy/paste flow avoids an unreachable `localhost:65010` callback when the CLI is in the cloud. `.local/` contains ignored CLI auth/cache; existing environment overrides are honored.

`deploy` checks/builds and runs `devvit upload`. Uploads are owner-visible, and Devvit creates a private default test community with you as moderator. `dev` starts the playtest and prints its link. An alternate small private community where you have moderator post permissions can be selected with `npm run dev -- community_name`.

In that community's moderator menu:

1. **Open today’s daily** creates or retrieves the UTC edition's post.
2. **Choose playtest edition** opens any of the seven dated editions, including future ones for testing.
3. **Recover edition post** registers an existing app post after an interrupted creation or to adopt a legacy Moonroot post. Enter its `t3_...` ID.

Server checks enforce authenticated moderator post permissions and a **private** community. The one-post registry atomically reserves each edition. Concurrent attempts reuse its registered post or show a recoverable pending/recovery error. Ambiguous Reddit timeouts are never retried blindly: a durable reservation prevents a second submission. If a post exists, use Recover with its ID. If no post exists after a failed ambiguous submission, an administrator must audit the failed reservation before clearing it; do not delete reservations merely because a request timed out.

These commands do **not** publicly publish the app or submit it to Devpost. See [official playtest documentation](https://developers.reddit.com/docs/guides/tools/playtest).

## Daily bindings and saved results

The server-only schedule is `src/server/core/schedule.ts`, with explicit UTC dates **2026-11-18 through 2026-11-24**, immutable edition IDs, puzzle IDs, and board versions. Outside these dates, today's action shows a clear no-edition message. Existing posts always resolve their stored binding; midnight never substitutes another board. Legacy Milestone 1 Moonroot bindings remain Day 1. There is no modulo rotation and no client-controlled production picker.

A signed-in player's final sequence is replayed on the server against the post's canonical version. Illegal, incomplete, malformed, mismatched-edition and wrong-version submissions are rejected. Identity comes exclusively from Devvit context. One atomic Redis `HSETNX` stores the first valid record, including its first move. Community aggregates are derived from those unique records, without a separate counter that could double-increment on retries. Reloading restores the recorded rescue, personal undo count, card art preference, and saved result without submitting again. Undo counts are **personal, unverified stats**.

The reunion appears immediately. Saving errors leave it visible with a retry button; replaying is unnecessary. Replays never replace the recorded opening. Favorite-animal art is a separate preference. Copy results contain “Everyone home,” day number, personal undo count, favorite animal, and the same post's comments URL—never the rescue order. Players choose whether to copy or open comments. Aggregates are returned only after that player's completion; low participation has an honest empty state.

## Verification

```sh
npm run check          # rules, schedule/API/storage tests, TypeScript, lint, Reddit build
npm run test:browser   # builds the production bundle, then runs real Chromium acceptance checks
npm run solver:report  # regenerates developer-only spoilers/report
```

The browser suite checks the actual Phaser canvas, mouse/touch, rapid-tap protection, keyboard, reduced motion, all seven solves, save failure/retry, favorite art, reload, clipboard, compact layout, and the production bundle's comments navigation SDK effect. Production-bundle API responses in local browser tests are fixtures; they are not evidence of in-Reddit execution.

Browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH`, or install Playwright Chromium and set `PLAYWRIGHT_BUNDLED_CHROMIUM=1`. Tests run the local preview on 5173/5174 and serve the production client on 5175. Screenshots are under ignored `artifacts/`. Widths 288, 320, 390, and 640 are checked at height 512, alongside narrow phone viewports.

[Developer solver report](docs/SOLVER-REPORT.md) records solution counts, safe openings, dead-end openings, and every valid order. It is not imported into the player UI. [Journeys notes](docs/JOURNEYS.md) document SDK integration, the map, approval requirements, and the distinction between local event tests and Reddit ingestion. [Judge playtest notes](docs/PLAYTEST.md) record the tested revision and remaining runtime/device checks.

## Add a solver-verified edition

1. Add a new immutable board in `src/shared/boards.ts`; use the existing four animals, straight arrows, paths, and matching bridge/latch symbols. Do not edit any already published board/version. Add a new ID/version for a revision.
2. Add an explicit new date, unique edition ID, consecutive daily number, puzzle ID, and exact board version to the **server** schedule. Keep existing entries intact. Do not cycle old boards by array index.
3. Run `npm run solver:report`. Require at least one complete solution; inspect safe/tempting openings and test the intended dependency. Update the targeted solver-count tests when adding editions, keeping previous counts stable.
4. Play it in the local picker at phone size, including blocked moves, bridge folding, Undo, and reunion. Run `npm run check` and `npm run test:browser`.
5. Upload to the private playtest and use **Choose playtest edition** to create/retrieve its bound post. Check it on Reddit and a physical phone before releasing it.

## Scope and provenance

Implemented: seven editions, stable private posts, validated Redis completions, restored results, favorite art, spoiler-free copying/comments, real aggregates after completion, and isolated Journeys calls. Journeys ingestion requires Reddit approval and is not assumed from local tests. Streaks, leaderboards, editor, campaign, payments, public publishing, and submissions remain out of scope.

Starter: [reddit/devvit-template-phaser](https://github.com/reddit/devvit-template-phaser), commit `537cb84534dde85ae21b26912141cd525c20d86e`. Existing Git history and Moonroot board/version are preserved. The starter's license is `LICENSE`; the repository's original license is retained in `docs/ORIGINAL-LICENSE`.
