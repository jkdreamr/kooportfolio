import { StaticBatch } from "./StaticBatch";
import { Ball, Box, Cylinder, Ring } from "./Models";
import { HipRoof } from "./VillageBuildings";
import { StoneFooting } from "./ArchitectureDetail";

/** 7.2×5.4 village footprint, doorway facing +Z. Position owned by Hub. */
export function GoShell() {
  return (
    <StaticBatch id="GoShell">
      <group>
        <StoneFooting width={6.6} depth={4.7} />
        <Box p={[0, 0.4, 0]} s={[7, 0.55, 5.1]} c="#75674e" />
        <Box p={[0, 2.1, 0]} s={[6.5, 3.2, 4.55]} c="#c4a573" />
        <Box p={[0, 0.83, 0]} s={[6.7, 0.35, 4.75]} c="#75502f" />
        <Box p={[0, 3.55, 0]} s={[6.8, 0.32, 4.8]} c="#68462c" />
        {[-3.08, -1.22, 1.22, 3.08].map((x) => (
          <group key={x}>
            <Box p={[x, 2.12, 2.35]} s={[0.27, 3.15, 0.3]} c="#6f4c2b" />
            <Box p={[x, 0.8, 2.4]} s={[0.45, 0.45, 0.45]} c="#a48e60" />
          </group>
        ))}
        {[-2.15, 2.15].map((x) => (
          <group key={x} position={[x, 2.2, 2.33]}>
            <Box s={[1.5, 1.9, 0.2]} c="#493a28" />
            <Box p={[0, 0, 0.13]} s={[1.25, 1.65, 0.12]} c="#738d6c" />
            {[-0.4, 0, 0.4].map((dx) => (
              <Box
                key={dx}
                p={[dx, 0, 0.23]}
                s={[0.065, 1.65, 0.12]}
                c="#ac8851"
              />
            ))}
            {[-0.5, 0, 0.5].map((y) => (
              <Box key={y} p={[0, y, 0.23]} s={[1.3, 0.07, 0.12]} c="#ac8851" />
            ))}
          </group>
        ))}
        <Box p={[0, 1.78, 2.36]} s={[1.75, 2.5, 0.19]} c="#3d392a" />
        <Box p={[0, 1.75, 2.49]} s={[1.5, 2.2, 0.15]} c="#45674b" />
        {[-0.54, 0, 0.54].map((x) => (
          <Box key={x} p={[x, 1.78, 2.6]} s={[0.08, 2.15, 0.1]} c="#b79553" />
        ))}
        <Box p={[0, 2.3, 2.6]} s={[1.5, 0.09, 0.1]} c="#b79553" />
        <Ball p={[0.48, 1.65, 2.69]} s={[0.08, 0.08, 0.06]} c="#e4bd67" />
        <HipRoof width={7.2} depth={5.4} y={3.75} rise={1.75} color="#345f50" />
        <Box p={[0, 0.35, 2.7]} s={[2.3, 0.35, 0.8]} c="#b8a17a" />
        <Box p={[0, 0.17, 3.15]} s={[2.6, 0.25, 0.7]} c="#9b8f70" />
        {/* Carved stone emblem replaces a text banner. */}
        <Box p={[0, 3.61, 2.65]} s={[1.7, 0.85, 0.3]} c="#6d4c2a" />
        {[-0.36, 0.36].map((x, i) => (
          <group key={x} position={[x, 3.62, 2.83]}>
            <Ring
              radius={0.28}
              tube={0.035}
              c="#c7a052"
              r={[Math.PI / 2, 0, 0]}
            />
            <Ball s={[0.23, 0.23, 0.07]} c={i ? "#eee4c5" : "#26372c"} />
          </group>
        ))}
        {[-2.9, 2.9].map((x) => (
          <group key={x} position={[x, 0, 2.68]}>
            <Cylinder p={[0, 1.2, 0]} s={[0.1, 1.9, 0.1]} c="#61462b" />
            <Cylinder p={[0, 2.15, 0]} s={[0.29, 0.7, 0.29]} c="#d9ac59" />
            {[1.78, 2.5].map((y) => (
              <Box key={y} p={[0, y, 0]} s={[0.67, 0.14, 0.67]} c="#665134" />
            ))}
          </group>
        ))}
      </group>
    </StaticBatch>
  );
}
