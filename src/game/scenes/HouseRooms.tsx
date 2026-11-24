import { HOUSE_DOORS, HOUSE_PARTITIONS } from "../core/houseRooms";
import { Sign } from "../world/Models";
import { CraftedBox, BrassStud } from "./CraftedDetails";

/** Cutaway internal rooms, never a second outer shell or village entrance. */
export function HouseRooms({ scene }: { scene: "kappa" | "kitchen" }) {
  const kitchen = scene === "kitchen";
  return (
    <group>
      {HOUSE_PARTITIONS[scene].map((wall, index) => (
        <group key={index}>
          <CraftedBox
            p={[wall.x, 0.72, wall.z]}
            s={[wall.width, 1.44, wall.depth]}
            c={kitchen ? "#8a9d85" : "#647762"}
          />
          <CraftedBox
            p={[wall.x, 0.22, wall.z]}
            s={[wall.width + 0.06, 0.3, wall.depth + 0.08]}
            c="#5a4230"
          />
          <CraftedBox
            p={[wall.x, 1.46, wall.z]}
            s={[wall.width + 0.08, 0.2, wall.depth + 0.12]}
            c={kitchen ? "#b18a50" : "#8d643a"}
          />
          {Array.from(
            {
              length: Math.max(
                1,
                Math.floor(Math.max(wall.width, wall.depth) / 1.4),
              ),
            },
            (_, i) => {
              const count = Math.max(
                1,
                Math.floor(Math.max(wall.width, wall.depth) / 1.4),
              );
              return (
                <CraftedBox
                  key={i}
                  p={[
                    wall.x +
                      (wall.width > wall.depth
                        ? ((i + 0.5) * wall.width) / count - wall.width / 2
                        : 0),
                    0.77,
                    wall.z +
                      (wall.depth > wall.width
                        ? ((i + 0.5) * wall.depth) / count - wall.depth / 2
                        : 0),
                  ]}
                  s={
                    wall.width > wall.depth
                      ? [0.1, 1.1, wall.depth + 0.04]
                      : [wall.width + 0.04, 1.1, 0.1]
                  }
                  c="#aa8550"
                />
              );
            },
          )}
        </group>
      ))}
      {HOUSE_DOORS[scene].map((door, index) => (
        <group
          key={index}
          position={[door.x, 0, door.z]}
          rotation={[0, door.axis === "z" ? Math.PI / 2 : 0, 0]}
        >
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (door.width / 2 + 0.2), 0, 0]}>
              <CraftedBox p={[0, 1.34, 0]} s={[0.4, 2.68, 0.48]} c="#795535" />
              <CraftedBox p={[0, 0.24, 0]} s={[0.5, 0.48, 0.58]} c="#a79b78" />
              <BrassStud p={[0, 1.6, 0.27]} radius={0.07} />
            </group>
          ))}
          <CraftedBox
            p={[0, 2.65, 0]}
            s={[door.width + 0.8, 0.4, 0.55]}
            c="#795535"
          />
          <CraftedBox
            p={[0, 2.85, 0]}
            s={[door.width + 1, 0.12, 0.65]}
            c="#b28d4d"
          />
          <CraftedBox
            p={[0, 2.65, 0.3]}
            s={[Math.min(door.width, 2.5), 0.44, 0.13]}
            c="#293e31"
          />
          <Sign
            text={door.label}
            p={[0, 2.65, 0.375]}
            size={[Math.min(door.width - 0.15, 2.3), 0.35]}
            color="#293e31"
            ink="#e0c285"
          />
        </group>
      ))}
      {kitchen ? (
        <>
          <CraftedBox p={[-8.1, 0.07, -5.9]} s={[5, 0.06, 12.5]} c="#858c70" />
          <CraftedBox
            p={[2.7, 0.07, -5.9]}
            s={[15.5, 0.06, 12.5]}
            c="#b5b597"
          />
          {[-9, -7, -5, -3, -1].map((z) => (
            <CraftedBox
              key={z}
              p={[2.7, 0.105, z]}
              s={[15.3, 0.01, 0.035]}
              c="#8a947c"
            />
          ))}
        </>
      ) : (
        <>
          <CraftedBox p={[-5, 0.07, 6.8]} s={[9.6, 0.07, 9.1]} c="#7b3b32" />
          <CraftedBox p={[-5, 0.115, 6.8]} s={[9.1, 0.02, 8.6]} c="#a46445" />
          <CraftedBox p={[6, 0.07, 6.3]} s={[7.5, 0.07, 8.7]} c="#344e3c" />
          <CraftedBox p={[6, 0.115, 6.3]} s={[7.1, 0.02, 8.3]} c="#4d6c4b" />
        </>
      )}
    </group>
  );
}
