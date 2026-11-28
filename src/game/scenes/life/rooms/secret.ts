import type { Kit } from "../kit";
import * as f from "../furniture";
import { byBack, byLeft, onLeft, wallsOf } from "./common";

function goldPile(k: Kit, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const a = f.hashStone(i, seed) * 6.28,
      r = f.hashStone(i, seed + 1) * 0.5;
    k.cyl([Math.cos(a) * r, 0.04 + (i % 4) * 0.07, Math.sin(a) * r], [0.14, 0.06, 0.14], i % 3 ? "#f4d06d" : "#c89932", [f.hashStone(i, seed + 2) * 0.3, 0, 0]);
  }
}

/** Hoover vault (Stanford): a tower room nobody has tidied in decades. */
export function secret(k: Kit) {
  const w = wallsOf("secret");

  // Ledger desk, left.
  k.at(-6.6, 1.6, Math.PI / 2, () => {
    f.rug(k, 4.4, 3.4, "#743d38", "#c2a764");
    k.at(0, -0.6, 0, () => {
      f.desk(k, 2.4, 1.1, "#73543a");
      k.at(-0.5, 0.05, 0.1, () => f.notebook(k, { id: "ledger", label: "Old ledger", title: "The ledger", text: "The small key opened the door at the foot of the tower. Somebody had been keeping count." }, "#4c3528"), 1.01);
      k.at(0.7, -0.2, 0, () => f.lantern(k, "desk-lantern", true), 1.01, 0.6);
      k.at(0.3, 0.3, 0, () => f.coinFlip(k, "coin"), 1.01);
    });
    k.at(0, 0.5, 0, () => f.stool(k, "#743d38"));
  });

  // Crates, barrels and loose gold along the right.
  k.at(7.4, -1.6, 0, () => {
    f.crate(k, 1, "#73543a");
    k.at(0.1, 0, 0.3, () => f.crate(k, 0.7, "#9b7950"), 1);
    k.at(-1.3, 0.6, 0, () => {
      k.cyl([0, 0.6, 0], [0.5, 1.2, 0.5], "#9b6735");
      for (const y of [0.2, 1]) k.cyl([0, y, 0], [0.52, 0.08, 0.52], "#454940");
      k.prop({ id: "barrel", label: "Barrel", verb: "Knock", motion: { kind: "hop", height: 0.05, bounces: 2 }, sound: "tap", anchor: 1.6 }, () => k.cyl([0, 1.24, 0], [0.46, 0.08, 0.46], "#ba864a"));
    });
    k.at(0.2, 1.8, 0, () => goldPile(k, 14, 3));
  });
  k.at(4.6, 4.4, 0, () => {
    goldPile(k, 10, 8);
    k.at(1.6, 0.4, 0, () => f.lantern(k, "floor-lantern", true));
  });
  k.at(-3.6, 5.2, 0.4, () => {
    f.globe(k, "globe", true);
    k.at(1.3, 0.5, 0, () => f.bookStack(k, 5, 4));
  });

  // Back wall: shelves of files, a bell nobody has rung.
  byBack(k, w, 3.4, 0.56, () => f.bookcase(k, 2.8, 4, 12, "#4c3528", false));
  byBack(k, w, -2.2, 0.56, () => f.bookcase(k, 2.8, 4, 15, "#4c3528"));
  k.at(0.6, -10.2, 0, () => {
    f.sideTable(k, "#73543a", 0.4, 0.8);
    k.at(0, 0, 0, () => f.bell(k, "bell", "Dusty bell"), 0.84);
  });
  k.at(8.4, -10.6, -0.3, () => f.boxStack(k, 11));

  // Left wall.
  onLeft(k, w, -3, 3.2, () =>
    f.readableFrame(k, { id: "platinum", label: "Framed print", title: "USACO Platinum", text: "Josh made USACO Platinum in his freshman year of high school." }, 1.5, 1.1, ["#d0dedc", "#334d43", "#c6c8b6"], "#4c3528"));
  onLeft(k, w, 4.6, 3, () => f.sconce(k, "wall-lamp", false));
  byLeft(k, w, 7, 0.6, () => f.drawerChest(k, { id: "drawer", label: "Map drawer", title: "Map drawer", text: "A plan of the tower, folded and refolded until the creases gave out." }, 1.5, "#4c3528"));
  byLeft(k, w, -8.6, 0.6, () => {
    f.crate(k, 0.9, "#73543a");
    k.at(0, 0, 0, () => f.candles(k), 0.9);
  });
}
