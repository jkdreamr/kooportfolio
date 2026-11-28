/**
 * Towers (§1.5): Lookouts and Keeps, intact or ruined, baked by StaticBatch
 * and shared by both sides (team colour is drawn as props: pennants and
 * banners in view.ts). Each tower is built facing −Z (the river for side 0)
 * and turned for side 1.
 */
import { memo, type ReactNode } from "react";
import { engine } from "./engineApi";
const M = () => engine().models;
const Box: typeof import("../../world/Models").Box = (p) => M().Box(p);
const Cone: typeof import("../../world/Models").Cone = (p) => M().Cone(p);
const Cylinder: typeof import("../../world/Models").Cylinder = (p) => M().Cylinder(p);
const StaticBatch: typeof import("../../world/StaticBatch").StaticBatch = (p) => engine().staticBatch.StaticBatch(p);
import { useRushHud } from "./store";

const GRANITE = ["#a9a9a2", "#8c8a82", "#9c9b93", "#b3b2aa"];
const CAP = "#c6c4ba";
const ROOF = "#3f6a52";
const TIMBER = "#6b4a2c";
const TIMBER2 = "#8a603a";

/** A course of rounded granite blocks around a radius. */
function course(y: number, r: number, n: number, h: number, offset: number, keyBase: string, skip = -1): ReactNode[] {
  const out: ReactNode[] = [];
  const w = ((Math.PI * 2 * r) / n) * 0.96;
  for (let i = 0; i < n; i++) {
    if (i === skip) continue;
    const a = ((i + offset) / n) * Math.PI * 2;
    out.push(<Box key={`${keyBase}${i}`} p={[Math.sin(a) * r, y, Math.cos(a) * r]} s={[w, h, 0.62]} r={[0, a, 0]} c={GRANITE[(i * 3 + keyBase.length) % 4]} />);
  }
  return out;
}

function LookoutIntact() {
  return (
    <>
      <Cylinder p={[0, 1.05, 0]} s={[1.18, 2.1, 1.18]} c="#8c8a82" />
      {course(0.5, 1.22, 8, 1.0, 0, "a")}
      {course(1.52, 1.22, 8, 1.0, 0.5, "b")}
      <Cylinder p={[0, 2.12, 0]} s={[1.48, 0.16, 1.48]} c={CAP} />
      {/* Timber hoarding: a deck and a low rail with posts. */}
      <Cylinder p={[0, 2.28, 0]} s={[1.46, 0.14, 1.46]} c={TIMBER2} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <Box key={`p${i}`} p={[Math.sin(a) * 1.38, 2.62, Math.cos(a) * 1.38]} s={[0.14, 0.62, 0.14]} c={TIMBER} />;
      })}
      {Array.from({ length: 10 }, (_, i) => {
        const a = ((i + 0.5) / 10) * Math.PI * 2;
        return <Box key={`r${i}`} p={[Math.sin(a) * 1.36, 2.82, Math.cos(a) * 1.36]} s={[0.86, 0.12, 0.1]} r={[0, a, 0]} c={TIMBER2} />;
      })}
      {/* A little turret at the back with the green cone (the pennant pole rises from it). */}
      <Cylinder p={[0, 2.95, 0.55]} s={[0.55, 1.2, 0.55]} c="#9c9b93" />
      <Cone p={[0, 4.0, 0.55]} s={[0.78, 0.95, 0.78]} c={ROOF} />
      {/* Arrow loop facing the river. */}
      <Box p={[0, 1.55, -1.5]} s={[0.16, 0.55, 0.1]} c="#3a3530" />
    </>
  );
}
function LookoutRuin() {
  return (
    <>
      <Cylinder p={[0, 0.3, 0]} s={[1.18, 0.6, 1.18]} c="#8c8a82" />
      {course(0.42, 1.22, 8, 0.84, 0, "a", 2)}
      <Box p={[1.6, 0.25, -0.9]} s={[0.8, 0.5, 0.6]} r={[0.2, 0.7, 0.3]} c={GRANITE[0]} />
      <Box p={[-1.4, 0.22, -1.3]} s={[0.75, 0.45, 0.55]} r={[-0.3, 1.9, 0.1]} c={GRANITE[2]} />
      <Box p={[0.6, 0.85, 0.3]} s={[0.7, 0.5, 0.6]} r={[0.4, 0.3, -0.2]} c={GRANITE[3]} />
      <Cylinder p={[0, 0.62, 0]} s={[1.0, 0.06, 1.0]} c="#b9a27c" />
    </>
  );
}

function KeepIntact() {
  return (
    <>
      <Cylinder p={[0, 1.55, 0]} s={[1.62, 3.1, 1.62]} c="#8c8a82" />
      {course(0.5, 1.68, 11, 1.0, 0, "a")}
      {course(1.52, 1.68, 11, 1.0, 0.5, "b")}
      {course(2.54, 1.68, 11, 1.0, 0, "c")}
      <Cylinder p={[0, 3.12, 0]} s={[1.92, 0.18, 1.92]} c={CAP} />
      {/* Deep-eaved roof, lantern cupola. */}
      <Cone p={[0, 3.95, 0]} s={[2.3, 1.55, 2.3]} c={ROOF} />
      <Cylinder p={[0, 4.85, 0]} s={[0.36, 0.5, 0.36]} c="#efe2bf" />
      <Cone p={[0, 5.3, 0]} s={[0.46, 0.45, 0.46]} c={ROOF} />
      {/* Arched timber door and the window for the core, front (−Z). */}
      <Box p={[0, 0.65, -1.82]} s={[0.95, 1.3, 0.2]} c={TIMBER} />
      <Cylinder p={[0, 1.3, -1.82]} s={[0.48, 0.2, 0.48]} r={[Math.PI / 2, 0, 0]} c={TIMBER} />
      <Box p={[0, 2.0, -1.8]} s={[0.9, 0.7, 0.12]} c="#3a3530" />
      {/* Balcony for the crew. */}
      <Box p={[0, 3.05, -1.95]} s={[1.6, 0.14, 0.75]} c={TIMBER2} />
      <Box p={[0, 3.3, -2.3]} s={[1.6, 0.36, 0.08]} c={TIMBER} />
    </>
  );
}
function KeepRuin() {
  return (
    <>
      <Cylinder p={[0, 0.35, 0]} s={[1.62, 0.7, 1.62]} c="#8c8a82" />
      {course(0.45, 1.68, 11, 0.9, 0, "a", 4)}
      <Box p={[2.1, 0.3, -1.0]} s={[0.9, 0.55, 0.65]} r={[0.2, 0.6, 0.3]} c={GRANITE[0]} />
      <Box p={[-1.9, 0.25, -1.6]} s={[0.85, 0.5, 0.6]} r={[-0.3, 2.1, 0.1]} c={GRANITE[1]} />
      <Box p={[0.4, 0.95, 0.6]} s={[0.8, 0.55, 0.7]} r={[0.4, 0.2, -0.2]} c={GRANITE[3]} />
      <Cone p={[-2.2, 0.3, 1.2]} s={[0.9, 0.5, 0.9]} c={ROOF} />
      <Cylinder p={[0, 0.72, 0]} s={[1.4, 0.06, 1.4]} c="#b9a27c" />
    </>
  );
}

/** Own-frame tower centres (side 0); side 1 is the point mirror. */
const AT: [number, number][] = [
  [3, 20.5],
  [13, 20.5],
  [8, 25],
];

/** All six towers in one bake (one or two draws), keyed by which are standing;
 * a fall rebakes once, under the fall's speed dip. */
export const Towers = memo(function Towers() {
  const towers = useRushHud((s) => s.towers);
  const out: ReactNode[] = [];
  let mask = 0;
  for (let t = 0; t < 6; t++) {
    const side = t < 3 ? 0 : 1;
    const which = t % 3;
    const [ox, oy] = AT[which];
    const x = side === 0 ? ox : 16 - ox,
      y = side === 0 ? oy : 28 - oy;
    const keep = which === 2;
    const alive = towers[t] > 0;
    if (alive) mask |= 1 << t;
    out.push(
      <group key={`${t}-${alive}`} position={[x - 8, 0, y - 14]} rotation={[0, side === 0 ? 0 : Math.PI, 0]}>
        {keep ? alive ? <KeepIntact /> : <KeepRuin /> : alive ? <LookoutIntact /> : <LookoutRuin />}
      </group>,
    );
  }
  return (
    <StaticBatch key={mask} id={`br-towers-${mask}`} chunk={false} ao={false}>
      {out}
    </StaticBatch>
  );
});
