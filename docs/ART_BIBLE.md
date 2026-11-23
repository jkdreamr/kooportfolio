# A small world, made by hand

- Palette: pure white editorial cover, charcoal ink, vibrant grid-cut grass, strong terracotta roofs, teal water, honey windows. Minimal portfolio typography gives way to a richer strategic-village world.
- Joshua requested a chunkier strategic-village direction after the first screenshots: thick timber braces, masonry foundations and low boundary walls, saturated roofs, a study tower, original pennants and visible level labels. No existing game's meshes, icons, logos or protected assets are copied.
- The world carries the personality, not HUD prose: no welcome essay, quest card, coordinate ornament, taglines or decorative modal eyebrows. Keep building names, currency, controls and save status; reveal details only when requested.

## Design review references

Reviewed the public [Anthropic frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) and [Vercel web-design-guidelines skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), plus its [interface guidelines](https://github.com/vercel-labs/web-interface-guidelines). Used as review guidance, not copied assets or runtime dependencies.

Anti-slop pass: removed the cream editorial canvas, tracked eyebrow stack, decorative coordinates, numbered navigation and generic aspirational copy. The loose letter and original village are the distinctive elements; surrounding UI stays quiet. Check actual screenshots, not just source: readable controls, mobile safe areas/touch targets, reduced motion, visible focus and no content hidden by chrome.
- Original rounded modular geometry: low poly canopies, tiled pitched roofs, visible timber framing, ceramic pots, a brick-colored court, timber docks and animated shell crews. Model source is `src/game/world/Models.tsx`; no visual reference images are used in production.
- One world unit is approximately one metre; avatar height 1.6 units, doors 2.1. Orthographic three-quarter hub camera, chase race camera, wider court camera. Warm directional sun, ambient sky and low-contrast shadows.
- Keep the world legible: boathouse gable and oars, open court silhouette, quiet green study roof. Upgrade geometry must be visible: balcony then tower, pergola then garden seating.
- Gentle character bob, alternating walking limbs and synchronized oar recovery. No flashing, camera shake or compulsory sound. Respect reduced motion in the editorial reveal; gameplay remains manually controlled.
- Art references in Joshua’s handoff are direction only and are not redistributed as authored assets. All shipped geometry, UI, favicon and WebAudio sounds are original in this repository. System fonts only.
