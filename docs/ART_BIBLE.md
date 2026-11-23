# A small world, made by hand

- Palette: pure white editorial cover, charcoal ink, vibrant grid-cut grass, strong terracotta roofs, teal water, honey windows. Minimal portfolio typography gives way to a richer strategic-village world.
- Joshua requested a chunkier strategic-village direction after the first screenshots: thick timber braces, masonry foundations and low boundary walls, saturated roofs, a study tower, original pennants and visible level labels. No existing game's meshes, icons, logos or protected assets are copied.
- The world carries the personality, not HUD prose: no welcome essay, quest card, coordinate ornament, taglines or decorative modal eyebrows. Keep building names, currency, controls and save status; reveal details only when requested.

## Design review references

Reviewed the public [Anthropic frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) and [Vercel web-design-guidelines skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), plus its [interface guidelines](https://github.com/vercel-labs/web-interface-guidelines). Used as review guidance, not copied assets or runtime dependencies.

Anti-slop pass: removed the cream editorial canvas, tracked eyebrow stack, decorative coordinates, numbered navigation and generic aspirational copy. The loose letter and original village are the distinctive elements; surrounding UI stays quiet. Check actual screenshots, not just source: readable controls, mobile safe areas/touch targets, reduced motion, visible focus and no content hidden by chrome.

## Expanded village references

Joshua asked us to study [Supercell's Clash of Clans](https://supercell.com/en/games/clashofclans/) and similar 3D models. Reviewed its public village art and the [Kenney Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) sample for readable massing, deep roof overhangs, chunky foundations, distinct roof heights, enclosed planting and dense but navigable streets. Reference images stay outside the repository; no Supercell or Kenney assets are shipped.

The expanded map uses seven distinct silhouettes: the oar-framed Boathouse, open Court, Study tower, red-roofed Kappa Sigma portico, stepped Cognition workshop, green-awning Kitchen and barrel-roofed Gym with a dumbbell. A windmill, growing beds, dock and music corner fill the edges without extra HUD copy. Lawn, roads and wall blocks are instanced to avoid one draw call per tile. The mobile camera follows the player rather than shrinking the entire village into unreadable miniatures; Places provides keyboard/touch access to every route.
- Original rounded modular geometry: low poly canopies, tiled pitched roofs, visible timber framing, ceramic pots, a brick-colored court, timber docks and animated shell crews. Model source is `src/game/world/Models.tsx`; no visual reference images are used in production.
- One world unit is approximately one metre; avatar height 1.6 units, doors 2.1. Orthographic three-quarter hub camera, chase race camera, wider court camera. Warm directional sun, ambient sky and low-contrast shadows.
- Keep the world legible: boathouse gable and oars, open court silhouette, quiet green study roof. Upgrade geometry must be visible: balcony then tower, pergola then garden seating.
- Gentle character bob, alternating walking limbs and synchronized oar recovery. No flashing, camera shake or compulsory sound. Respect reduced motion in the editorial reveal; gameplay remains manually controlled.
- Art references in Joshua’s handoff are direction only and are not redistributed as authored assets. All shipped geometry, UI, favicon and WebAudio sounds are original in this repository. System fonts only.
