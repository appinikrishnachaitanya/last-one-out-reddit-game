# Last One Out puzzle design

An animal follows its arrow in a straight line until it exits the board. Other animals, solid forest, and folded bridges block that line. Each bridge is open while its holder is on the board and folds as soon as the holder gets home. Moving an animal must be legal on the current board, even when the move would leave no way to finish. Preview shows the route and affected bridges. Solo Undo restores the previous board together with its bridge state. Community Rescue starts a fresh attempt when a move leaves no winning continuation.

## Eight-board introduction

These are suggested practice tiers using existing editions. Their original dates and saved post bindings stay intact.

| Tier | Boards | What to look for |
| --- | --- | --- |
| Tutorial | Moonroot Crossing, Alder Passage | Learn to keep a bridge open, then read a tight route-clearance sequence. |
| Medium | Willow Weave, Lantern Fork, Twinbank Lanterns | Compare multiple plausible openings and track who needs to wait. |
| Hard | Reedlight Relay, Foxglove Confluence | Read dependencies across multiple departures and spot clear routes that can trap another animal. |
| Expert | Fernfall Narrows | Find the single winning order and watch for traps after the opening. |

## Level format

The canonical records are typed objects in [boards.ts](src/shared/boards.ts). The same fields are JSON-compatible. Coordinates are zero-indexed from the top left, with x increasing right and y increasing down.

- Board metadata includes `id`, `version`, `title`, `subtitle`, and the square grid `size`.
- `animals` holds records such as `{"id":"rabbit","x":0,"y":2,"direction":"E"}`.
- `bridges` holds records such as `{"id":"moon","x":2,"y":2,"symbol":"☾","holder":"turtle"}`.
- `paths` lists traversable coordinates. A route must reach the edge and continue out of the grid. Keep bridge cells in the path list so an open bridge is traversable.

## Building a daily catalog

1. Begin with a specific decision. Pair a latch dependency with a route blocker, or give the player two safe openings with different follow-up decisions.
2. Run `npm run solver:report` and review solution count, safe openings, and legal traps. Use narrow-screen playtests to make sure players can read the consequence of a mistake.
3. Curate batches by mechanic and difficulty. Reject boards whose only novelty is a rotated layout or swapped animal. Have another player test previews and recovery before scheduling.
4. Schedule each approved edition by UTC date and board version. Give changed layouts new versions so old posts and saves still resolve correctly.

The current catalog has 31 solver-checked boards. A year of distinct dailies would require continuing this curation and verification process. See the [solver report](docs/SOLVER-REPORT.md) for the current catalog and spoilers.
