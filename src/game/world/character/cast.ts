import type { Villager } from "../../core/npcs";
import { shade, type Outfit } from "./outfit";

/**
 * Who wears what. Every villager's outfit follows who they are and what they
 * talk about (their `lines`); `npc.color` stays their signature colour and
 * `npc.skin` their skin. The one-line reason per entry is also the table in
 * the F3 notes. Unknown ids fall back to a casual outfit from the hash.
 */
type Make = (npc: Villager) => Outfit;
type Entry = { why: string; make: Make };

const H = {
  black: "#24201f",
  dark: "#3a2c26",
  brown: "#5b4030",
  chestnut: "#7a4a2e",
  auburn: "#8a4a2a",
  blond: "#c49a62",
  grey: "#9a9590",
  white: "#d9d4cc",
};
const CARDINAL = "#8c1515";
const NINERS_RED = "#aa0000";
const NINERS_GOLD = "#b3995d";
const DENIM = "#3d5373";
const KHAKI = "#b59f78";
const CREAM = "#efe8da";
const CHARCOAL = "#34373d";

export const CAST: Record<string, Entry> = {
  // --- Stanford -----------------------------------------------------------
  rower: {
    why: "Invites you to race at the boathouse: cardinal crew tank and shorts, cap, sneakers.",
    make: (n) => ({
      build: { width: 1.08 },
      skin: n.skin,
      hair: { style: "crop", color: H.brown },
      top: { kind: "tank", color: CARDINAL, trim: "#f2efe8" },
      bottom: { kind: "shorts", color: CARDINAL, trim: "#f2efe8" },
      head: { kind: "cap", color: CARDINAL, band: "#f2efe8" },
      feet: { kind: "sneakers", color: "#e9e6df" },
    }),
  },
  coxswain: {
    why: "Runs the crew's warm-up: crew jacket, cap, whistle lanyard, small build.",
    make: (n) => ({
      build: { height: 0.94 },
      skin: n.skin,
      hair: { style: "ponytail", color: H.dark },
      top: { kind: "tee", color: "#f2efe8" },
      bottom: { kind: "shorts", color: CHARCOAL },
      outer: { kind: "jacket", color: CARDINAL, trim: "#f2efe8" },
      head: { kind: "cap", color: CARDINAL, band: "#f2efe8" },
      feet: { kind: "sneakers", color: "#e9e6df" },
      extras: [{ kind: "whistle", color: "#2a2a2a" }],
    }),
  },
  dockhand: {
    why: "Works the dock ropes: navy overalls, beanie, boots and a rope coil.",
    make: (n) => ({
      build: { width: 1.12 },
      skin: n.skin,
      hair: { style: "crop", color: H.black },
      top: { kind: "tee", color: "#d8cdb6", sleeves: "rolled" },
      bottom: { kind: "trousers", color: n.color },
      outer: { kind: "overalls", color: n.color },
      head: { kind: "beanie", color: "#c2552f" },
      feet: { kind: "boots", color: "#5a3e2b" },
      extras: [{ kind: "rope" }],
    }),
  },
  hooper: {
    why: "Asks if you play and points to the court: basketball jersey with a number, shorts, headband, ball.",
    make: (n) => ({
      build: { height: 1.06 },
      skin: n.skin,
      hair: { style: "curly", color: H.black },
      top: { kind: "jersey", color: n.color, trim: "#f4f1ea" },
      bottom: { kind: "shorts", color: n.color, trim: "#f4f1ea" },
      head: { kind: "headband", color: "#f4f1ea" },
      feet: { kind: "sneakers", color: "#d6503a" },
      extras: [{ kind: "number", color: "#f4f1ea", color2: shade(n.color, -0.4) }, { kind: "ball" }],
    }),
  },
  teammate: {
    why: "Heading back to the court: matching team jersey and shorts, sneakers.",
    make: (n) => ({
      build: { height: 1.04, width: 1.04 },
      skin: n.skin,
      hair: { style: "buzz", color: H.black },
      top: { kind: "jersey", color: "#6d859f", trim: "#f4f1ea" },
      bottom: { kind: "shorts", color: "#6d859f", trim: "#f4f1ea" },
      feet: { kind: "sneakers", color: "#f2efe8", sole: n.color },
      extras: [{ kind: "number", color: "#f4f1ea", color2: n.color }],
    }),
  },
  rebounder: {
    why: "Chasing a loose ball: gold practice jersey, shorts, carries the basketball.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.dark },
      top: { kind: "jersey", color: n.color, trim: "#3a3f4a" },
      bottom: { kind: "shorts", color: "#3a3f4a", trim: n.color },
      feet: { kind: "sneakers", color: "#3a3f4a" },
      extras: [{ kind: "ball" }],
    }),
  },
  neighbor: {
    why: "Hanging out at the house: relaxed hoodie, jeans, cap.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.chestnut },
      top: { kind: "hoodie", color: n.color },
      bottom: { kind: "trousers", color: DENIM },
      head: { kind: "cap-back", color: "#3c4a5c" },
      feet: { kind: "sneakers", color: "#f0ede6" },
    }),
  },
  visitor: {
    why: "A day-tripper looking for the house: bucket sun hat, shorts, backpack.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "long", color: H.blond },
      top: { kind: "tee", color: n.color },
      bottom: { kind: "shorts", color: KHAKI },
      head: { kind: "bucket", color: CREAM },
      feet: { kind: "sneakers", color: "#e8e3d8" },
      extras: [{ kind: "backpack", color: "#c46b3c" }],
    }),
  },
  student: {
    why: "Stuck on a problem all morning, off to the math lab: backpack and sweater.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "ponytail", color: H.dark },
      top: { kind: "sweater", color: n.color },
      bottom: { kind: "trousers", color: DENIM },
      feet: { kind: "sneakers", color: "#ece8de" },
      extras: [{ kind: "backpack", color: "#3f5f7f" }],
    }),
  },
  classmate: {
    why: "Late for math lab: hoodie, backpack, notebook clutched to the chest.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.black },
      top: { kind: "hoodie", color: n.color },
      bottom: { kind: "trousers", color: CHARCOAL },
      feet: { kind: "sneakers", color: "#ece8de", sole: "#d24a3a" },
      extras: [{ kind: "backpack", color: "#2f3a35" }, { kind: "book", color: "#3e6fa8" }],
    }),
  },
  "math-tutor": {
    why: "Erased the board too soon: cardigan, glasses, clipboard of worked problems.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bun", color: H.dark },
      top: { kind: "shirt", color: "#ebe5d8" },
      bottom: { kind: "skirt", color: CHARCOAL },
      outer: { kind: "cardigan", color: n.color },
      feet: { kind: "flats", color: "#4a3a32" },
      extras: [{ kind: "glasses", color: "#2b2b2b" }, { kind: "clipboard", color: "#8a6a48" }],
    }),
  },
  runner: {
    why: "One more lap, then the gym: running singlet, shorts, visor, bright sneakers.",
    make: (n) => ({
      build: { width: 0.92 },
      skin: n.skin,
      hair: { style: "ponytail", color: H.chestnut },
      top: { kind: "tank", color: n.color, trim: "#f5e05a" },
      bottom: { kind: "shorts", color: "#2d3340", trim: "#f5e05a" },
      head: { kind: "visor", color: "#f5e05a", band: "#2d3340" },
      feet: { kind: "sneakers", color: "#f5e05a", sole: "#f2efe8" },
    }),
  },
  lifter: {
    why: "Talks leg day: broad build, tank top, training shorts, towel over the shoulder.",
    make: (n) => ({
      build: { width: 1.24, height: 1.03 },
      skin: n.skin,
      hair: { style: "buzz", color: H.brown },
      top: { kind: "tank", color: n.color, trim: shade(n.color, -0.3) },
      bottom: { kind: "shorts", color: CHARCOAL },
      feet: { kind: "sneakers", color: CHARCOAL, sole: "#f2efe8" },
      extras: [{ kind: "towel", color: "#f1ede4" }],
    }),
  },
  "gym-walker": {
    why: "Power-walking as a warm-up: tracksuit jacket, joggers, visor.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.grey },
      top: { kind: "tee", color: "#f2efe8" },
      bottom: { kind: "trousers", color: shade(n.color, -0.3) },
      outer: { kind: "jacket", color: n.color, trim: "#f2efe8" },
      head: { kind: "visor", color: "#f2efe8", band: n.color },
      feet: { kind: "sneakers", color: "#f2efe8" },
    }),
  },
  skater: {
    why: "Eyeing the big ramp: baggy tee, backwards cap, skate shoes, beanie-free.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.chestnut },
      top: { kind: "tee", color: n.color, trim: "#e8d26a" },
      bottom: { kind: "trousers", color: "#6b6a5e" },
      head: { kind: "cap-back", color: "#e8d26a", band: "#2a2a2a" },
      feet: { kind: "sneakers", color: "#2a2a2a", sole: "#f2efe8" },
    }),
  },
  "shuttle-player": {
    why: "Doubles player hunting a shuttle: athletic polo, pleated skirt, racket.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "ponytail", color: H.black },
      top: { kind: "polo", color: "#f4f1ea", trim: n.color },
      bottom: { kind: "skirt", color: n.color },
      head: { kind: "headband", color: n.color },
      feet: { kind: "sneakers", color: "#f4f1ea" },
      extras: [{ kind: "racket", color: n.color }],
    }),
  },
  "tower-docent": {
    why: "Gives Hoover Tower tours: blazer, beret, lanyard badge.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.dark },
      top: { kind: "turtleneck", color: CREAM },
      bottom: { kind: "trousers", color: CHARCOAL },
      outer: { kind: "blazer", color: n.color },
      head: { kind: "beret", color: CARDINAL },
      feet: { kind: "shoes", color: "#2e2622" },
      extras: [{ kind: "lanyard", color: CARDINAL, color2: "#f4f2ec" }],
    }),
  },
  mapmaker: {
    why: "Folds a map and offers directions: explorer vest, ranger hat, satchel, map in hand.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.auburn },
      top: { kind: "shirt", color: "#e7dcc3", sleeves: "rolled" },
      bottom: { kind: "trousers", color: "#6e6450" },
      outer: { kind: "vest", color: n.color },
      belt: { color: "#5a3e2b", buckle: "#c8a24e" },
      head: { kind: "ranger", color: KHAKI },
      feet: { kind: "boots", color: "#6a4a33" },
      extras: [{ kind: "satchel", color: "#7a5136" }, { kind: "map" }],
    }),
  },

  // --- Home ---------------------------------------------------------------
  cook: {
    why: "On a break from the kitchen: chef's whites, apron and toque.",
    make: (n) => ({
      build: { width: 1.1 },
      skin: n.skin,
      hair: { style: "crop", color: H.dark },
      top: { kind: "chef", color: "#f4f1ea" },
      bottom: { kind: "trousers", color: "#3b3b3e" },
      outer: { kind: "apron", color: n.color, trim: shade(n.color, -0.35) },
      head: { kind: "chef", color: "#f6f4ef" },
      feet: { kind: "shoes", color: "#2a2a2a" },
    }),
  },
  "prep-cook": {
    why: "Looking for the basil: kitchen apron, headscarf, rolled sleeves.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bun", color: H.black },
      top: { kind: "tee", color: "#f1ede4", sleeves: "rolled" },
      bottom: { kind: "trousers", color: "#3d3a38" },
      outer: { kind: "apron", color: n.color },
      head: { kind: "headscarf", color: "#c9543e", band: "#a33f2e" },
      feet: { kind: "shoes", color: "#2a2a2a" },
    }),
  },
  gardener: {
    why: "Waters the herbs for the kitchen: straw hat, denim overalls, gloves, watering can.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "long", color: H.auburn },
      top: { kind: "shirt", color: "#e8dfc9", sleeves: "rolled" },
      bottom: { kind: "trousers", color: DENIM },
      outer: { kind: "overalls", color: DENIM },
      head: { kind: "straw", color: "#e0b86d", band: n.color },
      feet: { kind: "boots", color: "#5f7a45" },
      gloves: "#7f9a52",
      extras: [{ kind: "watering-can", color: "#6f9a8a" }],
    }),
  },
  "home-neighbor": {
    why: "Checks on the tomatoes: bucket hat, garden apron, gloves, basket.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.grey },
      top: { kind: "shirt", color: "#c9d3b8", sleeves: "rolled" },
      bottom: { kind: "trousers", color: KHAKI },
      outer: { kind: "apron", color: n.color },
      head: { kind: "bucket", color: "#7f8f5e" },
      feet: { kind: "boots", color: "#4f5b3a" },
      gloves: "#c98f4a",
      extras: [{ kind: "basket", color: "#b68a52", color2: "#d0453a" }],
    }),
  },
  regular: {
    why: "Gets lunch here most days: casual flannel shirt, jeans, tote.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.brown },
      top: { kind: "shirt", color: n.color },
      bottom: { kind: "trousers", color: DENIM },
      feet: { kind: "sneakers", color: "#8a6a50", sole: "#efe8da" },
      extras: [{ kind: "tote", color: "#d8cdb2" }],
    }),
  },
  musician: {
    why: "A tune stuck in their head, off to the beat lab: guitar on the back, beanie.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "long", color: H.dark },
      top: { kind: "tee", color: "#2e2f36", trim: n.color },
      bottom: { kind: "trousers", color: "#3e4552" },
      outer: { kind: "jacket", color: n.color },
      head: { kind: "beanie", color: "#a3423a" },
      feet: { kind: "boots", color: "#2a2422" },
      extras: [{ kind: "guitar", color: "#b5743a" }],
    }),
  },
  producer: {
    why: "Wants to sample the birdsong: headphones, bomber jacket, cap.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.black },
      top: { kind: "tee", color: "#f0ece4" },
      bottom: { kind: "trousers", color: "#2f3138" },
      outer: { kind: "jacket", color: n.color, trim: "#2f3138" },
      head: { kind: "cap", color: "#2f3138", band: n.color },
      feet: { kind: "sneakers", color: "#f0ece4" },
      extras: [{ kind: "headphones", color: "#2b2b2f", color2: n.color }],
    }),
  },
  drummer: {
    why: "Can't stop tapping: band tee, drumsticks in both hands, headband.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "curly", color: H.chestnut },
      top: { kind: "tee", color: n.color, sleeves: "none", trim: "#2a2a2a" },
      bottom: { kind: "trousers", color: "#2c2e33" },
      head: { kind: "headband", color: "#c9473a" },
      feet: { kind: "sneakers", color: "#2a2a2a" },
      extras: [{ kind: "drumsticks" }],
    }),
  },
  "record-shopper": {
    why: "Deciding between two records: oversized cardigan, tote bag of vinyl.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.black },
      top: { kind: "turtleneck", color: "#2d2f36" },
      bottom: { kind: "long-skirt", color: "#5c5340" },
      outer: { kind: "cardigan", color: n.color },
      feet: { kind: "boots", color: "#2a2422" },
      extras: [{ kind: "tote", color: "#e6dcc4" }],
    }),
  },
  reader: {
    why: "Lost their place, heading to the quiet study: cardigan, glasses, book.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.chestnut },
      top: { kind: "shirt", color: "#e6e2d8" },
      bottom: { kind: "trousers", color: "#5a5248" },
      outer: { kind: "cardigan", color: n.color },
      feet: { kind: "shoes", color: "#6a4a33" },
      extras: [{ kind: "glasses", color: "#5a3a2a" }, { kind: "book", color: "#8a3a3a" }],
    }),
  },
  "copy-editor": {
    why: "Keeps deleting the first sentence: shirt and vest, glasses, pencil behind the ear, clipboard.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.brown },
      top: { kind: "shirt", color: "#f0ece2", sleeves: "rolled" },
      bottom: { kind: "trousers", color: CHARCOAL },
      outer: { kind: "vest", color: n.color },
      feet: { kind: "shoes", color: "#2e2622" },
      extras: [{ kind: "glasses", color: "#1f1f1f" }, { kind: "pencil" }, { kind: "clipboard", color: "#6b5038" }],
    }),
  },
  postie: {
    why: "Delivering the last envelope: mail-carrier cap and shirt, mailbag, envelope in hand.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.dark },
      top: { kind: "shirt", color: "#9fb6c9" },
      bottom: { kind: "shorts", color: n.color },
      head: { kind: "cap", color: n.color, band: shade(n.color, -0.3) },
      feet: { kind: "shoes", color: "#2a2a2a" },
      extras: [{ kind: "satchel", color: "#3f5f6e" }, { kind: "envelope" }],
    }),
  },
  "go-player": {
    why: "Staring at one corner of a Go board: knit vest, glasses, thoughtful.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.grey },
      top: { kind: "shirt", color: "#e9e4d6" },
      bottom: { kind: "trousers", color: "#4b4a52" },
      outer: { kind: "vest", color: n.color },
      feet: { kind: "shoes", color: "#3a2c26" },
      extras: [{ kind: "glasses", color: "#8a7350" }],
    }),
  },
  "go-regular": {
    why: "A Go club regular: flat cap, cardigan, comfortable shoes.",
    make: (n) => ({
      build: { width: 1.08 },
      skin: n.skin,
      hair: { style: "crop", color: H.white },
      top: { kind: "shirt", color: "#dfe3e6" },
      bottom: { kind: "trousers", color: "#57524a" },
      outer: { kind: "cardigan", color: n.color },
      head: { kind: "flatcap", color: "#6a5f52" },
      feet: { kind: "shoes", color: "#4a382c" },
    }),
  },
  "play-caller": {
    why: "Practising field goals in the wind: 49ers-red windbreaker, gold cap, whistle, clipboard.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.dark },
      top: { kind: "polo", color: NINERS_GOLD },
      bottom: { kind: "trousers", color: "#3a3a3a" },
      outer: { kind: "jacket", color: NINERS_RED, trim: NINERS_GOLD },
      head: { kind: "cap", color: NINERS_RED, band: NINERS_GOLD },
      feet: { kind: "sneakers", color: "#2a2a2a" },
      extras: [{ kind: "whistle", color: NINERS_GOLD }, { kind: "clipboard", color: "#2a2a2a" }],
    }),
  },

  // --- Korea: landmark visitors -------------------------------------------
  "palace-guide": {
    why: "Tells Gyeongbokgung's Joseon history to groups: tour-guide polo, cap, lanyard and a raised flag.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "ponytail", color: H.black },
      top: { kind: "polo", color: n.color, trim: "#f2efe8" },
      bottom: { kind: "trousers", color: "#e2dccb" },
      head: { kind: "cap", color: "#f2efe8", band: n.color },
      feet: { kind: "sneakers", color: "#f2efe8" },
      extras: [{ kind: "lanyard", color: "#d24a3a", color2: "#f4f2ec" }, { kind: "flag", color: "#e8c34a" }],
    }),
  },
  "hall-docent": {
    why: "Explains Geunjeongjeon and officials lined up by rank: scholar's durumagi coat over white baji, black gat.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "topknot", color: H.black },
      top: { kind: "jeogori", color: "#ece6d6" },
      bottom: { kind: "baji", color: "#ece6d6" },
      outer: { kind: "durumagi", color: "#cfd8dc", trim: n.color },
      head: { kind: "gat", color: "#1c1b1d", band: "#3a3436" },
      feet: { kind: "flats", color: "#1f1e1e", sole: "#f0ece4" },
      extras: [{ kind: "book", color: "#2d4a6a" }],
    }),
  },
  "hanok-grandmother": {
    why: "Grew up in a hanok, talks ondol: everyday hanbok (jeogori and chima), bun with a binyeo pin.",
    make: (n) => ({
      build: { height: 0.92, width: 1.04 },
      skin: n.skin,
      hair: { style: "bun", color: H.grey },
      top: { kind: "jeogori", color: "#efe0c8", trim: n.color, sleeves: "long" },
      bottom: { kind: "chima", color: n.color, trim: shade(n.color, 0.3) },
      feet: { kind: "flats", color: "#f2ede4", sole: n.color },
      extras: [{ kind: "binyeo" }, { kind: "goreum", color: n.color }],
    }),
  },
  "astronomy-student": {
    why: "Studies Cheomseongdae and the lunar year: student with backpack, glasses and a star-chart book.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.black },
      top: { kind: "sweater", color: n.color, trim: "#f0ece2" },
      bottom: { kind: "skirt", color: "#3b4250" },
      feet: { kind: "sneakers", color: "#f0ece2" },
      extras: [{ kind: "backpack", color: "#e0b84a" }, { kind: "glasses", color: "#2b2b2b" }, { kind: "book", color: "#25305a" }],
    }),
  },
  "city-wall-walker": {
    why: "Walks Seoul's old city wall to Sungnyemun: hiking vest, bucket hat, backpack, trekking pole, boots.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.black },
      top: { kind: "shirt", color: "#d65a3a", sleeves: "long" },
      bottom: { kind: "trousers", color: "#4a4f45" },
      outer: { kind: "vest", color: n.color },
      head: { kind: "bucket", color: "#6e7a5a" },
      feet: { kind: "boots", color: "#5a4632", sole: "#2a2a2a" },
      extras: [{ kind: "backpack", color: "#3a6a8a" }, { kind: "pole" }],
    }),
  },
  "temple-visitor": {
    why: "Talks Bulguksa's pagodas and sutras: templestay outfit, grey loose top and trousers, orange vest.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "buzz", color: H.black },
      top: { kind: "shirt", color: "#8f9088", sleeves: "long" },
      bottom: { kind: "baji", color: "#8f9088" },
      outer: { kind: "vest", color: "#c9782f" },
      feet: { kind: "flats", color: "#5a4a3a" },
      extras: [{ kind: "book", color: n.color }],
    }),
  },
  "tower-fan": {
    why: "K-pop fan off to a concert: oversized streetwear hoodie, cap, pleated skirt, chunky boots, glowing lightstick.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "long", color: "#3a2a3a" },
      top: { kind: "hoodie", color: n.color },
      bottom: { kind: "skirt", color: "#2a2b33" },
      head: { kind: "cap", color: "#2a2b33", band: n.color },
      feet: { kind: "boots", color: "#f0ece6", sole: "#2a2a2a" },
      extras: [{ kind: "lightstick", color: "#ff9ed2" }],
    }),
  },
  "architecture-student": {
    why: "Talks Zaha Hadid's DDP and Lotte Tower: architect black turtleneck, round glasses, drawing tube.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.black },
      top: { kind: "turtleneck", color: "#232428" },
      bottom: { kind: "trousers", color: "#2e3036" },
      outer: { kind: "blazer", color: n.color },
      feet: { kind: "shoes", color: "#1e1e1e" },
      extras: [{ kind: "glasses", color: "#9a8a6a" }, { kind: "roll", color: "#c9c2b0" }],
    }),
  },

  // --- Korea: locals ------------------------------------------------------
  maker: {
    why: "Back to the workshop: canvas shop apron, hard hat, rolled sleeves, pouch belt.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.dark },
      top: { kind: "tee", color: "#d9d1c0", sleeves: "rolled" },
      bottom: { kind: "trousers", color: "#4a4a42" },
      outer: { kind: "apron", color: n.color },
      belt: { color: "#5a3e2b", pouch: "#7a5136" },
      head: { kind: "hardhat", color: "#e9b440" },
      feet: { kind: "boots", color: "#6a4a33" },
    }),
  },
  researcher: {
    why: "Escaped their screen for a minute: lab coat, ID badge on a lanyard, glasses.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.black },
      top: { kind: "shirt", color: n.color },
      bottom: { kind: "trousers", color: "#3e4450" },
      outer: { kind: "labcoat", color: "#f3f2ee" },
      feet: { kind: "shoes", color: "#2e2a28" },
      extras: [{ kind: "lanyard", color: "#2f5f9a", color2: "#f4f2ec" }, { kind: "glasses", color: "#2b2b2b" }],
    }),
  },
  "puzzle-solver": {
    why: "Trying to stop thinking about the puzzle: cosy sweater, glasses, notebook.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "curly", color: H.brown },
      top: { kind: "sweater", color: n.color, trim: shade(n.color, 0.2) },
      bottom: { kind: "trousers", color: "#3d4250" },
      feet: { kind: "sneakers", color: "#2a2a2a" },
      extras: [{ kind: "glasses", color: "#1f1f1f" }, { kind: "book", color: "#e0b84a" }],
    }),
  },
  photographer: {
    why: "Trying to catch the light: photo vest, camera on a neck strap, beret.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "bob", color: H.dark },
      top: { kind: "tee", color: "#2e3036" },
      bottom: { kind: "trousers", color: "#6b6450" },
      outer: { kind: "vest", color: "#6e6a52" },
      head: { kind: "beret", color: n.color },
      feet: { kind: "sneakers", color: "#e6e1d6" },
      extras: [{ kind: "camera" }],
    }),
  },
  "booth-visitor": {
    why: "Blinked in every photo-booth shot: trendy Seoul casual, cardigan, mini skirt, tote.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "long", color: H.dark },
      top: { kind: "tee", color: "#f2ede6" },
      bottom: { kind: "skirt", color: "#4a5a7a" },
      outer: { kind: "cardigan", color: n.color },
      feet: { kind: "flats", color: "#2a2a2a" },
      extras: [{ kind: "tote", color: "#e9dcc4" }],
    }),
  },
  "food-regular": {
    why: "Orders the same lunch every day: office shirt, lanyard, iced coffee in hand.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.black },
      top: { kind: "shirt", color: "#dfe7ef" },
      bottom: { kind: "trousers", color: "#2f3440" },
      belt: { color: "#2a2422", buckle: "#c0c4c8" },
      feet: { kind: "shoes", color: "#2a2422" },
      extras: [{ kind: "lanyard", color: n.color }, { kind: "cup" }],
    }),
  },
  "lunch-vendor": {
    why: "Hands out napkins at the food stall: vendor apron, visor, rolled sleeves.",
    make: (n) => ({
      build: { width: 1.08 },
      skin: n.skin,
      hair: { style: "crop", color: H.black },
      top: { kind: "tee", color: "#f1ede4", sleeves: "rolled" },
      bottom: { kind: "trousers", color: "#3b3b3e" },
      outer: { kind: "apron", color: n.color, trim: shade(n.color, -0.35) },
      head: { kind: "visor", color: "#d24a3a", band: "#d24a3a" },
      feet: { kind: "shoes", color: "#2a2a2a" },
    }),
  },
  picnicker: {
    why: "Found a spot in the shade: sundress, wide straw sun hat, picnic basket.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "long", color: H.chestnut },
      top: { kind: "tee", color: n.color, sleeves: "short" },
      bottom: { kind: "long-skirt", color: n.color },
      head: { kind: "straw", color: "#e6c98a", band: "#c96a5a" },
      feet: { kind: "flats", color: "#c9a27a" },
      extras: [{ kind: "basket", color: "#b68a52", color2: "#e8b0a8" }],
    }),
  },
  "river-walker": {
    why: "Takes the long way home by the river: light windbreaker, scarf, sneakers.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "side", color: H.dark },
      top: { kind: "tee", color: "#ece8de" },
      bottom: { kind: "trousers", color: "#4a4f5a" },
      outer: { kind: "jacket", color: n.color, trim: shade(n.color, 0.2) },
      feet: { kind: "sneakers", color: "#ece8de" },
      extras: [{ kind: "scarf", color: "#d9b25a" }],
    }),
  },
  "bridge-cyclist": {
    why: "Taking a breather on a ride: cycling jersey, bike helmet, shorts, gloves.",
    make: (n) => ({
      build: { width: 0.94 },
      skin: n.skin,
      hair: { style: "crop", color: H.black },
      top: { kind: "jersey", color: n.color, trim: "#2a2d35", sleeves: "short" },
      bottom: { kind: "shorts", color: "#22252b" },
      head: { kind: "helmet", color: "#f2efe8", band: n.color },
      feet: { kind: "sneakers", color: "#22252b", sole: "#f2efe8" },
      gloves: "#22252b",
      extras: [{ kind: "sunglasses", color: "#22252b" }],
    }),
  },
  "park-guide": {
    why: "Points the way to the river: park-ranger shirt, campaign hat, badge, belt.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "crop", color: H.dark },
      top: { kind: "shirt", color: "#c9b98a" },
      bottom: { kind: "trousers", color: n.color },
      belt: { color: "#4a3626", buckle: "#c8a24e", pouch: "#4a3626" },
      head: { kind: "ranger", color: "#7a6a48", band: "#4a3626" },
      feet: { kind: "boots", color: "#4a3626" },
      extras: [{ kind: "lanyard", color: n.color, color2: "#e8c34a" }],
    }),
  },
  "bridge-lookout": {
    why: "Stops here even when late: office commuter in a blazer with a satchel.",
    make: (n) => ({
      skin: n.skin,
      hair: { style: "ponytail", color: H.black },
      top: { kind: "shirt", color: "#f2efe8" },
      bottom: { kind: "skirt", color: "#2f3440" },
      outer: { kind: "blazer", color: n.color },
      feet: { kind: "flats", color: "#2a2422" },
      extras: [{ kind: "satchel", color: "#6a4a33" }],
    }),
  },
  angler: {
    why: "No bites, that's all right: fishing vest with pockets, bucket hat, rod.",
    make: (n) => ({
      build: { width: 1.06 },
      skin: n.skin,
      hair: { style: "crop", color: H.grey },
      top: { kind: "shirt", color: "#8fa3b0", sleeves: "rolled" },
      bottom: { kind: "trousers", color: "#5a5a48" },
      outer: { kind: "vest", color: "#8a8a5a" },
      head: { kind: "bucket", color: n.color },
      feet: { kind: "boots", color: "#3f4a3a" },
      extras: [{ kind: "rod" }],
    }),
  },
};

const HAIRS = [H.dark, H.brown, H.black, H.chestnut, H.blond];
const STYLES = ["crop", "bob", "side", "ponytail", "curly"] as const;
function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Casual fallback for a villager without a cast entry. */
export function casualOutfit(npc: Villager): Outfit {
  const h = hashId(npc.id);
  return {
    skin: npc.skin,
    hair: { style: STYLES[h % STYLES.length], color: HAIRS[(h >>> 3) % HAIRS.length] },
    top: { kind: "tee", color: npc.color },
    bottom: { kind: "trousers", color: ["#3a4547", "#4b4a5e", "#6b5844", DENIM][(h >>> 6) % 4] },
    head: npc.hat ? { kind: "straw", color: "#e0b86d", band: npc.color } : undefined,
    feet: { kind: "sneakers", color: "#ece8de" },
  };
}

/** Expression and eye colour per villager, from their role and lines. */
const FACE: Record<string, { expr: NonNullable<Outfit["face"]>["expr"]; eyes?: string; flick?: boolean }> = {
  cook: { expr: "grin" }, "lunch-vendor": { expr: "grin" }, "prep-cook": { expr: "smile", eyes: "#7a5a2e" },
  "tower-fan": { expr: "excited", flick: true }, "booth-visitor": { expr: "excited" }, drummer: { expr: "excited" },
  "palace-guide": { expr: "grin" }, "hall-docent": { expr: "proud" }, "tower-docent": { expr: "proud", flick: true },
  "architecture-student": { expr: "proud" }, researcher: { expr: "thoughtful" }, "puzzle-solver": { expr: "thoughtful", eyes: "#7a5a2e" },
  "math-tutor": { expr: "thoughtful" }, "go-player": { expr: "thoughtful" }, "go-regular": { expr: "smile" },
  student: { expr: "thoughtful" }, classmate: { expr: "smile" }, reader: { expr: "thoughtful", eyes: "#5d7f6a" },
  "copy-editor": { expr: "thoughtful" }, hooper: { expr: "grin" }, rower: { expr: "grin" }, teammate: { expr: "grin" },
  rebounder: { expr: "excited" }, "hanok-grandmother": { expr: "grin" }, "astronomy-student": { expr: "excited", flick: true },
  "park-guide": { expr: "grin" }, musician: { expr: "grin" }, visitor: { expr: "smile", eyes: "#4f7fb0" },
  picnicker: { expr: "smile", eyes: "#8a6a32" }, gardener: { expr: "grin", eyes: "#6f7f3a" }, neighbor: { expr: "smile", eyes: "#8a6a32" },
  runner: { expr: "grin", eyes: "#4f7fb0" }, skater: { expr: "grin" }, "shuttle-player": { expr: "excited" },
  postie: { expr: "grin" }, mapmaker: { expr: "smile", eyes: "#8a6a32" }, "play-caller": { expr: "proud" },
};
export const outfitFor = (npc: Villager): Outfit => {
  const o = CAST[npc.id]?.make(npc) ?? casualOutfit(npc);
  const f = FACE[npc.id];
  return f ? { ...o, eyes: o.eyes ?? f.eyes, face: { expr: f.expr, flick: f.flick } } : o;
};

