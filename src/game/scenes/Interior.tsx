import {
  Box,
  Boat,
  Bench,
  Cylinder,
  Flowers,
  Ring,
  Sign,
  Window,
} from "../world/Models";
import { Walker } from "../world/Hub";
import { useGame } from "../core/store";

export function Interior() {
  const office = useGame((s) => s.scene === "office");
  return (
    <group>
      <Box p={[0, -0.25, 0]} s={[11, 0.5, 13]} c="#b89770" />
      {Array.from({ length: 22 }, (_, i) => (
        <Box
          key={i}
          p={[i * 0.5 - 5.25, 0.02, 0]}
          s={[0.47, 0.08, 12.5]}
          c={i % 3 ? "#c8ab80" : "#bd9b70"}
        />
      ))}
      <Box p={[0, 2.5, -6]} s={[11, 5, 0.3]} c="#e6d4b3" />
      <Box p={[-5.4, 2.1, 0]} s={[0.3, 4.3, 12]} c="#d8c4a1" />
      {[-5, 0, 5].map((x) => (
        <Box key={x} p={[x, 2.5, -5.75]} s={[0.23, 5, 0.22]} c="#9e805c" />
      ))}
      <Box p={[0, 4.9, -5.7]} s={[11, 0.3, 0.35]} c="#9e805c" />
      <Window p={[-3.1, 3, -5.78]} width={1.6} />
      <Window p={[3.1, 3, -5.78]} width={1.6} />
      <Sign
        text={office ? "CURIOSITY LIVES HERE" : "EVERY STROKE COUNTS"}
        p={[0, 4, -5.72]}
        size={[4.5, 0.65]}
      />
      <Box
        p={[0, 0.1, -2]}
        s={[4.2, 0.1, 3]}
        c={office ? "#768973" : "#758f8a"}
      />
      <Ring p={[0, 0.17, -2]} radius={1.2} tube={0.035} c="#e6d2a8" />
      {office ? (
        <>
          <Box p={[-2.5, 1.1, -4]} s={[4, 0.18, 1.3]} c="#927650" />
          {[-4, -1].map((x) => (
            <Box key={x} p={[x, 0.55, -4]} s={[0.18, 1.1, 1.1]} c="#927650" />
          ))}
          <Box p={[-2.5, 1.7, -4]} s={[1.4, 1, 0.12]} c="#4c615b" />
          <Box p={[-2.5, 1.7, -3.91]} s={[1.18, 0.74, 0.04]} c="#a6bdb0" />
          {Array.from({ length: 15 }, (_, i) => (
            <Box
              key={i}
              p={[3.5 + (i % 4) * 0.22, 0.7 + Math.floor(i / 4) * 0.75, -5.5]}
              s={[0.17, 0.55, 0.55]}
              c={["#b97d62", "#7b8b72", "#c4ab74"][i % 3]}
            />
          ))}
          <Flowers p={[-4.3, 1.2, -4]} />
          <Bench p={[-2.5, 0, -2.7]} />
        </>
      ) : (
        <>
          <group position={[-3.8, 1.4, -0.7]} rotation={[0, 0, 0.45]}>
            <Boat color="#e6bc77" pace={0} />
          </group>
          {[-3.2, -2.6, -2].map((x) => (
            <group key={x} position={[x, 1.8, -5.5]} rotation={[0, 0, -0.2]}>
              <Box s={[0.08, 3, 0.08]} c="#a7835b" />
              <Box p={[0, -1, 0]} s={[0.4, 0.65, 0.08]} c="#be795f" />
            </group>
          ))}
          <Bench p={[3.3, 0, -3]} />
          <Box p={[3.4, 1, -5.3]} s={[2.2, 0.15, 1]} c="#9f805b" />
          <Cylinder p={[3.5, 1.5, -5.2]} s={[0.25, 0.8, 0.25]} c="#d6b569" />
          <Box p={[3.5, 1.1, -5.2]} s={[0.8, 0.12, 0.6]} c="#826a4a" />
        </>
      )}
      <Box p={[0, 0.1, 5.5]} s={[2, 0.12, 1.6]} c="#7d8d75" />
      <Box p={[-1.3, 1.3, 6.1]} s={[0.2, 2.6, 0.2]} c="#9f825f" />
      <Box p={[1.3, 1.3, 6.1]} s={[0.2, 2.6, 0.2]} c="#9f825f" />
      <Box p={[0, 2.6, 6.1]} s={[2.8, 0.2, 0.2]} c="#9f825f" />
      <Sign text="← VILLAGE" p={[0, 2.9, 6.15]} size={[2, 0.45]} />
      <Flowers p={[4.6, 0, 4.6]} />
      <Walker interior />
    </group>
  );
}
