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
import { doors } from "../core/world";
import { CognitionFurnishings, GymFurnishings } from "./CognitionGym";
import { HouseInterior } from "./HouseInterior";
import { KitchenInterior } from "./KitchenInterior";
import { newRunId } from "../../shared/run-id";
import { ROOM } from "../core/room";
import { RoomDressing } from "./RoomDressing";
import { BeatLabInterior, MathLabInterior } from "./LabRooms";
import type { PlaceId } from "../core/world";
import { useState } from "react";
import { BadmintonCourt } from "./BadmintonCourt";
import { GoInterior } from "./GoInterior";
import { WritingInterior } from "./WritingInterior";
import { StadiumInterior } from "./Stadium";

const rewardInterior = (game: "dice" | "cooking", coins: number) =>
  useGame
    .getState()
    .award(`${game}-${newRunId()}`, coins, Math.ceil(coins / 2));

export function Interior() {
  const [badmintonActive, setBadmintonActive] = useState(false);
  const scene = useGame((s) => s.scene),
    office = scene === "office";
  const name = doors.find((door) => door.id === scene)?.name ?? "";
  if (scene === "stadium") return <StadiumInterior />;
  return (
    <group>
      <Box
        p={[0, -0.4, 0]}
        s={[ROOM.width + 0.6, 0.8, ROOM.depth + 0.6]}
        c="#6f624c"
      />
      <Box p={[0, -0.13, 0]} s={[ROOM.width, 0.3, ROOM.depth]} c="#9d7851" />
      {Array.from({ length: 28 }, (_, i) => (
        <Box
          key={i}
          p={[(i - 13.5) * 0.78, 0.02, 0]}
          s={[0.75, 0.09, 25.7]}
          c={i % 3 ? "#c8ab80" : "#bd9b70"}
        />
      ))}
      <Box p={[0, 2.8, -12.8]} s={[22, 5.6, 0.4]} c="#e6d4b3" />
      <Box p={[-10.8, 2.4, 0]} s={[0.4, 4.8, 26]} c="#d8c4a1" />
      {[-10.5, -5.25, 0, 5.25, 10.5].map((x) => (
        <group key={x}>
          <Box p={[x, 2.8, -12.5]} s={[0.36, 5.6, 0.38]} c="#8f6b43" />
          <Box p={[x, 0.35, -12.3]} s={[0.65, 0.7, 0.6]} c="#a99874" />
          <Box p={[x, 5.35, -12.3]} s={[0.7, 0.45, 0.6]} c="#c4a36b" />
        </group>
      ))}
      <Box p={[0, 5.6, -12.5]} s={[22.5, 0.38, 0.65]} c="#785a39" />
      <Box p={[0, 0.35, -12.5]} s={[22, 0.45, 0.4]} c="#967347" />
      <Box p={[-10.5, 0.35, 0]} s={[0.4, 0.45, 26]} c="#967347" />
      {[-7.8, -2.6, 2.6, 7.8].map((x) => (
        <Window key={x} p={[x, 3.5, -12.5]} width={2.4} />
      ))}
      <Sign text={name.toUpperCase()} p={[0, 4.4, -12.25]} size={[4.5, 0.65]} />
      {[-7.5, 7.5].map((x) => (
        <group key={x}>
          <Bench p={[x, 0, 7.8]} />
          <Flowers p={[x, 0, 10.5]} />
        </group>
      ))}
      {scene !== "badminton" && scene !== "go" && (
        <>
          <Box
            p={[0, 0.1, -2]}
            s={[4.2, 0.1, 3]}
            c={office ? "#768973" : "#758f8a"}
          />
          <Ring p={[0, 0.17, -2]} radius={1.2} tube={0.035} c="#e6d2a8" />
        </>
      )}
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
      ) : scene === "boathouse" ? (
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
      ) : null}
      {scene === "cognition" && <CognitionFurnishings />}
      {scene === "kappa" && <HouseInterior onReward={rewardInterior} />}
      {scene === "kitchen" && <KitchenInterior onReward={rewardInterior} />}
      {scene === "gym" && <GymFurnishings />}
      {scene === "music" && <BeatLabInterior />}
      {scene === "math" && <MathLabInterior />}
      {scene === "badminton" && (
        <BadmintonCourt onPlayingChange={setBadmintonActive} />
      )}
      {scene === "go" && <GoInterior />}
      {scene === "writing" && <WritingInterior />}
      <RoomDressing scene={scene as PlaceId} />
      <Box p={[0, 0.1, ROOM.doorZ]} s={[3, 0.12, 2]} c="#4f7966" />
      <Box p={[-1.7, 1.6, 12.3]} s={[0.35, 3.2, 0.4]} c="#8c6947" />
      <Box p={[1.7, 1.6, 12.3]} s={[0.35, 3.2, 0.4]} c="#8c6947" />
      <Box p={[0, 3.2, 12.3]} s={[3.8, 0.38, 0.5]} c="#8c6947" />
      <Sign text="← VILLAGE" p={[0, 3.55, 12.35]} size={[2.8, 0.55]} />
      {!badmintonActive && <Walker interior />}
    </group>
  );
}
