import type { Kit } from "../kit";
import * as f from "../furniture";
import { byLeft, onLeft, wallsOf } from "./common";

function stanchions(k: Kit, x: number, z0: number, z1: number, rope: string) {
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 2.2) + 1);
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * i) / (n - 1);
    k.cyl([x, 0.03, z], [0.18, 0.05, 0.18], "#b99a4a");
    k.cyl([x, 0.5, z], [0.035, 0.95, 0.035], "#b99a4a");
    k.ball([x, 1, z], [0.07, 0.07, 0.07], "#d7aa45");
    if (i < n - 1) k.slab([x, 0.82, z + (z1 - z0) / (n - 1) / 2], [0.05, 0.05, Math.abs(z1 - z0) / (n - 1) - 0.1], rope);
  }
}

/** The cinemas: a lobby with something to nibble and posters to read. */
function cinema(k: Kit, korea: boolean) {
  const w = wallsOf("theater");
  const carpet = korea ? "#3d4f73" : "#7a2f34",
    rope = korea ? "#c9603f" : "#8c2f2f";

  k.at(0, 12.4, 0, () => f.runner(k, 3, 11, carpet, "#d7aa45"));
  stanchions(k, -2.2, 9.4, 16, rope);
  stanchions(k, 2.2, 9.4, 16, rope);

  // Concessions, front right.
  k.at(9.4, 12.6, -0.25, () => {
    f.rug(k, 6.4, 4.4, carpet, "#e2cf9f", "#d7aa45");
    k.box([0, 0.6, 0], [3.6, 1.2, 0.8], "#4a3a2e");
    k.slab([0, 1.23, 0], [3.8, 0.07, 0.95], "#d9c08a");
    for (let i = 0; i < 4; i++) k.slab([-1.3 + i * 0.86, 0.6, 0.41], [0.74, 0.9, 0.03], i % 2 ? carpet : f.shade(carpet, 1.2));
    k.at(-2.6, -0.2, 0.2, () => f.popcorn(k, "popcorn"));
    for (let i = 0; i < 3; i++) {
      k.cyl([-0.9 + i * 0.3, 1.42, 0.1], [0.09, 0.3, 0.09], ["#c9603f", "#e8c66a", "#f1e8d0"][i]);
      k.clutter(() => k.slab([-0.9 + i * 0.3, 1.62, 0.1], [0.02, 0.16, 0.02], "#f1e8d0"));
    }
    k.clutter(() => {
      for (let i = 0; i < 4; i++) k.box([0.5 + i * 0.3, 1.34, -0.05], [0.24, 0.16, 0.34], ["#e8c66a", "#a33a32", "#52776a", "#e6a48c"][i], [0, 0.2 * (i - 1.5), 0]);
    });
    k.at(1.5, 0.1, 0, () => f.bell(k, "bell", "Counter bell"), 1.27);
    k.at(2.6, -0.9, 0, () => f.stool(k, carpet));
    k.at(-0.6, -1.5, 0, () => f.crate(k, 0.7));
  });

  // Waiting area, front left: sofa, lamp, a reel to play with.
  k.at(-9.4, 12.8, 0.25, () => {
    f.rug(k, 6.4, 4.6, carpet, "#e2cf9f", "#d7aa45");
    k.at(0, -1.1, 0, () => {
      f.sofa(k, 3.4, korea ? "#52657f" : "#7d3a3a", "#d7aa45");
      f.seatSpot(k, "sofa", "Lobby sofa", [0.5, 0.04, 0.12]);
    });
    k.at(0, 0.7, 0, () => {
      f.coffeeTable(k, 1.6, 0.9, "#4a3a2e");
      k.at(-0.3, 0, 0, () => f.filmReel(k, "reel"), 0.51);
      k.at(0.45, 0.1, 0.4, () => f.papers(k, 4), 0.51);
    });
    k.at(-2.5, -1.2, 0, () => (korea ? f.lantern(k, "lobby-lamp", true) : f.floorLamp(k, "lobby-lamp", true, "#e8d2a0")));
    k.at(2.5, -1.1, 0, () => f.wateredPlant(k, "palm", 1, 1.4, "Palm"));
    k.at(2.4, 1.3, -0.6, () => f.pouf(k, "#d7aa45"));
  });

  // The booth behind the seats.
  k.at(3.4, 8.4, 0, () => f.projector(k, "projector"));

  // Left wall: posters.
  const posters = korea
    ? [
        { id: "paper", label: "Poster", title: "A working paper", text: "Josh's working paper: “Understanding the importance of the idol training process in the popularity of global K-Pop.”" },
        { id: "languages", label: "Poster", title: "Three languages", text: "Josh speaks Korean, English and Chinese." },
        { id: "seoul", label: "Poster", title: "Seoul", text: "Josh leads Cognition's Korea efforts." },
      ]
    : [
        { id: "los-altos", label: "Poster", title: "Los Altos", text: "Josh grew up in Los Altos, just down the road from Stanford." },
        { id: "stanford", label: "Poster", title: "Down the road", text: "He studies CS and math at Stanford now." },
        { id: "sports", label: "Poster", title: "Game day", text: "Josh loves watching and playing sports: badminton, basketball, football and more." },
      ];
  const art = korea ? [["#3d4f73", "#e8c66a", "#c9603f"], ["#c9603f", "#f1e8d0"], ["#52776a", "#f1e8d0", "#3d4f73"]] : [["#7a2f34", "#e8c66a", "#f1e8d0"], ["#52776a", "#f1e8d0"], ["#435668", "#c9603f", "#e8c66a"]];
  posters.forEach((poster, i) => onLeft(k, w, 12 - i * 5.2, 3.3, () => f.readableFrame(k, poster, 1.5, 2.1, art[i], "#b99a4a")));
  onLeft(k, w, 9.4, 3.2, () => f.sconce(k, "sconce-front", true));
  onLeft(k, w, -1, 3.2, () => f.sconce(k, "sconce-back", true));
  onLeft(k, w, 15.4, 1.6, () => f.lightSwitch(k));
  byLeft(k, w, 4.2, 0.5, () => f.bench(k, 2.6, "#4a3a2e"));
  byLeft(k, w, -6.2, 0.5, () => f.plant(k, 2, 1.2));

  // Along the right edge and behind the screen: the working side of a cinema.
  k.at(13.4, -1, 0, () => {
    f.bench(k, 2.6, "#4a3a2e");
    k.at(0, -2.2, 0, () => f.plant(k, 1, 1.2));
    k.at(0.2, 2.4, 0, () => f.basket(k));
  });
  k.at(-6, -15.6, 0.2, () => {
    f.boxStack(k, 6);
    k.at(1.4, 0.2, -0.3, () => f.crate(k, 0.9, "#4a3a2e"));
    k.clutter(() => {
      for (let i = 0; i < 4; i++) k.cyl([2.6, 0.06 + i * 0.1, 0.4], [0.32, 0.09, 0.32], i % 2 ? "#9aa3a3" : "#3d4747");
    });
  });
  k.at(5.6, -15.8, 0, () => {
    // Spare seats, stacked.
    for (let i = 0; i < 3; i++) k.box([i * 0.9, 0.5, 0], [0.8, 1, 0.8], korea ? "#52657f" : "#7d3a3a", [0, 0.1 * i, 0]);
    k.at(3.4, 0.4, 0, () => f.lantern(k, "backstage-lantern", false));
  });
}

export const theater = (k: Kit) => cinema(k, false);
export const theaterKorea = (k: Kit) => cinema(k, true);
