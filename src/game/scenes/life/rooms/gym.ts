import type { Kit } from "../kit";
import * as f from "../furniture";
import { byLeft, onLeft, wallsOf } from "./common";

const MAT = "#3c554e";

function kettlebell(k: Kit, c: string, s = 1) {
  k.ball([0, 0.17 * s, 0], [0.17 * s, 0.17 * s, 0.17 * s], c);
  k.slab([0, 0.38 * s, 0], [0.22 * s, 0.05, 0.05], f.STEEL);
}
function plyo(k: Kit, s: number, c: string) {
  k.box([0, s / 2, 0], [s, s, s], c);
  k.slab([0, s / 2, s / 2 + 0.01], [s * 0.4, s * 0.4, 0.02], f.shade(c, 0.7));
}

/** Gym (Stanford): an erg row, a stretch corner, chalk on everything. */
export function gym(k: Kit) {
  const w = wallsOf("gym");

  // Erg row, back left: where the crew does its metres.
  k.at(-7.4, -10.6, 0, () => {
    f.rug(k, 7.4, 5.4, MAT, "#2a3d38");
    k.at(0, 0, 0, () => f.erg(k, "erg"));
    for (const x of [-2.2, 2.2])
      k.at(x, 0, 0, () => {
        // The machines either side are taken (static twins of the one you can pull).
        k.slab([0, 0.16, 0.2], [0.12, 0.08, 2.3], "#9aa3a3");
        for (const z of [-0.85, 1.25]) k.slab([0, 0.07, z], [0.6, 0.12, 0.1], f.STEEL);
        k.cyl([0, 0.52, -0.95], [0.34, 0.14, 0.34], "#2b3134", [0, 0, Math.PI / 2]);
        k.slab([0, 0.36, -0.7], [0.1, 0.5, 0.1], f.STEEL);
        k.box([0, 0.3, 0.75], [0.34, 0.08, 0.3], "#2b3134");
        k.cyl([0, 0.6, -0.3], [0.03, 0.5, 0.03], f.PALE_WOOD, [0, 0, Math.PI / 2]);
      });
    k.at(-3.2, 2, 0, () => f.waterCooler(k, "water"));
  });
  onLeft(k, w, -10.6, 3.5, () =>
    f.readableFrame(k, { id: "crew", label: "Team photo", title: "Coxswain", text: "Josh trains with Stanford men's rowing, where he coxes." }, 2, 1.3, ["#dfe6e2", "#8c2f2f", "#3c554e"]));
  onLeft(k, w, -5.4, 3.8, () =>
    k.prop({ id: "oar", label: "Mounted oar", verb: "Tap the blade", motion: { kind: "wobble", axis: "z", angle: 0.05 }, sound: "oar", anchor: 0, reach: 2.8 }, () => f.mountedOar(k, 4.4, "#8c2f2f")));

  // Free weights, back right.
  k.at(7.6, -10.8, 0, () => {
    f.rug(k, 6.4, 5.4, MAT, "#2a3d38");
    // A squat rack.
    for (const x of [-1, 1]) {
      k.slab([x, 1.2, -1.4], [0.12, 2.4, 0.12], f.STEEL);
      k.slab([x, 0.06, -0.9], [0.14, 0.12, 1.3], f.STEEL);
      k.slab([x, 1.5, -1.3], [0.1, 0.08, 0.3], "#a44b35");
    }
    k.slab([0, 2.38, -1.4], [2.1, 0.1, 0.1], f.STEEL);
    k.cyl([0, 1.56, -1.24], [0.04, 2.6, 0.04], "#bfc5b8", [0, 0, Math.PI / 2]);
    for (const x of [-1.2, 1.2]) k.cyl([x, 1.56, -1.24], [0.36, 0.1, 0.36], "#34494a", [0, 0, Math.PI / 2]);
    // Kettlebells in a row; one swings.
    for (let i = 0; i < 4; i++) k.at(-2 + i * 0.6, 1.6, 0, () => kettlebell(k, ["#a44b35", "#34494a", "#d0b06b", "#34494a"][i], 0.8 + i * 0.12));
    k.at(0.8, 1.6, 0, () =>
      k.prop({ id: "kettlebell", label: "Kettlebell", verb: "Swing", motion: { kind: "wobble", axis: "x", angle: 0.7 }, pivot: [0, 1, 0], sound: "whoosh", anchor: 0.9 }, () => kettlebell(k, "#a44b35", 1.25)));
    k.at(2.2, 0.6, 0.2, () => plyo(k, 0.8, "#a98250"));
    k.at(2.3, -0.5, -0.1, () => plyo(k, 0.55, "#c5a373"));
    k.at(-2.4, -0.4, 0, () => f.bouncyBall(k, "med-ball", "soccer", "Medicine ball"));
  });

  // Stretch corner, front left of centre.
  k.at(-6.6, 9.4, 0, () => {
    f.rug(k, 6, 5, "#567469", "#2a3d38");
    for (const [x, c] of [[-1.6, "#7a5578"], [0, "#4f86a0"], [1.6, "#c98a4b"]] as const) k.slab([x, 0.13, 0.2], [1, 0.04, 2.6], c);
    k.cyl([-1.6, 0.26, -0.7], [0.14, 0.9, 0.14], "#2b3134", [0, 0, Math.PI / 2]);
    k.at(0, -0.6, 0, () =>
      k.prop({ id: "exercise-ball", label: "Exercise ball", verb: "Bounce", motion: { kind: "hop", height: 0.6, bounces: 3 }, sound: "bounce", anchor: 1.2 }, () => k.ball([0, 0.46, 0], [0.46, 0.46, 0.46], "#4f86a0")));
    k.at(1.6, 0.9, 0.3, () => {
      for (const x of [-0.2, 0.2]) k.cyl([x, 0.08, 0], [0.07, 0.3, 0.07], "#a44b35", [0, 0, Math.PI / 2]);
    });
    k.at(2.6, -2, 0, () => f.fan(k, "fan"));
  });

  // Front right: chalk, towels, a bench to catch your breath.
  k.at(6.6, 15.4, 0, () => {
    k.at(-1.6, 0, 0, () => {
      k.cyl([0, 0.45, 0], [0.06, 0.9, 0.06], f.STEEL);
      k.cyl([0, 0.04, 0], [0.3, 0.07, 0.3], f.STEEL);
      k.cyl([0, 0.92, 0], [0.3, 0.14, 0.3], "#2b3134");
      k.prop({ id: "chalk", label: "Chalk bowl", verb: "Chalk up", motion: { kind: "pulse", amount: 0.3 }, pivot: [0, 0.98, 0], sound: "paper", pop: "☁", anchor: 1.4 }, () => k.ball([0, 0.98, 0], [0.24, 0.07, 0.24], "#f1ede2"));
    });
    k.at(0.6, 0, 0, () => {
      f.bench(k, 2.4, "#7c5540");
      f.seatSpot(k, "bench", "Bench", [0, 0.02, 0.05]);
      k.at(0.7, 0, 0.3, () => f.duffel(k, "#8c2f2f"), 0.56);
    });
    k.at(2.6, 0.1, 0, () => {
      // Towel shelf.
      k.box([0, 0.6, 0], [0.9, 1.2, 0.5], "#624a36");
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.cyl([-0.2 + j * 0.4, 0.3 + i * 0.36, 0.2], [0.13, 0.4, 0.13], (i + j) % 2 ? "#dfe6e2" : "#a6b6a4", [Math.PI / 2, 0, 0]);
    });
  });
  k.at(-3.6, 17, 0, () => f.wateredPlant(k, "snake-plant", 1, 1.2, "Snake plant"));

  // Left wall: today's board and a boombox on the bench below it.
  onLeft(k, w, 8.6, 3.3, () => f.whiteboard(k, "board", "Whiteboard", 2.8, 1.7, ["Today", "Lift (a lot)", "Erg with the crew", "Stretch. Water. Repeat."], "Write the next line"));
  byLeft(k, w, 8.6, 0.5, () => {
    f.consoleTable(k, 2, "#46535a");
    k.at(0, 0, 0, () => {
      k.box([0, 0.2, 0], [0.9, 0.4, 0.3], "#2b3134");
      for (const x of [-0.26, 0.26]) k.cyl([x, 0.2, 0.16], [0.13, 0.03, 0.13], "#9aa3a3", [Math.PI / 2, 0, 0]);
      k.prop({ id: "boombox", label: "Boombox", verb: "Play", verbOn: "Stop", motion: { kind: "spin", speed: 5, axis: "z" }, pivot: [0, 0.2, 0], action: { type: "tune", tune: "backroom" }, sound: "tap", pop: "♪", anchor: 0.8 }, () =>
        k.slab([0, 0.2, 0.165], [0.1, 0.03, 0.02], "#c9603f"));
    }, 0.91);
  });
  onLeft(k, w, 0.4, 3.6, () => f.wallClock(k, "#dfe6e2"));
  onLeft(k, w, -15, 3.2, () => f.pennant(k, "#8c2f2f"));

  // Middle, clear of the bench press: racks along the right edge.
  k.at(13.4, -3.6, -Math.PI / 2, () => {
    k.box([0, 0.5, 0], [3, 0.1, 0.5], f.STEEL);
    k.box([0, 0.95, 0], [3, 0.1, 0.5], f.STEEL);
    for (const x of [-1.4, 1.4]) k.slab([x, 0.5, 0], [0.1, 1, 0.5], f.STEEL);
    for (let i = 0; i < 5; i++) for (const y of [0.66, 1.11]) k.ball([-1.1 + i * 0.55, y, 0], [0.16 + i * 0.012, 0.16 + i * 0.012, 0.16 + i * 0.012], y > 1 ? "#a44b35" : "#34494a");
  });
  k.at(-10.4, -3, 0, () => {
    f.roundRug(k, 1.7, MAT, "#2a3d38");
    // Battle rope, coiled.
    for (let i = 0; i < 3; i++) k.cyl([0, 0.1 + i * 0.12, 0], [0.7 - i * 0.12, 0.12, 0.7 - i * 0.12], i % 2 ? "#2b3134" : "#3d4747");
  });
  for (const x of [-12.75, -4.25, 4.25, 12.75]) f.windowLight(k, x, w.backZ, 3);
}
