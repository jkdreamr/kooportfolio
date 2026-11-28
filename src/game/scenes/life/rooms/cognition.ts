import type { Kit } from "../kit";
import * as f from "../furniture";
import { byLeft, onLeft, wallsOf } from "./common";

/** Cognition (Korea): an office that is hiring, with coffee on. */
export function cognition(k: Kit) {
  const w = wallsOf("cognition");

  // Meeting table, back middle.
  k.at(0, -11.6, 0, () => {
    f.rug(k, 8.4, 5, "#2f4a55", "#dfe6e2", "#7fb0c4");
    f.longTable(k, 5.4, 1.6, "#c9b28a");
    for (const x of [-1.8, -0.6, 0.6, 1.8]) {
      k.at(x, -1.25, 0, () => f.chair(k, "#2f4a55", f.STEEL));
      k.at(x, 1.25, Math.PI, () => f.chair(k, "#2f4a55", f.STEEL));
    }
    k.at(-1.5, 0.1, 0.2, () => f.laptop(k, "#7fb0c4"), 1.02);
    k.at(0.9, -0.1, Math.PI + 0.2, () => f.laptop(k, "#7fb0c4"), 1.02);
    k.at(-0.2, 0, 0, () => f.papers(k, 3), 1.02);
    k.at(2.2, 0, 0, () => f.tableLamp(k, "table-lamp", true, "#7fb0c4"), 1.02);
    k.clutter(() => {
      k.at(0.3, 0.4, 0, () => f.mug(k), 1.02);
      k.at(-0.9, -0.4, 0, () => f.mug(k, "#2f4a55"), 1.02);
    });
  });

  // Coffee bar, front right.
  k.at(7.2, 14.8, 0, () => {
    f.rug(k, 6, 3.6, "#3f5d55", "#dfe6e2");
    k.at(0, -0.6, 0, () => {
      f.sideboard(k, 3.6, 1, "#2b3a40", "#3f5d55");
      k.at(-1.1, 0, 0, () => {
        k.box([0, 0.26, 0], [0.5, 0.52, 0.44], "#2b3134");
        k.slab([0, 0.12, 0.24], [0.3, 0.04, 0.12], f.STEEL);
        k.prop({ id: "coffee", label: "Coffee machine", verb: "Brew a cup", motion: { kind: "pulse", amount: 0.18 }, pivot: [0, 0.14, 0.28], sound: "swish", pop: "☕", anchor: 0.9 }, () => f.mug(k));
      }, 1.07);
      for (let i = 0; i < 4; i++) k.at(0.1 + i * 0.3, i % 2 ? 0.1 : -0.08, 0, () => f.mug(k, ["#dfe6e2", "#7fb0c4", "#3f5d55", "#e8c66a"][i]), 1.07);
      k.at(1.5, 0, 0, () => f.fruitBowl(k), 1.07);
    });
    for (const x of [-1, 0.4]) k.at(x, 0.7, 0, () => f.stool(k, "#3f5d55"));
    k.at(2.6, -0.4, 0, () => f.waterCooler(k, "water"));
    k.at(-2.7, -0.6, 0, () => f.wateredPlant(k, "ficus", 2, 1.2, "Ficus"));
  });

  // Waiting area, front left: where candidates sit.
  k.at(-6.8, 15.4, 0, () => {
    f.rug(k, 6, 3.6, "#2f4a55", "#dfe6e2", "#7fb0c4");
    k.at(0, -1, 0, () => {
      f.sofa(k, 3.2, "#4e7480", "#e8c66a");
      f.seatSpot(k, "sofa", "Sofa", [0.5, 0.04, 0.12]);
    });
    k.at(0, 0.6, 0, () => {
      f.coffeeTable(k, 1.6, 0.8, "#c9b28a");
      k.at(0, 0, 0.2, () => f.bookStack(k, 2, 9), 0.51);
    });
    k.at(2.5, -1, 0, () => f.floorLamp(k, "floor-lamp", true, "#dfe6e2"));
    k.at(-2.6, 0.2, Math.PI / 2, () => f.armchair(k, "#3f5d55"));
  });
  k.at(3.4, 12.6, -0.2, () =>
    f.standingBoard(k, { id: "hiring", label: "Notice board", title: "Hiring for Korea", text: "Cognition is hiring for Korea. Message or DM Joshua." }, 5));

  // Mid room, either side of the desk lane.
  k.at(-8.6, -4.6, 0, () => {
    f.roundRug(k, 2.2, "#3f5d55", "#dfe6e2");
    k.at(0, 0, 0, () => f.globe(k, "globe", true));
    k.at(1.5, 0.6, -0.6, () => f.pouf(k, "#e8c66a"));
    k.at(-1.4, 0.8, 0.5, () => f.pouf(k, "#4e7480"));
  });
  k.at(7.6, -5, 0, () => {
    f.rug(k, 4.4, 3.4, "#2f4a55", "#dfe6e2");
    k.at(0, -0.6, 0, () => f.desk(k, 2.6, 1.1, "#c9b28a"));
    k.at(-0.5, -0.6, 0, () => f.monitor(k, "#7fb0c4"), 1.01);
    k.at(0.75, -0.4, 0, () => f.notebook(k, { id: "devin", label: "Notebook", title: "Devin", text: "Cognition makes Devin, the AI software engineer." }, "#2f4a55"), 1.01);
    k.at(0, 0.6, 0, () => f.chair(k, "#2f4a55", f.STEEL));
    k.at(2, -1, 0, () => f.plant(k, 1, 1.1));
  });

  // Left wall: the plan, the title, two clocks an ocean apart.
  onLeft(k, w, -5.6, 3.3, () =>
    f.whiteboard(k, "plan", "Whiteboard", 3.2, 1.8, ["Korea", "1. Hire for Korea", "2. Message or DM Joshua", "3. Say hello: annyeong!"], "Write the next line"));
  onLeft(k, w, 8.4, 3.4, () =>
    f.readableFrame(k, { id: "title", label: "Framed card", title: "Chief of Staff, APAC", text: "Josh leads Cognition's Korea efforts as Chief of Staff, APAC." }, 1.6, 1.1, ["#dfe6e2", "#2f4a55", "#7fb0c4"], f.STEEL));
  onLeft(k, w, -10.4, 3.7, () => f.wallClock(k, "#dfe6e2"));
  onLeft(k, w, -11.6, 3.7, () => f.wallClock(k, "#dfe6e2"));
  onLeft(k, w, 15.2, 1.6, () => f.lightSwitch(k));
  byLeft(k, w, -15.6, 0.5, () => f.plant(k, 2, 1.3));
  byLeft(k, w, 8.4, 0.5, () => {
    f.consoleTable(k, 2, "#2b3a40");
    k.at(0.5, 0, 0, () => f.bell(k, "bell", "Desk bell"), 0.91);
    k.at(-0.5, 0, 0, () => f.vase(k, "#7fb0c4", "#dfe6e2"), 0.91);
  });
  for (const x of [-4.25, 4.25]) f.windowLight(k, x, w.backZ, 4.2);
  k.at(-4.6, -16.4, 0.3, () => f.plant(k, 1, 1.2));
  k.at(5.2, -16.6, 0, () => f.boxStack(k, 7));
}
