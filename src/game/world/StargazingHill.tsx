import { sampleDaylight } from "../core/daylight";
import { useTimeOfDay } from "../core/timeOfDay";
import { Ball, Bench, Box, Cylinder, Ring, Sign } from "./Models";

/** Local-origin landmark. The world owns placement, collision and the Look action. */
export function StargazingHill({
  position = [0, 0, 0],
}: {
  position?: [number, number, number];
}) {
  const night = useTimeOfDay((state) => sampleDaylight(state.hour).night);
  return (
    <group position={position}>
      <mesh position={[0, 0.6, -0.5]} receiveShadow castShadow>
        <cylinderGeometry args={[5.6, 6.8, 1.4, 11]} />
        <meshStandardMaterial color="#72786b" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 1.45, -0.7]} receiveShadow castShadow>
        <cylinderGeometry args={[4.8, 5.8, 1.2, 11]} />
        <meshStandardMaterial color="#697e47" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 2.05, -0.8]} receiveShadow castShadow>
        <cylinderGeometry args={[4.2, 4.8, 0.6, 11]} />
        <meshStandardMaterial color="#819554" roughness={1} flatShading />
      </mesh>
      <Cylinder p={[0, 2.37, -0.1]} s={[2.3, 0.14, 2.3]} c="#b8ad8d" />
      <Ring p={[0, 2.46, -0.1]} radius={2.12} tube={0.045} c="#7f755f" />
      {/* A broad stairway reads from the southern foot without requiring vertical physics. */}
      {Array.from({ length: 8 }, (_, i) => (
        <Box
          key={i}
          p={[0, 0.18 + i * 0.29, 6.3 - i * 0.59]}
          s={[2.25, 0.35, 0.73]}
          c={i % 2 ? "#b6ad94" : "#a39d87"}
        />
      ))}
      <group position={[0, 2.47, -0.1]}>
        {/* Heavy hardwood tripod, metal shoes and bracing. */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
          <group key={angle} rotation={[0, angle, 0]}>
            <Box
              p={[0, 0.92, 0.54]}
              s={[0.19, 1.95, 0.2]}
              r={[0.52, 0, 0]}
              c="#8d5c37"
            />
            <Box p={[0, 0.12, 1.02]} s={[0.26, 0.25, 0.3]} c="#283638" />
            <Box
              p={[0, 0.63, 0.36]}
              s={[0.09, 0.1, 0.9]}
              r={[-0.32, 0, 0]}
              c="#b2945f"
            />
          </group>
        ))}
        <Cylinder p={[0, 1.75, 0]} s={[0.34, 0.3, 0.34]} c="#b08a4e" />
        <Box p={[0, 2.03, 0]} s={[0.28, 0.42, 0.45]} c="#344548" />
        <group position={[0, 2.2, 0]} rotation={[Math.PI / 2 - 0.52, -0.38, 0]}>
          <Cylinder s={[0.33, 2.45, 0.33]} c="#e5ddc5" />
          {[-0.8, 0.65].map((y) => (
            <Cylinder
              key={y}
              p={[0, y, 0]}
              s={[0.37, 0.14, 0.37]}
              c="#ad8648"
            />
          ))}
          <Cylinder p={[0, 1.25, 0]} s={[0.42, 0.4, 0.42]} c="#344548" />
          <Cylinder p={[0, 1.46, 0]} s={[0.35, 0.035, 0.35]} c="#172e3b" />
          <Cylinder p={[0, 1.49, 0]} s={[0.22, 0.02, 0.22]} c="#477281" />
          <Cylinder p={[0, -1.4, 0]} s={[0.15, 0.45, 0.15]} c="#344548" />
          <Cylinder
            p={[0.34, -1.14, 0]}
            s={[0.12, 0.17, 0.12]}
            r={[0, 0, Math.PI / 2]}
            c="#b08a4e"
          />
          <Box p={[0.4, 0.2, 0]} s={[0.1, 0.65, 0.1]} c="#ad8648" />
          <Cylinder p={[0.46, 0.2, 0]} s={[0.095, 0.85, 0.095]} c="#344548" />
        </group>
      </group>
      <group position={[-3.1, 2.3, -1.9]} rotation={[0, 0.5, 0]}>
        <Bench p={[0, 0, 0]} />
      </group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.65, 0.35, 5.7]}>
          <Cylinder p={[0, 0.55, 0]} s={[0.12, 1.1, 0.12]} c="#4f493c" />
          <Box p={[0, 1.17, 0]} s={[0.42, 0.55, 0.42]} c="#55392d" />
          <mesh position={[0, 1.2, 0.22]}>
            <boxGeometry args={[0.24, 0.3, 0.025]} />
            <meshStandardMaterial
              color="#d58052"
              emissive="#ed693d"
              emissiveIntensity={night * 1.5}
            />
          </mesh>
          <Box p={[0, 1.5, 0]} s={[0.55, 0.14, 0.55]} c="#344548" />
        </group>
      ))}
      {[
        [-4.9, 0.9, 1.8],
        [4.8, 0.8, 2],
        [3.5, 1.7, -3.9],
        [-3.8, 1.5, -3.8],
      ].map((p, i) => (
        <Ball
          key={i}
          p={p as [number, number, number]}
          s={[0.8, 0.55, 0.65]}
          c={i % 2 ? "#8a8b73" : "#606f5b"}
        />
      ))}
      <group position={[3.2, 0, 5.3]}>
        <Box p={[0, 0.8, 0]} s={[0.2, 1.6, 0.2]} c="#755235" />
        <Box p={[0, 1.65, 0]} s={[2.65, 0.72, 0.2]} c="#344548" />
        <Sign
          text="STARGAZING"
          p={[0, 1.65, 0.12]}
          size={[2.45, 0.54]}
          color="#344548"
          ink="#eee1bb"
        />
      </group>
    </group>
  );
}
