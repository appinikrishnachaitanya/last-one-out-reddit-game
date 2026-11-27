# Last One Out

**Getting home is easy. Knowing when to stay is the puzzle.**

Last One Out is a daily forest rescue playable inside Reddit. Tap an animal to see its path, then tap again or choose **Send home**. If it leaves a latch, the matching bridge folds. On Moonroot Crossing, send Turtle early and watch Rabbit’s route end at the gap. **Undo** brings Turtle and the bridge back together.

## What to try

- Start on the board with a single first-move cue. **Settings** holds optional guided practice, keyboard instructions, reduced motion, Full screen, Restart, and the archive. Solo Undo is unlimited. Each daily starts with an available Hint, and another recharges after 15 minutes. Signed-in hint cooldowns sync across devices. The elapsed timer is visible during play and can be hidden in Settings. The Sound button is beside the timer.
- Settings offers Moonroot River, Silver Dawn and Amber Creek. Choose the scenery’s forest ambience or the supplied woodland music. Sound is optional and pauses when the tab is hidden. Scenery and sound preferences are stored on the device. Rabbit hops, Fox trots, Badger lumbers and Turtle shuffles along the same straight puzzle routes. Skip animations removes these motions.
- The original ten editions teach the rules. The new 21-board Challenge set has exactly one successful order per board, with tempting legal mistakes at the start and after the correct opening. Every board is exhaustively [solver-checked](docs/SOLVER-REPORT.md).
- A saved rescue earns a collectible animal portrait stamped with the Reddit account and the original earned timestamp. The result includes the personal time, undos, and a route-based rescuer identity and personal rank (S for zero assists, A for one or two, B for three or more; a used hint counts as one assist). Undo and time are personal stats. The archive and saved cards follow your Reddit account.
- Choose **Post Rescue to Comments** to share a recap behind Reddit’s spoiler controls. **Copy result link** appears after Reddit confirms the comment. You can also copy the spoiler-free text or download a personalized PNG with your identity, favorite animal without posting. **Rescue Streak Flair** gives players a subreddit identity based on their favorite animal and consecutive dated rescues. Reddit failures leave the result available.
- The daily opens with yesterday’s verified rescues, most-stranded animal, and perfect-run percentage when data exists. The first saved solo rescue unlocks comparison. With fewer than ten distinct attempt participants, it shows an early-rescuer message. With ten or more, it compares opening attempts and the most common first mistake.
- **Community Rescue** shares one crossing per Reddit daily post. Each account gets one turn per attempt, and the last mover has to wait even after a reset. The board resets after a stranded move or a whole rescue, and retains the last ten moves. Copy and comment sharing invite others to try the shared crossing without revealing the solution order.
- **Which move fooled you?** Players can leave a short, spoiler-free tip prefixed with `[hint]` in the daily post’s comments. The next edition’s Hint action features the highest-ranked eligible tip from that thread when it has community support, with a link back to the source. Built-in hints cover days without a qualifying comment.

**Community goal.** The counter follows the daily schedule at midnight UTC. Each account’s first verified Solo completion on that day’s edition counts. Moderators can set **Daily rescue goal** in the subreddit’s Devvit installation settings (default 4). The target locks when the day’s goal first loads or receives a completion. A completed goal adds a Golden Leaf to that day’s card for every contributor, including anyone who finished before the target was reached. During an open day the last streak remains visible until the day is missed. The best streak stays recorded.

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
- The ten dated boards run November 18–27 UTC. The original 21 Challenge dates run November 28–December 18. Starting December 19, each shuffled cycle has 33 boards, with an expert crossing every two or three days. Each of the 12 expert boards has four active bridges, one successful order, and a legal trap at each of the first three decisions. The end screen countdown uses server time. The archive includes the original editions and recent rotation posts. Earned cards persist after posts age out of that list.
- **Devvit Redis** stores first validated completions by account and edition. The server replays every final sequence, and atomic first-write storage prevents duplicate contributions. Redis also stores portrait preferences, earned card indexes, recharge state and comment receipts. Streaks are derived from dated rescues.
- **Permissions** in `devvit.json` are `reddit: true`, `redis: true`, `realtime: true`, and `journeys: true`. Scheduler is registered in the top-level `scheduler.tasks` config. Comments post as the app. Flair requires the installed app to have effective subreddit flair permissions.
- **Journeys** reports ready, first move, progress, and server-validated completion independently of gameplay. In-Reddit ingestion requires approval and live verification. [Journeys details](docs/JOURNEYS.md)

See [Puzzle design](PUZZLE_DESIGN.md) for rules, a starter difficulty ladder, and the editorial process.

To add a new board, register a new ID/version in `src/shared/boards.ts`, solve it exhaustively and play it in a narrow viewport, then add an explicitly dated, versioned rotation era beginning on a future UTC date. Keep the existing rotation and bindings intact so posted days continue to resolve correctly. Re-run the checks and playtest the new edition before release.

### Challenge playtesting

The moderator edition picker and local preview include the original editions, the first 21 Challenge dates, and the first scheduled date for each expert crossing. Select an edition to test it before its scheduled UTC date. The solver report is for development and contains spoilers.

The timer counts up from the first committed Solo move and can be hidden. The board stays playable when Undo runs out, and motion can be reduced or skipped. [W3C timing guidance](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) · [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) · [W3C touch target guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

See the [private release rehearsal and launch draft](docs/RELEASE-REHEARSAL.md).

### Remix Sunday review

Open **Settings → Remix Sunday** inside a signed-in Reddit post. Pick one of three templates, then set the animals and arrows in its four numbered slots. Choosing an animal swaps it with the slot it currently occupies. **Check & submit draft** runs the canonical solver and only saves solvable drafts.

A moderator with post permissions can open the review queue in the same dialog, preview and test play a draft, then approve it or reject it with a note. Difficulty uses the minimum number of forced decisions across winning routes, excluding the final move. Approval enables a JSON download with a stable ID, version, and creator credit.

Publication is manual. Register the approved JSON in the versioned board catalog and schedule its edition through the normal release process. Preserve the exported ID, version, and credited title. The app has no automatic draft publication route.

### My Animal and My Map

Home opens My Map, Collection, and Settings. My Map uses an illustrated forest trail with tappable crossing landmarks. The account’s chosen animal marks the active crossing with “You are here.” Completed posts show check marks, upcoming markers stay locked, and older crossings are grouped into six-stop chapters. Continue rescue opens the same edition as the post. Settings → My Animal saves the account’s avatar and accessory in Redis. All four puzzle animals are available immediately. Owl unlocks after 2 saved rescues, Deer after 5, Red panda after 10, and Otter after 20. Lantern and Golden leaf accessories unlock after 1 and 3 rescues. Unlocks count distinct saved editions and are validated on the server. Avatar choices appear on Home, the result, and the downloaded image.

Share result opens Download image and Post Rescue to Comments. Collection and customization are accessed from Home and Settings.

### Rescue showcase

On a daily Reddit post, **Rescue Rabbit** opens a short, playable introduction. Complete it and choose **Play this daily crossing** to open the same post’s puzzle. **Play Today’s Rescue** opens the daily directly.

Run `npm run demo` and open `http://localhost:5173/callback.html` to try the two-board showcase. The opening starts with Rabbit stranded and three friends at the campfire. Call one bridge keeper back, send Rabbit across, then bring the keeper home. In Firefly Commons, either keeper can help Rabbit, but Badger still needs a second bridge. Undo or try the other keeper in one tap.

In a Devvit playtest community, a moderator can select **Create rescue showcase** to make the standalone interactive post. Create today's daily with **Open today’s daily** so the showcase can link straight to it. If today’s post is unavailable, the showcase links to the latest playable puzzle from the archive or, if none is available, the rescue community. Showcase runs are independent of daily saves and scores.
