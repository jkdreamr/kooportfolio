export type TheaterFilm = {
  id: string;
  title: string;
  episode: string;
  channel: string;
  kind: "Full episode" | "Short film" | "Trailer";
};

// Add only owner-approved, official uploads whose embeds have been checked.
// No thumbnail, oEmbed or player requests run while browsing this catalog.
export const THEATER_PROGRAM: readonly TheaterFilm[] = [
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
    id: "MmuDI7lbJpk",
    title: "Bluey",
    episode: "The Beach",
    channel: "Bluey — Official Channel",
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
  {
    id: "shW9i6k8cB0",
    title: "Spider-Man: Across the Spider-Verse",
    episode: "Official trailer 2",
    channel: "Sony Pictures Entertainment",
    kind: "Trailer",
  },
];

// Official BANGTANTV / KBS WORLD uploads; full episodes, not fan reuploads.
// Watch metadata confirmed OK + playableInEmbed for every entry.
export const KOREA_THEATER_PROGRAM: readonly TheaterFilm[] = [
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

export function youtubeEmbedUrl(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}
