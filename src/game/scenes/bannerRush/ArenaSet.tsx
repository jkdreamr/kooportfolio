/**
 * The board and its Ground (§1.5): a raised table model with mown stripes,
 * a river channel, two plank bridges, packed-earth paths and the Ground's
 * surroundings, all baked by StaticBatch (sculpted-bake programs). Units are
 * tiles (the parent group scales by 0.5); arena-local X = x − 8, Z = y − 14.
 */
import { memo, type ReactNode } from "react";
import { engine } from "./engineApi";
const M = () => engine().models;
const Ball: typeof import("../../world/Models").Ball = (p) => M().Ball(p);
const Box: typeof import("../../world/Models").Box = (p) => M().Box(p);
const Cone: typeof import("../../world/Models").Cone = (p) => M().Cone(p);
const Cylinder: typeof import("../../world/Models").Cylinder = (p) => M().Cylinder(p);
const StaticBatch: typeof import("../../world/StaticBatch").StaticBatch = (p) => engine().staticBatch.StaticBatch(p);

export type Ground = "home" | "palace" | "quad";
export const GROUND_NAMES: Record<Ground, string> = { home: "Home Lawn", palace: "Palace Court", quad: "Stanford Quad" };
export const GROUND_LIGHT: Record<Ground, { color: string; intensity: number }> = {
  home: { color: "#ffe4b4", intensity: 1.7 },
  palace: { color: "#fff0d6", intensity: 1.6 },
  quad: { color: "#ffe9c2", intensity: 1.8 },
};
const FIELD: Record<Ground, { a: string; b: string; path: string; surround: string; far: string }> = {
  home: { a: "#6c9746", b: "#78a450", path: "#b9a27c", surround: "#5f8a3f", far: "#557d38" },
  palace: { a: "#cfc6ae", b: "#c3b99f", path: "#a9a9a2", surround: "#7d8f5a", far: "#6f8250" },
  quad: { a: "#6c9746", b: "#78a450", path: "#d8c39a", surround: "#6a8d45", far: "#5c7f3c" },
};

type V3 = [number, number, number];

/** A packed-earth path segment from a to b (tiles, arena-local XZ). */
function Path({ a, b, w = 1.1, c }: { a: [number, number]; b: [number, number]; w?: number; c: string }) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  return <Box p={[(a[0] + b[0]) / 2, 0.005, (a[1] + b[1]) / 2]} s={[w, 0.05, len + w * 0.6]} r={[0, Math.atan2(dx, dz), 0]} c={c} sharp />;
}

function Tree({ p, s = 1, c = "#4f7a3a" }: { p: V3; s?: number; c?: string }) {
  return (
    <>
      <Cylinder p={[p[0], p[1] + 0.9 * s, p[2]]} s={[0.22 * s, 1.8 * s, 0.22 * s]} c="#6b4a2c" />
      <Ball p={[p[0], p[1] + 2.4 * s, p[2]]} s={[1.3 * s, 1.15 * s, 1.3 * s]} c={c} />
      <Ball p={[p[0] + 0.5 * s, p[1] + 2.0 * s, p[2] + 0.3 * s]} s={[0.8 * s, 0.75 * s, 0.8 * s]} c={c} />
    </>
  );
}

function Cottage({ p, ry = 0, wall = "#efe2bf", roof = "#b55a3c", s = 1 }: { p: V3; ry?: number; wall?: string; roof?: string; s?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]} scale={s}>
      <Box p={[0, 0.25, 0]} s={[3.4, 0.5, 2.6]} c="#9f9a83" />
      <Box p={[0, 1.4, 0]} s={[3.1, 1.9, 2.3]} c={wall} />
      <Box p={[0, 2.85, -0.62]} s={[3.5, 0.24, 1.6]} r={[0.62, 0, 0]} c={roof} />
      <Box p={[0, 2.85, 0.62]} s={[3.5, 0.24, 1.6]} r={[-0.62, 0, 0]} c={roof} />
      <Box p={[0, 1.0, 1.17]} s={[0.7, 1.2, 0.08]} c="#6b4a2c" />
      <Box p={[-1.0, 1.55, 1.17]} s={[0.6, 0.55, 0.06]} c="#9fc3c9" />
      <Box p={[1.0, 1.55, 1.17]} s={[0.6, 0.55, 0.06]} c="#9fc3c9" />
      <Box p={[1.0, 3.0, 0.2]} s={[0.45, 1.1, 0.45]} c="#8f8578" />
    </group>
  );
}

function Fence({ from, to }: { from: [number, number]; to: [number, number] }) {
  const out: ReactNode[] = [];
  const dx = to[0] - from[0],
    dz = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.round(len / 1.4));
  const ry = Math.atan2(dx, dz);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(<Box key={`p${i}`} p={[from[0] + dx * t, -0.25, from[1] + dz * t]} s={[0.18, 0.9, 0.18]} c="#f4ecd6" />);
  }
  out.push(<Box key="r1" p={[(from[0] + to[0]) / 2, -0.1, (from[1] + to[1]) / 2]} s={[0.1, 0.12, len]} r={[0, ry, 0]} c="#f4ecd6" sharp />);
  out.push(<Box key="r2" p={[(from[0] + to[0]) / 2, -0.4, (from[1] + to[1]) / 2]} s={[0.1, 0.12, len]} r={[0, ry, 0]} c="#f4ecd6" sharp />);
  return <>{out}</>;
}

/** The board: slab, stripes, river, bridges, rail, paths, pegs. */
function Board({ ground }: { ground: Ground }) {
  const f = FIELD[ground];
  const stripes: ReactNode[] = [];
  for (let k = 0; k < 14; k++) {
    const z0 = -14 + k * 2;
    if (z0 === -2 || z0 === 0) continue; // the river rows 13..15 (and their halves)
    stripes.push(<Box key={k} p={[0, -0.04, z0 + 1]} s={[16, 0.08, 2]} c={k % 2 ? f.a : f.b} sharp />);
  }
  // The half-bands next to the river (rows 12 and 15).
  stripes.push(<Box key="n" p={[0, -0.04, -1.5]} s={[16, 0.08, 1]} c={f.b} sharp />);
  stripes.push(<Box key="s" p={[0, -0.04, 1.5]} s={[16, 0.08, 1]} c={f.a} sharp />);
  const pegs: ReactNode[] = [];
  for (let x = 0; x < 16; x += 1) {
    if (Math.abs(x + 0.5 - 3) < 1.2 || Math.abs(x + 0.5 - 13) < 1.2) continue;
    pegs.push(<Cylinder key={`a${x}`} p={[x + 0.5 - 8, 0.08, 1.12]} s={[0.07, 0.18, 0.07]} c="#f4f0e4" />);
    pegs.push(<Cylinder key={`b${x}`} p={[x + 0.5 - 8, 0.08, -1.12]} s={[0.07, 0.18, 0.07]} c="#f4f0e4" />);
  }
  const bridge = (bx: number) => (
    <group key={bx} position={[bx, 0, 0]}>
      <Box p={[0, 0.06, 0]} s={[2.1, 0.12, 2.8]} c="#8a603a" />
      {[-0.75, -0.25, 0.25, 0.75].map((x) => (
        <Box key={x} p={[x, 0.14, 0]} s={[0.46, 0.06, 2.75]} c={x % 0.5 ? "#9a6e44" : "#8a603a"} sharp />
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <Cylinder key={`${sx}${sz}`} p={[sx * 1.05, 0.4, sz * 1.35]} s={[0.1, 0.8, 0.1]} c="#6b4a2c" />),
      )}
      {[-1, 1].map((sx) => (
        <Box key={`rope${sx}`} p={[sx * 1.05, 0.6, 0]} s={[0.05, 0.05, 2.7]} c="#d8c39a" sharp />
      ))}
    </group>
  );
  return (
    <>
      {/* The slab (earth), split at the river channel. */}
      <Box p={[0, -0.38, -7.5]} s={[16, 0.6, 13]} c="#9c7a52" />
      <Box p={[0, -0.38, 7.5]} s={[16, 0.6, 13]} c="#9c7a52" />
      <Box p={[0, -0.62, 0]} s={[16, 0.12, 2]} c="#7d6040" />
      {/* Channel walls, bed and water. */}
      <Box p={[0, -0.55, 0]} s={[16, 0.06, 2]} c="#3f6f7a" sharp />
      <Box p={[0, -0.24, 0]} s={[16, 0.04, 2]} c="#5f8f99" sharp />
      <Box p={[0, -0.16, -1.02]} s={[16, 0.3, 0.06]} c="#8c8a82" sharp />
      <Box p={[0, -0.16, 1.02]} s={[16, 0.3, 0.06]} c="#8c8a82" sharp />
      {stripes}
      {/* Paths: Keep → Lookouts → bridges, both sides. */}
      {[1, -1].flatMap((side) => [
        <Path key={`${side}l`} a={[0, side * 11]} b={[-5, side * 6.5]} c={f.path} />,
        <Path key={`${side}r`} a={[0, side * 11]} b={[5, side * 6.5]} c={f.path} />,
        <Path key={`${side}bl`} a={[-5, side * 6.5]} b={[-5, side * 1.3]} c={f.path} />,
        <Path key={`${side}br`} a={[5, side * 6.5]} b={[5, side * 1.3]} c={f.path} />,
      ])}
      {bridge(-5)}
      {bridge(5)}
      {/* Stepping stones and lily pads outside the play area. */}
      <Cylinder p={[-8.7, -0.18, 0.3]} s={[0.35, 0.12, 0.35]} c="#a9a9a2" />
      <Cylinder p={[8.8, -0.18, -0.4]} s={[0.4, 0.12, 0.4]} c="#a9a9a2" />
      <Cylinder p={[-2.2, -0.2, 0.45]} s={[0.3, 0.03, 0.3]} c="#4f8a44" />
      <Cylinder p={[1.7, -0.2, -0.5]} s={[0.26, 0.03, 0.26]} c="#4f8a44" />
      <Cylinder p={[7.1, -0.2, 0.55]} s={[0.24, 0.03, 0.24]} c="#4f8a44" />
      {pegs}
      {/* Timber edge rail. */}
      <Box p={[0, 0.0, -14.25]} s={[16.9, 0.36, 0.45]} c="#6b4a2c" />
      <Box p={[0, 0.0, 14.25]} s={[16.9, 0.36, 0.45]} c="#6b4a2c" />
      <Box p={[-8.25, 0.0, 0]} s={[0.45, 0.36, 28.9]} c="#6b4a2c" />
      <Box p={[8.25, 0.0, 0]} s={[0.45, 0.36, 28.9]} c="#6b4a2c" />
      <Box p={[0, 0.2, -14.25]} s={[16.9, 0.06, 0.5]} c="#e8c26e" sharp />
      <Box p={[0, 0.2, 14.25]} s={[16.9, 0.06, 0.5]} c="#e8c26e" sharp />
      {/* Commander podiums behind each Keep. */}
      <Cylinder p={[0, 0.25, 15.4]} s={[0.9, 0.5, 0.9]} c="#8a603a" />
      <Cylinder p={[0, 0.25, -15.4]} s={[0.9, 0.5, 0.9]} c="#8a603a" />
    </>
  );
}

function HomeLawn() {
  const f = FIELD.home;
  return (
    <>
      <Box p={[0, -0.9, 0]} s={[90, 0.3, 70]} c={f.surround} />
      {/* Cottages left and right (seen on wide screens), the far row behind the rival. */}
      <Cottage p={[-15, -0.75, -9]} ry={0.25} />
      <Cottage p={[-16, -0.75, 3]} ry={-0.2} wall="#e9dcc0" roof="#3f6a52" />
      <Cottage p={[-14.5, -0.75, 13]} ry={0.1} roof="#8f4a34" />
      <Cottage p={[15, -0.75, -8]} ry={-0.3} wall="#f1e6c8" roof="#3f6a52" />
      <Cottage p={[16, -0.75, 4]} ry={0.2} />
      <Cottage p={[14.5, -0.75, 14]} ry={-0.1} wall="#e9dcc0" roof="#8f4a34" />
      <Cottage p={[-5, -0.75, -21]} ry={0} s={1.1} />
      <Cottage p={[6, -0.75, -22]} ry={0.15} wall="#e9dcc0" roof="#3f6a52" s={1.1} />
      <Tree p={[-11, -0.75, -14]} s={1.1} />
      <Tree p={[-11.5, -0.75, -2]} s={0.9} c="#5b8a40" />
      <Tree p={[-11, -0.75, 9]} s={1.0} />
      <Tree p={[11.2, -0.75, -13]} s={1.0} c="#5b8a40" />
      <Tree p={[11.5, -0.75, -1]} s={1.1} />
      <Tree p={[11, -0.75, 10]} s={0.95} c="#5b8a40" />
      <Tree p={[-1, -0.75, -19]} s={1.2} />
      <Tree p={[-19, -0.75, -4]} s={1.3} c="#4a7536" />
      <Tree p={[19, -0.75, 9]} s={1.3} c="#4a7536" />
      {/* Picket fences along the long sides. */}
      <Fence from={[-10, -15]} to={[-10, 15]} />
      <Fence from={[10, -15]} to={[10, 15]} />
      {/* Flower beds and a notice board. */}
      {[-12.5, 12.5].map((x) => (
        <group key={x}>
          <Box p={[x, -0.62, -5]} s={[1.2, 0.3, 3]} c="#7a5a3a" />
          {[-1, 0, 1].map((k) => (
            <Ball key={k} p={[x, -0.4, -5 + k]} s={[0.35, 0.3, 0.35]} c={["#e58a8a", "#f2d27a", "#c9a0dc"][(k + 3) % 3]} />
          ))}
        </group>
      ))}
      <Box p={[12.6, 0.4, 7]} s={[0.15, 2.2, 0.15]} c="#6b4a2c" />
      <Box p={[13.6, 0.4, 7]} s={[0.15, 2.2, 0.15]} c="#6b4a2c" />
      <Box p={[13.1, 1.1, 7]} s={[1.5, 1.0, 0.12]} c="#8a603a" />
      <Box p={[13.1, 1.1, 7.07]} s={[1.3, 0.8, 0.02]} c="#efe2bf" sharp />
      {/* Bunting poles behind your podium. */}
      <Cylinder p={[-6, 1.0, 17.5]} s={[0.1, 3.5, 0.1]} c="#6b4a2c" />
      <Cylinder p={[6, 1.0, 17.5]} s={[0.1, 3.5, 0.1]} c="#6b4a2c" />
      <Cone p={[0, -0.4, 19]} s={[0.01, 0.01, 0.01]} c="#4f7a3a" />
    </>
  );
}

/** One baked set per Ground (chunk off: the board is one or two draws). */
export const ArenaSet = memo(function ArenaSet({ ground }: { ground: Ground }) {
  return (
    <StaticBatch id={`br-ground-${ground}`} chunk={false} ao={false}>
      <Board ground={ground} />
      {ground === "home" && <HomeLawn />}
      {ground === "palace" && <HomeLawn />}
      {ground === "quad" && <HomeLawn />}
    </StaticBatch>
  );
});
