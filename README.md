# Last One Out · Milestone 1

A mobile-first Reddit rescue puzzle built from Reddit’s official **Devvit Phaser + TypeScript** starter. One board: **Moonroot Crossing**. Phaser draws the illustrated animals, routes, lantern exits, movement, folding bridges, and reunion. HTML buttons provide keyboard and accessible controls. No animal emoji or external art/font services are used.

## Play locally

Use Node **24+** (`.nvmrc` pins the starter’s version).

```sh
npm ci
npm run demo
```

Open `http://localhost:5173/game.html` in your browser. The visible **Local preview** label distinguishes it from Reddit. Both builds use the same board and shared TypeScript engine; no Reddit account or mock backend is required locally. In this cloud workspace, use `npm ci --cache /workspace/.npm-cache` if the default npm cache is unwritable.

Tap an animal once to preview and again to send it, or use **Send home**. The matching symbol and color identify the bridge it holds open. Coral paths and a cross mark the precise obstruction. Use the animal buttons with Tab and Enter/Space for keyboard play. Undo and Restart remain visible; input is locked during movement and folding. The OS reduced-motion setting is respected, with a manual toggle as well.

Try **Turtle first**: its path is clear, but leaving folds the moon bridge and strands Rabbit. **Undo**, then rescue **Fox → Rabbit → Turtle → Badger**. All three solver-verified orders are:

- Fox → Rabbit → Turtle → Badger
- Fox → Rabbit → Badger → Turtle
- Fox → Badger → Rabbit → Turtle

## Private Reddit playtest

`devvit.json` configures `last-one-out-app`, the Phaser entrypoint, a tall inline post, the starter’s Hono server, and the **Create Moonroot Crossing** moderator menu action. It contains no credentials. The app name must belong to the signed-in Reddit developer account.

From the project directory:

```sh
npm run login -- --copy-paste
npm run devvit -- whoami
npm run deploy
npm run dev
```

Complete the login in your browser and enter its code **in the CLI terminal**, never in Git, `devvit.json`, or chat. The wrapper keeps local CLI credentials/cache under ignored `.local/`, honors existing environment overrides, and enables Node’s environment-proxy support.

`deploy` checks/builds and runs **devvit upload**, which uploads an owner-visible app and automatically creates a **private** playtest subreddit with you as moderator. `dev` runs **devvit playtest** and prints its link. A manually created subreddit is unnecessary. Optionally use `npm run dev -- your_private_test_subreddit` for another small community where you are a moderator.

Open the printed community, use its moderator menu → **Create Moonroot Crossing**, and open the resulting post. It starts directly on the board. Keep the playtest process running for updates; Ctrl+C stops it. These commands do **not** publish the app publicly or submit it for review.

See [official playtest documentation](https://developers.reddit.com/docs/guides/tools/playtest).

## Checks and current evidence

```sh
npm run check          # solver/rules tests, TypeScript, ESLint, production Reddit build
npm run test:browser   # local preview, real Chromium canvas, touch and keyboard flows
```

Browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` for another installation, or run `npx playwright install chromium` and set `PLAYWRIGHT_BUNDLED_CHROMIUM=1`. CI installs bundled Chromium. Screenshots are written to ignored `artifacts/`.

Verified locally: Turtle-first dead end, exact obstruction, bridge restoration, all solver orders, full rescue/reunion, Restart, keyboard, reduced motion, canvas touch events, and rapid-tap protection. Layout checks cover **288, 320, 390, and 640px widths in a 512px-high frame**, plus **320×720** and **390×844** viewports. These are automated Chromium checks, including touch emulation, **not physical-device tests**.

**Not yet verified inside Reddit:** the CLI reports no signed-in account. After sign-in, run the private playtest above and check the full flow in Reddit desktop and the Reddit iOS/Android app. Confirm the bridge consequence is clear without reading the text, all controls fit, and touch works. No in-Reddit or physical phone success is claimed yet.

## Source map and scope

- `src/shared/engine.ts`: pure rules, route tracing, exhaustive solver, snapshots/Undo.
- `src/shared/boards.ts`: the one canonical Moonroot board.
- `src/client/scenes/Crossing.ts`: Phaser drawing and animations.
- `src/client/game.ts`: accessible controls and game flow.
- `src/server/`: Hono server and private-playtest post creation.
- `tests/`: engine and browser acceptance checks.

Daily scheduling, persistent completions, Redis, community statistics, result sharing, and Journeys are deferred until after the phone playtest. Reloading resets this milestone’s local run. Public launch and hackathon submission are separate tasks.

Starter source: [reddit/devvit-template-phaser](https://github.com/reddit/devvit-template-phaser), commit `537cb84534dde85ae21b26912141cd525c20d86e`. Existing repository history is preserved; its original license is retained in `docs/ORIGINAL-LICENSE`. The starter’s BSD license is in `LICENSE`.
