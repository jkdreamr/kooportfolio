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
import { StaticBatch } from "../world/StaticBatch";
import { InteriorCraft } from "./InteriorCraft";
import { useGame, walkTo } from "../core/store";
import { useGameMode } from "../core/gameMode";
import { doors } from "../core/world";
import { CognitionFurnishings, GymFurnishings } from "./CognitionGym";
import { CognitionPlaque } from "./CognitionWordmark";
import { HouseInterior } from "./HouseInterior";
import { KitchenInterior } from "./KitchenInterior";
import { roomFor } from "../core/room";
import { RoomDressing } from "./RoomDressing";
import { BeatLabInterior, MathLabInterior } from "./LabRooms";
import type { PlaceId } from "../core/world";
import { useState } from "react";
import { BadmintonCourt } from "./BadmintonCourt";
import { GoInterior } from "./GoInterior";
import { WritingInterior } from "./WritingInterior";
import { StadiumInterior } from "./Stadium";
import { MovieTheaterInterior, useTheater } from "./MovieTheater";
import { SecretRoomInterior } from "./SecretRoom";
import { HOOVER_STASH } from "../core/hoover";
import { KOREA_THEATER_PROGRAM } from "../core/theaterProgram";

export function Interior() {
  const world = useGame((s) => s.world);
  const [badmintonActive, setBadmintonActive] = useState(false);
  const theaterSeated = useTheater((s) => s.seated);
  const stashClaimed = useGame((s) => s.save.memories.includes(HOOVER_STASH));
  const scene = useGame((s) => s.scene),
    office = scene === "office",
    theater = scene === "theater",
    cognition = scene === "cognition";
  const name =
    scene === "secret"
      ? "Hoover vault"
      : (doors.find((door) => door.id === scene)?.name ?? "");
  const room = roomFor(scene);
  const back = -room.depth / 2 + 0.2;
  const left = -room.width / 2 + 0.2;
  const walkFloor = (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.2, 0]}
      onPointerDown={(event) => {
        const state = useGame.getState();
        if (
          useGameMode.getState().active ||
          (theater && theaterSeated) ||
          state.paused ||
          state.traveling ||
          state.overlayLocked ||
          state.panel !== "none"
        )
          return;
        event.stopPropagation();
        walkTo(event.point.x, event.point.z);
      }}
    >
      <planeGeometry args={[room.width, room.depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
  if (scene === "stadium")
    return (
      <group>
        {walkFloor}
        <StadiumInterior />
      </group>
    );
  return (
    <group>
      {walkFloor}
      <StaticBatch id={`interior-${world}-${scene}`}>
        <Box
          p={[0, -0.4, 0]}
          s={[room.width + 0.6, 0.8, room.depth + 0.6]}
          c="#6f624c"
        />
        <Box p={[0, -0.13, 0]} s={[room.width, 0.3, room.depth]} c="#9d7851" />
        <InteriorCraft
          width={room.width}
          depth={room.depth}
          back={back}
          left={left}
          scene={scene}
        />
        <Box p={[0, 2.8, back]} s={[room.width, 5.6, 0.4]} c="#e6d4b3" />
        <Box p={[left, 2.4, 0]} s={[0.4, 4.8, room.depth]} c="#d8c4a1" />
        {[-1, -0.5, 0, 0.5, 1].map((fraction) => {
          const x = fraction * (room.width / 2 - 0.5);
          return (
            <group key={x}>
              <Box p={[x, 2.8, back + 0.3]} s={[0.36, 5.6, 0.38]} c="#8f6b43" />
              <Box p={[x, 0.35, back + 0.5]} s={[0.65, 0.7, 0.6]} c="#a99874" />
              <Box p={[x, 5.35, back + 0.5]} s={[0.7, 0.45, 0.6]} c="#c4a36b" />
            </group>
          );
        })}
        <Box
          p={[0, 5.6, back + 0.3]}
          s={[room.width + 0.5, 0.38, 0.65]}
          c="#785a39"
        />
        <Box
          p={[0, 0.35, back + 0.3]}
          s={[room.width, 0.45, 0.4]}
          c="#967347"
        />
        <Box
          p={[left + 0.3, 0.35, 0]}
          s={[0.4, 0.45, room.depth]}
          c="#967347"
        />
        {!theater &&
          [-0.75, -0.25, 0.25, 0.75].map((fraction) => (
            <Window
              key={fraction}
              p={[(fraction * room.width) / 2, 3.5, back + 0.3]}
              width={2.4}
            />
          ))}
        {!cognition && !theater && (
          <Sign
            text={name.toUpperCase()}
            p={[0, 4.4, back + 0.55]}
            size={[4.5, 0.65]}
          />
        )}
        {!theater &&
          [-1, 1].map((side) => (
            <group key={side}>
              <Bench
                p={[side * (room.width / 2 - 4.5), 0, room.depth / 2 - 5.2]}
              />
              <Flowers
                p={[side * (room.width / 2 - 2.5), 0, room.depth / 2 - 2.5]}
              />
              {scene !== "secret" && <Bench p={[side * 9, 0, back + 3.5]} />}
            </group>
          ))}
        {scene !== "badminton" && scene !== "go" && !theater && (
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
        {cognition && <CognitionFurnishings />}
        {scene === "kappa" && <HouseInterior />}
        {scene === "kitchen" && <KitchenInterior />}
        {scene === "gym" && <GymFurnishings />}
        {scene === "music" && <BeatLabInterior />}
        {scene === "math" && <MathLabInterior />}
        {scene === "badminton" && (
          <BadmintonCourt onPlayingChange={setBadmintonActive} />
        )}
        {scene === "go" && <GoInterior />}
        {scene === "writing" && <WritingInterior />}
        {theater && (
          <MovieTheaterInterior
            program={world === "korea" ? KOREA_THEATER_PROGRAM : undefined}
            title={world === "korea" ? "Seoul Cinema" : undefined}
          />
        )}
        {scene === "secret" && <SecretRoomInterior claimed={stashClaimed} />}
        {!theater && scene !== "secret" && (
          <RoomDressing scene={scene as PlaceId} />
        )}
        <Box p={[0, 0.1, room.doorZ]} s={[3, 0.12, 2]} c="#4f7966" />
        <Box p={[-1.7, 1.6, room.doorZ + 1]} s={[0.35, 3.2, 0.4]} c="#8c6947" />
        <Box p={[1.7, 1.6, room.doorZ + 1]} s={[0.35, 3.2, 0.4]} c="#8c6947" />
        <Box p={[0, 3.2, room.doorZ + 1]} s={[3.8, 0.38, 0.5]} c="#8c6947" />
        {cognition ? (
          <>
            <CognitionPlaque
              p={[0, 3.685, room.doorZ + 1.05]}
              size={[3.7, 0.55]}
              depth={0.07}
            />
            <Sign
              text="EXIT"
              p={[0, 3.2, room.doorZ + 1.27]}
              size={[1.75, 0.26]}
            />
          </>
        ) : (
          <Sign
            text="EXIT"
            p={[0, 3.55, room.doorZ + 1.05]}
            size={[2.8, 0.55]}
          />
        )}
      </StaticBatch>
      {!badmintonActive && (
        <Walker interior locked={theater && theaterSeated} />
      )}
    </group>
  );
}
