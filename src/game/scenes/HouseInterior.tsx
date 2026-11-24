import { useState } from "react";
import { Box, Ball, Cylinder, Ring } from "../world/Models";
import { BrassStud, CraftedBox, WallSconce } from "./CraftedDetails";
import { HouseRooms } from "./HouseRooms";
import { BlackjackTable } from "./BlackjackTable";
import { PongTable } from "./PongTable";
import { HouseBanner } from "./HouseBanner";
import {
  Barrel,
  Bottle,
  Fire,
  Plant,
  Shelf,
  Table,
  type InteriorGameProps,
} from "./InteriorProps";

function Sofa({
  p,
  rotation = 0,
}: {
  p: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={p} rotation={[0, rotation, 0]}>
      <CraftedBox p={[0, 0.4, 0]} s={[3.15, 0.7, 1.35]} c="#482b23" />
      <CraftedBox p={[0, 1.12, -0.48]} s={[3.15, 1.25, 0.45]} c="#79332c" />
      {[-1, 0, 1].map((x) => (
        <group key={x}>
          <CraftedBox
            p={[x * 0.82, 0.8, 0.05]}
            s={[0.8, 0.4, 1.05]}
            c={x === 0 ? "#aa5143" : "#954538"}
          />
          <CraftedBox
            p={[x * 0.82, 1.1, -0.29]}
            s={[0.8, 0.85, 0.38]}
            c="#a54a3c"
            r={[-0.1, 0, 0]}
          />
          {[-0.2, 0.2].map((dx) => (
            <BrassStud
              key={dx}
              p={[x * 0.82 + dx, 1.17, -0.08]}
              radius={0.035}
            />
          ))}
        </group>
      ))}
      {[-1.5, 1.5].map((x) => (
        <group key={x}>
          <CraftedBox p={[x, 0.95, 0]} s={[0.42, 0.75, 1.48]} c="#823b35" />
          {[-0.4, 0, 0.4].map((z) => (
            <BrassStud key={z} p={[x, 0.98, z + 0.32]} />
          ))}
          <CraftedBox
            p={[x, 0.35, 0.4]}
            s={[0.28, 0.45, 0.28]}
            c="#c39b50"
            metal
          />
        </group>
      ))}
      <CraftedBox
        p={[-0.85, 1.1, 0]}
        s={[0.57, 0.57, 0.34]}
        c="#d1ab54"
        r={[0, 0, 0.2]}
      />
    </group>
  );
}
function Fireplace() {
  return (
    <group position={[7.1, 0, -10.9]} scale={1.25}>
      <Box p={[0, 0.12, 0.12]} s={[2.5, 0.24, 1.3]} c="#858377" />
      <Box p={[0, 1.15, -0.3]} s={[2.15, 2.1, 0.45]} c="#6d6b60" />
      <Box p={[0, 0.85, -0.04]} s={[1.3, 1.35, 0.1]} c="#362d27" />
      {[-1, 1].flatMap((x) =>
        [0, 1, 2].map((i) => (
          <Box
            key={`${x}${i}`}
            p={[x * 0.85, 0.4 + i * 0.5, 0]}
            s={[0.43, 0.45, 0.65]}
            c={i % 2 ? "#aaa58f" : "#bab199"}
          />
        )),
      )}
      {[-0.65, 0, 0.65].map((x) => (
        <Box
          key={x}
          p={[x, 1.95, 0]}
          s={[0.62, 0.45, 0.65]}
          c="#bcb29a"
          r={[0, 0, -x * 0.15]}
        />
      ))}
      <Box p={[0, 2.28, 0.03]} s={[2.6, 0.23, 0.95]} c="#784b2c" />
      <CraftedBox p={[0, 2.15, 0.06]} s={[2.5, 0.16, 0.85]} c="#563a29" />
      <CraftedBox p={[0, 2.43, -0.05]} s={[2.7, 0.14, 1.02]} c="#b27c40" />
      <Box p={[0, 3.5, -0.35]} s={[1.6, 2.1, 0.5]} c="#8b8777" />
      {Array.from({ length: 9 }, (_, i) => (
        <CraftedBox
          key={i}
          p={[-0.53 + (i % 3) * 0.53, 2.75 + Math.floor(i / 3) * 0.54, -0.06]}
          s={[0.49, 0.49, 0.18]}
          c={i % 2 ? "#a9a28c" : "#b9ad94"}
        />
      ))}
      <Fire p={[0, 0.25, 0.15]} large />
      <Cylinder p={[0, 2.48, 0]} s={[0.32, 0.16, 0.32]} c="#5a4936" />
      <Cylinder p={[0, 2.75, 0]} s={[0.09, 0.45, 0.09]} c="#d7aa45" />
      <Cylinder p={[0, 3.06, 0]} s={[0.29, 0.24, 0.29]} c="#e3b956" />
      <Ring
        p={[-0.3, 3.05, 0]}
        radius={0.16}
        tube={0.04}
        c="#d7aa45"
        r={[0, 0, 0]}
      />
      <Ring
        p={[0.3, 3.05, 0]}
        radius={0.16}
        tube={0.04}
        c="#d7aa45"
        r={[0, 0, 0]}
      />
    </group>
  );
}
function Pennant({ x }: { x: number }) {
  return (
    <group position={[x, 3, -11.5]} scale={1.25}>
      <HouseBanner />
      {/* Raised brass letters stay readable at game-camera distance. */}
      <group position={[-0.06, 0.1, 0.31]}>
        <Box p={[-0.47, 0, 0]} s={[0.1, 0.8, 0.04]} c="#edcf7d" />
        <Box
          p={[-0.29, 0.21, 0]}
          s={[0.1, 0.5, 0.04]}
          r={[0, 0, -0.7]}
          c="#edcf7d"
        />
        <Box
          p={[-0.29, -0.21, 0]}
          s={[0.1, 0.5, 0.04]}
          r={[0, 0, 0.7]}
          c="#edcf7d"
        />
        <Box p={[0.32, 0.36, 0]} s={[0.5, 0.1, 0.04]} c="#edcf7d" />
        <Box p={[0.32, -0.36, 0]} s={[0.5, 0.1, 0.04]} c="#edcf7d" />
        <Box
          p={[0.25, 0.18, 0]}
          s={[0.1, 0.5, 0.04]}
          r={[0, 0, 0.7]}
          c="#edcf7d"
        />
        <Box
          p={[0.25, -0.18, 0]}
          s={[0.1, 0.5, 0.04]}
          r={[0, 0, -0.7]}
          c="#edcf7d"
        />
      </group>
    </group>
  );
}

/** Furnishings/game only. Mount inside the shared 22×26 room shell. */
export function HouseInterior(props: InteriorGameProps) {
  const [activity, setActivity] = useState<"blackjack" | "pong">("blackjack");
  const navigation = (
    <nav className="house-game-tabs" aria-label="House games">
      <button
        aria-pressed={activity === "blackjack"}
        onClick={() => setActivity("blackjack")}
      >
        Blackjack
      </button>
      <button
        aria-pressed={activity === "pong"}
        onClick={() => setActivity("pong")}
      >
        Pong
      </button>
    </nav>
  );
  return (
    <group>
      <HouseRooms scene="kappa" />
      <Pennant x={0} />
      <WallSconce p={[-2.5, 3, -11.5]} />
      <WallSconce p={[2.5, 3, -11.5]} />
      <group position={[-10.55, 2.65, 3.3]} rotation={[0, Math.PI / 2, 0]}>
        <WallSconce p={[0, 0, 0]} />
      </group>
      <Fireplace />
      <group scale={1.3}>
        <Sofa p={[-6.3, 0, -2.6]} rotation={Math.PI / 2} />
        <Sofa p={[2.8, 0, -4.4]} rotation={-Math.PI / 2} />
      </group>
      <group position={[-6, 0, -10.6]} scale={1.4}>
        <Box p={[0, 0.6, 0]} s={[3.8, 1.2, 0.85]} c="#36543c" />
        <Box p={[0, 1.26, 0]} s={[4.05, 0.18, 1.05]} c="#b47b42" />
        {[-1.35, -0.45, 0.45, 1.35].map((x) => (
          <group key={x}>
            <Box p={[x, 0.64, 0.45]} s={[0.76, 0.83, 0.05]} c="#45674a" />
            <Ball
              p={[x + 0.23, 0.9, 0.5]}
              s={[0.045, 0.045, 0.045]}
              c="#d3af55"
            />
          </group>
        ))}
        <Bottle p={[-1.4, 1.36, 0]} />
        <Bottle p={[-1.05, 1.36, 0.1]} color="#b85d3c" />
        <Cylinder p={[0.95, 1.4, 0]} s={[0.38, 0.1, 0.38]} c="#e1c690" />
        <Shelf p={[0, 2.1, -0.55]} width={3.9} />
        {Array.from({ length: 9 }, (_, i) => (
          <Box
            key={i}
            p={[-1.55 + i * 0.23, 2.46, -0.55]}
            s={[0.18, 0.55 + (i % 3) * 0.05, 0.36]}
            c={["#7b3e32", "#c59d4f", "#446852"][i % 3]}
            r={[0, 0, i === 8 ? -0.2 : 0]}
          />
        ))}
        <Bottle p={[1.1, 2.2, -0.55]} />
        <Bottle p={[1.5, 2.2, -0.55]} color="#a35637" />
      </group>
      <Barrel p={[-8.7, 0, 2.2]} />
      <Bottle p={[-8.7, 1.32, 2.2]} />
      <Plant p={[9.5, 0, 8]} />
      <group
        position={[-10.6, 2.7, -2]}
        rotation={[0, Math.PI / 2, 0]}
        scale={1.5}
      >
        <Cylinder s={[0.62, 0.1, 0.62]} r={[Math.PI / 2, 0, 0]} c="#d6bd7c" />
        <Ring
          p={[0, 0, 0.065]}
          radius={0.49}
          tube={0.09}
          c="#883d32"
          r={[0, 0, 0]}
        />
        <Ring
          p={[0, 0, 0.07]}
          radius={0.25}
          tube={0.07}
          c="#34563f"
          r={[0, 0, 0]}
        />
        <Ball p={[0, 0, 0.1]} s={[0.09, 0.09, 0.04]} c="#a84937" />
      </group>
      <group position={[-6.5, 0, 6]} scale={1.2}>
        <Sofa p={[0, 0, 0]} />
        <Table p={[0, 0, 2]} size={[2.8, 1.5]} />
        <Bottle p={[0.7, 1.25, 2]} />
        <Cylinder p={[-0.5, 1.3, 2]} s={[0.3, 0.08, 0.3]} c="#ead4a0" />
      </group>
      <BlackjackTable
        {...props}
        active={activity === "blackjack"}
        onSelect={() => setActivity("blackjack")}
        navigation={navigation}
      />
      <PongTable
        active={activity === "pong"}
        onSelect={() => setActivity("pong")}
        navigation={navigation}
      />
    </group>
  );
}
