import type { TheaterFilm } from "./types";

// Shard Home-B: family/kids official channels, open movies and studio trailers.
// Official rights-holder channels only, allowlisted by channel ID.
export const CHANNELS: Record<string, string> = {
  "Bluey — Official Channel": "UCVzLLZkDuFGAE2BGdBuBNBg",
  "Sony Pictures Entertainment": "UCz97F7dMxBNOfGYu3rx8aCw",
};

export const FILMS: readonly TheaterFilm[] = [
  {
    id: "MmuDI7lbJpk",
    title: "Bluey",
    episode: "The Beach",
    channel: "Bluey — Official Channel",
    kind: "Full episode",
  },
  {
    id: "shW9i6k8cB0",
    title: "Spider-Man: Across the Spider-Verse",
    episode: "Official trailer 2",
    channel: "Sony Pictures Entertainment",
    kind: "Trailer",
  },
];
