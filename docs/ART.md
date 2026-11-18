# Storybook art direction

The user supplied a three-panel Moonroot Crossing mockup as visual direction. This implementation adopts its painted woodland animals, cream parchment, turquoise water, warm lanterns, and campfire reunion while preserving the existing four-animal rules, all seven canonical boards, stable post bindings, and save behavior. The mockup's extra animal species, gates, Hint button, and launch screen were not added.

New illustrations were generated from that supplied direction and optimized to WebP without changing the original generated files in `/workspace/generated_images`.

- `public/art/animals.webp`: transparent 1262×1246 sheet. Phaser uses four equal 631×623 frames: Turtle, Rabbit, Fox, Badger. The same art appears in favorite-animal result cards.
- `public/art/forest-board.webp`: 1254×1254 painted river and foliage frame. Paths, route previews, bridge states, latch symbols, arrows, exits, and hit areas remain real Phaser objects.
- `public/art/reunion.webp`: 1536×1024 illustration of the four established animals safely reunited at the campfire.

The three optimized files total about 1.2MB. Artwork is local to the app; no external image service is called during play. If an asset fails to load, the existing Phaser vector animal fallback remains available. Reduced motion changes animations, not the final illustrations.

At wide Reddit frame sizes, the board expands beside the controls. Compact phone frames retain the complete board and main controls. Winning opens a dedicated result view; Undo and Restart remain available. The favorite selection changes the actual illustrated portrait, and the share text remains spoiler-free.
