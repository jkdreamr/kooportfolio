/**
 * Second layer for each room: the smaller groups that sit between the main
 * ones, so no stretch of floor is just boards. Kept apart from the rooms'
 * own files so a room's story furniture and its fill read separately.
 */
import type { Kit } from "../kit";
import * as f from "../furniture";
import type { RoomBuilder } from "./common";

function barbell(k: Kit) {
  k.cyl([0, 0.24, 0], [0.035, 2.2, 0.035], "#bfc5b8", [0, 0, Math.PI / 2]);
  for (const x of [-0.9, 0.9]) {
    k.cyl([x, 0.24, 0], [0.24, 0.08, 0.24], "#34494a", [0, 0, Math.PI / 2]);
    k.cyl([x + Math.sign(x) * 0.1, 0.24, 0], [0.18, 0.06, 0.18], "#a44b35", [0, 0, Math.PI / 2]);
  }
}
function plateTree(k: Kit) {
  k.cyl([0, 0.04, 0], [0.34, 0.07, 0.34], f.STEEL);
  k.cyl([0, 0.6, 0], [0.05, 1.1, 0.05], f.STEEL);
  for (let i = 0; i < 4; i++) k.cyl([0, 0.16 + i * 0.12, 0], [0.3 - i * 0.04, 0.1, 0.3 - i * 0.04], i % 2 ? "#a44b35" : "#34494a");
}
function oarTrestle(k: Kit) {
  for (const x of [-1.6, 1.6]) {
    k.slab([x, 0.45, -0.3], [0.08, 0.95, 0.08], f.DARK_WOOD, [0.3, 0, 0]);
    k.slab([x, 0.45, 0.3], [0.08, 0.95, 0.08], f.DARK_WOOD, [-0.3, 0, 0]);
    k.slab([x, 0.88, 0], [0.1, 0.06, 0.9], f.DARK_WOOD);
  }
  for (let i = 0; i < 4; i++) {
    const z = -0.3 + i * 0.2;
    k.cyl([0, 0.95, z], [0.04, 4.4, 0.04], f.PALE_WOOD, [0, 0, Math.PI / 2]);
    k.slab([2.5, 0.95, z], [0.7, 0.05, 0.24], i % 2 ? "#8c2f2f" : "#f1e8d0", [0.3, 0, 0]);
  }
}

export const EXTRAS: Record<string, RoomBuilder> = {
  office(k) {
    k.at(7, 1.2, 0, () => f.cafeTable(k));
    k.at(-8.8, 1.9, Math.PI / 2, () => f.lowShelf(k, 3, 2));
    k.at(-9, 14.6, 0, () => f.plantCluster(k));
    k.at(2.4, -14.6, -0.3, () => f.readingNook(k, "#a35e46", "#3c5a50", 5));
    k.at(-12.2, -6.2, 0.3, () => f.storageCorner(k, 2));
    k.at(4.4, 5.4, 0, () => f.plinth(k, () => f.vase(k, "#435668", "#e2cf9f")));
    // A rug and pouf in the back room, clear of the dividing wall.
    k.at(12, -7.6, 0, () => f.rug(k, 4, 3, "#52776a", "#e2cf9f"));
    k.at(12, -7.6, 0.4, () => f.pouf(k, "#a35e46", 0.5));
  },
  music(k) {
    k.at(-9, -0.6, 0, () => f.cafeTable(k, "#4a3a2e", "#3c4a5e"));
    k.at(7.6, 3.6, 0, () => f.lowShelf(k, 3.2, 6, "#4a3a2e"));
    k.at(-3.4, -16.2, 0, () => f.lowShelf(k, 3, 9, "#4a3a2e"));
    k.at(4.2, -16, 0, () => f.plantCluster(k, "#6b4a55"));
    k.at(-4.2, 15.4, 0, () => f.plantCluster(k, "#3c4a5e"));
    k.at(4.4, 15.8, 0.3, () => {
      f.coatRack(k, "#c9603f");
      k.at(1.3, 0.2, 0, () => f.pouf(k, "#e8c66a"));
    });
    k.at(-13, -9.6, 0.2, () => f.speaker(k, 1.3));
    k.at(13.2, 5, -0.5, () => f.plinth(k, () => f.vase(k, "#c9603f", "#f1e8d0"), "#3c4a5e"));
  },
  writing(k) {
    k.at(11.8, -11.4, -0.5, () => f.readingNook(k, "#903f36", "#344b65", 3));
    k.at(-12, -12.4, 0.5, () => f.readingNook(k, "#2c6353", "#70413a", 8));
    k.at(-11.8, 3.6, Math.PI / 2, () => f.lowShelf(k, 3.2, 4, "#4e3327"));
    k.at(5.4, 4.4, 0, () => f.cafeTable(k, "#734b2f", "#2c6353"));
    k.at(13, 8.4, 0, () => f.plantCluster(k));
    k.at(-13, 9.4, 0.2, () => f.storageCorner(k, 6));
    k.at(-3.6, 8.2, 0, () => f.plinth(k, () => f.bookStack(k, 4, 3), "#a2733e"));
    k.at(4, 16.4, 0, () => f.plant(k, 1, 1.3));
  },
  go(k) {
    k.at(-11.6, 1.2, 0, () => f.plantCluster(k));
    k.at(12.8, 5.2, Math.PI / 2, () => f.lowShelf(k, 3, 3, "#4e3327"));
    k.at(-13.2, 14, 0, () => f.plantCluster(k));
    k.at(-9, -8.4, 0, () => f.cafeTable(k, "#6b4a33", "#903f36"));
    k.at(13, -9.8, 0, () => f.plinth(k, () => f.vase(k, "#344b65", "#efe7d2"), "#4e3327"));
    k.at(-4.8, 15, 0, () => f.plinth(k, () => f.candles(k), "#4e3327"));
    k.at(5, 5.4, 0, () => {
      f.rug(k, 3.6, 3, "#b9b07a", "#3c5a50");
      f.cushion(k, "#d2a957", 0.85);
      k.at(1, 0.4, 0, () => f.bookStack(k, 3, 4));
    });
    k.at(-5, 2.6, 0.4, () => f.pouf(k, "#903f36"));
  },
  kitchen(k) {
    k.at(13.8, 4.6, 0, () => f.plantCluster(k));
    k.at(-8.2, -14.6, 0.3, () => f.storageCorner(k, 3));
    k.at(-13.6, 4.4, 0, () => f.plinth(k, () => f.fruitBowl(k), "#bd914f"));
    k.at(-9.6, 17.4, 0, () => f.lowShelf(k, 2.8, 5, "#51392a"));
    k.at(11.2, 17.4, 0, () => f.lowShelf(k, 2.6, 8, "#51392a"));
  },
  theater(k) {
    k.at(13.4, 5.6, 0, () => f.plantCluster(k, "#7a2f34"));
    k.at(13.4, -6.4, 0, () => f.plinth(k, () => f.vase(k, "#b99a4a", "#f1e8d0"), "#4a3a2e"));
    k.at(-13.4, -2.4, 0, () => f.plinth(k, () => f.candles(k), "#4a3a2e"));
    k.at(-13.4, -11.6, 0.2, () => f.storageCorner(k, 4));
    k.at(-3.9, 16.6, 0, () => f.cafeTable(k, "#4a3a2e", "#7a2f34"));
    k.at(4.8, 17, 0, () => f.plant(k, 1, 1.3));
    k.at(13.6, 12.4, -Math.PI / 2, () => f.lowShelf(k, 2.8, 2, "#4a3a2e"));
  },
  "theater-korea"(k) {
    k.at(13.4, 5.6, 0, () => f.plantCluster(k, "#3d4f73"));
    k.at(13.4, -6.4, 0, () => f.plinth(k, () => f.vase(k, "#3d4f73", "#f1e8d0"), "#4a3a2e"));
    k.at(-13.4, -2.4, 0, () => f.plinth(k, () => f.candles(k), "#4a3a2e"));
    k.at(-13.4, -11.6, 0.2, () => f.storageCorner(k, 4));
    k.at(-3.9, 16.6, 0, () => f.cafeTable(k, "#4a3a2e", "#3d4f73"));
    k.at(4.8, 17, 0, () => f.plant(k, 1, 1.3));
    k.at(13.6, 12.4, -Math.PI / 2, () => f.lowShelf(k, 2.8, 2, "#4a3a2e"));
  },
  cognition(k) {
    k.at(-8.6, -11, 0, () => f.cafeTable(k, "#c9b28a", "#2f4a55"));
    k.at(6, 3.6, 0, () => f.lowShelf(k, 3, 4, "#2b3a40"));
    k.at(8.4, 7.6, 0, () => f.plantCluster(k, "#3f5d55"));
    k.at(-8.2, 4.6, 0.3, () => f.readingNook(k, "#4e7480", "#2f4a55", 2));
    k.at(8.8, -11.6, 0.3, () => f.storageCorner(k, 5));
    k.at(-4.2, 3.6, 0, () => f.plinth(k, () => f.vase(k, "#7fb0c4", "#dfe6e2"), "#dfe6e2"));
  },
  kappa(k) {
    k.at(-9.2, -15.6, 0, () => f.lowShelf(k, 2.8, 7, "#65472f"));
    k.at(9, -2.2, 0, () => f.cafeTable(k, "#673f2b", "#934e3c"));
    k.at(-10.4, 13.2, 0, () => f.plinth(k, () => f.candles(k), "#65472f"));
    k.at(4.2, 11.6, 0, () => f.pouf(k, "#36543c"));
    k.at(13.4, 3.6, 0, () => f.plant(k, 2, 1.2));
  },
  gym(k) {
    k.at(7.4, 5.2, 0, () => {
      f.rug(k, 5.4, 4.2, "#3c554e", "#2a3d38");
      barbell(k);
      k.at(2, -1.2, 0, () => plateTree(k));
      k.at(-1.8, 1.2, 0.3, () => f.bench(k, 2, "#7c5540"));
    });
    k.at(-7.4, 2.6, 0, () => {
      f.rug(k, 4.6, 3.6, "#567469", "#2a3d38");
      k.slab([0, 0.13, 0], [1, 0.04, 2.6], "#c98a4b", [0, 0.2, 0]);
      for (const [x, c] of [[1.3, "#7a5578"], [1.7, "#4f86a0"]] as const) k.box([x, 0.2, -0.8], [0.3, 0.2, 0.5], c);
      k.at(-1.5, 0.9, 0, () => f.pouf(k, "#a44b35", 0.42));
    });
    k.at(3.6, 12.6, 0, () => plateTree(k));
    k.at(-10.6, 16.6, 0.2, () => f.storageCorner(k, 4));
    k.at(0.4, -13.6, 0, () => {
      f.rug(k, 4, 3, "#3c554e", "#2a3d38");
      for (const [x, s] of [[-1, 0.9], [0.1, 0.7], [1, 0.5]] as const) k.box([x, s / 2, 0], [s, s, s], x > 0.5 ? "#c5a373" : "#a98250");
    });
  },
  boathouse(k) {
    k.at(8.6, -2.4, Math.PI / 2, () => oarTrestle(k));
    k.at(-9.6, -4.8, 0.3, () => f.storageCorner(k, 2));
    k.at(-9.4, -15.4, -0.2, () => f.storageCorner(k, 7));
    k.at(8.6, 14.6, 0, () => f.cafeTable(k, "#9f805b", "#456d65"));
    k.at(-10, 16.6, 0, () => f.lowShelf(k, 2.8, 3, "#4a655d"));
  },
  badminton(k) {
    k.at(13.6, 9.4, 0, () => f.plantCluster(k, "#35615a"));
    k.at(0.4, -16.6, 0.2, () => f.storageCorner(k, 5));
    k.at(-10.6, 16.4, 0, () => f.lowShelf(k, 2.8, 4, "#4a655d"));
    k.at(13.2, -14.6, 0, () => f.plinth(k, () => f.vase(k, "#35615a", "#f1e8d0"), "#9f805b"));
  },
  math(k) {
    k.at(-9.8, 3.6, Math.PI / 2, () => f.lowShelf(k, 3.2, 5, "#4a4034"));
    k.at(-9.6, -2.8, 0, () => f.cafeTable(k, "#9f805b", "#344b65"));
    k.at(9.2, -3.6, -0.4, () => f.readingNook(k, "#70413a", "#344b65", 6));
    k.at(9.8, 3.4, 0, () => f.plantCluster(k));
    k.at(-3.6, 16.2, 0, () => f.plinth(k, () => k.box([0, 0.28, 0], [0.36, 0.36, 0.36], "#4f86a0", [0.6, 0.5, 0.2])));
    k.at(3.8, 16.4, 0, () => f.plinth(k, () => k.cone([0, 0.26, 0], [0.24, 0.5, 0.24], "#c9603f")));
  },
  secret(k) {
    k.at(-8.2, -10.4, 0.3, () => f.storageCorner(k, 9));
    k.at(8.2, 9.6, 0, () => f.plinth(k, () => f.candles(k), "#73543a"));
    k.at(-2.6, 9.4, 0.2, () => f.crate(k, 0.9, "#73543a"));
  },
};
