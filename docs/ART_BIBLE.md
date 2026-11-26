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
- One world unit is approximately one metre; avatar height 1.6 units, doors 2.1. Orthographic three-quarter hub camera, chase race camera, wider court camera. Directional sun, cool sky fill and readable grounded shadows; shared surface shading retains the lighting rig's time-of-day colors.
- Keep the world legible: boathouse gable, balcony and tower, open court silhouette, quiet green study roof, garden pergola and seating.
- Gentle character bob, alternating walking limbs and synchronized oar recovery. No flashing, camera shake or compulsory sound. Respect reduced motion in the editorial reveal; gameplay remains manually controlled.
- Art references in Joshua’s handoff are direction only and are not redistributed as authored assets. Shipped geometry, UI and WebAudio effects are original. Nature ambience uses locally bundled CC0 recordings documented in `public/audio/LICENSES.md`. System fonts only; no logo or favicon monogram.

## Solid-material and interface standard

Reviewed Supercell's own material process in [Adobe's Creature Shop interview](https://www.adobe.com/products/substance3d/magazine/supercell-helsinki-creating-stylized-content-for-clash-of-clans-and-clash-royale.html) and Clash artist [Jonathan Bacheter's production notes](https://jonathanbacheter.com/work/clash-of-clans). The useful principles are boxy, readable massing; restrained albedo variation; rough, stylized PBR materials; and local detail rather than noisy sculpting. The [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) supplies the critique/copy discipline, not a template. No third-party code or game assets were installed.

- World: rounded solid edges, overlapping ceramic tiles, staggered footing blocks, thick framed signs. `Surface.ts` adds broad cool-under/warm-top painted variation to the shared helpers, including instanced roof and foundation pieces. No grain, paper overlays, global postprocessing or extra texture downloads.
- HUD palette: slate `#293f49`, recessed slate `#21353e`, edge `#536971`, text `#f5f4e9`, action green `#506c43`, coin gold `#e7c27e`. Hairline edges and quiet shadows; no embossed card rims. (Superseded for surface treatment by the Glass pass below: faces are now frosted, and these hex values survive only as the opaque `--hud-*` aliases.)
- Type: Arial/Helvetica for the game; sentence-case control labels and tabular scores. The existing white editorial landing stays separate.
- Layout: quiet corner controls, a recessed bottom tool rail, dark building-name plaques, opt-in room stories. Keep the middle of the world clear. Court keyboard guidance sits apart from mode buttons.
- Copy: name the action or measurement; remove repeated public-source stamps, decorative result eyebrows, tiny uppercase label stacks and aspirational filler. Preserve verified room facts and story entry behavior.
- Other builders should use the shared `Box`/`Sign`/architecture helpers and HUD tokens rather than adding pale cards or per-room font systems. Preserve mobile safe areas, touch controls and pointer-event pass-through.

## National flags

`NationalFlag.tsx` draws original canvas textures and folded cloth geometry. United States flags use 13 stripes and 50 stars (alternating six/five across nine rows), following the [National Archives construction order](https://www.archives.gov/federal-register/codification/executive-order/10834.html). South Korean flags use a 3:2 white field, red/blue taegeuk and geon/gon/gam/ri trigrams, following the [Korean National Archives construction guide](https://theme.archives.go.kr/next/symbolKorea/makeNationalFlag.do). No external image or emoji font is loaded. These are requested scenery, not claims about Josh's nationality, affiliation or endorsement.

## Grounded nature and room detail

Reviewed [SpeedTree's modeling fundamentals](https://docs.speedtree.com/doku.php?id=gettingstarted) and [generation guide](https://docs8.speedtree.com/modeler/doku.php?id=generation_properties) for taper, bifurcation, branch-length variance, irregular pine whorls and foliage attached to actual branch tips. The implementation is original procedural Three.js geometry, not SpeedTree code, models or textures. Closed leaf volumes retain the solid game-art direction; no transparent leaf cards or photo assets.

`TreeArt.tsx` supplies rooted, bent trunks, forked limbs, irregular broadleaf crowns and separate pine branch fans. Position-derived seeds keep variations stable. `NaturalTrees` batches a whole grove into three opaque meshes, plus one when palms are present; `Models.Tree({ p, size, variant })` stays compatible. Forest positions and collision/pathfinding data are untouched.

Room dressing uses practical edge zones and keeps the middle/entrance clear: boathouse lockers, repair tools, life vests, rope and footlockers; office workstations/reading furniture; gym weights and towels. New details are instanced in at most three additional batches per furnished room, with no decorative labels or invented biographical claims. Secret rooms, theater, kitchen and partition/game logic remain owned by their builders.

## Sleek-control and foliage refinement

Reviewed [Apple's button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons) for recognizable controls, clear hierarchy, press states and full-size touch regions. The dock uses 44px controls inside a lighter rail. Building plaques have a compact visible face over a 44px interaction target. Slate cards use one thin border and little shadow; green denotes the primary action. The white editorial landing is untouched.

Foliage uses closed, warped canopy masses with small ridged leaf edges, not disconnected blade sprays, translucent cards or smooth sphere crowns. Adjacent oak forks overlap into a continuous, irregular crown; conifer fans have real depth. The masses are baked into the shared geometry at essentially the previous triangle budget, with no additional draws. Foliage casts shadows but uses painted undersides instead of receiving thin-leaf shadow-map noise. Palms have curved segmented trunks and individually modeled pinnate leaflets on arching fronds. Optional `TreePlacement.species` accepts `oak`, `pine`, `redwood` or `palm`; the mature redwood is tall and narrow at its normal scale. Campus nature generators consume the same batched trees rather than retaining their older sphere/fan models. All meshes are original procedural geometry.

Room dressing reads `roomFor(scene)` to anchor bookshelves, storage and racks to the expanded hall edges while keeping each object at its original scale. New forward wings contain practical rowing storage, workstations, a bench-press station and stretching mats; the central entrance and walking lane stay clear.

## Floating islands

All three regions are sky islands: no sea plane, a static low-poly cloud deck far below as the depth cue, and faceted, flat-shaded rock hanging beneath each slab. One shared ring/strip builder (`core/islandUnderside.ts`) takes a per-world style, and each island keeps its own silhouette, rock and props. Home is a rounded warm-earth bowl of soft layered strata with dangling roots, timber ladders, a scaffold, honey lanterns, a chute and a water wheel at its falls, a plank bridge to an allotment-shed islet and oak islets. Korea is pale cleaved granite breaking into a hanging range of craggy spires, with red pines on the lip, a thin, tall fall, a jeongja islet (dark curved-eave roof, red columns, dancheong band), stone cairns and a dolmen, and red/green/blue lanterns. Stanford is a broad, flat sandstone mesa in buff, ochre and rust horizontal bands, with a rock shelf carrying the viaduct piers, wide sheet falls, redwood, palm and golden-poppy islets, and a tiny red-tile Main Quad arcade. Undersides use vertex-coloured strata plus a daylight-driven sky bounce, so down-facing facets stay readable at night. They add no lights, textures, shadow casting or colliders, and the overview camera pans down just enough to frame the rock above the tool rail.

## Glass pass

Joshua asked for the design to be "a lot more detailed, 3d, premium, glassy feel". For the interface that replaces the matte slate faces with frosted panes; the world's own glass and water live in `GlossKit.ts`. The quiet-HUD rules above still hold: no new copy, no ornaments, the middle of the world stays clear.

- Tokens are `--glass-*` on `:root` in `src/game/ui/village-skin.css`; the recipe and every surface that wears it are in `src/game/ui/glass.css`. `--hud-*` stay as opaque dark aliases, so scene sheets (cinema, kitchen, stadium…) inherit the palette without edits. New UI should use the glass tokens and the recipe, not a private fill.
- Recipe: translucent tinted fill over `backdrop-filter: blur(22px) saturate(1.8) brightness(.68)`, one 1px light border, a 1px inner top highlight, a faint top-down sheen and three stacked soft shadows. Radii 22 / 16 / 11 / 8px; capsules for the header cluster and place plaques. Controls inside a pane are "wells" (6% white), never a second pane.
- Dark is the default. `prefers-color-scheme: light` gives the open-air hub light glass with dark ink; interiors keep dark glass because their scene sheets assume it.
- Blur budget, at most eight backdrop surfaces: dock, header capsule, the zoom + clock card (one pane drawn behind both controls), the four nearest place plaques (`Labels.tsx` marks them `is-frosted`, 8px blur, fine pointers only) and the context prompt. A toast, conversation or station pane takes the plaques' share. Modals sit on one blurred scrim and do not blur again. The joystick and touch plaques are tinted, never blurred.
- Contrast is computed for the worst backdrop (pure white behind dark glass with the sheen at full strength; pure black behind light glass), compositing the token values with the WCAG 2 formula; recompute when a fill, blur brightness or ink token changes. Dark: ink 6.9:1, muted 5.5:1, gold 5.1:1 on a pane; ink 4.8:1 on the active dock item; muted 4.7:1 on a well; plaques without blur 7.0:1. Light: ink 9.5:1, muted 5.5:1 on a pane; the coin gold `#e7c27e` measured 1.0:1 there and is `#644508` (5.3:1) in light. Primary buttons 5.5:1 (4.7:1 hovered).
- Fallbacks: without `backdrop-filter` every pane uses its opaque fill. `prefers-reduced-transparency: reduce`, `prefers-contrast: more` and `forced-colors: active` give solid panes, no blur or sheen, and a plain 1px border; forced colours hands fills to the system palette.
- Motion: 180ms ease-out on colour, shadow and transform; hover lifts 1px, press scales to 97%. `prefers-reduced-motion` removes the transforms. Touch targets stay 44px and every control keeps a 2px focus ring (gold on dark, ink on light).
