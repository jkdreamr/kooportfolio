import { Box, Cylinder, Ring } from "./Models";

/** Small original key, positioned by the world owner rather than baked into the campus. */
export function HooverKey() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Ring
        p={[-0.15, 0, 0]}
        radius={0.12}
        tube={0.035}
        c="#d8b45d"
        r={[0, 0, 0]}
      />
      <Box p={[0.12, 0, 0]} s={[0.4, 0.06, 0.07]} c="#d8b45d" />
      <Box p={[0.24, -0.07, 0]} s={[0.06, 0.12, 0.07]} c="#d8b45d" />
      <Box p={[0.34, -0.05, 0]} s={[0.06, 0.09, 0.07]} c="#d8b45d" />
    </group>
  );
}

/** Design-space tower entrance; collision and interaction are outside this art component. */
export function HooverTowerDoor() {
  return (
    <group position={[23, 0, -13.25]}>
      <Box p={[0, 0.24, -0.2]} s={[2.4, 0.25, 1.2]} c="#c6b184" />
      <Box p={[0, 1.65, -0.35]} s={[2.1, 2.8, 0.75]} c="#806c4a" />
      <Box p={[0, 1.58, 0.055]} s={[1.6, 2.6, 0.12]} c="#384b42" />
      {[-0.95, 0.95].map((x) => (
        <Box key={x} p={[x, 1.6, -0.1]} s={[0.28, 2.9, 0.8]} c="#d6bd8d" />
      ))}
      <Box p={[0, 3.08, -0.1]} s={[2.35, 0.3, 0.85]} c="#e0c899" />
      {[-0.5, 0, 0.5].map((x) => (
        <Box key={x} p={[x, 1.58, 0.13]} s={[0.04, 2.45, 0.04]} c="#6b7760" />
      ))}
      <Box p={[0.44, 1.4, 0.18]} s={[0.25, 0.4, 0.08]} c="#c5a054" />
      <Cylinder
        p={[0.44, 1.44, 0.23]}
        s={[0.065, 0.025, 0.065]}
        r={[Math.PI / 2, 0, 0]}
        c="#29362f"
      />
      <Box p={[0.44, 1.35, 0.23]} s={[0.06, 0.13, 0.03]} c="#29362f" />
    </group>
  );
}
