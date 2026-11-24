export const ISLAND_RAIL = {
  radiusX: 86.5,
  radiusZ: 92,
  centerZ: 12,
  height: 1,
  lapSeconds: 130,
  station: [-76, 12] as const,
};

/** Distance-like phase, in turns. Locomotive and coaches share this route. */
export function railPose(turns: number, offset = 0) {
  const angle = (turns - offset) * Math.PI * 2 + Math.PI;
  return {
    x: Math.cos(angle) * ISLAND_RAIL.radiusX,
    z: ISLAND_RAIL.centerZ + Math.sin(angle) * ISLAND_RAIL.radiusZ,
    heading: Math.atan2(
      -Math.sin(angle) * ISLAND_RAIL.radiusX,
      Math.cos(angle) * ISLAND_RAIL.radiusZ,
    ),
  };
}
