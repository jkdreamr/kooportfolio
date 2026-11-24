import { useGameMode, startGameMode } from "../core/gameMode";
import { roomFor } from "../core/room";
import { newCookingGame, SOUP_INGREDIENTS } from "../core/interiorGames";
import { Box, Cylinder, Ring } from "../world/Models";
import {
  Barrel,
  Bottle,
  Plant,
  Stool,
  Table,
  Shelf,
  gameIsActive,
  type InteriorGameProps,
} from "./InteriorProps";
import { CraftedBox, WallSconce, Customer } from "./CraftedDetails";
import { HouseRooms } from "./HouseRooms";
import { DiningSet, SupplyRack } from "./HouseWingFurniture";
import { Produce, Crate, Cabinet, HangingPan, Stove } from "./KitchenProps";
import { PapaKitchenGame } from "./PapaKitchenGame";
const room = roomFor("kitchen"),
  backWall = -room.depth / 2 + 0.5,
  leftWall = -room.width / 2 + 0.5,
  tileColumns = Math.floor((room.width - 1) / 0.83);

export function KitchenInterior({ onReward }: InteriorGameProps) {
  const playing = useGameMode((s) => s.active?.id === "kitchen");
  const game = newCookingGame();
  const play = () => {
    startGameMode("kitchen");
  };
  return (
    <group>
      <group visible={!playing}>
        {/* A ceramic backsplash, not another room shell. */}
        <HouseRooms scene="kitchen" />
        {Array.from({ length: tileColumns * 2 }, (_, i) => (
          <CraftedBox
            key={i}
            p={[
              ((i % tileColumns) - (tileColumns - 1) / 2) * 0.83,
              1.9 + Math.floor(i / tileColumns) * 0.57,
              backWall - 0.05,
            ]}
            s={[0.78, 0.51, 0.14]}
            c={i % 3 === 0 ? "#7d9d8a" : "#e7d6aa"}
          />
        ))}
        <group position={[leftWall + 4.5, 0, backWall + 1]}>
          <Cabinet p={[0, 0, 0]} width={4.1} />
          {SOUP_INGREDIENTS.map((kind, i) => (
            <Crate
              key={kind}
              p={[-1.3 + i * 1.3, 1.35, 0]}
              kind={kind}
              taken={game.ingredients.includes(kind)}
              onTake={play}
            />
          ))}
          <Shelf p={[0, 3.2, -0.65]} width={4.2} />
          {[-1.5, -1.1, -0.7].map((x) => (
            <Bottle key={x} p={[x, 3.3, -0.65]} color="#8e984e" />
          ))}
          {[-0.1, 0.6, 1.3].map((x, i) => (
            <group key={x}>
              <Cylinder
                p={[x, 3.58, -0.65]}
                s={[0.24, 0.6, 0.24]}
                c={["#d6b877", "#b6804b", "#c4cb9b"][i]}
              />
              <Cylinder
                p={[x, 3.9, -0.65]}
                s={[0.26, 0.08, 0.26]}
                c="#83512e"
              />
              <Box p={[x, 3.55, -0.4]} s={[0.22, 0.2, 0.025]} c="#f3e3b5" />
            </group>
          ))}
        </group>
        <group
          position={[leftWall + 0.9, 0, -4.7]}
          scale={1.3}
          rotation={[0, Math.PI / 2, 0]}
        >
          <Cabinet p={[0, 0, 0]} width={3.4} />
          <Box p={[0, 1.35, 0]} s={[1.5, 0.11, 0.9]} c="#577f78" />
          <Box p={[0, 1.4, 0]} s={[1.22, 0.08, 0.68]} c="#a3b9a2" />
          <Ring
            p={[0, 1.65, -0.45]}
            radius={0.24}
            tube={0.045}
            r={[0, 0, 0]}
            c="#b99b53"
          />
          <Box p={[0, 1.62, -0.3]} s={[0.08, 0.12, 0.3]} c="#b99b53" />
          <Box p={[1.15, 1.4, 0]} s={[0.5, 0.08, 0.6]} c="#d3d5b6" />
          <Box p={[1.15, 1.45, 0]} s={[0.36, 0.02, 0.5]} c="#8aa695" />
        </group>
        <CraftedBox
          p={[leftWall, 3.5, -4.7]}
          s={[0.18, 0.18, 5.5]}
          c="#674a32"
        />
        {[-6.4, -4.7, -3].map((z, i) => (
          <HangingPan
            key={z}
            p={[leftWall + 0.1, 2.65, z]}
            radius={0.38 + i * 0.055}
          />
        ))}
        <Stove stage={game.stage} onFinish={play} />
        <group position={[-1.8, 0, -4]} scale={1.45}>
          <Table size={[3.8, 1.8]} />
          <CraftedBox p={[0, 1.27, 0]} s={[3.9, 0.25, 1.95]} c="#dfbb75" />
          {[-1.3, -0.65, 0, 0.65, 1.3].map((x) => (
            <Box
              key={x}
              p={[x, 1.355, 0]}
              s={[0.017, 0.012, 1.83]}
              c="#b88b47"
            />
          ))}
          <group
            onClick={(e) => {
              e.stopPropagation();
              if (gameIsActive()) play();
            }}
          >
            <Box p={[-0.35, 1.4, 0]} s={[1.65, 0.09, 1.15]} c="#a7763e" />
            <Cylinder p={[0.58, 1.4, 0]} s={[0.2, 0.07, 0.2]} c="#a7763e" />
            {game.stage === "chop" &&
              game.ingredients.map((kind, i) => (
                <Produce
                  key={kind}
                  kind={kind}
                  p={[-0.8 + i * 0.45, 1.58, 0]}
                />
              ))}
            {game.chops > 0 &&
              Array.from({ length: game.chops * 3 }, (_, i) => (
                <Box
                  key={i}
                  p={[
                    -0.85 + (i % 4) * 0.3,
                    1.52,
                    -0.28 + Math.floor(i / 4) * 0.25,
                  ]}
                  s={[0.15, 0.13, 0.12]}
                  c={["#cd5438", "#e69a37", "#5c8c3d"][i % 3]}
                  r={[0, i * 0.7, 0]}
                />
              ))}
            <group position={[-0.9, 1.64, -0.42]}>
              <Box p={[0.28, 0, 0]} s={[0.62, 0.26, 0.035]} c="#d7d8bf" />
              <Box p={[-0.18, 0.04, 0]} s={[0.3, 0.11, 0.1]} c="#513c28" />
            </group>
          </group>
          <Cylinder p={[1.25, 1.51, 0]} s={[0.28, 0.35, 0.28]} c="#d9c38b" />
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              p={[1.12 + i * 0.13, 1.9, 0]}
              s={[0.05, 0.65, 0.05]}
              c="#81603c"
              r={[0, 0, (i - 1) * 0.2]}
            />
          ))}
          <Shelf p={[0, 0.3, 0]} width={3.3} />
          {[-0.9, 0, 0.9].map((x) => (
            <Cylinder
              key={x}
              p={[x, 0.56, 0]}
              s={[0.33, 0.4, 0.33]}
              c="#bd8c4c"
            />
          ))}
        </group>
        <group position={[8.8, 0, -3.5]} scale={1.2}>
          <Table size={[1.65, 2.4]} />
          <Box p={[0, 1.26, 0]} s={[1.7, 0.05, 2.45]} c="#c3d1b1" />
          {[-0.65, 0.15, 0.85].map((z, i) => (
            <group key={z}>
              <Cylinder p={[0, 1.32, z]} s={[0.42, 0.05, 0.42]} c="#eee0b9" />
              <Cylinder p={[0, 1.46, z]} s={[0.29, 0.22, 0.29]} c="#dfc98f" />
              <Cylinder
                p={[0, 1.58, z]}
                s={[0.24, 0.015, 0.24]}
                c={
                  game.stage === "done" || (game.stage === "serve" && i === 0)
                    ? game.quality === "burnt"
                      ? "#5c4533"
                      : "#d77a35"
                    : "#c6b782"
                }
              />
            </group>
          ))}
          <Stool p={[0, 0, 2]} color="#598074" />
        </group>
        <Barrel p={[-9.1, 0, 0.5]} />
        <Plant p={[9.2, 0, 9]} />
        <WallSconce p={[-1.6, 3.3, backWall]} />
        <WallSconce p={[9, 3.3, backWall]} />
        <SupplyRack p={[leftWall + 0.5, 0, -12.5]} rotation={Math.PI / 2} />
        <SupplyRack p={[-leftWall - 0.5, 0, -7.5]} rotation={-Math.PI / 2} />
        <group position={[-leftWall - 4, 0, backWall + 1]}>
          <Cabinet p={[0, 0, 0]} width={4} />
          <Cylinder p={[-0.9, 1.7, 0]} s={[0.34, 0.65, 0.34]} c="#657d70" />
          <Cylinder p={[-0.9, 2.04, 0]} s={[0.38, 0.09, 0.38]} c="#c3a367" />
          {[0, 1, 2].map((i) => (
            <Cylinder
              key={i}
              p={[0.25 + i * 0.5, 1.5, 0.1]}
              s={[0.16, 0.28, 0.16]}
              c="#ded5b4"
            />
          ))}
        </group>
        <DiningSet p={[-12.4, 0, 12]} />
        <DiningSet p={[12.4, 0, 12]} />
        <Plant p={[-15.3, 0, 17.4]} />
        <Plant p={[15.3, 0, 17.4]} />
        <group
          position={[0, 0, 2.4]}
          onClick={(event) => {
            event.stopPropagation();
            if (gameIsActive()) play();
          }}
        >
          <CraftedBox p={[0, 0.76, 0]} s={[14.8, 1.5, 1.35]} c="#365e50" />
          <CraftedBox p={[0, 1.58, 0]} s={[15.2, 0.3, 1.65]} c="#bd914f" />
          <CraftedBox p={[0, 1.77, 0]} s={[14.6, 0.12, 1.38]} c="#ecd3a0" />
          {[-6, -3, 0, 3, 6].map((x) => (
            <group key={x}>
              <CraftedBox
                p={[x, 0.83, 0.69]}
                s={[2.5, 1.1, 0.12]}
                c="#4b7b65"
              />
              <CraftedBox
                p={[x, 0.3, 0.78]}
                s={[2.3, 0.09, 0.1]}
                c="#d1ab5b"
                metal
              />
            </group>
          ))}
          {[0, 1, 2].map((seat) => (
            <group
              key={seat}
              position={[-4.8 + seat * 4.8, 0, 1.9]}
              rotation={[0, Math.PI, 0]}
              scale={1.3}
            >
              <Customer
                p={[0, 0, 0]}
                color={["#8e4535", "#3e6d7f", "#7b7242"][seat]}
                index={seat}
              />
            </group>
          ))}
        </group>
        {[-6, 6].map((x) => (
          <group key={x} position={[x, 0, 14.4]}>
            <Table size={[3, 2]} />
            <CraftedBox p={[0, 1.26, 0]} s={[3.2, 0.18, 2.2]} c="#cba268" />
            {[-1, 1].map((side) => (
              <Stool key={side} p={[side * 1.8, 0, 0]} color="#9e4f36" />
            ))}
            <Bottle p={[0, 1.4, 0]} color="#608255" />
          </group>
        ))}
      </group>
      <PapaKitchenGame onReward={onReward} />
    </group>
  );
}
