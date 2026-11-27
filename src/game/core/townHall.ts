/**
 * The Town Hall in Home: an original round stone keep at the head of the
 * village, behind the Writing house, its door on the rear lane.
 *
 * Site chosen with the placement scan (tests/townHall.test.ts): the whole
 * footprint is on the lawn, clear of terrain, at least 3 m from every other
 * building, bed and collider, with a walkable approach from the street.
 */

/** Centre of the keep (world x, z). */
export const TOWN_HALL_KEEP: readonly [number, number] = [-4, -39];
/** Collision footprint [cx, cz, halfX, halfZ]: plinth and the three steps.
 * Its centre is the model origin; the keep sits 0.5 behind it. */
export const TOWN_HALL_FOOTPRINT: readonly [number, number, number, number] = [-4, -38.5, 4.7, 5];
/** Where a visitor stands to use the door: on the rear lane. */
export const TOWN_HALL_DOOR: readonly [number, number] = [-4, -32.5];
/** Keep radius at the wall face and the eaves' reach (m). */
export const TOWN_HALL_RADIUS = 4;
/** Height of the lantern cupola's finial: the label anchor sits just above. */
export const TOWN_HALL_TOP = 12.4;
/** How far the keep's centre sits behind the footprint centre (local z). */
export const TOWN_HALL_KEEP_Z = TOWN_HALL_KEEP[1] - TOWN_HALL_FOOTPRINT[1];

/** The glowing core: emissive intensity by day and by night, breathing
 * ±12 % over 4 s. `night` is 0 (day) to 1 (night). */
export const CORE_COLOR = "#ffd27a";
export function coreIntensity(night: number, seconds: number) {
  const base = 1.6 + (3.0 - 1.6) * Math.min(1, Math.max(0, night));
  return base * (1 + 0.12 * Math.sin((seconds / 4) * Math.PI * 2));
}
