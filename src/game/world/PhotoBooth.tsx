import { StaticBatch } from "./StaticBatch";
import {
  PHOTO_BOOTH_FRONT,
  PHOTO_BOOTH_ORIGIN,
} from "../core/photoBoothLayout";
import { Box, Cylinder, Sign } from "./Models";

const frame = "#435762";
const shell = "#82939b";
const trim = "#bcc8cc";
const dark = "#263a45";
const curtain = ["#556b80", "#687e90"];

export function PhotoBooth() {
  return (
    <StaticBatch id="PhotoBooth">
      <group position={[...PHOTO_BOOTH_ORIGIN]}>
        <Box p={[0, 0.14, 0]} s={[3.2, 0.24, 2.94]} c={frame} />
        <Box p={[0, 0.27, 0]} s={[2.9, 0.06, 2.56]} c={shell} />
        <Box p={[0, 0.2, 1.47]} s={[1.35, 0.12, 0.25]} c={trim} />
        <Box p={[0, 1.62, -1.3]} s={[3, 2.72, 0.28]} c={shell} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Box p={[side * 1.5, 1.62, 0]} s={[0.2, 2.72, 2.8]} c={shell} />
            <Box
              p={[side * 1.5, 1.62, 1.36]}
              s={[0.21, 2.72, 0.16]}
              c={frame}
            />
            <Box
              p={[side * 1.38, 1.1, -0.15]}
              s={[0.08, 0.16, 2.12]}
              c={trim}
            />
            {Array.from({ length: 6 }, (_, i) => (
              <Box
                key={i}
                p={[
                  side * (0.74 + i * 0.106),
                  1.38,
                  PHOTO_BOOTH_FRONT + (i % 2) * 0.04,
                ]}
                s={[0.13, 2.14, 0.15]}
                c={curtain[i % 2]}
              />
            ))}
          </group>
        ))}
        <Box p={[0, 2.5, PHOTO_BOOTH_FRONT]} s={[2.9, 0.1, 0.12]} c={dark} />
        <Box p={[0, 2.82, 1.36]} s={[3.08, 0.53, 0.2]} c={frame} />
        <Sign
          text="4 CUT PHOTO"
          p={[0, 2.83, 1.45]}
          size={[2.25, 0.38]}
          color={frame}
          ink="#f4f7fa"
        />
        <Box p={[0, 3.12, 0]} s={[3.25, 0.22, 2.99]} c={frame} />
        <Box p={[0, 3.24, 0]} s={[3.12, 0.07, 2.9]} c={trim} />
        <Box p={[0, 2.97, -0.3]} s={[1.73, 0.05, 0.18]} c="#e5edf4" />
        <Box p={[0, 1.53, -1.14]} s={[2.35, 2.13, 0.1]} c={frame} />
        <Box p={[0, 1.75, -1.02]} s={[1.63, 0.99, 0.12]} c={dark} />
        <mesh position={[0, 1.75, -0.953]}>
          <planeGeometry args={[1.5, 0.85]} />
          <meshBasicMaterial color="#c5d8e6" />
        </mesh>
        {[-0.51, -0.17, 0.17, 0.51].map((slot) => (
          <group key={slot} position={[slot, 1.75, -0.95]}>
            <mesh>
              <planeGeometry args={[0.27, 0.52]} />
              <meshBasicMaterial color="#edf2f7" />
            </mesh>
            <mesh position={[0, 0.025, 0.003]}>
              <planeGeometry args={[0.205, 0.36]} />
              <meshBasicMaterial color="#71849a" />
            </mesh>
          </group>
        ))}
        <Box p={[0, 2.37, -1.04]} s={[0.37, 0.18, 0.18]} c={dark} />
        <Cylinder
          p={[0, 2.37, -0.934]}
          s={[0.083, 0.042, 0.083]}
          r={[Math.PI / 2, 0, 0]}
          c="#18232c"
        />
        <Box p={[0, 1.02, -1.04]} s={[0.73, 0.16, 0.16]} c={dark} />
        <Box p={[0, 1.01, -0.944]} s={[0.63, 0.043, 0.04]} c="#889aa6" />
        <Box p={[0, 0.85, -1.07]} s={[1.03, 0.092, 0.26]} c={trim} />
      </group>
    </StaticBatch>
  );
}
