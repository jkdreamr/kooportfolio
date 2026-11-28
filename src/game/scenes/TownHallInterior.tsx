import { BannerRush } from "./BannerRush";
import { Ball, Bench, Box, Cone, Cylinder, Flowers, Ring } from "../world/Models";
import { useGame } from "../core/store";
import { roomFor } from "../core/room";
import { TOWN_HALL_STORY } from "../../content/room-stories";
import { Plaque } from "../world/Plaque";
import { TOWN_HALL_COLUMNS, TOWN_HALL_HEARTH, TOWN_HALL_TABLE } from "../core/houseRooms";

const T = TOWN_HALL_TABLE;
const TOP = 1.08;

/** A tiny village on the table: the street rows, the lane, the keep. */
function VillageModel() {
  const houses: [number, number, string, string][] = [
    [-0.75, -1.6, "#c9a36e", "#a3523d"],
    [-0.75, -0.5, "#d8c5a0", "#3f6a52"],
    [-0.75, 0.6, "#c4a573", "#b8582e"],
    [0.75, -1.6, "#d7c39b", "#3f6a52"],
    [0.75, -0.5, "#bca07b", "#9e2c30"],
    [0.75, 0.6, "#cfb489", "#3f6a52"],
    [-0.75, 1.9, "#d4bd94", "#a35538"],
    [0.75, 1.9, "#c8b088", "#345f50"],
  ];
  return (
    <group position={[T.x, TOP, T.z]}>
      <Box p={[0, 0.07, 0]} s={[2.5, 0.12, 8.2]} c="#6c9746" />
      {/* The high street and the rear lane in packed earth. */}
      <Box p={[0, 0.14, 0.05]} s={[0.42, 0.03, 5.2]} c="#b9a27c" />
      <Box p={[0, 0.14, -2.45]} s={[2.1, 0.03, 0.3]} c="#b9a27c" />
      {houses.map(([x, z, wall, roof]) => (
        <group key={`${x}/${z}`} position={[x, 0.13, z]}>
          <Box p={[0, 0.16, 0]} s={[0.62, 0.32, 0.72]} c={wall} />
          <Box p={[0, 0.38, 0]} s={[0.7, 0.14, 0.8]} c={roof} />
        </group>
      ))}
      {/* The keep at the head of the model, with its green cone. */}
      <group position={[0, 0.13, -3.2]}>
        <Cylinder p={[0, 0.03, 0]} s={[0.52, 0.06, 0.52]} c="#8c8a82" />
        <Cylinder p={[0, 0.3, 0]} s={[0.42, 0.5, 0.42]} c="#a9a9a2" />
        <Cone p={[0, 0.82, 0]} s={[0.58, 0.55, 0.58]} c="#3f6a52" />
        <Ball p={[0, 1.13, 0]} s={[0.07, 0.07, 0.07]} c="#e8c26e" />
      </group>
      {/* Allotments, a pond and a few trees at the foot. */}
      {[-0.7, 0.7].map((x) => (
        <Box key={x} p={[x, 0.15, 3.3]} s={[0.7, 0.05, 0.8]} c="#6f5236" />
      ))}
      <Cylinder p={[0, 0.14, 3.55]} s={[0.32, 0.03, 0.22]} c="#5f8f99" />
      {[
        [-1.05, -2.6],
        [1.05, -2.8],
        [-1.05, 2.9],
        [1.05, 3.0],
        [1.05, -3.6],
      ].map(([x, z]) => (
        <group key={`${x}/${z}`} position={[x, 0.13, z]}>
          <Cylinder p={[0, 0.08, 0]} s={[0.04, 0.16, 0.04]} c="#6a4b30" />
          <Ball p={[0, 0.25, 0]} s={[0.16, 0.16, 0.16]} c={z > 0 ? "#c98a3c" : "#5d7f45"} />
        </group>
      ))}
    </group>
  );
}

const room = roomFor("townhall");
const BACK = -room.depth / 2 + 0.2;

/** A broad stone hearth on the west wall, banked embers and a mantel. */
function Hearth() {
  const H = TOWN_HALL_HEARTH;
  return (
    <group position={[H.x, 0, H.z]}>
      <Box p={[0.15, 1.35, 0]} s={[1.1, 2.7, 3.4]} c="#8c8a82" />
      <Box p={[0.62, 0.95, 0]} s={[0.3, 1.5, 1.9]} c="#2c2621" />
      <Box p={[0.55, 0.32, 0]} s={[0.5, 0.18, 1.7]} c="#4a3f35" />
      {[-0.35, 0.05, 0.4].map((z, i) => (
        <Cylinder key={z} p={[0.6, 0.5, z]} s={[0.14, 0.9, 0.14]} r={[Math.PI / 2, 0, 0.3 * (i - 1)]} c="#6b4a2c" />
      ))}
      <Box p={[0.66, 0.44, 0]} s={[0.24, 0.1, 1.2]} c="#e07a3a" />
      <Box p={[0.67, 0.5, 0.05]} s={[0.16, 0.06, 0.7]} c="#ffb35c" />
      <Box p={[0.5, 2.78, 0]} s={[0.95, 0.22, 3.8]} c="#6b4a2c" />
      <Box p={[0.15, 3.6, 0]} s={[0.9, 1.6, 2.2]} c="#a9a9a2" />
      {[-1.4, 1.4].map((z) => (
        <group key={z} position={[0.6, 2.9, z]}>
          <Cylinder p={[0, 0.05, 0]} s={[0.14, 0.06, 0.14]} c="#b08a4e" />
          <Cylinder p={[0, 0.3, 0]} s={[0.06, 0.45, 0.06]} c="#f1e6c8" />
        </group>
      ))}
      <Ball p={[0.62, 3.05, 0]} s={[0.32, 0.26, 0.32]} c="#a3523d" />
      {/* A log basket by the hearth. */}
      <Box p={[0.75, 0.3, 2.35]} s={[0.8, 0.6, 0.8]} c="#7a5634" />
      {[-0.18, 0.18].map((z) => (
        <Cylinder key={z} p={[0.75, 0.68, 2.35 + z]} s={[0.16, 0.7, 0.16]} r={[0, 0, Math.PI / 2]} c="#8a603a" />
      ))}
    </group>
  );
}

/** Furnishings of the hall: the long table and its model, four round stone
 * columns, two banners in the visitor's colour, and the launcher ring at
 * the table's foot where Banner Rush starts. */
export function TownHallInterior() {
  const banner = useGame((s) => s.save.color);
  const halfX = T.width / 2;
  return (
    <>
      {/* The table on four stout legs, benches either side. */}
      <Box p={[T.x, TOP - 0.08, T.z]} s={[3.1, 0.16, 9]} c="#8a603a" />
      <Box p={[T.x, TOP - 0.22, T.z]} s={[2.8, 0.14, 8.6]} c="#6b4a2c" />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}/${sz}`} p={[T.x + sx * 1.25, (TOP - 0.2) / 2, T.z + sz * 3.9]} s={[0.3, TOP - 0.2, 0.3]} c="#5a3f27" />
        )),
      )}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box p={[T.x + side * (halfX - 0.35), 0.48, T.z]} s={[0.6, 0.12, 8.6]} c="#8a603a" />
          {[-3.6, 0, 3.6].map((dz) => (
            <Box key={dz} p={[T.x + side * (halfX - 0.35), 0.22, T.z + dz]} s={[0.42, 0.44, 0.24]} c="#5a3f27" />
          ))}
        </group>
      ))}
      <VillageModel />
      {/* A runner from the door to the table's foot. */}
      <Box p={[0, 0.07, 9.5]} s={[2.8, 0.04, 13]} c="#3f6a52" />
      <Box p={[0, 0.08, 9.5]} s={[2.3, 0.04, 12.6]} c="#4d7c5f" />
      {/* The plaque, word for word, under the hall's name. */}
      <Plaque text={TOWN_HALL_STORY.text} p={[0, 1.78, BACK + 0.62]} size={[5.2, 1.8]} />
      <Hearth />
      {/* Banner Rush starts from the launcher ring at the table's foot. */}
      <BannerRush room="townhall" />
      {/* The launcher ring at the table's foot. */}
      <Cylinder p={[0, 0.08, T.z + T.depth / 2 + 1.6]} s={[1.5, 0.05, 1.5]} c="#6e8a5a" />
      <Ring p={[0, 0.13, T.z + T.depth / 2 + 1.6]} radius={1.36} tube={0.05} c="#e8c26e" />
      {/* Round stone columns echo the keep outside. */}
      {[-1, 1].flatMap((sx) =>
        TOWN_HALL_COLUMNS.filter((c) => Math.sign(c.x) === sx).map(({ x, z }) => (
          <group key={`${x}/${z}`} position={[x, 0, z]}>
            <Cylinder p={[0, 0.3, 0]} s={[0.95, 0.6, 0.95]} c="#8c8a82" />
            <Cylinder p={[0, 2.9, 0]} s={[0.7, 4.6, 0.7]} c="#a9a9a2" />
            <Cylinder p={[0, 5.3, 0]} s={[0.9, 0.3, 0.9]} c="#c6c4ba" />
          </group>
        )),
      )}
      {/* Two long banners on the back wall, either side of the name. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 6.4, 0, -19.4]}>
          <Box p={[0, 5.0, 0.04]} s={[1.6, 0.1, 0.1]} c="#4f3a28" />
          <Box p={[0, 3.55, 0.06]} s={[1.2, 2.8, 0.08]} c={banner} />
          {[4.6, 2.5].map((y) => (
            <Box key={y} p={[0, y, 0.11]} s={[1.22, 0.12, 0.04]} c="#efe2bf" />
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Bench p={[side * 12.5, 0, -2]} rotation={side * Math.PI / 2} />
          <Flowers p={[side * 12.5, 0, -14]} />
        </group>
      ))}
    </>
  );
}
