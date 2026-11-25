import type { TheaterFilm } from "./types";

// Shard Korea-A: idol and web variety on artists' / studios' own channels.
// Official rights-holder channels only, allowlisted by channel ID; every
// entry verified embeddable, owner-matched and landscape.
export const CHANNELS: Record<string, string> = {
  BANGTANTV: "UCLkAepWjdylmXSltofFvsYQ",
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
    ["KA6OilIOjcI", "2.0 · It's Here!"],
    ["wu6bA3zK_us", "2.0 · BTS's Trip, Episode 1"],
    ["9D-8kb6RIK4", "2.0 · BTS's Trip, Episode 2"],
    ["jvvuHBGKuR0", "2.0 · BTS's Trip, Episode 3"],
    ["i9T0TiqiARY", "2.0 · BTS Dinner Party 2.0"],
    ["qmp3RB7qbN4", "2.0 · BTS in Toronto, Episode 1"],
    ["pfUnfbaNarg", "2.0 · BTS in Toronto, Episode 2"],
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
    ["NJhoWnlRECw", "Episode 1 · 5 Days Since Discharge and I'm Climbing Mt. Hallasan"],
    ["ybBPvd5Qt_M", "Episode 2 · A Glorious Homecoming"],
    ["zm42SXCpuSo", "Episode 3 · Even Leaving the Military Wasn't This Hard"],
    ["JliAZvhJpl8", "Episode 4 · A Dangerous Invitation from Jin 1"],
    ["v5rUGagE910", "Episode 5 · A Dangerous Invitation from Jin 2"],
    ["0uoVYPw4hf4", "Episode 6 · The Prince of Tennis"],
    ["HjF32v4uFXw", "Episode 7 · The New Channel Owner"],
    ["Jvn4PtnzX44", "Episode 8 · Find Jin"],
    ["ytaopkxZUmU", "Episode 9 · Blood, Sweat & Peppers"],
    ["o799SNn4eTU", "Episode 10 · Freeze! Polliceping"],
    ["Xozj294ILP8", "Episode 11 · I Met a Ghost for Real"],
    ["na6LvaQhCQk", "Episode 12 · K-Mukbang"],
    ["Stwau2ND_fo", "Episode 13 · Don't Watch This If You Don't Want to Marry Jin"],
    ["EzJaR8QL0q4", "Episode 14 · \"Goodbye, Jin\""],
    ["SBjbstFEYtA", "Episode 15 · You've Been Kidnapped"],
    ["nnO1o6TYhaM", "Episode 16 · It's Me, Zombie"],
    ["whJJzrKE65g", "Episode 17 · New Year's Gift Giveaway"],
    ["D0HRrxipY_Y", "Episode 18 · The Magpie 'Jin' that Repaid a Favor"],
    ["ySb4CteETSk", "Episode 19 · Gymnastics Day"],
    ["a3sNjokvUI4", "Episode 20 · Variety Show Extravaganza 1"],
    ["tweKMEEFYks", "Episode 21 · Variety Show Extravaganza 2"],
    ["N6SBPaCYhV4", "Episode 22 · Jin vs Jin (feat. Climbing)"],
    ["XFfu0mjKW0k", "Episode 23 · Jin in the Strange Land of Fairytales"],
    ["A2oK2xPvJV0", "Episode 24 · Squid-Jin Game 1"],
    ["CMXCZAJR1aU", "Episode 25 · Squid-Jin Game 2"],
  ].map(
    ([id, episode]): TheaterFilm => ({
      id,
      title: "Run Jin",
      episode,
      channel: "BANGTANTV",
      kind: "Full episode",
    }),
  ),
];
