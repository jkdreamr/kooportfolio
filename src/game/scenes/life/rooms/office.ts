import type { Kit } from "../kit";
import * as f from "../furniture";
import { byBack, byLeft, onLeft, wallsOf } from "./common";

/** The Study (home): founder's desk, a lounge to read in, a deal table. */
export function office(k: Kit) {
  const w = wallsOf("office");

  // The way in: a runner from the door to the middle of the room.
  k.at(0, 10.2, 0, () => f.runner(k, 2.8, 12.5, "#5d7565"));
  k.at(3.7, 17.2, -0.4, () => f.coatRack(k));
  k.at(-3.6, 17.3, 0, () => f.wateredPlant(k, "fern", 1, 1.15, "Fern"));
  k.at(-4.6, 16.4, 0.4, () => f.basket(k));

  // Lounge, front left: sofa, two chairs, a low table, a lamp to read by.
  k.at(-7.2, 8.4, 0, () => {
    f.rug(k, 7, 5.6, "#8a4f43", "#e2cf9f", "#d9b765");
    k.at(0, -2, 0, () => {
      f.sofa(k, 3.4, "#52776a", "#d9b765");
      f.seatSpot(k, "sofa", "Sofa", [0.6, 0.04, 0.12]);
    });
    k.at(-2.9, 0.5, Math.PI / 2, () => f.armchair(k, "#a35e46", "#e2cf9f"));
    k.at(2.9, 0.6, -Math.PI / 2, () => f.armchair(k, "#a35e46"));
    k.at(0, 0.3, 0, () => {
      f.coffeeTable(k, 1.9, 1);
      k.at(-0.5, 0, 0.1, () => f.bookStack(k, 3, 4), 0.51);
      k.at(0.45, -0.1, 0, () => f.fruitBowl(k), 0.51);
      k.clutter(() => k.at(0.2, 0.3, 0.6, () => f.mug(k), 0.51));
    });
    k.at(-2.9, -2, 0, () => f.floorLamp(k, "reading-lamp", true));
    k.at(2.7, -2, 0, () => {
      f.sideTable(k);
      k.at(0, 0, 0, () => f.globe(k, "globe", false), 0.74);
    });
    k.at(0.3, 2.2, 0, () => f.pouf(k, "#c98a4b"));
    k.at(1.7, 1.9, 2.3, () => f.cat(k, "cat"));
  });

  // Back wall: two more bookcases, so the wall reads as a library.
  byBack(k, w, -5.6, 0.56, () => f.bookcase(k, 2.6, 5, 3));
  byBack(k, w, 5.6, 0.56, () => f.bookcase(k, 2.6, 5, 8, f.DARK_WOOD, false));
  k.at(-7.4, -17.6, 0, () => f.boxStack(k, 3));
  for (const x of [-12.75, -4.25, 4.25, 12.75]) f.windowLight(k, x, w.backZ, 4.4);

  // Reading corner, mid left: a chair, a floor globe's cousin, tall plants.
  k.at(-7.6, -7.2, 0, () => {
    f.roundRug(k, 2.4, "#3c5a50", "#d9b765");
    k.at(-0.5, -0.3, 0.5, () => f.armchair(k, "#52776a", "#d9b765"));
    k.at(1.3, -0.9, 0, () => {
      f.sideTable(k, f.WOOD, 0.4, 0.66);
      k.at(0, 0, 0.3, () => f.bookStack(k, 2, 7), 0.7);
      k.clutter(() => k.at(0.12, 0.16, 0, () => f.mug(k, "#a35e46"), 0.7));
    });
    k.at(-2.1, -1.5, 0, () => f.plant(k, 2, 1.2));
    k.at(1.5, 1.3, 0.3, () => f.bouncyBall(k, "football", "football"));
  });

  // Side projects, mid right: a console with a notebook, a board of jobs.
  k.at(7.2, -9.6, 0, () => {
    f.rug(k, 4.6, 3.6, "#435668", "#e2cf9f");
    k.at(0, -0.9, 0, () => {
      f.consoleTable(k, 2.4);
      k.at(-0.6, 0, 0, () =>
        f.notebook(k, {
          id: "projects",
          label: "Notebook",
          title: "Side projects",
          text: "kookwleigh: intimate dinners, by invitation. NOVUM: artist-led creative technology. LiveX: an NBA Summer League hoodie designer. Harbor: make sense of your work. Verses: a songwriting surface.",
        }), 0.91);
      k.at(0.6, 0, 0, () => f.laptop(k), 0.91);
      k.clutter(() => k.at(1, 0.05, 0.4, () => f.mug(k), 0.91));
    });
    k.at(0.2, 0.4, 0, () => f.chair(k));
    k.at(-2.6, -1.2, 0.35, () =>
      f.standingBoard(k, {
        id: "work",
        label: "Pin board",
        title: "Where Josh has worked",
        text: "Cognition, leading Korea efforts. CRV, investment intern. NEAR Protocol, ecosystem manager. Pantera Capital, research. Branch and Bound (CodeTree), intern.",
      }));
    k.at(2.5, -0.8, 0, () => f.plant(k, 0, 1.1));
  });

  // Deal table, front right: where the long conversations happen.
  k.at(7.4, 10.4, Math.PI / 2, () => {
    f.rug(k, 5.6, 3.8, "#6b5a45", "#e2cf9f", "#b19a65");
    f.longTable(k, 4, 1.3);
    for (const x of [-1.2, 0, 1.2]) {
      k.at(x, -1.05, 0, () => f.chair(k, "#52776a"));
      k.at(x, 1.05, Math.PI, () => f.chair(k, "#52776a"));
    }
    k.at(-1.1, 0.1, 0.3, () => f.laptop(k), 1.02);
    k.at(0.2, -0.2, 0.2, () => f.papers(k, 2), 1.02);
    k.at(1.3, 0.2, 0, () => f.papers(k, 5), 1.02);
    k.at(0.7, 0.3, 0, () => f.mug(k), 1.02);
    k.clutter(() => k.at(-0.4, 0.35, 0, () => f.mug(k, "#52776a"), 1.02));
    k.at(1.75, 0, 0, () => f.tableLamp(k, "table-lamp", true, "#c98a4b"), 1.02);
  });
  k.at(10.6, 15.6, 0, () => f.plant(k, 1, 1.2));

  // The desk in the middle gets a lamp; the paper-toss lane stays clear.
  k.at(-4.1, -4.2, 0, () => f.tableLamp(k, "desk-lamp", false, "#24715b", "Desk lamp"), 1.2);

  // Left wall: a sideboard with keepsakes under a gallery of frames.
  byLeft(k, w, -1.5, 0.6, () => {
    f.sideboard(k, 3);
    k.at(-1, 0, 0, () => f.vase(k), 0.97);
    k.at(0.2, 0, 0, () => f.candles(k), 0.97);
    k.at(1, 0, 0, () => f.bookStack(k, 2, 2), 0.97);
  });
  onLeft(k, w, -1.5, 3.3, () =>
    f.readableFrame(
      k,
      {
        id: "alphag3n",
        label: "Framed page",
        title: "Alphag3n",
        text: "Before Stanford, Josh founded Alphag3n, a startup backed by sponsors like Coinbase, Solana and Polygon.",
      },
      1.5,
      1.9,
      ["#efe7d2", "#435668", "#d9b765"],
    ));
  onLeft(k, w, 0.6, 3.5, () => f.frame(k, 1.1, 0.9, ["#a9c9b8", "#52776a"]));
  onLeft(k, w, 0.6, 2.6, () => f.frame(k, 1.1, 0.7, ["#e6a48c", "#a35e46"]));
  onLeft(k, w, -3.8, 3.2, () =>
    f.readableFrame(
      k,
      {
        id: "three-places",
        label: "Framed map",
        title: "Three places",
        text: "Josh grew up in Los Altos, studies CS and math at Stanford, and leads Cognition's Korea efforts.",
      },
      1.7,
      1.2,
      ["#bcd0e0", "#7fa35a", "#e2cf9f"],
    ));
  onLeft(k, w, 9.5, 3.6, () => f.wallClock(k));
  onLeft(k, w, 14.5, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, -9.5, 3.4, () => f.hangingPlant(k));
  byLeft(k, w, 16, 0.6, () =>
    f.drawerChest(k, {
      id: "drawer",
      title: "A note in the drawer",
      text: "“I like to build and make things I actually use.”",
    }));
  onLeft(k, w, 0, 4.55, () => f.stringLights(k, -13, 13, 0, 22, 0.22));
}
