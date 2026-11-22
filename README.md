# Last One Out

**Getting home is easy. Knowing when to stay is the puzzle.**

Last One Out is a daily forest rescue playable inside Reddit. Tap an animal to see its path, then tap again or choose **Send home**. If it leaves a latch, the matching bridge folds. On Moonroot Crossing, send Turtle early and watch Rabbit’s route end at the gap. **Undo** brings Turtle and the bridge back together.

## What to try

- Start on the board with a single first-move cue. **Settings** holds optional guided practice, keyboard instructions, reduced motion, Full screen, Restart, and the archive. You can Undo freely. A quiet 60-second rechargeable hint is available on the board. The elapsed timer is visible during play and can be hidden in Settings. The Sound button is beside the timer.
- Settings offers Moonroot River, Silver Dawn and Amber Creek. Choose the scenery’s forest ambience or the supplied woodland music. Sound is optional and pauses when the tab is hidden. Scenery and sound preferences are stored on the device. Rabbit hops, Fox trots, Badger lumbers and Turtle shuffles along the same straight puzzle routes. Skip animations removes these motions.
- The first ten handcrafted boards progress from simple bridge dependencies to overlapping escape paths, alternate starts, shared bridges, an animal crossing its own bridge, and a mid-rescue trap. Every board is exhaustively [solver-checked](docs/SOLVER-REPORT.md).
- A saved rescue earns a collectible animal portrait. The result includes the personal time, undos, and a Clean Crossing badge for zero undos. Undo and time are personal stats. The archive and saved cards follow your Reddit account.
- Choose **Post Rescue to Comments** to share a spoiler-free recap to the current post through the app account, or copy it and share it yourself. **Rescue Streak Flair** gives players a subreddit identity based on their favorite animal and consecutive dated rescues. Reddit failures leave the result available.
- The daily opens with yesterday’s verified rescues, most-stranded animal, and perfect-run percentage when data exists. The first saved solo rescue unlocks comparison. With fewer than ten distinct attempt participants, it shows an early-rescuer message. With ten or more, it compares opening attempts and the most common first mistake.
- **Community Rescue** shares one crossing per Reddit daily post. Each account gets one turn per attempt, and the last mover has to wait even after a reset. The board resets after a stranded move or a whole rescue, and retains the last ten moves. Copy and comment sharing invite others to try the shared crossing without revealing the solution order.
- **Which move fooled you?** Players can leave a short, spoiler-free tip prefixed with `[hint]` in the daily post’s comments. The next edition’s Hint action features the highest-ranked eligible tip from that thread when it has community support, with a link back to the source. Built-in hints cover days without a qualifying comment.

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

For a live judge rehearsal, open the same Day 1 post on four signed-in accounts. In Solo Rescue, send Turtle early, undo, and finish to see the comparison and copy the result. In Community Rescue, send Turtle first to see the bridge consequence and reset. Let a different account start the next attempt. Finish with four distinct contributors, one move each. Leave one viewer on the shared tab to verify live refresh, then verify the Refresh button and the preserved solo run. Check the two modes on a physical phone. [Official Devvit playtest guide](https://developers.reddit.com/docs/guides/tools/playtest)

## Daily rotation and architecture

- **Shared TypeScript** owns the board definitions, rules, and solver. **Phaser** renders motion and routes. HTML provides accessible controls and results.
- **Devvit Web 0.15.4 and Hono** bind each post to a unique UTC edition and its immutable board version. A `0 0 * * *` Devvit Scheduler task creates or retrieves the next post in private installations. Public test posts use the explicit moderator action.
- The ten dated boards run November 18–27 UTC. From Day 11, the same boards repeat in a fixed order with new date IDs, posts, results, and cards. The end screen countdown uses server time. The archive includes the original editions and recent rotation posts. Earned cards persist after posts age out of that list.
- **Devvit Redis** stores first validated completions by account and edition. The server replays every final sequence, and atomic first-write storage prevents duplicate contributions. Redis also stores portrait preferences, earned card indexes, recharge state and comment receipts. Streaks are derived from dated rescues.
- **Permissions** in `devvit.json` are `reddit: true`, `redis: true`, `realtime: true`, and `journeys: true`. Scheduler is registered in the top-level `scheduler.tasks` config. Comments post as the app. Flair requires the installed app to have effective subreddit flair permissions.
- **Journeys** reports ready, first move, progress, and server-validated completion independently of gameplay. In-Reddit ingestion requires approval and live verification. [Journeys details](docs/JOURNEYS.md)

To add a new board, register a new ID/version in `src/shared/boards.ts`, solve it exhaustively and play it in a narrow viewport, then add an explicitly dated, versioned rotation era beginning on a future UTC date. Keep the existing rotation and bindings intact so posted days continue to resolve correctly. Re-run the checks and playtest the new edition before release.

### Beyond the ten launch crossings

The ten launch boards are hand-tuned. The exhaustive solver already verifies every legal opening and finish order for a candidate board. The live fallback after Day 10 rotates these boards on dated editions. The content roadmap is to generate fresh candidates, reject unsolvable or repetitive boards with the solver, and bring community-submitted crossings into future dailies through Reddit voting and editorial review.
