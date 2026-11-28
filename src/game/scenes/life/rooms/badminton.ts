import type { Kit } from "../kit";
import * as f from "../furniture";
import { onLeft, wallsOf } from "./common";

/** Badminton hall (Stanford): the court stays clear; the life is around it. */
export function badminton(k: Kit) {
  const w = wallsOf("badminton");

  // Players' corner, front right: stringing table, bags, somewhere to sit.
  k.at(7.4, 13.2, 0, () => {
    f.rug(k, 7, 4.6, "#35615a", "#e2cf9f", "#d9b765");
    k.at(-1.2, -0.9, 0, () => {
      f.longTable(k, 3, 1.1, "#9f805b", 0.9);
      k.at(-0.7, 0, 0.5, () => f.racket(k, "#8c2f2f"), 0.98);
      k.at(0.9, 0.1, 0, () =>
        k.prop({ id: "racket", label: "Racket", verb: "Swing", motion: { kind: "wobble", axis: "x", angle: 0.7 }, pivot: [0, 0, 0.5], sound: "swish", anchor: 0.6 }, () => f.racket(k, "#35615a")), 0.98);
      // Tubes of shuttles.
      for (let i = 0; i < 3; i++) k.cyl([0.1 + i * 0.16, 1.14, -0.3], [0.06, 0.32, 0.06], i % 2 ? "#e2cf9f" : "#d9b765");
    });
    k.at(1.9, -0.6, 0, () => f.bouncyBall(k, "shuttle", "shuttle"));
    k.at(-1, 0.9, 0, () => {
      f.bench(k, 2.8, "#9f805b");
      f.seatSpot(k, "bench", "Bench", [0, 0.02, 0.05]);
    });
    k.at(2.6, 1, -0.4, () => f.duffel(k, "#8c2f2f"));
    k.at(2.2, 1.7, 0.5, () => f.duffel(k, "#35615a"));
    k.at(-3, -1.6, 0, () => f.waterCooler(k, "water"));
  });

  // Front left: scoreboard and a fan for July.
  k.at(-6.8, 12.6, 0.3, () => {
    f.roundRug(k, 2.2, "#35615a", "#e2cf9f");
    for (const x of [-0.7, 0.7]) k.slab([x, 0.8, 0], [0.08, 1.6, 0.08], f.STEEL);
    k.box([0, 1.5, 0], [1.9, 1, 0.14], "#2b3134");
    k.slab([-0.45, 1.5, 0.08], [0.7, 0.74, 0.02], "#8c2f2f");
    k.prop({ id: "scoreboard", label: "Scoreboard", verb: "Flip a point", motion: { kind: "flip", height: 0 }, pivot: [0.45, 1.5, 0.09], sound: "card", anchor: 2.2 }, () => k.slab([0.45, 1.5, 0.09], [0.7, 0.74, 0.02], "#35615a"));
    k.at(1.9, 0.9, -0.5, () => f.fan(k, "fan"));
  });
  k.at(-3.2, 17, 0, () => f.wateredPlant(k, "palm", 1, 1.3, "Palm"));

  // Left wall: how he got here.
  onLeft(k, w, 13.6, 3.4, () =>
    f.readableFrame(k, { id: "middle-school", label: "Team photo", title: "Since middle school", text: "Josh played badminton in middle school." }, 1.6, 1.2, ["#e2cf9f", "#35615a", "#8c2f2f"]));
  onLeft(k, w, 11.2, 3.4, () =>
    f.readableFrame(k, { id: "club", label: "Club flyer", title: "Stanford Badminton Club", text: "He joined Stanford's badminton club his freshman year. These days he plays when he can." }, 1.2, 1.7, ["#8c2f2f", "#f1e8d0", "#d9b765"]));
  onLeft(k, w, 4.6, 3.4, () => {
    // Rackets on pegs.
    for (let i = 0; i < 3; i++) {
      const x = -0.8 + i * 0.8;
      k.cyl([x, 0.34, 0.06], [0.2, 0.03, 0.26], ["#35615a", "#8c2f2f", "#d9b765"][i], [Math.PI / 2, 0, 0]);
      k.cyl([x, 0.34, 0.075], [0.16, 0.012, 0.22], f.PAPER, [Math.PI / 2, 0, 0]);
      k.slab([x, -0.14, 0.06], [0.03, 0.5, 0.03], f.STEEL);
      k.slab([x, -0.44, 0.06], [0.05, 0.2, 0.045], f.INK);
    }
  });
  onLeft(k, w, 16.4, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, -14, 3.4, () => f.pennant(k, "#35615a"));

  // Behind the back line: the kit a hall collects.
  k.at(-7.6, -15.8, 0, () => {
    // Shuttle cart.
    k.box([0, 0.6, 0], [1.4, 0.7, 0.9], "#46535a");
    for (const x of [-0.6, 0.6]) for (const z of [-0.36, 0.36]) k.cyl([x, 0.12, z], [0.1, 0.08, 0.1], "#2b3134", [0, 0, Math.PI / 2]);
    k.clutter(() => {
      for (let i = 0; i < 6; i++) k.cone([-0.45 + (i % 3) * 0.45, 1.04, -0.2 + Math.floor(i / 3) * 0.4], [0.1, 0.18, 0.1], "#f1e8d0", [Math.PI, 0, 0]);
    });
    k.at(2.2, 0.2, 0, () => {
      for (let i = 0; i < 4; i++) k.cone([i * 0.5, 0.2, 0], [0.16, 0.4, 0.16], "#e07a2f");
    });
  });
  k.at(7, -16, 0, () => {
    // Spare net, rolled; a bench of towels.
    k.cyl([0, 0.2, 0], [0.2, 3.4, 0.2], "#dfe6e2", [0, 0, Math.PI / 2]);
    k.at(0, 1.4, 0, () => f.bench(k, 2.6, "#9f805b"));
    k.at(-0.6, 1.4, 0, () => f.duffel(k, "#d9b765"), 0.56);
    k.at(3, 0.8, 0, () => f.lantern(k, "corner-lantern", true));
  });
  for (const x of [-12.75, -4.25, 4.25, 12.75]) f.windowLight(k, x, w.backZ, 2.6);
}
