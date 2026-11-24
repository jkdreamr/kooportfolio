import { Ball, Box, Cylinder, Ring } from "../world/Models";
import { CraftedBox, BrassStud, WallSconce } from "./CraftedDetails";
import { Plant } from "./InteriorProps";
import { WritingRoomControls } from "./WritingRoomControls";

const bindings = ["#2c6353", "#903f36", "#d2a957", "#344b65", "#705570"];
function Book({
  p,
  color,
  height = 0.9,
}: {
  p: [number, number, number];
  color: string;
  height?: number;
}) {
  return (
    <group position={p}>
      <CraftedBox p={[0, height / 2, 0]} s={[0.29, height, 0.82]} c={color} />
      {[0.16, height - 0.16].map((y) => (
        <Box key={y} p={[0, y, 0.427]} s={[0.28, 0.045, 0.03]} c="#d9b765" />
      ))}
      <Box p={[0, height / 2, 0.43]} s={[0.13, 0.16, 0.025]} c="#d9b765" />
    </group>
  );
}
function LibraryShelf({ x }: { x: number }) {
  return (
    <group position={[x, 0, -11.35]}>
      <CraftedBox p={[0, 2.25, -0.6]} s={[5.3, 4.5, 0.3]} c="#4e3327" />
      {[-2.65, 2.65].map((side) => (
        <CraftedBox
          key={side}
          p={[side, 2.25, 0]}
          s={[0.4, 4.5, 1.4]}
          c="#785131"
        />
      ))}
      {[0.28, 1.55, 2.82, 4.15].map((y) => (
        <CraftedBox key={y} p={[0, y, 0]} s={[5.7, 0.25, 1.5]} c="#a2733e" />
      ))}
      <CraftedBox p={[0, 4.52, 0]} s={[5.95, 0.42, 1.7]} c="#a2733e" />
      {Array.from({ length: 39 }, (_, i) => (
        <Book
          key={i}
          p={[-2.22 + (i % 13) * 0.36, 0.43 + Math.floor(i / 13) * 1.27, 0]}
          color={bindings[(i * 3 + Math.round(Math.abs(x))) % bindings.length]}
          height={0.79 + (i % 3) * 0.1}
        />
      ))}
      {[-2.65, 2.65].map((side) => (
        <BrassStud key={side} p={[side, 4.54, 0.86]} radius={0.09} />
      ))}
    </group>
  );
}
function ReadingChair({
  p,
  turn = 0,
}: {
  p: [number, number, number];
  turn?: number;
}) {
  return (
    <group position={p} rotation={[0, turn, 0]}>
      <CraftedBox p={[0, 0.55, 0]} s={[2.4, 0.7, 2.3]} c="#493327" />
      <CraftedBox p={[0, 1.05, 0]} s={[1.9, 0.45, 1.9]} c="#366653" />
      <CraftedBox p={[0, 1.85, -0.9]} s={[2.35, 2.3, 0.5]} c="#285644" />
      {[-1.05, 1.05].map((x) => (
        <CraftedBox key={x} p={[x, 1.1, 0]} s={[0.46, 1.25, 2.3]} c="#41755a" />
      ))}
      {[-0.55, 0.55].flatMap((x) =>
        [1.55, 2.25].map((y) => (
          <Ball
            key={`${x}${y}`}
            p={[x, y, -0.62]}
            s={[0.085, 0.085, 0.04]}
            c="#214a3b"
          />
        )),
      )}
      {[-0.85, 0.85].flatMap((x) =>
        [-0.8, 0.8].map((z) => (
          <Box
            key={`${x}${z}`}
            p={[x, 0.2, z]}
            s={[0.28, 0.4, 0.28]}
            c="#62442b"
          />
        )),
      )}
    </group>
  );
}
function ReadingLamp({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Cylinder p={[0, 0.08, 0]} s={[0.4, 0.16, 0.4]} c="#b29349" />
      <Cylinder p={[0, 0.55, 0]} s={[0.07, 1, 0.07]} c="#c4a354" />
      <CraftedBox p={[0, 1.08, 0.12]} s={[1.18, 0.4, 0.68]} c="#24715b" />
      <Box p={[0, 0.9, 0.12]} s={[0.95, 0.035, 0.52]} c="#f0d17a" />
    </group>
  );
}
function Typewriter() {
  return (
    <group position={[0, 1.65, 0.1]}>
      <CraftedBox p={[0, 0.18, 0]} s={[2.15, 0.42, 1.4]} c="#324744" />
      <CraftedBox p={[0, 0.47, -0.4]} s={[2.3, 0.32, 0.62]} c="#23312f" />
      <Cylinder
        p={[0, 0.61, -0.5]}
        s={[0.16, 2.45, 0.16]}
        c="#3c332a"
        r={[0, 0, Math.PI / 2]}
      />
      <Box
        p={[0, 0.88, -0.52]}
        s={[1.55, 0.82, 0.07]}
        c="#e3d4a7"
        r={[-0.15, 0, 0]}
      />
      {Array.from({ length: 27 }, (_, i) => (
        <Cylinder
          key={i}
          p={[-0.84 + (i % 9) * 0.21, 0.43, -0.04 + Math.floor(i / 9) * 0.25]}
          s={[0.07, 0.08, 0.07]}
          c="#d7c89e"
        />
      ))}
      <Box p={[0, 0.43, 0.66]} s={[1.1, 0.08, 0.12]} c="#c8b98e" />
    </group>
  );
}

/** Furnishings only; shared shell, Walker and doorway remain with Interior. */
export function WritingInterior() {
  return (
    <group>
      <LibraryShelf x={-6.3} />
      <LibraryShelf x={6.3} />
      <WallSconce p={[-2.7, 3.4, -11.9]} />
      <WallSconce p={[2.7, 3.4, -11.9]} />
      <CraftedBox p={[0, 0.11, -2]} s={[10, 0.12, 9]} c="#3c5a50" />
      {[-4.6, 4.6].map((x) => (
        <Box key={x} p={[x, 0.18, -2]} s={[0.12, 0.02, 8.3]} c="#c49e4f" />
      ))}
      {[-6.1, 2.1].map((z) => (
        <Box key={z} p={[0, 0.18, z]} s={[9.3, 0.02, 0.12]} c="#c49e4f" />
      ))}
      <group position={[0, 0, -4]}>
        <CraftedBox p={[0, 1.5, 0]} s={[6.8, 0.4, 3.15]} c="#a16c36" />
        <CraftedBox p={[0, 1.7, 0.2]} s={[4.1, 0.06, 2.2]} c="#294f43" />
        {[-2.65, 2.65].map((x) => (
          <group key={x}>
            <CraftedBox p={[x, 0.75, 0]} s={[1.05, 1.5, 2.6]} c="#734b2f" />
            {[0.45, 0.98].map((y) => (
              <group key={y}>
                <Box p={[x, y, 1.34]} s={[0.86, 0.4, 0.08]} c="#966234" />
                <Box p={[x, y, 1.41]} s={[0.3, 0.07, 0.1]} c="#c3a052" />
              </group>
            ))}
          </group>
        ))}
        <Typewriter />
        <ReadingLamp p={[-2.5, 1.72, -0.15]} />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            p={[2.3, 1.8 + i * 0.18, 0.1]}
            s={[1.1, 0.17, 1.6]}
            c={bindings[i]}
            r={[0, i * 0.13, 0]}
          />
        ))}
      </group>
      <ReadingChair p={[0, 0, -7.5]} turn={Math.PI} />
      <ReadingChair p={[-7.2, 0, 0.5]} turn={0.6} />
      <ReadingChair p={[-4.5, 0, 4.8]} turn={2.4} />
      <group position={[-7, 0, 4]}>
        <Cylinder p={[0, 0.65, 0]} s={[0.16, 1.3, 0.16]} c="#a17b42" />
        <Cylinder p={[0, 1.35, 0]} s={[1, 0.22, 1]} c="#946336" />
        <ReadingLamp p={[0, 1.47, 0]} />
        <Ring p={[0.5, 1.5, 0.3]} radius={0.17} tube={0.035} c="#e0c894" />
      </group>
      <Plant p={[8.5, 0, -6.5]} />
      <Plant p={[-9, 0, 7.5]} />
      <WritingRoomControls />
    </group>
  );
}
