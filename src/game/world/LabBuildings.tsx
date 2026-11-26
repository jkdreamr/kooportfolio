import { StaticBatch } from "./StaticBatch";
import { Ball, Box, Cylinder, Ring, Sign, Window } from "./Models";
import { StoneFooting } from "./ArchitectureDetail";
import { HipRoof } from "./VillageBuildings";

function LabDoor({ color }: { color: string }) {
  return (
    <>
      <Box p={[0, 1.35, 2.14]} s={[1.6, 2.5, 0.28]} c="#493a2a" />
      <Box p={[0, 1.32, 2.32]} s={[1.25, 2.18, 0.18]} c={color} />
      {[0.6, 2.03].map((y) => (
        <Box key={y} p={[0, y, 2.44]} s={[1.2, 0.12, 0.1]} c="#c09645" />
      ))}
      <Ball p={[0.38, 1.3, 2.48]} s={[0.09, 0.09, 0.06]} c="#e8c464" />
      <Box p={[0, 0.15, 2.7]} s={[2.3, 0.25, 1.3]} c="#96856a" />
      <Box p={[0, 0.32, 2.36]} s={[1.9, 0.2, 0.85]} c="#d0b486" />
    </>
  );
}

// Wall footprint 6.2 × 4.2. Both entrances face +z, matching shared doors.
export function BeatLabShell() {
  return (
    <StaticBatch id="BeatLabShell">
      <group>
        <StoneFooting width={6.2} depth={4.2} />
        <Box p={[0, 2, 0]} s={[6.2, 3.6, 4.2]} c="#c47d49" />
        <Box p={[0, 0.7, 0]} s={[6.35, 0.45, 4.35]} c="#805638" />
        <HipRoof width={6.9} depth={5} y={3.8} rise={1.8} color="#923f32" />
        {[-2.15, 2.15].map((x) => (
          <group key={x}>
            <Box p={[x, 2.15, 2.14]} s={[1.3, 2, 0.2]} c="#4b3d31" />
            <Cylinder
              p={[x, 2.15, 2.32]}
              s={[0.48, 0.2, 0.48]}
              r={[Math.PI / 2, 0, 0]}
              c="#c4984d"
            />
            <Cylinder
              p={[x, 2.15, 2.45]}
              s={[0.35, 0.12, 0.35]}
              r={[Math.PI / 2, 0, 0]}
              c="#2e473d"
            />
            <Ball p={[x, 2.15, 2.54]} s={[0.15, 0.15, 0.08]} c="#819780" />
          </group>
        ))}
        <group position={[1.8, 4.4, -0.5]}>
          <Box s={[0.6, 2.5, 0.6]} c="#52674e" />
          <Ball p={[-0.45, -1.1, 0]} s={[0.7, 0.37, 0.5]} c="#d5b45b" />
          <Box
            p={[0.5, 0.8, 0]}
            s={[1, 0.45, 0.55]}
            c="#d5b45b"
            r={[0, 0, -0.2]}
          />
        </group>
        <LabDoor color="#315849" />
        <Box p={[0, 3.15, 2.25]} s={[2.8, 0.6, 0.24]} c="#4c3b2c" />
        <Sign
          text="BEAT LAB"
          p={[0, 3.16, 2.39]}
          size={[2.5, 0.42]}
          color="#4c3b2c"
          ink="#f0d48b"
        />
      </group>
    </StaticBatch>
  );
}

export function MathLabShell() {
  return (
    <StaticBatch id="MathLabShell">
      <group>
        <StoneFooting width={6.2} depth={4.2} />
        <Box p={[0, 2.15, 0]} s={[6.2, 3.9, 4.2]} c="#a9a485" />
        <Box p={[0, 0.65, 0]} s={[6.4, 0.5, 4.35]} c="#787b63" />
        {[-2.9, 2.9].map((x) => (
          <Box key={x} p={[x, 2.3, 2.05]} s={[0.45, 3.5, 0.45]} c="#6f7457" />
        ))}
        <HipRoof width={7} depth={5} y={4.1} rise={1.6} color="#365b4d" />
        <Cylinder p={[0, 5.2, 0]} s={[0.6, 0.8, 0.6]} c="#b58b48" />
        <group position={[0, 6, 0]}>
          <Ring radius={0.9} tube={0.095} c="#d4ad55" r={[0.6, 0, 0.2]} />
          <Ring radius={0.7} tube={0.08} c="#9fb4a0" r={[0, 0.2, 1.1]} />
          <Ball s={[0.32, 0.32, 0.32]} c="#e7c469" />
        </group>
        {[-2, 2].map((x) => (
          <Window key={x} p={[x, 2.3, 2.14]} width={1.05} />
        ))}
        <LabDoor color="#37614e" />
        <Box p={[0, 3.3, 2.25]} s={[2.8, 0.6, 0.24]} c="#3d5140" />
        <Sign
          text="MATH LAB"
          p={[0, 3.3, 2.39]}
          size={[2.5, 0.42]}
          color="#3d5140"
          ink="#f0d48b"
        />
      </group>
    </StaticBatch>
  );
}
