import type { TheaterFilm } from "./types";

// Shard Home-A: Disney / Pixar / Cartoon Network / Warner / Marvel.
// Official rights-holder channels only, allowlisted by channel ID.
export const CHANNELS: Record<string, string> = {
  "Disney Channel Animation": "UCw7SNYrYei7F5ttQO3o-rpA",
  Pixar: "UC_IRYSp4auq7hKLvziWVH6w",
};

export const FILMS: readonly TheaterFilm[] = [
  {
    id: "o2E2wLm_LlY",
    title: "Gravity Falls",
    episode: "Tourist Trapped · S1 E1",
    channel: "Disney Channel Animation",
    kind: "Full episode",
  },
  {
    id: "fLWBx37eKBM",
    title: "Phineas and Ferb",
    episode: "Rollercoaster · S1 E1",
    channel: "Disney Channel Animation",
    kind: "Full episode",
  },
  {
    id: "XcOWOLX1z14",
    title: "DuckTales",
    episode: "Woo-oo! · S1 E1 & E2",
    channel: "Disney Channel Animation",
    kind: "Full episode",
  },
  {
    id: "DViUDJuFPhQ",
    title: "The Owl House",
    episode: "A Lying Witch and a Warden · S1 E1",
    channel: "Disney Channel Animation",
    kind: "Full episode",
  },
  {
    id: "XX3uta-AuEg",
    title: "Amphibia",
    episode: "Anne or Beast? / Best Fronds · S1 E1",
    channel: "Disney Channel Animation",
    kind: "Full episode",
  },
  {
    id: "LEjhY15eCx0",
    title: "Inside Out 2",
    episode: "Official trailer",
    channel: "Pixar",
    kind: "Trailer",
  },
];
