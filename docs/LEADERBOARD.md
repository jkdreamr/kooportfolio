# Leaderboard

Sprint and Regatta times (milliseconds) rank low to high; 90-second basketball
scores rank high to low. Daily and practice modes do not share these boards.
Completed runs do not publish automatically. The player explicitly posts a
display name or saves on their device.

## World integration

- Mount `Leaderboard` from `src/game/ui/Leaderboard.tsx` in the DOM HUD when a
  player opens it: `{boardOpen && <Leaderboard onClose={() => setBoardOpen(false)} />}`.
  The host should pause world simulation while the modal is open. Optionally pass
  `initialBoard` to open it from a specific game's results.
- At rowing completion, call `recordLeaderboardResult` from
  `src/game/core/leaderboard.ts` with
  `{ id: id.current, board, score: Math.round(s.time * 1000) }`. Only call for
  `board = "rowing-sprint"` (360 m, seed 1) or `"rowing-regatta"` (750 m, seed 2).
- At basketball completion, call the same function in `mode === "attack"`
  with `{ id: id.current, board: "basketball-attack", score: score.current }`.
  Zero-point runs are ignored.

## Local Worker

```sh
npm run build
npx wrangler d1 migrations apply joshua-leaderboard-local --local --config wrangler.leaderboard-local.jsonc
npx wrangler dev --local --config wrangler.leaderboard-local.jsonc
```

The normal site configuration has no leaderboard binding. When the Worker
returns 503 or the connection is unavailable, the panel uses the device's top
ten and does not queue scores for public posting.

Shared scores are explicitly **unverified**: the browser simulates the games
and submits the result, with no accounts, wallet integration, or signed runs.
The Worker caps writes at 12 per network per fixed hour, 200 globally per
rolling hour, and 10,000 stored entries. It stores an hour-scoped network hash
for rate limiting and never returns it. No remote database or deployment was
provisioned.
