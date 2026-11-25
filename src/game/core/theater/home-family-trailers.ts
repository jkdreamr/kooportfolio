import type { TheaterFilm } from "./types";

// Shard Home-B: family/kids official channels, open movies and studio trailers.
// Official rights-holder channels only, allowlisted by channel ID.
export const CHANNELS: Record<string, string> = {
  "Bluey — Official Channel": "UCVzLLZkDuFGAE2BGdBuBNBg",
  "Mr Bean": "UCkAGrHCLFmlK3H2kd6isipg",
  Pokémon: "UCFctpiB_Hnlk3ejWfHqSm6Q",
  LEGO: "UCP-Ng5SXUEt0VE-TXqRdL6g",
  "Sony Pictures Entertainment": "UCz97F7dMxBNOfGYu3rx8aCw",
};

type Row = readonly [id: string, episode: string];

const show = (
  title: string,
  channel: string,
  kind: TheaterFilm["kind"],
  rows: readonly Row[],
): TheaterFilm[] =>
  rows.map(([id, episode]) => ({ id, title, episode, channel, kind }));

export const FILMS: readonly TheaterFilm[] = [
  ...show("Bluey", "Bluey — Official Channel", "Full episode", [
    ["MmuDI7lbJpk", "The Beach"],
    ["ewekkT49lsM", "Seesaw"],
    ["YpI0jgqNJGc", "The Pool"],
    ["W3GpdLhgHVA", "Hotel"],
    ["V3r4UWtoN_o", "The Sleepover"],
    ["FCeGAAo6WbM", "Movies"],
    ["vAdXLDVkjVA", "Yoga Ball"],
    ["Q-K4TCO7Lp8", "Magic Asparagus"],
    ["3-JaRuTxlaU", "Bingo"],
    ["xmkCmJtK6X8", "Baby Race"],
    ["zL_vNn06a5M", "Pizza Girls"],
    ["yY4GKcH1rRg", "Granny Mobile"],
    ["JcinTAfwdVw", "Christmas Swim"],
    ["e8ULi9CC6os", "Dad Baby"],
    ["h7sBLY6vXLU", "Pass the Parcel"],
    ["gvaeBYeN70g", "Unicorse"],
    ["kx8_wF9HOX8", "Faceytalk"],
    ["8z2WihkDEHI", "Stories"],
  ]),
  ...show("Mr. Bean", "Mr Bean", "Full episode", [
    ["7Im2I6STbms", "Episode 1 · Mr. Bean"],
    ["YtfQLyy43Xg", "Episode 2 · The Return of Mr. Bean"],
    ["mcOsNvDbYqM", "Episode 3 · The Curse of Mr. Bean"],
    ["N8arZdtpINE", "Episode 4 · Mr. Bean Goes to Town"],
    ["SgA85x-7TaY", "Episode 5 · The Trouble with Mr. Bean"],
    ["TvQw9VVfZwk", "Episode 6 · Mr. Bean Rides Again"],
    ["HKUY_gOxLas", "Episode 7 · Merry Christmas, Mr. Bean"],
    ["RbikwV0HbZs", "Episode 8 · Mr. Bean in Room 426"],
    ["e6VaYr7xOsw", "Episode 9 · Do-It-Yourself Mr. Bean"],
    ["ORMYFBsOvvA", "Episode 10 · Mind the Baby, Mr. Bean"],
    ["5JPKE5ynCLY", "Episode 11 · Back to School Mr. Bean"],
    ["0RnKU0o-tDg", "Episode 12 · Tee Off, Mr. Bean"],
    ["JcpqQm4bkeQ", "Episode 13 · Goodnight Mr. Bean"],
    ["FsEhY4SexV0", "Episode 14 · Hair by Mr. Bean of London"],
  ]),
  ...show("Mr. Bean: The Animated Series", "Mr Bean", "Full episode", [
    ["qfg4aSLxFcI", "S1 E1 · In the Wild"],
    ["bf11g_i8-3w", "S1 E7 · Mime Games"],
    ["S0r-BHE1fS4", "S1 E8 · Spring Clean"],
    ["WqKJvCyt9Co", "S1 E10 · Ray of Sunshine"],
    ["JxDWz9Qv0LM", "S1 E14 · The Sofa"],
    ["AaEOGyWCCws", "S1 E17 · Camping"],
    ["zHY3wHZtNCU", "S1 E20 · Young Bean"],
    ["0DjXUYs_FBk", "S1 E24 · Toothache"],
    ["IexoJu3TMWM", "S1 E27 · Nurse"],
    ["hcZDxomV7rA", "S1 E36 · Restaurant"],
    ["HhcdFibiyQg", "S1 E38 · Scaredy Bean"],
    ["kH_Vkrwl5xc", "S1 E43 · Big TV"],
    ["cY3dzPkCXnY", "S2 E1 · Home Movie"],
    ["BgQGaI5-0jA", "S2 E5 · Green Bean"],
    ["F5YZyMg7ePI", "S2 E14 · Viral Bean"],
    ["Ra4TqZ_LgRA", "S2 E18 · Lord Bean"],
    ["3EKS5oZbXYo", "S3 E18 · Coach Trip"],
  ]),
  ...show("Pokémon: Indigo League", "Pokémon", "Full episode", [
    ["Zyt2GKb6qWw", "Episode 1 · Pokémon – I Choose You!"],
  ]),
  ...show("Pokémon: The Johto Journeys", "Pokémon", "Full episode", [
    ["d722bGusttw", "Episode 1 · Don't Touch That 'dile"],
  ]),
  ...show("Pokémon: Advanced", "Pokémon", "Full episode", [
    ["dkVNZY8hoR8", "Episode 1 · Get the Show on the Road"],
  ]),
  ...show("Pokémon: Diamond and Pearl", "Pokémon", "Full episode", [
    ["LA9mX6uxgvM", "Episode 1 · Following a Maiden's Voyage"],
  ]),
  ...show("Pokémon: Black & White", "Pokémon", "Full episode", [
    ["AupFEoIkSAE", "Episode 1 · In the Shadow of Zekrom!"],
  ]),
  ...show("Pokémon the Series: XY", "Pokémon", "Full episode", [
    ["SeJkcF6gYjA", "Episode 1 · Kalos, Where Dreams and Adventures Begin!"],
  ]),
  ...show("Pokémon the Series: Sun & Moon", "Pokémon", "Full episode", [
    ["oVm96zTiSl0", "Episode 1 · Alola to New Adventure!"],
  ]),
  ...show("Pokémon Journeys", "Pokémon", "Full episode", [
    ["uKEnSOCmD3A", "Episode 1 · Enter Pikachu!"],
  ]),
  ...show("Pokémon Horizons", "Pokémon", "Full episode", [
    ["EOo8jyymztA", "S1 E1 · The Pendant That Starts It All, Part 1"],
    ["uiR60dG-8BM", "S1 E2 · The Pendant That Starts It All, Part 2"],
    ["VmTSAWTQhmE", "S2 E1 · Welcome to Naranja Academy!"],
    ["QUnqM6BeQnE", "S2 E2 · Put Your Heart into It!"],
    ["iE-at9RW3VI", "S3 E1 · Eyes to the Skies Once Again, Part 1"],
    ["P47US-ZdC7M", "S3 E2 · Eyes to the Skies Once Again, Part 2"],
  ]),
  ...show("Pokémon Mystery Dungeon", "Pokémon", "Full episode", [
    ["rAOmQ-foqeg", "Team Go-Getters Out of the Gate!"],
    ["V0PlwsTLoM0", "Explorers of Time and Darkness"],
    ["y5wGtHkCY0Y", "Explorers of Sky: Beyond Time and Darkness"],
  ]),
  ...show("Pokémon Evolutions", "Pokémon", "Full episode", [
    ["v56BRim3g0w", "Episode 1 · The Champion"],
    ["n-qLMis6ids", "Episode 2 · The Eclipse"],
    ["i4TNqOlTY0M", "Episode 3 · The Visionary"],
    ["Mds1-c2MGkI", "Episode 4 · The Plan"],
    ["qgY9RYTO7Nw", "Episode 5 · The Rival"],
    ["oIhxsoFiccU", "Episode 6 · The Wish"],
    ["hwq6shJVpDE", "Episode 7 · The Show"],
    ["_-K-sVn8Iko", "Episode 8 · The Discovery"],
  ]),
  ...show("Pokémon: Twilight Wings", "Pokémon", "Full episode", [
    ["rYDmL5VH-uk", "Episode 1 · Letter"],
    ["ZOSoQxSHKKE", "Episode 2 · Training"],
    ["P0cXpOnfX6I", "Episode 3 · Buddy"],
    ["gfsT2uqJPOc", "Episode 4 · Early-Evening Waves"],
  ]),
  ...show("Pokémon: Twilight Wings", "Pokémon", "Short film", [
    ["liZuy6ufYMs", "Episode 5 · Assistant"],
  ]),
  ...show("Pokémon: Twilight Wings", "Pokémon", "Full episode", [
    ["CIxj6cUMm7M", "Episode 6 · Moonlight"],
    ["3-144RjSRWI", "Episode 7 · Sky"],
  ]),
  ...show("Pokémon: Hisuian Snow", "Pokémon", "Full episode", [
    ["thhRi11aTI8", "Episode 1 · Onto the Icy Blue"],
    ["zflsMl4_b0U", "Episode 2 · Fiery Reflections in Snow"],
    ["OLpFe1_qOgI", "Episode 3 · Two Hues"],
  ]),
  ...show("Pokémon: Paldean Winds", "Pokémon", "Full episode", [
    ["uyMxQl-PeJE", "Episode 1 · Breathe Out"],
    ["24jkD5LodAc", "Episode 2 · Breathe In"],
    ["f0P0cnVmhJE", "Episode 3 · Take a Breath"],
    ["3dYrLv5HULQ", "Episode 4 · Breathe Together"],
  ]),
  ...show("LEGO NINJAGO: Dragons Rising", "LEGO", "Full episode", [
    ["NkPurwGQV1w", "S2 E2 · Shattered Dreams"],
    ["S0PA7VPv8uY", "S2 E3 · Beyond the Phantasm Cave"],
    ["G0vi-UKK-8E", "S2 E7 · Fugitives from Madness"],
    ["oLJYvxP210w", "S2 E10 · Rising Ninja"],
    ["no6_j6Qd2Jw", "S3 E1 · The Missing"],
    ["YJHQKgb6Uxs", "S3 E3 · The Spectral Lands"],
    ["F1eOEvRIqTs", "S3 E4 · The Great Zane Robbery"],
    ["Y_kwzJbWo-Y", "S3 E5 · I Alone Can Save Them!"],
    ["25OjMmQRoo8", "S3 E6 · Summoning Help!"],
    ["zaCS2CXM5Gg", "S4 E1 · The Whispering Wood"],
    ["dw-Cznf1gi4", "S4 E2 · Fate Brought You Here"],
    ["hgu2NpfW9AY", "S4 E3 · Tonight, We Hunt Monsters!"],
  ]),
  ...show("LEGO DREAMZzz", "LEGO", "Full episode", [
    ["y9Y5ZvC-MHg", "S1 E1 · Awakening"],
    ["avGpzpRpQWQ", "S1 E6 · The Anomaly"],
    ["INJP9G5fnqQ", "S1 E16 · The Worthy Dreamer"],
    ["pOuzmm3f49g", "S2 E4 · Sick Beats!"],
  ]),
  ...show(
    "Spider-Man: Across the Spider-Verse",
    "Sony Pictures Entertainment",
    "Trailer",
    [["shW9i6k8cB0", "Official trailer 2"]],
  ),
];
