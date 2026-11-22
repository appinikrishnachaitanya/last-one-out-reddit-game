# Last One Out

**Getting home is easy. Knowing when to stay is the puzzle.**

Last One Out is a daily forest rescue playable inside Reddit. Tap an animal to see its path, then tap again or choose **Send home**. If it leaves a latch, the matching bridge folds. On Moonroot Crossing, send Turtle early and watch Rabbit’s route end at the gap. **Undo** brings Turtle and the bridge back together.

## What to try

- Start on the board with a single first-move cue. **Settings** holds optional guided practice, keyboard instructions, reduced motion, Full screen, Restart, and the archive. You can Undo freely. A quiet 60-second rechargeable hint is available on the board. The personal timer appears in the result unless you turn on the live clock.
- Settings offers Moonroot River, Silver Dawn and Amber Creek. Choose the scenery’s forest ambience or the supplied woodland music. Sound is optional and pauses when the tab is hidden. Scenery and sound preferences are stored on the device. Rabbit hops, Fox trots, Badger lumbers and Turtle shuffles along the same straight puzzle routes. Skip animations removes these motions.
- The first ten handcrafted boards progress from simple bridge dependencies to overlapping escape paths, alternate starts, shared bridges, an animal crossing its own bridge, and a mid-rescue trap. Every board is exhaustively [solver-checked](docs/SOLVER-REPORT.md).
- A saved rescue earns a collectible animal portrait. The result includes the personal time, undos, and a Clean Crossing badge for zero undos. Undo and time are personal stats. The archive and saved cards follow your Reddit account.
- Choose **Post Rescue to Comments** to share a spoiler-free recap to the current post through the app account, or copy it and share it yourself. A separate button opts into Crossing Keeper subreddit flair. Reddit failures leave the result available.
- After two unique verified finishers, successful opening moves are available for comparison. Reported opening traps are tracked separately and shown only when at least two finishers report the same trap. The comment prompt is **Which move fooled you?**

## Local preview

Requires Node 24+. The demo uses the real rules, Hono routes and completion validator with a labeled mock identity and ignored local storage adapter.

```sh
npm ci
npm run demo
```

Open `http://localhost:5173/game.html` and use the local-only edition picker. Use a fresh browser profile for a new mock player. The demo does not write Reddit comments, flair, Redis, or Journeys.

```sh
npm run check
npm run test:browser
npm run solver:report
```

## Devvit playtest

```sh
npm run login -- --copy-paste
npm run devvit -- whoami
npm run deploy
npm run dev -- last_one_out_app_dev
```

Run the CLI login in your terminal, follow the printed Reddit URL, and paste the returned code into that terminal. The copy/paste flow avoids a cloud localhost callback. CLI credentials stay in ignored local storage.

In the playtest subreddit, use **Open today’s daily** or **Choose playtest edition** in the moderator menu. Choose Moonroot for the signature sequence. Existing posts retain their entrypoint and puzzle binding. Newly created posts use the woodland feed preview and open the same game in expanded view. If post creation was interrupted, use **Recover edition post** with the existing `t3_…` ID. This avoids duplicate posts after an ambiguous Reddit response.

For a public test community with fewer than 200 members, replace `last_one_out_app_dev` in the last command with that community’s name. Use a moderator account with post permissions. After installation, create the test post explicitly with the moderator menu. A post created this way in a public community is publicly visible.

For a live judge rehearsal, have two distinct signed-in Reddit accounts finish the same post. On one account, send Turtle early and Undo before solving. Verify the saved result and collection across devices, check both accounts see the opening comparison, then explicitly test posting once, opting into flair, copying, and opening the original comments. Also check the feed card and the active board on a physical phone. [Official Devvit playtest guide](https://developers.reddit.com/docs/guides/tools/playtest)

## Daily rotation and architecture

- **Shared TypeScript** owns the board definitions, rules, and solver. **Phaser** renders motion and routes. HTML provides accessible controls and results.
- **Devvit Web 0.15.4 and Hono** bind each post to a unique UTC edition and its immutable board version. A `0 0 * * *` Devvit Scheduler task creates or retrieves the next post in private installations. Public test posts use the explicit moderator action.
- The ten dated boards run November 18–27 UTC. From Day 11, the same boards repeat in a fixed order with new date IDs, posts, results, and cards. The end screen countdown uses server time. The archive includes the original editions and recent rotation posts. Earned cards persist after posts age out of that list.
- **Devvit Redis** stores first validated completions by account and edition. The server replays every final sequence, and atomic first-write storage prevents duplicate contributions. Redis also stores portrait preferences, earned card indexes, recharge state and comment receipts. Streaks are derived from dated rescues.
- **Permissions** in `devvit.json` are `reddit: true`, `redis: true`, and `journeys: true`. Scheduler is registered in the top-level `scheduler.tasks` config. Comments post as the app. Flair requires the installed app to have effective subreddit flair permissions.
- **Journeys** reports ready, first move, progress, and server-validated completion independently of gameplay. In-Reddit ingestion requires approval and live verification. [Journeys details](docs/JOURNEYS.md)

To add a new board, register a new ID/version in `src/shared/boards.ts`, solve it exhaustively and play it in a narrow viewport, then add an explicitly dated, versioned rotation era beginning on a future UTC date. Keep the existing rotation and bindings intact so posted days continue to resolve correctly. Re-run the checks and playtest the new edition before release.
