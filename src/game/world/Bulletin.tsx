import { Box, Cylinder, Sign } from "./Models";
import { walkTo } from "../core/store";

/** The village contact board opens the same verified profile as the Study. */
export function Bulletin({
  position = [0, -6.6],
}: {
  position?: readonly [number, number];
}) {
  const [x, z] = position;
  return (
    <group
      position={[x, 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        walkTo(x, z + 2);
      }}
    >
      <Box p={[0, 0.2, 0]} s={[4.5, 0.35, 1.3]} c="#727f72" />
      {[-1.8, 1.8].map((x) => (
        <group key={x}>
          <Box p={[x, 1.9, 0]} s={[0.3, 3.8, 0.3]} c="#71472b" />
          <Box p={[x, 0.55, 0]} s={[0.55, 0.65, 0.55]} c="#969985" />
        </group>
      ))}
      <Box p={[0, 2.6, 0]} s={[3.8, 1.9, 0.32]} c="#6c452a" />
      <Box p={[0, 2.6, 0.19]} s={[3.35, 1.45, 0.12]} c="#21343b" />
      <Box p={[0, 3.63, 0]} s={[4.3, 0.3, 0.85]} c="#b25539" />
      <Box p={[0, 3.83, 0]} s={[4.05, 0.16, 0.6]} c="#d77a47" />
      <Sign
        text="CONTACT"
        p={[0, 2.77, 0.29]}
        size={[2.9, 0.65]}
        color="#21343b"
        ink="#f7e4b7"
      />
      {[-0.65, 0, 0.65].map((x) => (
        <Cylinder
          key={x}
          p={[x, 2.13, 0.29]}
          s={[0.08, 0.07, 0.08]}
          r={[Math.PI / 2, 0, 0]}
          c="#deb66b"
        />
      ))}
    </group>
  );
}
