import { Ball, Box, Cylinder, Flowers, Ring } from "../world/Models";
import type { PlaceId } from "../core/world";

function Bookcase({ x }: { x: number }) {
  return (
    <group position={[x, 0, -11.4]}>
      <Box p={[0, 1.8, -0.5]} s={[4.2, 3.6, 0.25]} c="#674b32" />
      {[-2, 2].map((side) => (
        <Box key={side} p={[side, 1.8, 0]} s={[0.25, 3.6, 1.15]} c="#805f3b" />
      ))}
      {[0.25, 1.35, 2.45, 3.55].map((y) => (
        <Box key={y} p={[0, y, 0]} s={[4.3, 0.2, 1.2]} c="#a57e49" />
      ))}
      {Array.from({ length: 36 }, (_, i) => (
        <Box
          key={i}
          p={[-1.68 + (i % 12) * 0.3, 0.75 + Math.floor(i / 12) * 1.1, 0]}
          s={[0.22, 0.65 + (i % 3) * 0.08, 0.75]}
          c={["#496b61", "#a54f38", "#b5a16e", "#435668"][i % 4]}
        />
      ))}
      <Flowers p={[0.8, 3.65, 0]} />
    </group>
  );
}

export function RoomDressing({ scene }: { scene: PlaceId }) {
  if (scene === "boathouse")
    return (
      <>
        {[-7.5, 7.5].map((x, side) => (
          <group key={x}>
            {[-10, -4].map((z) => (
              <group key={z}>
                <Box p={[x, 2.1, z]} s={[0.22, 4.2, 0.3]} c="#785337" />
                <Box p={[x, 0.25, z]} s={[2.8, 0.25, 0.8]} c="#a58d64" />
                {[1.3, 2.5, 3.7].map((y) => (
                  <Box key={y} p={[x, y, z]} s={[2, 0.18, 0.25]} c="#a58d64" />
                ))}
              </group>
            ))}
            {[1.45, 2.65, 3.85].map((y, i) => (
              <group key={y} position={[x, y, -7]}>
                <Ball
                  s={[0.45, 0.23, 4.5]}
                  c={["#b94e30", "#e7bc5c", "#335b54"][(i + side) % 3]}
                />
                <Box p={[0, 0.17, 0]} s={[0.5, 0.09, 6.5]} c="#5b3e29" />
                {[-2, -0.65, 0.65, 2].map((z) => (
                  <Box
                    key={z}
                    p={[0, 0.22, z]}
                    s={[0.42, 0.08, 0.25]}
                    c="#c4a578"
                  />
                ))}
              </group>
            ))}
          </group>
        ))}
        <Box p={[0, 0.09, -8.5]} s={[5, 0.1, 6]} c="#456d65" />
      </>
    );
  if (scene === "office" || scene === "cognition")
    return (
      <>
        <Bookcase x={7.5} />
        <Bookcase x={-7.5} />
        <group position={[7, 0, 0]}>
          <Cylinder p={[0, 1.1, 0]} s={[1.8, 0.2, 1.8]} c="#a57c4b" />
          <Cylinder p={[0, 0.55, 0]} s={[0.25, 1.1, 0.25]} c="#47514a" />
          <Cylinder p={[0, 0.1, 0]} s={[0.9, 0.15, 0.9]} c="#47514a" />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              p={[0, 0.6, side * 2.3]}
              s={[2.4, 0.35, 0.8]}
              c="#52776a"
            />
          ))}
          <Flowers p={[0, 1.2, 0]} />
        </group>
      </>
    );
  if (scene === "gym")
    return (
      <>
        {[-7, 7].map((x) => (
          <group key={x} position={[x, 0, -8.5]}>
            <Box p={[0, 0.12, 0]} s={[3, 0.16, 5.5]} c="#3c554e" />
            <Cylinder p={[0, 0.3, 0]} s={[0.9, 0.25, 0.9]} c="#7c8372" />
            <Cylinder p={[0, 2.2, 0]} s={[0.18, 4, 0.18]} c="#c3c7b6" />
            <Cylinder p={[0, 2.1, 0]} s={[0.62, 2.4, 0.62]} c="#a44b35" />
            {[1.05, 3.15].map((y) => (
              <Ring
                key={y}
                p={[0, y, 0]}
                radius={0.63}
                tube={0.055}
                c="#d0b06b"
              />
            ))}
          </group>
        ))}
      </>
    );
  return null;
}
