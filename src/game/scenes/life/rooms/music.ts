import type { Kit } from "../kit";
import * as f from "../furniture";
import { byLeft, onBack, onLeft, wallsOf } from "./common";

/** Beat Lab (home): a studio around the stage, with a place to listen. */
export function music(k: Kit) {
  const w = wallsOf("music");

  k.at(0, 10.6, 0, () => f.runner(k, 2.6, 11.5, "#3c4a5e", "#c9603f"));

  // Listening corner, front left: records on the sideboard, a sofa to sink into.
  byLeft(k, w, 9.5, 0.6, () => {
    f.sideboard(k, 3.2, 0.9, "#4a3a2e", "#35473d");
    k.at(-0.6, 0, 0, () => f.recordPlayer(k, "record", "backroom"), 0.97);
    k.at(0.9, 0, 0.2, () => f.bookStack(k, 4, 6), 0.97);
    k.at(2.4, 0.5, 0, () => f.crate(k, 0.7));
    k.clutter(() => {
      for (let i = 0; i < 7; i++) k.slab([2.14 + i * 0.075, 0.86, 0.5], [0.03, 0.5, 0.5], ["#c9603f", "#3c4a5e", "#e8c66a", "#52776a"][i % 4], [0, 0, 0.06]);
    });
  });
  k.at(-9.2, 9.6, 0, () => {
    f.rug(k, 6.6, 6, "#3c4a5e", "#e2cf9f", "#c9603f");
    k.at(1.6, 0, -Math.PI / 2, () => {
      f.sofa(k, 3.2, "#7a5578", "#e8c66a");
      f.seatSpot(k, "sofa", "Sofa", [-0.5, 0.04, 0.12]);
    });
    k.at(-0.9, 2.1, Math.PI, () => f.beanBag(k, "#c9603f"));
    k.at(-1, -0.2, 0, () => {
      f.coffeeTable(k, 1.5, 0.9, "#4a3a2e");
      k.at(0.2, 0, 0.4, () => f.papers(k, 3), 0.51);
      k.clutter(() => k.at(-0.4, 0.1, 0, () => f.mug(k, "#c9603f"), 0.51));
    });
    k.at(2, -2.4, 0, () => f.floorLamp(k, "corner-lamp", true, "#e8c66a"));
  });
  onLeft(k, w, 12.4, 3.3, () =>
    f.readableFrame(k, { id: "fairytale", label: "Framed single", title: "“Fairytale”", text: "Josh debuted with the digital single “Fairytale” under Korean hip hop label Dejavu Group. The video is on YouTube." }, 1.4, 1.4, ["#2b3134", "#d7aa45", "#c9603f"]));
  onLeft(k, w, 10.2, 3.2, () =>
    f.readableFrame(k, { id: "kelix", label: "Poster", title: "kelix", text: "On his own Josh posts as kelix on SoundCloud, and he's @atkelix on Instagram. He previously released music as dreamr." }, 1.2, 1.7, ["#c9603f", "#f1e8d0", "#3c4a5e"]));
  onLeft(k, w, 7.9, 3.4, () =>
    f.readableFrame(k, { id: "all-i-need", label: "Framed cover", title: "“all i need”", text: "“all i need” is on Spotify. On SoundCloud, try ‘back room’ or ‘please be’." }, 1.2, 1.2, ["#52776a", "#e8c66a"]));
  onLeft(k, w, 15.2, 1.6, () => f.lightSwitch(k));
  onLeft(k, w, -8, 4.5, () => f.stringLights(k, -9, 9, 0, 16, 0.25));

  // Writing songs, front right: a desk, a notebook, a guitar within reach.
  k.at(9.4, 9.2, 0, () => {
    f.rug(k, 6, 5, "#6b4a55", "#e2cf9f");
    k.at(0, -0.8, 0, () => {
      f.desk(k, 2.8, 1.2, "#4a3a2e");
      k.at(-0.7, 0, 0, () => f.laptop(k, "#c9603f"), 1.01);
      k.at(0.5, 0.1, 0.2, () => f.notebook(k, { id: "lyrics", label: "Lyric book", title: "Verses", text: "Josh built Verses, a songwriting surface, for his songs." }, "#c9603f"), 1.01);
      k.at(1.15, -0.3, 0, () => f.tableLamp(k, "desk-lamp", true, "#c9603f", "Desk lamp"), 1.01);
      k.clutter(() => k.at(-1.15, 0.3, 0, () => f.mug(k), 1.01));
    });
    k.at(0, 0.5, 0, () => f.chair(k, "#3c4a5e"));
    k.at(-2.3, -1.2, 0.5, () => {
      f.guitar(k);
      k.prop({ id: "guitar", label: "Guitar", verb: "Strum", sound: "chime", pop: "♪", anchor: 1.9 });
    });
    k.at(2.4, -1.4, -0.3, () => f.plant(k, 1, 1.2));
    k.at(2.2, 1.6, -0.6, () => f.speaker(k, 0.8));
  });

  // Keys and outboard, right of the stage.
  k.at(11.6, -1.4, -Math.PI / 2, () => {
    f.synth(k, "synth");
    k.at(0, 0.9, Math.PI, () => f.stool(k, "#3c4a5e"));
  });
  k.at(12.6, -4.6, -Math.PI / 2, () => f.speaker(k, 1));
  k.at(12.4, 1.8, -0.4, () => {
    // Mic on a stand.
    k.cyl([0, 0.04, 0], [0.26, 0.06, 0.26], f.STEEL);
    k.cyl([0, 0.8, 0], [0.03, 1.5, 0.03], f.STEEL);
    k.ball([0, 1.62, 0.04], [0.08, 0.1, 0.08], "#2b3134");
  });
  k.at(10.2, -11.5, 0, () => {
    f.roundRug(k, 1.8, "#c9603f", "#e2cf9f");
    f.pouf(k, "#3c4a5e", 0.5);
    k.at(1.2, 0.4, 0, () => f.lantern(k, "lantern", true));
    k.at(-1.1, -0.6, 0, () => f.wateredPlant(k, "monstera", 0, 1.3, "Monstera"));
  });

  // Left of the stage: crates of cables, a metronome on the piano's side table.
  k.at(-11.6, -5.6, 0, () => {
    f.sideTable(k, "#4a3a2e", 0.44, 0.8);
    k.at(0, 0, 0, () => {
      k.slab([0, 0.02, 0], [0.2, 0.04, 0.2], f.DARK_WOOD);
      k.cone([0, 0.2, 0], [0.12, 0.34, 0.12], f.WOOD);
      k.prop({ id: "metronome", label: "Metronome", verb: "Set it ticking", motion: { kind: "wobble", axis: "z", angle: 0.5 }, pivot: [0, 0.06, 0.1], sound: "tap", anchor: 0.6 }, () => k.slab([0, 0.24, 0.1], [0.02, 0.36, 0.02], f.BRASS));
    }, 0.84);
  });
  k.at(-11.4, -12.4, 0.3, () => f.boxStack(k, 5));
  k.at(-9.6, -13.4, -0.2, () => f.crate(k, 0.8, "#4a3a2e"));
  k.at(-12.6, 4.6, 0.4, () => f.plant(k, 2, 1.1));

  // Acoustic panels on the back wall, lit by the windows between them.
  for (const [x, c] of [[-10.5, "#3c4a5e"], [-1.7, "#c9603f"], [1.7, "#3c4a5e"], [10.5, "#c9603f"]] as const)
    onBack(k, w, x, 3.4, () => {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) k.box([-0.42 + i * 0.84, -0.42 + j * 0.84, 0.08], [0.78, 0.78, 0.12], (i + j) % 2 ? c : f.shade(c, 1.25));
    });
  for (const x of [-12.75, -4.25, 4.25, 12.75]) f.windowLight(k, x, w.backZ, 3);
}
