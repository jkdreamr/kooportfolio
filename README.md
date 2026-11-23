# JOSHUA.EXE

A very serious portfolio. A very unserious game.

An original React / TypeScript / Three.js miniature world: a breakable editorial cover, walkable village and interiors, rowing against animated rivals, physical basketball shots, guest progress and visible architectural upgrades.

## Local

Node 24 LTS, npm. `npm ci`, then `npm run dev`. Vite serves the app; the official Cloudflare plugin runs the API locally. No credentials needed for local play. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run audit:assets`.

Portfolio: `/`, `/about`, `/work`, `/contact`. Game: `/play`. Static editorial fallback pages are generated during build and work without JavaScript. Three.js is lazy-loaded only for play.

## Controls

WASD / arrows or touch joystick to move; click the ground or a building name for pathfinding. Walk to a door then E / Enter button. Inside, approach the back exit mat to return to the same hub spot. Escape pauses. Build suspends movement.

Rowing: A/D steering, 1/2/3 cadence, hold Space for a stamina burst. Sprint, winding regatta and UTC daily-seed practice. Basketball: WASD position, hold/release Space or the shot button, Q/E or slider aim. Gold power zone is a starting hint; chase a rebound or wait for a new ball. Finish games for local coins; upgrades change the actual world geometry.

## Trust and scope

This is a **local guest first slice**, not a finished global game service. Saves and records stay in this browser and are unverified; no fake leaderboard, account sync or server-authoritative wallet. Export a save from Settings. Storage denial/corruption warns without overwriting an unreadable old save. See [architecture](docs/ARCHITECTURE.md), [art](docs/ART_BIBLE.md), [content approvals](docs/CONTENT_APPROVALS.md), and the [zero-cost audit](docs/ZERO_COST_AUDIT.md).

## Staging only

Read the audit and [deployment runbook](docs/DEPLOYMENT.md). Deploy only after verifying the Cloudflare account is Workers Free with no charges. `CONFIRMED_WORKERS_FREE=yes CLOUDFLARE_ACCOUNT_ID=<verified-free-account> npm run deploy:staging`. Never add paid bindings. No DNS or production cutover. CI is intentionally not enabled until free runner eligibility is verified; all checks can be run locally.
