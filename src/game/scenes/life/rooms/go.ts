import type { Kit } from "../kit";
import * as f from "../furniture";
import { byBack, byLeft, onBack, onLeft, wallsOf } from "./common";

const TATAMI = "#b9b07a",
  EDGE = "#3c5a50";

function lowTable(k: Kit, w = 1.6, d = 1.1) {
  k.box([0, 0.34, 0], [w, 0.1, d], "#6b4a33");
  for (const x of [-1, 1]) k.slab([x * (w / 2 - 0.14), 0.15, 0], [0.12, 0.3, d - 0.2], "#4e3327");
}
function screen(k: Kit, panels = 3) {
  for (let i = 0; i < panels; i++) {
    const x = (i - (panels - 1) / 2) * 0.92;
    k.slab([x, 1.05, i % 2 ? 0.12 : -0.12], [0.9, 2.1, 0.05], "#4e3327", [0, i % 2 ? 0.26 : -0.26, 0]);
    k.slab([x, 1.1, i % 2 ? 0.12 : -0.12], [0.76, 1.7, 0.07], "#efe7d2", [0, i % 2 ? 0.26 : -0.26, 0]);
  }
}

/** Go Room (home): a quiet house of boards, tea and lanterns. */
export function go(k: Kit) {
  const w = wallsOf("go");

  k.at(0, 11.4, 0, () => f.runner(k, 2.6, 11, EDGE, "#d9b765"));

  // Tea corner, front left: floor cushions round a low table.
  k.at(-8.6, 8.4, 0, () => {
    f.rug(k, 6.4, 5.4, TATAMI, EDGE);
    lowTable(k, 2, 1.2);
    k.at(-0.4, 0, 0, () => f.kettle(k, "kettle", "Teapot", "Pour tea"), 0.39);
    for (const x of [0.2, 0.5]) k.cyl([x, 0.43, 0.25], [0.06, 0.08, 0.06], "#efe7d2");
    k.at(0, 1.3, 0, () => {
      f.cushion(k, "#903f36", 0.85);
      f.seatSpot(k, "cushion", "Floor cushion", [0, 0.02, 0]);
    });
    k.at(0, -1.3, 0, () => f.cushion(k, "#344b65", 0.85));
    k.at(-1.7, 0, 0, () => f.cushion(k, "#d2a957", 0.85));
    k.at(1.7, 0, 0, () => f.cushion(k, "#3c5a50", 0.85));
    k.at(-2.6, -2.2, 0, () => f.lantern(k, "tea-lantern", true));
  });

  // Study boards, right: a second goban mid-game and bowls of stones.
  k.at(8.8, -3.4, 0, () => {
    f.rug(k, 6, 5, TATAMI, EDGE);
    lowTable(k, 1.3, 1.3);
    k.slab([0, 0.42, 0], [1.05, 0.08, 1.05], "#d9b765");
    k.clutter(() => {
      for (let i = 0; i < 14; i++) {
        const gx = Math.floor(f.hashStone(i, 1) * 9) - 4,
          gz = Math.floor(f.hashStone(i, 2) * 9) - 4;
        k.cyl([gx * 0.11, 0.47, gz * 0.11], [0.045, 0.025, 0.045], i % 2 ? "#232a2a" : "#f3efe2");
      }
    });
    k.at(1.1, 0.1, 0, () => {
      k.cyl([0, 0.1, 0], [0.2, 0.2, 0.2], "#4e3327");
      k.prop({ id: "stones", label: "Bowl of stones", verb: "Rattle", motion: { kind: "hop", height: 0.12, bounces: 3 }, sound: "stone", anchor: 0.7 }, () => {
        k.cyl([0, 0.2, 0], [0.17, 0.04, 0.17], "#232a2a");
        k.ball([0.05, 0.24, 0.02], [0.05, 0.03, 0.05], "#2f3838");
      });
    }, 0);
    k.at(0, 1.4, 0, () => f.cushion(k, "#344b65", 0.85));
    k.at(0, -1.4, 0, () => f.cushion(k, "#903f36", 0.85));
    k.at(-2.3, -1.8, 0, () => f.lantern(k, "board-lantern", true));
    k.at(2.2, 1.6, 0, () => f.notebook(k, { id: "kifu", label: "Game record", title: "Go", text: "Go, the board game, is the first thing on Josh's list of other things he likes." }, "#3c5a50"), 0.1);
  });

  // The back of the room: folding screens, a garden of pots, a bell.
  byBack(k, w, -11.4, 1.2, () => screen(k, 4));
  byBack(k, w, 11.4, 1.2, () => screen(k, 4));
  byBack(k, w, 0, 0.7, () => {
    f.consoleTable(k, 3.2, "#4e3327");
    k.at(-1, 0, 0, () => f.wateredPlant(k, "bonsai", 2, 0.55, "Bonsai"), 0.91);
    k.at(0.2, 0, 0, () => f.bell(k, "bell", "Brass bell"), 0.91);
    k.at(1.1, 0, 0, () => f.candles(k), 0.91);
  });
  k.at(-6, -15.4, 0, () => {
    f.roundRug(k, 2, "#8f9a6c", EDGE);
    f.plant(k, 1, 1.5);
    k.at(1.3, 0.5, 0, () => f.plant(k, 0, 0.9));
    k.at(-1.2, 0.7, 0, () => f.plant(k, 1, 1));
  });
  k.at(6.4, -15.6, 0, () => {
    f.roundRug(k, 2, "#8f9a6c", EDGE);
    k.at(0, 0, 0, () => f.lantern(k, "garden-lantern", false));
    k.at(1.3, 0.3, 0, () => f.plant(k, 0, 1.1));
    k.at(-1.2, 0.5, 0, () => f.plant(k, 2, 0.9));
  });
  for (const x of [-12.75, -4.25, 4.25, 12.75]) f.windowLight(k, x, w.backZ, 3.6);
  onBack(k, w, -1.8, 3.5, () => f.frame(k, 1, 1.5, ["#efe7d2", "#232a2a"], "#4e3327"));
  onBack(k, w, 1.8, 3.5, () => f.frame(k, 1, 1.5, ["#efe7d2", "#903f36"], "#4e3327"));

  // Left wall: scrolls to read, a chest of teas.
  onLeft(k, w, -6, 3.3, () =>
    f.readableFrame(k, { id: "languages", label: "Hanging scroll", title: "Three languages", text: "Josh speaks Korean, English and Chinese." }, 1, 2, ["#efe7d2", "#232a2a", "#903f36"], "#4e3327"));
  onLeft(k, w, 2, 3.3, () =>
    f.readableFrame(k, { id: "go", label: "Hanging scroll", title: "Go", text: "Josh plays Go." }, 1, 2, ["#efe7d2", "#3c5a50"], "#4e3327"));
  byLeft(k, w, -2, 0.6, () => f.drawerChest(k, { id: "tea-chest", label: "Tea chest", title: "Tea chest", text: "Green, barley and jasmine, in little tins." }, 1.8, "#4e3327"));
  byLeft(k, w, -10.5, 0.9, () => screen(k, 3));
  byLeft(k, w, 14.4, 0.5, () => f.plant(k, 1, 1.4));
  onLeft(k, w, 12.6, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, 6.5, 4.5, () => f.stringLights(k, -8, 8, 0, 14, 0.24));

  // Front right: a bench to watch a game from, shoes left at the door.
  k.at(8.4, 11.6, -0.3, () => {
    f.rug(k, 5, 3.4, TATAMI, EDGE);
    f.bench(k, 3, "#6b4a33");
    k.at(-2.2, 0.4, 0, () => f.plant(k, 0, 1.1));
    k.at(2.2, -0.6, 0, () => {
      f.sideTable(k, "#4e3327", 0.4, 0.6);
      k.at(0, 0, 0, () => f.vase(k, "#344b65", "#efe7d2"), 0.64);
    });
  });
  k.clutter(() => {
    for (let i = 0; i < 3; i++) k.at(2.4 + i * 0.5, 17.2, 0.1 * i, () => {
      k.box([-0.09, 0.06, 0], [0.13, 0.1, 0.34], ["#4e3327", "#232a2a", "#903f36"][i]);
      k.box([0.09, 0.06, 0.03], [0.13, 0.1, 0.34], ["#4e3327", "#232a2a", "#903f36"][i]);
    });
  });
}
