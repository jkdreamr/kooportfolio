import type { Kit } from "../kit";
import * as f from "../furniture";
import { byBack, byLeft, onBack, onLeft, wallsOf } from "./common";

/** Writing Room (home): stacks behind the shelves, nooks for each kind of page. */
export function writing(k: Kit) {
  const w = wallsOf("writing");

  k.at(0, 11.2, 0, () => f.runner(k, 2.6, 10.5, "#70413a", "#d9b765"));

  // The stacks: the back wall lined with books, an aisle to wander.
  for (const [x, seed] of [[-10.6, 1], [-7.6, 4], [7.6, 6], [10.6, 9]] as const) byBack(k, w, x, 0.56, () => f.bookcase(k, 2.8, 5, seed, "#4e3327"));
  byBack(k, w, 0, 0.6, () => {
    f.bench(k, 3.4, "#a2733e");
    k.at(-1, 0, 0.3, () => f.bookStack(k, 4, 3), 0.56);
    k.at(0.9, 0, 0, () => f.cushion(k, "#2c6353", 0.7), 0.5);
  });
  k.at(0, -15.6, 0, () => f.runner(k, 20, 2.2, "#3c5a50", "#d9b765"));
  k.at(-4.4, -16.6, 0, () => f.lantern(k, "stacks-lantern", true));
  k.at(4.4, -17.4, 0.4, () => {
    f.boxStack(k, 2);
    k.at(1.2, 0.3, 0.3, () => f.bookStack(k, 5, 8));
  });
  // A ladder against the stacks.
  byBack(k, w, 13.4, 0.9, () => {
    for (const side of [-1, 1]) k.slab([side * 0.32, 1.7, 0], [0.07, 3.5, 0.07], f.PALE_WOOD, [-0.24, 0, 0]);
    for (let i = 0; i < 6; i++) k.slab([0, 0.4 + i * 0.5, 0.38 - i * 0.125], [0.64, 0.05, 0.07], f.PALE_WOOD);
  });
  for (const x of [-4.25, 4.25]) f.windowLight(k, x, w.backZ, 3.4);
  onBack(k, w, -1.7, 3.4, () => f.frame(k, 1.4, 1.1, ["#e2cf9f", "#70413a", "#2c6353"]));
  onBack(k, w, 1.7, 3.4, () => f.wallClock(k));

  // Poetry desk, right: notebooks that open, a radio for company.
  k.at(10, -3.4, -Math.PI / 2, () => {
    f.rug(k, 5.6, 4.6, "#344b65", "#e2cf9f", "#d9b765");
    k.at(0, -0.9, 0, () => {
      f.desk(k, 3, 1.3, "#734b2f");
      k.at(-0.9, 0.1, 0.15, () => f.notebook(k, { id: "poems", label: "Poetry notebook", title: "Poems", text: "Josh loves to write: poetry, songwriting and essays." }, "#903f36"), 1.01);
      k.at(0.1, 0.05, -0.1, () => f.notebook(k, { id: "essays", label: "Essay folder", title: "A working paper", text: "“Understanding the importance of the idol training process in the popularity of global K-Pop.”" }, "#344b65"), 1.01);
      k.at(1.1, -0.2, 0, () => f.tableLamp(k, "poetry-lamp", true, "#d2a957", "Desk lamp"), 1.01);
      k.at(0.9, 0.35, 0.3, () => f.papers(k, 6), 1.01);
      k.clutter(() => k.at(-1.3, -0.3, 0, () => f.mug(k), 1.01));
    });
    k.at(0, 0.5, 0, () => f.chair(k, "#903f36"));
    k.at(2.2, -1.1, 0, () => f.basket(k));
    k.at(2.3, 0.2, 0, () =>
      k.prop({ id: "draft", label: "Crumpled draft", verb: "Toss it up", motion: { kind: "hop", height: 0.8, bounces: 2 }, sound: "paper", anchor: 0.6 }, () => k.ball([0, 0.12, 0], [0.12, 0.11, 0.12], f.PAPER)));
    k.at(-2.3, -1.2, 0, () => {
      f.sideTable(k, "#734b2f", 0.46, 0.8);
      k.at(0, 0, 0, () => {
        k.box([0, 0.17, 0], [0.56, 0.34, 0.26], "#70413a");
        k.slab([-0.1, 0.18, 0.135], [0.26, 0.2, 0.02], "#d9b765");
        k.prop({ id: "radio", label: "Radio", verb: "Tune in", verbOn: "Switch off", motion: { kind: "spin", speed: 1.2 }, pivot: [0.17, 0, 0], action: { type: "tune", tune: "lamplight" }, sound: "tap", pop: "♪", anchor: 0.7 }, () =>
          k.cyl([0.17, 0.2, 0.14], [0.06, 0.03, 0.06], f.BRASS, [Math.PI / 2, 0, 0]));
      }, 0.84);
    });
  });
  k.at(12.4, 3.2, 0, () => f.wateredPlant(k, "fig", 2, 1.25, "Fig tree"));

  // Window seat on the left wall, deep with cushions.
  byLeft(k, w, -8.5, 0.9, () => {
    k.box([0, 0.3, 0], [4.2, 0.6, 0.9], "#734b2f");
    k.box([0, 0.66, 0], [4.1, 0.14, 0.86], "#2c6353");
    k.box([-1.5, 0.92, -0.18], [0.6, 0.5, 0.2], "#d2a957", [-0.2, 0.2, 0]);
    k.box([1.4, 0.9, -0.18], [0.6, 0.46, 0.2], "#903f36", [-0.2, -0.2, 0]);
    f.seatSpot(k, "window-seat", "Window seat", [0, 0.14, 0.05]);
    k.at(0.6, 0.1, 0.4, () => f.bookStack(k, 2, 5), 0.73);
  });
  onLeft(k, w, -8.5, 3.4, () =>
    f.readableFrame(k, { id: "verses", label: "Framed lyric sheet", title: "Verses", text: "Josh even built Verses, a songwriting surface, for his songs." }, 1.6, 1.2, ["#f1e8d0", "#2c6353", "#d2a957"]));
  onLeft(k, w, -11.2, 3.3, () => f.frame(k, 0.9, 1.3, ["#903f36", "#f1e8d0"]));
  onLeft(k, w, -5.8, 3.3, () => f.frame(k, 0.9, 1.3, ["#344b65", "#d2a957"]));
  onLeft(k, w, 14.6, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, 3, 3.2, () => f.sconce(k, "wall-lamp", true));
  byLeft(k, w, 12, 0.6, () =>
    f.drawerChest(k, { id: "drawer", title: "In the drawer", text: "Blank pages, sharpened pencils, and room for the next one." }, 1.5, "#734b2f"));
  byLeft(k, w, 9.6, 0.5, () => f.plant(k, 1, 1.2));

  // By the door: two chairs and a lamp for whoever is waiting to read.
  k.at(7.6, 12.6, 0, () => {
    f.roundRug(k, 2.7, "#70413a", "#d9b765");
    k.at(-1.2, -0.4, 0.5, () => f.armchair(k, "#2c6353", "#d2a957"));
    k.at(1.2, -0.3, -0.5, () => f.armchair(k, "#2c6353"));
    k.at(0, 0.6, 0, () => {
      f.sideTable(k, "#734b2f", 0.5, 0.62);
      k.at(0, 0, 0, () => f.globe(k, "globe", false), 0.66);
    });
    k.at(0, -1.6, 0, () => f.floorLamp(k, "reading-lamp", true, "#d2a957"));
  });
  k.at(-6.8, 13.6, 0.3, () => {
    f.rug(k, 4, 3, "#344b65", "#e2cf9f");
    f.beanBag(k, "#903f36");
    k.at(1.3, 0.3, 0.6, () => f.bookStack(k, 5, 2));
    k.at(-1.2, 0.6, 0, () => f.candles(k));
  });
  k.at(4, -13, 0.2, () => f.pouf(k, "#d2a957"));
}
