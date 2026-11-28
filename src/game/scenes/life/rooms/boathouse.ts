import type { Kit } from "../kit";
import * as f from "../furniture";
import { onBack, onLeft, wallsOf } from "./common";

function lifeJackets(k: Kit) {
  k.slab([0, 1.5, 0], [2.4, 0.08, 0.08], f.DARK_WOOD);
  for (const x of [-1.1, 1.1]) k.slab([x, 0.78, 0], [0.08, 1.56, 0.08], f.DARK_WOOD);
  for (let i = 0; i < 5; i++) k.box([-0.9 + i * 0.45, 1.1, 0], [0.36, 0.6, 0.2], i % 2 ? "#e07a2f" : "#e9a23b", [0, 0, (i - 2) * 0.03]);
}

/** Boathouse (Stanford): the cox's corner of a working boat bay. */
export function boathouse(k: Kit) {
  const w = wallsOf("boathouse");

  k.at(0, 11, 0, () => f.runner(k, 2.6, 12, "#456d65", "#d1c496"));

  // A shell on slings, back middle, mid-repair.
  k.at(-4.6, -11.4, Math.PI / 2, () => {
    for (const x of [-2.6, 2.6]) {
      k.slab([x, 0.5, -0.4], [0.08, 1.05, 0.08], f.STEEL, [0.3, 0, 0]);
      k.slab([x, 0.5, 0.4], [0.08, 1.05, 0.08], f.STEEL, [-0.3, 0, 0]);
      k.slab([x, 0.96, 0], [0.1, 0.05, 0.7], "#d1c496");
    }
    k.ball([0, 1.16, 0], [4.6, 0.24, 0.36], "#e7bc5c");
    k.slab([0, 1.3, 0], [6.4, 0.05, 0.3], "#5b3e29");
    for (const x of [-2, -0.7, 0.7, 2]) k.slab([x, 1.36, 0], [0.3, 0.06, 0.34], "#c4a578");
    k.at(3.6, 1.2, 0, () => f.crate(k, 0.6));
    k.clutter(() => k.at(-3.4, 1.1, 0.3, () => f.basket(k, "#677b6d")));
  });

  // The cox's table: box, headset, race plan.
  k.at(6.4, -10.6, 0, () => {
    f.rug(k, 5.6, 4.4, "#456d65", "#d1c496");
    k.at(0, -0.8, 0, () => {
      f.desk(k, 2.8, 1.2, "#9f805b");
      k.at(-0.7, 0, 0, () => {
        k.box([0, 0.12, 0], [0.34, 0.24, 0.26], "#2b3134");
        k.slab([0, 0.25, 0.02], [0.24, 0.02, 0.14], "#9cc7d8");
        k.prop(
          { id: "cox-box", label: "Cox box", verb: "Call the start", motion: { kind: "press", depth: 0.03 }, action: { type: "read", title: "Coxswain", text: "He's a coxswain: he steers the boat and calls the race." }, sound: "oar", pop: "📣", anchor: 0.8 },
          () => k.cyl([0.24, 0.1, 0.1], [0.05, 0.16, 0.05], "#a54f38", [0, 0, 0.5]),
        );
      }, 1.01);
      k.at(0.4, 0.1, 0.2, () => f.papers(k, 8), 1.01);
      k.at(1.1, -0.2, 0, () => f.lantern(k, "table-lantern", true), 1.01, 0.6);
    });
    k.at(0, 0.5, 0, () => f.chair(k, "#456d65"));
    k.at(2.4, -1.4, 0, () => f.bell(k, "bell", "Ship's bell"), 0);
    k.at(-2.3, 0.6, 0.3, () => f.erg(k, "erg"));
  });

  // Back wall: jackets, buoys, the stroke-rate clock.
  k.at(4, -17.6, 0, () => lifeJackets(k));
  k.at(-0.4, -17.2, 0, () => {
    for (const [x, z, c] of [[0, 0, "#e07a2f"], [0.7, 0.3, "#f1e8d0"], [0.3, -0.5, "#e9a23b"]] as const) k.ball([x, 0.32, z], [0.32, 0.32, 0.32], c);
    k.at(1.4, 0.6, 0, () => f.bouncyBall(k, "buoy", "soccer", "Buoy"));
  });
  onBack(k, w, 1.7, 3.6, () => f.wallClock(k, "#f1e8d0"));
  for (const x of [-4.25, 4.25]) f.windowLight(k, x, w.backZ, 3.2);

  // Left wall: the race plan and the walk-on story.
  onLeft(k, w, 7.6, 3.4, () => f.whiteboard(k, "race-plan", "Race plan", 2.8, 1.7, ["Race plan", "Steer straight", "Call the start", "Call the sprint", "Bring them home"], "Chalk the next call"));
  onLeft(k, w, -3.4, 3.5, () =>
    f.readableFrame(k, { id: "walk-on", label: "Framed roster", title: "Walk-on", text: "Josh walked on to Stanford men's rowing as a sophomore." }, 1.6, 1.2, ["#f1e8d0", "#8c2f2f", "#456d65"]));
  onLeft(k, w, -7.6, 3.6, () => f.pennant(k, "#8c2f2f"));
  onLeft(k, w, 16.6, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, -12, 4.5, () => f.stringLights(k, -6, 6, 0, 10, 0.24));

  // Team corner, front middle-left: benches round a rug, boots by the wall.
  k.at(-6.4, 9.4, 0, () => {
    f.rug(k, 6, 4.6, "#6e8171", "#d1c496", "#8c2f2f");
    k.at(0, -1.4, 0, () => {
      f.bench(k, 3.2, "#9f805b");
      f.seatSpot(k, "bench", "Team bench", [0, 0.02, 0.05]);
    });
    k.at(-2.2, 0.4, Math.PI / 2, () => f.bench(k, 2.4, "#9f805b"));
    k.at(0.3, 0.6, 0.3, () => f.crate(k, 0.7));
    k.at(0.3, 0.6, 0.3, () => f.lantern(k, "team-lantern", true), 0.7, 0.6);
    k.at(2.2, 0.8, -0.5, () => f.duffel(k, "#8c2f2f"));
    k.at(1.6, -0.3, 0.2, () => f.duffel(k, "#456d65"));
  });
  k.at(6.2, 8.4, 0, () => {
    f.roundRug(k, 2, "#456d65", "#d1c496");
    // Rope coil, megaphone cones, a tool chest.
    for (let i = 0; i < 3; i++) k.cyl([-0.6, 0.08 + i * 0.1, 0.5], [0.5 - i * 0.07, 0.1, 0.5 - i * 0.07], "#b8a073");
    k.at(0.8, -0.3, -0.3, () => f.drawerChest(k, { id: "tools", label: "Tool chest", title: "Tool chest", text: "Rigger nuts, a spanner and a roll of tape." }, 1.1, "#4a655d"));
  });
  k.at(-3.4, 17.2, 0, () => f.wateredPlant(k, "reeds", 1, 1.2, "Pot of reeds"));
  k.at(3.6, 16.8, 0, () => {
    // Wellies, drying.
    for (let i = 0; i < 3; i++) for (const s of [-0.1, 0.1]) k.cyl([i * 0.5 + s, 0.2, 0], [0.08, 0.4, 0.08], ["#456d65", "#e9a23b", "#2b3134"][i]);
  });
}
