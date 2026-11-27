import {
  campusDistrictObstacles,
  campusDistrictStops,
  campusFountainCenter,
} from "./campusDistrict";

export const campus = { x: 20, z: 50 } as const;
// The whole campus is rotated by PI, including its navigation geometry.
export const campusObstacles = campusDistrictObstacles.map(
  ([x, z, hx, hz]) => [campus.x - x, campus.z - z, hx, hz] as const,
);
export const campusStops = Object.fromEntries(
  Object.entries(campusDistrictStops).map(([name, [x, z]]) => [
    name,
    [campus.x - x, campus.z - z],
  ]),
) as Record<keyof typeof campusDistrictStops, [number, number]>;
/** World x/z of the quad fountain (audio emitter, QA). */
export const campusFountainWorld = [
  campus.x - campusFountainCenter[0],
  campus.z - campusFountainCenter[1],
] as const;
