# JOSHUA.EXE — first playable slice

## Decisions

- React 19, TypeScript, Vite and the official Cloudflare Vite plugin. The initial HTML contains real portfolio copy. Build generates separate static editorial route files; Three.js is dynamically imported only at `/play`.
- React Three Fiber renders an original, modular diorama. Geometry and material factories share resources. No background image masquerades as a world, no asset APIs, fonts, HDRIs or audio downloads. Neutral, non-identifiable avatar.
- One scene machine: hub → boathouse / study / court → rowing / result → interior → saved hub spot. WebGL canvas persists across transitions. Avatar controls are disabled in dialogs/pause. A path grid and swept movement prevent tunnelling through buildings.
- Local guest progress is explicitly unverified. A validated versioned save supports records, appearance, position and memories; legacy coin and upgrade fields from retired saves are dropped. Corrupt saves are not overwritten. Storage-denied mode remains playable with a warning. One tab at a time is recommended; there is no claim of distributed transaction integrity.
- Rowing uses a portable fixed 60 Hz kinematic model, steering, current lines, three cadences, burst/stamina, AI pacing, splits and finish/retry. Basketball uses 120 Hz ball integration, gravity, board/rim/floor collisions, rebound recovery, charge/release and court position.
- Worker only exposes a minimal health response and explicit 503 for unavailable cloud features. No D1, authentication, leaderboard, signed runs, wallet sync or polling. This is an intentional budget/trust boundary, **not** a completed competitive backend.

## First-slice tradeoffs

Procedural model source replaces a Blender pipeline: every visible object has editable TypeScript source, with a common palette and dimensions. The garden courtyard occupies a reserved valid footprint instead of arbitrary building placement. Ranked replays and accounts are deferred rather than accepting client-claimed scores. Future rooms are marked honestly, not playable facades.

Next quality gates: sustained human playtesting and tuning, richer meshes/animations, validated placement/rotation, meaningful unlocks beyond cosmetic tiers, explicit save import/migrations, and a separately reviewed bounded free D1 backend. The full master specification remains broader than this first slice; this repository does not claim full V5 completion.
