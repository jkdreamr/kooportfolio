import type { WorldId } from "../../core/worlds";
import { doorsInWorld } from "../../core/world";
import { STANFORD_WALKS } from "../../core/stanfordLayout";
import { KOREA_GARDEN_WALKS } from "../../core/koreaLandmarks";
import { HOME_GARDEN_WALKS } from "../../core/homeGardens";
import { HOME_PATH_PARTS, HOME_ROAD_RECTS } from "./homePaths";
import {
  apronFootprint,
  filletFootprints,
  type Apron,
  type RoadNetwork,
  type RoadRect,
} from "./roadMesh";

/**
 * Every world's roads as data (pure): the layouts stay where they were
 * (`homePaths`, `HOME_GARDEN_WALKS`, `STANFORD_WALKS`, the Korea grounds) and
 * become road networks here. Roads.tsx draws them; placement keeps grass and
 * props off `ROAD_FOOTPRINTS`.
 */

/** Door thresholds: 2.4 × 1.6 in front of each door's front wall. */
export function doorAprons(world: WorldId): Apron[] {
  return doorsInWorld(world).map((door) => {
    const [, cz, , hz] = door.footprint;
    const facing = door.z >= cz ? 1 : -1;
    return { x: door.x, z: cz + facing * hz, axis: "z" as const, facing };
  });
}

/** Split `rects` where they cross any of `cut` (along their long axis), so
 * two networks meet edge to edge instead of overlapping. */
export function clipRects(rects: readonly RoadRect[], cut: readonly RoadRect[]): RoadRect[] {
  let out: RoadRect[] = [...rects];
  for (const [kx, kz, kw, kd] of cut) {
    const next: RoadRect[] = [];
    for (const r of out) {
      const [cx, cz, w, d] = r;
      const overlapX = Math.abs(cx - kx) < (w + kw) / 2;
      const overlapZ = Math.abs(cz - kz) < (d + kd) / 2;
      if (!overlapX || !overlapZ) {
        next.push(r);
        continue;
      }
      const alongX = w >= d;
      const [a0, a1] = alongX ? [cx - w / 2, cx + w / 2] : [cz - d / 2, cz + d / 2];
      const [k0, k1] = alongX ? [kx - kw / 2, kx + kw / 2] : [kz - kd / 2, kz + kd / 2];
      for (const [s0, s1] of [
        [a0, Math.min(a1, k0)],
        [Math.max(a0, k1), a1],
      ] as const) {
        if (s1 - s0 < 0.05) continue;
        next.push(alongX ? [(s0 + s1) / 2, cz, s1 - s0, d] : [cx, (s0 + s1) / 2, w, s1 - s0]);
      }
    }
    out = next;
  }
  return out;
}

/* ------------------------------------------------------------------ home */
const HOME_NET: RoadNetwork = {
  style: "lane",
  rects: [...HOME_GARDEN_WALKS, ...HOME_ROAD_RECTS],
  y: 0.19,
  ground: 0.14,
  crown: 0.02,
  // Doors that already have a limestone or timber threshold keep it.
  aprons: doorAprons("home").filter((apron) => {
    const [ax, az, aw, ad] = apronFootprint(apron);
    return !HOME_PATH_PARTS.some(({ p, s }) => Math.abs(p[0] - ax) < (s[0] + aw) / 2 && Math.abs(p[2] - az) < (s[2] + ad) / 2);
  }),
};

/* -------------------------------------------------------------- stanford */
const STANFORD_NET: RoadNetwork = {
  style: "pavers",
  rects: STANFORD_WALKS,
  y: 0.2,
  ground: 0.14,
  crown: 0.018,
  aprons: doorAprons("stanford"),
};

/* ----------------------------------------------------------------- korea */
/** Modern Seoul: the north-bank road along the Han (asphalt). The walk in
 * front of the plaza and the south bank stay pedestrian, so the district
 * reads as one street and its promenades, not a grid of tarmac. */
export const KOREA_STREETS: readonly RoadRect[] = [[25, 18.7, 79, 3.2]];
/** Granite promenades that joined the garden walks. */
const KOREA_PROMENADES: readonly RoadRect[] = [
  [-0.5, 12, 106, 3.3],
  [27.5, 47, 85, 3.2],
  [-15, 33, 3, 30],
  [65, 30, 3, 25],
  [69, 47.5, 2, 27],
  [63.5, 61, 13, 2],
];
/** The Gwanghwamun axis toward the palace: the raised spirit road. */
export const KOREA_SPIRIT_ROAD: RoadRect = [-23.5, -1.875, 2.6, 25.05];
const koreaSetts = clipRects([...KOREA_GARDEN_WALKS, ...KOREA_PROMENADES], KOREA_STREETS);
const KOREA_SETTS_NET: RoadNetwork = {
  style: "spirit",
  rects: koreaSetts,
  y: 0.226,
  ground: 0.14,
  crown: 0.016,
  // No wear band to draw: a coarser grid keeps the district under budget.
  grid: { step: 2, across: 4 },
  aprons: doorAprons("korea"),
  centreRects: koreaSetts
    .map((r, i) => [r, i] as const)
    .filter(([[cx, cz, w]]) => Math.abs(cx - KOREA_SPIRIT_ROAD[0]) < 0.01 && Math.abs(w - KOREA_SPIRIT_ROAD[2]) < 0.01 && cz < 10.7)
    .map(([, i]) => i),
};
const KOREA_ASPHALT_NET: RoadNetwork = {
  style: "asphalt",
  rects: KOREA_STREETS,
  y: 0.226,
  ground: 0.14,
  crown: 0.02,
  grid: { step: 2, across: 4 },
};

export const ROAD_NETWORKS: Record<WorldId, readonly RoadNetwork[]> = {
  home: [HOME_NET],
  stanford: [STANFORD_NET],
  korea: [KOREA_SETTS_NET, KOREA_ASPHALT_NET],
};

/** Everything a road covers: ribbons, junction fillets and door aprons. */
export function roadFootprints(world: WorldId): RoadRect[] {
  return ROAD_NETWORKS[world].flatMap((net) => [
    ...net.rects,
    ...filletFootprints(net.rects),
    ...(net.aprons ?? []).map(apronFootprint),
  ]);
}
