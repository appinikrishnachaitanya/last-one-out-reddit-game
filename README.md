# Last One Out

**Turtle can go home. If Turtle leaves now, Rabbit loses the bridge. Who goes first?**

Last One Out is a daily forest logic puzzle played inside a Reddit post. Tap an animal to see its route home. Some animals hold bridges open just by staying on the board. Once they leave, their friends may lose the crossing.

[Open the private Reddit playtest](https://www.reddit.com/r/last_one_out_app_dev/comments/1y6f9a6/last_one_out_day_10_20261127/)

<img src="public/art/feed-river.webp" alt="Fox and Turtle meet beside a lantern in a moonlit forest" width="640">

## One board, one turn each

Open **Community Rescue** and the whole thread shares a crossing. You get one move per attempt. Send an animal home and the next Redditor inherits the board you left behind. If you’ve taken your turn, you can vote on who should go next. A successful rescue credits the players who made it together.

The conversation carries over to the next day. Leave a spoiler-free tip in the post’s comments starting with `[hint]`. An upvoted tip can appear in the next puzzle, with credit linked back to the original comment. In **Remix Sunday**, players draft crossings and moderators can test them in-game before approving them. The same solver checks the drafts and the daily boards.

## Take a crossing for yourself

- **Rescue Rabbit** drops you into a folded-bridge rescue. Call a keeper back and get Rabbit across.
- **Play daily** opens Solo Rescue. Preview a route, try a move, and undo it if someone gets stranded. The game has 43 solver-checked crossings, including 12 expert boards where a legal move can spoil the rescue even near the end.
- **Keep what you earn.** A finished rescue unlocks a shareable animal card in your Collection. My Map marks the crossings you’ve completed, and the daily leaderboard ranks by fewest assists.

## Built on Devvit

Devvit ties each daily puzzle, shared board, and comment thread to the same Reddit post. Phaser draws the crossings. A shared TypeScript engine powers previews and the solver. Hono validates each completed route before Redis records a player’s first finish for that edition.

### Run locally

Use Node 24 or later.

```sh
npm ci
npm run demo
```

Open [the local game](http://localhost:5173/splash.html). Run `npm run check` and `npm run test:browser` to verify a change.
