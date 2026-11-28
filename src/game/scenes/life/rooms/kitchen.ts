import type { Kit } from "../kit";
import * as f from "../furniture";
import { byLeft, onLeft, wallsOf } from "./common";

/** Kitchen (home): a dining room that expects company, a pantry that is used. */
export function kitchen(k: Kit) {
  const w = wallsOf("kitchen");

  // The long table: set for a small dinner, candles already lit.
  k.at(0, 8.6, 0, () => {
    f.rug(k, 9, 4.6, "#7d4a3a", "#e2cf9f", "#d9b765");
    f.longTable(k, 6, 1.5, "#8e6138");
    k.at(0, 0, 0, () => f.placeSettings(k, 5.4, 1.5, 4), 1.02);
    k.at(-1.2, 0, 0, () => f.candles(k), 1.02);
    k.at(1.3, 0, 0, () => f.vase(k, "#7d9d8a", "#e69a37"), 1.02);
    k.at(0, 0, 0.3, () => f.fruitBowl(k), 1.02);
    for (const x of [-2, -0.7, 0.7, 2]) {
      k.at(x, -1.2, 0, () => f.chair(k, "#365e50", "#51392a"));
      if (x !== 0.7) k.at(x, 1.2, Math.PI, () => f.chair(k, "#365e50", "#51392a"));
    }
    k.at(0.7, 1.2, Math.PI, () => {
      f.chair(k, "#9e4f36", "#51392a");
      f.seatSpot(k, "chair", "Empty chair", [0, 0.04, 0]);
    });
  });

  // Host stand by the door: a bell, and the book for the dinners.
  k.at(3.6, 15.6, -0.3, () => {
    k.box([0, 0.6, 0], [1.1, 1.2, 0.6], "#365e50");
    k.slab([0, 1.23, 0], [1.24, 0.07, 0.72], "#bd914f");
    k.at(-0.3, 0.05, 0, () => f.bell(k, "bell", "Service bell"), 1.27);
    k.at(0.25, 0.05, 0, () =>
      f.notebook(k, { id: "guest-book", label: "Guest book", title: "kookwleigh", text: "One of Josh's side projects: kookwleigh, intimate dinners, by invitation." }, "#7d4a3a"), 1.27);
  });
  k.at(-3.4, 16.8, 0, () => f.wateredPlant(k, "herbs", 0, 1.1, "Herb pot"));
  k.at(0, 14.1, 0, () => f.runner(k, 2.4, 6.2, "#365e50", "#d9b765"));

  // Left wall: the menu, a sideboard of glasses, a framed truth.
  onLeft(k, w, 9, 3.2, () =>
    f.whiteboard(k, "menu", "Menu board", 2.6, 1.7, ["Today", "Tomato soup", "Carrot soup", "Herb broth", "Seconds for everyone"], "Chalk the next line"));
  byLeft(k, w, 5.2, 0.6, () => {
    f.sideboard(k, 3, 0.95, "#51392a", "#4b7b65");
    k.at(-1, 0, 0, () => f.tableLamp(k, "sideboard-lamp", true, "#e7d6aa"), 1.02);
    for (let i = 0; i < 5; i++) k.cyl([-0.2 + i * 0.26, 1.1, 0], [0.07, 0.18, 0.07], "#a9c9b8");
    k.at(1.2, 0, 0, () => f.kettle(k, "kettle"), 1.02);
  });
  onLeft(k, w, 5.2, 3.3, () =>
    f.readableFrame(k, { id: "everything", label: "Framed note", title: "House rule", text: "Josh likes cooking, and eating literally everything." }, 1.5, 1.1, ["#e7d6aa", "#7d4a3a", "#4b7b65"]));
  onLeft(k, w, 13, 3.4, () => f.frame(k, 1, 1.3, ["#7d9d8a", "#e69a37"]));
  onLeft(k, w, 15.2, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, 10, 4.55, () => f.stringLights(k, -8, 8, 0, 14, 0.24));

  // Between the counter and the tables.
  k.at(-10.6, 5.2, 0, () => f.floorLamp(k, "corner-lamp", true, "#e7d6aa"));
  k.at(10.4, 5.6, 0, () => {
    // A wine rack.
    k.box([0, 0.7, 0], [1.2, 1.4, 0.5], "#51392a");
    for (let i = 0; i < 9; i++) k.cyl([-0.36 + (i % 3) * 0.36, 0.3 + Math.floor(i / 3) * 0.4, 0.2], [0.1, 0.22, 0.1], i % 2 ? "#477b58" : "#7d4a3a", [Math.PI / 2, 0, 0]);
    k.at(0, 0, 0, () => f.plant(k, 0, 0.6), 1.4);
  });
  k.at(7.4, 17, 0.3, () => f.crate(k, 0.8));
  k.at(8.3, 16.6, -0.2, () => {
    f.crate(k, 0.6, "#bb8848");
    for (const [x, c] of [[-0.14, "#cd5438"], [0.12, "#e69a37"], [0, "#9bb04a"]] as const) k.ball([x, 0.66, x * 0.6], [0.12, 0.12, 0.12], c);
    k.at(0.6, 0.3, 0, () =>
      k.prop({ id: "tomato", label: "Stray tomato", verb: "Toss it up", motion: { kind: "hop", height: 0.8, bounces: 2 }, sound: "bounce", anchor: 0.6 }, () => k.ball([0, 0.13, 0], [0.13, 0.12, 0.13], "#cd5438")));
  });

  // Pantry (back left): sacks, crates, and a fridge that opens.
  k.at(-8.6, -17.6, 0, () => f.fridge(k, "fridge"));
  k.at(-12.6, -10.2, 0.2, () => {
    for (const [x, z, c] of [[0, 0, "#bda478"], [0.7, 0.3, "#c9b68c"], [0.3, -0.6, "#b29668"]] as const) {
      k.ball([x, 0.36, z], [0.42, 0.4, 0.36], c);
      k.cyl([x, 0.76, z], [0.14, 0.12, 0.14], f.shade(c, 0.8));
    }
  });
  k.at(-8, -11.6, 0.1, () => {
    f.crate(k, 0.9);
    k.at(0.1, 0, 0.3, () => f.crate(k, 0.7, "#bb8848"), 0.9);
  });
  k.at(-12.4, -3.6, 0, () => f.boxStack(k, 4));
  k.at(-9, -8.2, 0, () => f.roundRug(k, 1.6, "#858c70", "#e7d6aa"));
  k.at(-7.2, -3.4, 0, () => f.lantern(k, "pantry-lantern", true));

  // The dining corners get lamps of their own.
  k.at(-14.6, 9, 0, () => f.plant(k, 1, 1.3));
  k.at(14.8, 8.2, 0, () => f.plant(k, 2, 1.1));
}
