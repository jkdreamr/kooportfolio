import type { Kit } from "../kit";
import * as f from "../furniture";
import { byBack, byLeft, onLeft, wallsOf } from "./common";

/** Math Lab (Stanford): problem sets, models and a board mid-proof. */
export function math(k: Kit) {
  const w = wallsOf("math");

  k.at(0, 11.4, 0, () => f.runner(k, 2.6, 11, "#344b65", "#d9b765"));

  // Problem-set table, front left.
  k.at(-8.2, 9.6, 0, () => {
    f.rug(k, 7, 4.8, "#344b65", "#e2cf9f", "#d9b765");
    f.longTable(k, 4.4, 1.4, "#9f805b");
    for (const x of [-1.3, 0, 1.3]) {
      k.at(x, -1.1, 0, () => f.chair(k, "#344b65"));
      k.at(x, 1.1, Math.PI, () => f.chair(k, "#344b65"));
    }
    k.at(-1.3, 0.1, 0.1, () => f.notebook(k, { id: "usaco", label: "Contest notebook", title: "USACO Platinum", text: "Josh made USACO Platinum in his freshman year of high school." }, "#344b65"), 1.02);
    k.at(0.2, -0.1, 0.3, () => f.papers(k, 2), 1.02);
    k.at(1, 0.2, -0.2, () => f.laptop(k, "#9cc7d8"), 1.02);
    k.at(1.9, 0, 0, () => f.tableLamp(k, "table-lamp", true, "#d9b765"), 1.02);
    k.at(-0.4, 0.35, 0, () => f.puzzleSolid(k, "cube", 1, "Puzzle cube"), 1.02);
    k.clutter(() => k.at(-2, -0.3, 0, () => f.mug(k), 1.02));
  });

  // Reading chairs, front right, under a lamp.
  k.at(8.4, 10.4, 0, () => {
    f.roundRug(k, 2.8, "#70413a", "#e2cf9f");
    k.at(-1.2, -0.5, 0.5, () => {
      f.armchair(k, "#52776a", "#d9b765");
      f.seatSpot(k, "armchair", "Armchair", [0, 0.04, 0.1]);
    });
    k.at(1.3, -0.4, -0.5, () => f.armchair(k, "#52776a"));
    k.at(0, 0.7, 0, () => {
      f.sideTable(k, "#9f805b", 0.5, 0.62);
      k.at(0, 0, 0, () => f.notebook(k, { id: "euler", label: "Research notes", title: "Euler Circle", text: "He's done a lot of math beyond that too, from olympiads to research with Euler Circle." }, "#70413a"), 0.66);
    });
    k.at(0, -1.7, 0, () => f.floorLamp(k, "reading-lamp", true, "#e2cf9f"));
    k.at(2.6, 1, 0, () => f.wateredPlant(k, "fern", 0, 1.2, "Fern"));
  });

  // Back wall: books and a shelf of solids.
  for (const [x, seed] of [[-7.6, 2], [7.6, 5]] as const) byBack(k, w, x, 0.56, () => f.bookcase(k, 2.8, 5, seed, "#4a4034"));
  byBack(k, w, 0, 0.7, () => {
    f.sideboard(k, 4.4, 0.95, "#4a4034", "#52657f");
    k.at(-1.5, 0, 0, () => f.puzzleSolid(k, "polyhedron", 0), 1.02);
    k.at(-0.5, 0, 0, () => k.box([0, 0.22, 0], [0.34, 0.34, 0.34], "#c9603f", [0.6, 0.5, 0]), 1.02);
    k.at(0.4, 0, 0, () => k.ball([0, 0.22, 0], [0.22, 0.22, 0.22], "#e8c66a"), 1.02);
    k.at(1.3, 0, 0, () => {
      k.cyl([0, 0.2, 0], [0.16, 0.4, 0.16], "#7fa35a");
      k.cone([0.5, 0.22, 0], [0.2, 0.44, 0.2], "#7a5578");
    }, 1.02);
  });
  for (const x of [-4.25, 4.25]) f.windowLight(k, x, w.backZ, 3.6);
  k.at(-10.6, -10.4, 0, () => {
    f.roundRug(k, 2, "#52776a", "#e2cf9f");
    k.at(0, 0, 0.3, () => f.globe(k, "globe", true));
    k.at(1.3, 0.6, 0, () => f.pouf(k, "#d9b765"));
    k.at(-1.2, -0.9, 0, () => f.bookStack(k, 5, 6));
  });
  k.at(10.4, -10.2, 0, () => {
    f.rug(k, 4.6, 3.6, "#344b65", "#e2cf9f");
    k.at(0, -0.6, 0, () => f.desk(k, 2.6, 1.1, "#9f805b"));
    k.at(-0.5, -0.7, 0, () => f.monitor(k, "#9cc7d8"), 1.01);
    k.at(0.8, -0.5, 0, () => f.tableLamp(k, "desk-lamp", false, "#344b65", "Desk lamp"), 1.01);
    k.at(0, 0.6, 0, () => f.chair(k, "#70413a"));
    k.at(-2, -0.9, 0, () => f.basket(k));
  });

  // Left wall: the board, and what the certificates say.
  onLeft(k, w, -9, 3.3, () =>
    f.whiteboard(k, "proof", "Whiteboard", 4.2, 1.9, ["Show 30 divides n⁵ − n.", "n⁵ − n = (n−1) n (n+1) (n²+1)", "three in a row: 6 divides it", "mod 5: n⁵ ≡ n   (Fermat)", "so 30 divides n⁵ − n   ∎"]));
  onLeft(k, w, 6, 3.4, () =>
    f.readableFrame(k, { id: "m3", label: "Certificate", title: "M3 Challenge", text: "Josh earned an M3 Challenge honorable mention." }, 1.5, 1.1, ["#f1e8d0", "#344b65", "#d9b765"]));
  onLeft(k, w, 8.2, 3.4, () =>
    f.readableFrame(k, { id: "smt", label: "Poster", title: "Stanford Math Tournament", text: "He helped organize the Stanford Math Tournament." }, 1.3, 1.8, ["#8c2f2f", "#f1e8d0", "#344b65"]));
  onLeft(k, w, 15.6, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, 11.4, 3.7, () => f.wallClock(k));
  byLeft(k, w, 12.6, 0.5, () => f.plant(k, 2, 1.2));
  byLeft(k, w, -15.4, 0.6, () => f.boxStack(k, 9));
}
