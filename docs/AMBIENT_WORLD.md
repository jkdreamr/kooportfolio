# Ambient life integration

Import `Wildlife` from `src/game/world/Wildlife.tsx` and mount it once in Hub. Import `WorldAmbience` from `src/game/world/WorldAmbience.tsx` and mount once in Game's World. The world owner makes these two hook edits; no HUD, save, navigation, NPC or room changes are needed here.

- Six land animals (dog, two cats, three rabbits), three swimming ducks, seven circling/flapping birds and an occasional original propeller plane. Low quality reduces animal/bird counts.
- Hand-placed lawn circuits avoid building footprints and entrances; animals are ambient, not movement obstacles. Duck circuits remain within the dedicated west-park pond, clear of the expanded campus. Air traffic has no collision cost.
- The active wildlife clock freezes for pause/hidden/inactive state and never catches up hidden time. Birds roost out of sight at night. Planes cross every 110 active seconds, first shortly after entry.
- Audio is optional and muted by default through the existing store. No AudioContext until a pointer/keyboard gesture; no asset fetch or source playback until unmuted and outdoors. Mute, pause, hidden/inactive state, interiors and component cleanup stop all sources and invalidate outstanding loads. Only four local MP3s are decoded once, reused, and disconnected when stopped.
- Recorded birds fade into recorded crickets with the existing daylight clock. Recorded water grows louder near the west-park pond and on the rowing river. Plane synthesis follows the visible flyover. Nature recordings are CC0; exact credits, source URLs and processing live in `public/audio/LICENSES.md`.
- Weather is contained in Wildlife (no third mount): soft dawn mist, clear noon, late-afternoon/sunset showers and lightly falling night snow blend with the existing clock. This is a storybook climate, not live weather. Recorded rain and filtered winter wind match the conditions, with quieter wildlife in bad weather. Two batched precipitation draws follow the player; reduced motion hides falling particles and low quality cuts their count. Local fog wisps do not change the scene fog owned by daylight or cover the HUD. Weather is visible in the hub; its matching ambience continues in outdoor games.

## Art review

Used the existing hand-built miniature village palette: cream plumage, earth-toned fur, teal dog collar, green mallard heads and a small terracotta-winged plane. Recognisable silhouettes (rabbit ears, cat tail, dog muzzle, duck bill) carry the detail instead of labels or extra HUD. Reviewed the public Anthropic frontend-design guidance linked in ART_BIBLE for restraint; no cards, icons, prose or attention-grabbing notifications were added.

## Asset/cost audit amendment

The original art/zero-cost audit predates these field recordings: sound is no longer *only* synthesized. The new nature audio is CC0, locally bundled, under 0.7 MiB combined and below the existing per-file asset limit. No service, account, subscription, paid model or remote runtime dependency is added.
