import type { TheaterFilm } from "./types";

// Shard Korea-B: broadcaster variety, classic drama, Korean film + trailers.
// Official rights-holder channels only, allowlisted by channel ID.
export const CHANNELS: Record<string, string> = {
  "KBS WORLD TV": "UC5BMQOsAB8hKUyHu9KI6yig",
  NEON: "UCpy5dRhZd-JbZP4NsrnLt1w",
  Netflix: "UCWOA1ZGywLbqmigxE4Qlvuw",
};

export const FILMS: readonly TheaterFilm[] = [
  ...[
    ["cRjxcYnQkS0", "Episode 19"],
    ["numTqoidzM8", "Episode 20"],
    ["VRypmv-7PxU", "Episode 194 · I'm a Star"],
    ["CxjPmXMKJrE", "Episode 6"],
  ].map(
    ([id, episode]): TheaterFilm => ({
      id,
      title: "The Return of Superman",
      episode,
      channel: "KBS WORLD TV",
      kind: "Full episode",
    }),
  ),
  {
    id: "isOGD_7hNIY",
    title: "Parasite",
    episode: "Official trailer",
    channel: "NEON",
    kind: "Trailer",
  },
  {
    id: "oqxAJKy0ii4",
    title: "Squid Game",
    episode: "Official trailer",
    channel: "Netflix",
    kind: "Trailer",
  },
];
