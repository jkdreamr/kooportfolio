import type { TheaterFilm } from "./types";

// Shard Korea-A: idol and web variety on artists' / studios' own channels.
// Official rights-holder channels only, allowlisted by channel ID.
export const CHANNELS: Record<string, string> = {
  BANGTANTV: "UCLkAepWjdylmXSltofFvsYQ",
  "IU Official": "UC3SyT4_WLHzN7JmHQwKQZww",
  SEVENTEEN: "UCfkXDY7vwkcJ8ddFGz8KusA",
  // TODO(Korea-A): confirm SBS Mobidic channel ID from 5LGPm58E8qA.
  "SBS Mobidic": "",
};

export const FILMS: readonly TheaterFilm[] = [
  ...[
    ["nYyAQ_w0qGc", "Next Top Genius · Part 1"],
    ["EjUUTh8eqbo", "Next Top Genius · Part 2"],
    ["LjGzTSodJdE", "Mini Field Day · Part 1"],
    ["FDkciHzrZyo", "Mini Field Day · Part 2"],
    ["XJDPzNzQ3RE", "Fly BTS Fly · Part 1"],
    ["tLeZStGVaAY", "Fly BTS Fly · Part 2"],
    ["wtVKQDEZoF0", "Telepathy · Part 1"],
    ["nbRKyymm4Eg", "Telepathy · Part 2"],
  ].map(
    ([id, episode]): TheaterFilm => ({
      id,
      title: "Run BTS!",
      episode,
      channel: "BANGTANTV",
      kind: "Full episode",
    }),
  ),
  {
    id: "OP9I2w7UMDc",
    title: "IU's Palette",
    episode: "Episode 19 · With SUGA",
    channel: "IU Official",
    kind: "Full episode",
  },
  {
    id: "5LGPm58E8qA",
    title: "Jessi's Showterview",
    episode: "Episode 55 · With TWICE",
    channel: "SBS Mobidic",
    kind: "Full episode",
  },
  {
    id: "BeDkwcm-nJ4",
    title: "Going Seventeen",
    episode: "Episode 68 · Don't Lie: CLUE, Part 1",
    channel: "SEVENTEEN",
    kind: "Full episode",
  },
];
