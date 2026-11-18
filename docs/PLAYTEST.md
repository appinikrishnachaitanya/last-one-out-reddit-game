# Judge playtest record

Private playtest URL: https://www.reddit.com/r/last_one_out_app_dev/?playtest=last-one-out-app

Current private installation: **last-one-out-app v0.0.1.4**, confirmed by `devvit list installs`. The initial owner-visible upload was **0.0.1**. The playtest watcher was stopped after installation to freeze this version; stopping it does not uninstall the private build. The source revision is recorded in the implementation commit and final task report. Restarting `npm run dev` will create a newer playtest build.

Private Day 1 post: https://www.reddit.com/r/last_one_out_app_dev/comments/1xzazsj/last_one_out_day_1_20261118/

## Storybook redesign status

The latest source replaces flat pieces and dark panels with generated painted animal sprites, a leafy turquoise-water board, parchment panels, gold controls, a larger desktop board, and a dedicated campfire reunion/result view. It preserves the rule engine, canonical boards, post bindings, Redis records, and spoiler-free results. See `ART.md`.

The **redesign is verified locally but is not installed on Reddit yet**. Multiple CLI uploads failed with HTTP 503 connection timeouts at `reddit-service-devvit-webview-assets.s3.us-east-1.amazonaws.com`. The supported serial-upload mode failed too. Read-only HEAD checks of that host and `s3.us-east-1.amazonaws.com` also returned 503; the upload host failed outside the command sandbox as well. Network policy was confirmed unrestricted/enforced. TLS verification remained enabled. This is an external upload blocker, not a rule/build failure. Do not claim the private post has the new visuals until upload and installation succeed.

To upload from a working local network: pull this repository, use Node 24+, run `npm ci`, `npm run login -- --copy-paste` if needed, `npm run deploy`, and `npm run dev`. These use the same private app/community. A successful new build can reuse the existing post and saved results. No public publishing is needed.

## Verified locally

- 20 unit/API tests passed, including all seven boards, exact solver counts, wrong-edition/version rejection, malformed/illegal/incomplete sequences, concurrent duplicate submissions, preserved original openings, lost-response retry, independent favorite art, UTC rollover, old/legacy post reopening, and post publication reservations/recovery.
- TypeScript, ESLint, production Devvit build, and configuration schema validation passed.
- 10 Chromium acceptance tests passed. All seven editions were completed through the UI, with results restored after reload. Tests cover mouse and emulated touch, keyboard, reduced motion, rapid taps, the early-Turtle consequence, Undo, Restart, favorite portraits, clipboard, failure/retry, and honest community empty states.
- Layout checked at 288, 320, 390, and 640px widths in a 512px-high frame, plus narrow full-height phone viewports.
- The production bundle completed the exact judge sequence against the actual Hono validator/completion service with local adapters: open Day 1 → Turtle early → Rabbit stranded → Undo → complete → persist → reload → copy spoiler-free text → emit Reddit SDK navigation to the same post's comments.
- That production-bundle check also verified actual client SDK request ordering and server-side completion correlation using local telemetry fixtures. It does not establish Reddit ingestion.

## Verified with Reddit infrastructure

- Devvit CLI authenticated successfully with the developer account.
- `devvit upload` succeeded and created/installed the app in the private default playtest community.
- `devvit playtest` reported ready; the final installed version is 0.0.1.4.
- No public publishing or Devpost submission was performed.

The user confirmed that the existing Day 1 board loads on **Reddit desktop**. The private post was also found through authenticated Reddit listing access. A full save/reload run inside Reddit is **not yet confirmed**, and no physical phone check is claimed. The user requested the storybook visual redesign after trying the previous visuals.

The cloud Chromium attempt reached a TLS trust error (`ERR_CERT_AUTHORITY_INVALID`). Automatic approval review rejected adding the environment's proxy CA to Chromium because it would persistently broaden interception trust without explicit authorization. TLS verification was left enabled and the trust setting was not changed. The user's own browser can open the private community without that cloud-browser change.

Actual Journeys ingestion is also **unverified**. See `JOURNEYS.md` for the SDK/map and Reddit approval/allowlist restrictions.

## Final Reddit/device checklist

1. Sign in with the moderator account and open the private link above.
2. From the **community** moderator menu, choose **Open today’s daily**. For future editions or dates outside the initial week, use **Choose playtest edition**.
3. On Day 1, send Turtle, observe its arrival followed by bridge folding and Rabbit's blocked route, then Undo. Complete the rescue.
4. Confirm saving succeeds, reload the same post, and verify the saved result returns without a second community contribution.
5. Change the favorite portrait, copy the result, and use Back to comments. Check that it returns to this exact post.
6. Repeat the core flow on an actual phone in Reddit's iOS/Android app. Record the post URL, app/browser/device, build version, and any issue.
7. Check Journeys receipt status/dashboard only after Reddit approves the map and app allowlisting. A denied playtest receipt is not a gameplay failure.
