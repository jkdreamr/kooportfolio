import type { Kit } from "../kit";
import * as f from "../furniture";
import { onLeft, wallsOf } from "./common";

/** Kappa Sigma (Stanford): a lived-in house: games on, boards by the door. */
export function kappa(k: Kit) {
  const w = wallsOf("kappa");

  // Common room: a TV corner the sofas were missing.
  k.at(-1.6, -13.4, 0, () => {
    f.rug(k, 7, 5, "#344e3c", "#e2cf9f", "#c39b50");
    k.at(0, -1.2, 0, () => f.beanBag(k, "#79332c"));
    k.at(-1.9, -0.6, 0.5, () => {
      f.beanBag(k, "#36543c");
      f.seatSpot(k, "bean-bag", "Bean bag", [0, 0.1, 0]);
    });
    k.at(1.9, -0.8, -0.4, () => f.beanBag(k, "#c39b50"));
    k.at(0, 0.9, 0, () => {
      f.coffeeTable(k, 1.8, 0.9, "#673f2b");
      // Last night's pizza, and controllers.
      k.slab([-0.4, 0.54, 0], [0.56, 0.05, 0.56], "#c5a373", [0, 0.2, 0]);
      k.slab([-0.36, 0.59, 0.02], [0.56, 0.05, 0.56], "#b89362", [0, -0.1, 0]);
      k.clutter(() => {
        k.box([0.4, 0.54, 0.1], [0.22, 0.06, 0.14], "#2b3134", [0, 0.4, 0]);
        k.box([0.62, 0.54, -0.18], [0.22, 0.06, 0.14], "#dfe6e2", [0, -0.3, 0]);
        k.cyl([0.1, 0.57, -0.26], [0.05, 0.12, 0.05], "#a33a32");
      });
    });
  });
  k.at(1.6, -17.8, 0, () => f.tvConsole(k));
  k.at(-10.4, -6.2, 0.5, () => f.skateboard(k, "skateboard", "#79332c"));
  k.at(4.6, -10.4, 0, () => f.floorLamp(k, "common-lamp", true, "#e4b65a"));
  k.at(8.6, -6.4, 0, () => {
    f.roundRug(k, 1.9, "#79332c", "#e2cf9f");
    k.at(0, 0, 0.4, () => f.bouncyBall(k, "basketball", "basketball"));
    k.at(1.2, -0.7, 0, () => f.duffel(k, "#36543c"));
  });
  k.at(-3.4, -8.6, 0.2, () => f.pouf(k, "#c39b50"));

  // Left wall, common room: what he did on campus.
  onLeft(k, w, -6.5, 3.5, () =>
    f.readableFrame(k, { id: "treehacks", label: "Poster", title: "TreeHacks", text: "Josh helped organize TreeHacks." }, 1.4, 1.9, ["#36543c", "#e2cf9f", "#c39b50"]));
  onLeft(k, w, -8.6, 3.5, () =>
    f.readableFrame(k, { id: "blockchain", label: "Poster", title: "Stanford Blockchain Club", text: "He ran growth for the Stanford Blockchain Club." }, 1.4, 1.9, ["#344b65", "#e2cf9f", "#79332c"]));
  onLeft(k, w, -16, 3.3, () => f.pennant(k, "#79332c"));

  // Front left lounge: the composite on the wall, an oar from the boathouse.
  onLeft(k, w, 6.4, 3.4, () =>
    f.readableFrame(k, { id: "composite", label: "House composite", title: "Kappa Sigma", text: "Josh is in Kappa Sigma at Stanford." }, 2.4, 1.5, ["#e2cf9f", "#79332c", "#36543c"]));
  onLeft(k, w, 13, 3.7, () =>
    k.prop({ id: "oar", label: "Mounted oar", verb: "Read the blade", motion: { kind: "wobble", axis: "z", angle: 0.05 }, action: { type: "read", title: "Walk-on", text: "Josh walked on to Stanford men's rowing as a sophomore, as a coxswain." }, sound: "oar", anchor: 0, reach: 2.8 }, () => f.mountedOar(k, 4.2, "#79332c")));
  onLeft(k, w, 17.4, 1.6, () => f.lightSwitch(k));
  k.at(-3.2, 13.2, 0, () => {
    // Clear of the common room's big rug (HouseRooms.tsx), so no two rugs share a plane.
    f.rug(k, 4.6, 3.6, "#344b65", "#e2cf9f");
    k.at(-0.8, -0.4, 0.4, () => f.beanBag(k, "#344b65"));
    k.at(0.9, 0.2, 0, () => {
      f.sideTable(k, "#673f2b", 0.44, 0.6);
      k.at(0, 0, 0, () => f.tableLamp(k, "lounge-lamp", true, "#79332c"), 0.64);
    });
    k.at(-1.6, 1.2, 0.3, () => f.bookStack(k, 4, 2));
  });
  // The record cabinet already here gets a record that turns.
  k.at(-11.13, 16.8, 0, () =>
    k.prop({ id: "record", label: "Record cabinet", verb: "Play record", verbOn: "Lift the needle", motion: { kind: "spin", speed: 3.4 }, action: { type: "tune", tune: "parlour" }, sound: "tap", pop: "♪", anchor: 2.1 }, () => {
      k.cyl([0, 1.57, 0], [0.33, 0.03, 0.33], "#1c2222");
      k.cyl([0, 1.59, 0], [0.1, 0.012, 0.1], "#c39b50");
      k.slab([0, 1.592, 0.2], [0.03, 0.006, 0.14], "#3d4747");
    }));
  k.at(-7, 17.4, 0, () => f.wateredPlant(k, "fern", 1, 1.2, "Fern"));
  // By the front door: bags dropped where they fell.
  k.at(-2.2, 17.4, 0.4, () => f.duffel(k, "#79332c"));
  k.clutter(() => {
    k.at(-3.6, 17.6, -0.3, () => f.duffel(k, "#344b65"));
    for (let i = 0; i < 3; i++) k.at(-4.9 + i * 0.4, 16.2, 0.2 * i, () => {
      k.box([-0.09, 0.06, 0], [0.13, 0.1, 0.34], ["#dfe6e2", "#2b3134", "#79332c"][i]);
      k.box([0.09, 0.06, 0.04], [0.13, 0.1, 0.34], ["#dfe6e2", "#2b3134", "#79332c"][i]);
    });
  });

  // Pong room, front right: a cooler, cups, somewhere to lean.
  k.at(7.4, 15.4, 0, () => {
    k.box([0, 0.3, 0], [1.1, 0.6, 0.6], "#a33a32");
    k.slab([0, 0.63, 0], [1.14, 0.08, 0.64], "#dfe6e2");
    k.clutter(() => {
      for (let i = 0; i < 6; i++) k.cyl([1 + (i % 3) * 0.17, 0.09 + Math.floor(i / 3) * 0.17, 0.2], [0.07, 0.17, 0.07], "#a33a32");
    });
    k.at(-1.4, 0.3, 0.3, () => f.bouncyBall(k, "football", "football"));
  });
  k.at(4.6, 17.2, 0, () => f.lantern(k, "pong-lantern", true));
  k.at(10.2, 3.2, 0, () => f.coatRack(k, "#79332c"));
}
