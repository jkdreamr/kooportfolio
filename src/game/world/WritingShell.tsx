import { StaticBatch } from "./StaticBatch";
import { Box, Cylinder, Window } from "./Models";
import { CraftedBox } from "../scenes/CraftedDetails";
import { HipRoof } from "./VillageBuildings";
import { StoneFooting } from "./ArchitectureDetail";

/** 7.2 × 5 footprint, front +Z; village owns placement and label. */
export function WritingShell({
  p = [0, 0, 0],
}: {
  p?: [number, number, number];
}) {
  return (
    <StaticBatch id="WritingShell">
      <group position={p}>
        <StoneFooting width={7.2} depth={5} />
        <CraftedBox p={[0, 2.4, 0]} s={[7, 4.3, 4.8]} c="#d3b98a" />
        <Box p={[0, 1, 2.43]} s={[7.1, 1.4, 0.3]} c="#927954" />
        {[-3.25, 0, 3.25].map((x) => (
          <Box key={x} p={[x, 2.5, 2.5]} s={[0.3, 4.3, 0.34]} c="#63472f" />
        ))}
        <HipRoof width={7.8} depth={5.7} y={4.65} rise={2} color="#315e4d" />
        <Box p={[0, 1.65, 2.62]} s={[1.5, 2.7, 0.24]} c="#382e25" />
        <CraftedBox p={[0, 1.55, 2.78]} s={[1.22, 2.35, 0.18]} c="#785130" />
        <Cylinder
          p={[0.38, 1.5, 2.91]}
          s={[0.07, 0.1, 0.07]}
          c="#e0b65e"
          r={[Math.PI / 2, 0, 0]}
        />
        {[-2.2, 2.2].map((x) => (
          <Window key={x} p={[x, 2.7, 2.59]} width={1.3} />
        ))}
        <Box p={[0, 0.18, 3.1]} s={[2.4, 0.3, 1.1]} c="#b8a483" />
        <Box p={[0, 0.34, 2.8]} s={[2, 0.25, 0.8]} c="#e0c99f" />
        <group position={[0, 6.6, 0]} rotation={[0.08, 0, 0]}>
          <CraftedBox s={[2.5, 0.4, 1.8]} c="#8c3931" />
          <Box p={[0, 0.25, 0]} s={[2.18, 0.23, 1.5]} c="#d9c799" />
          <Box p={[0, 0.4, 0]} s={[2.5, 0.14, 1.8]} c="#a94c39" />
          <Box p={[0.5, 0.5, 0.15]} s={[0.16, 0.06, 1.6]} c="#d2b052" />
        </group>
        <Box p={[-2.3, 5.6, -0.9]} s={[0.85, 2.7, 0.85]} c="#8d6850" />
        <Box p={[-2.3, 7, -0.9]} s={[1.1, 0.3, 1.1]} c="#bc9e74" />
      </group>
    </StaticBatch>
  );
}
