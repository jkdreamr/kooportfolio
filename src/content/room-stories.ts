import type { PlaceId } from "../game/core/world";

/**
 * The "About Josh" card in each building. Every sentence comes from Josh's
 * own site source (J = /home/user/jkdreamr/josh, file:line in each comment)
 * or from his own message of 2026-11-27 ([owner]). Fictional rooms do not
 * imply membership or employment.
 *
 * PENDING_OWNER marks text his site does not show and he has not yet
 * confirmed; tests pin where each such phrase may appear.
 */
export type RoomStoryEntry = { text: string; link?: string; label?: string };

const ABOUT = { link: "https://joshuakoo.xyz", label: "About Josh" } as const;
const LINKEDIN = { link: "https://linkedin.com/in/joshuaykoo", label: "LinkedIn" } as const;

export const roomStories: Partial<Record<PlaceId, RoomStoryEntry>> = {
  // Not on his site (kept from before, unverified here): skateboarding.
  skate: {
    text: "Josh picked up skateboarding as a freshman at Stanford and still rides for fun.",
    ...ABOUT,
  },
  // Not on his site (kept from before, unverified here): Los Altos.
  theater: {
    text: "Josh grew up in Los Altos, just down the road from Stanford. He studies CS and math there now.",
    ...ABOUT,
  },
  // Club: J data.ts:58. "plays when he can": J Messages.tsx:26.
  // Middle school, freshman year: [owner].
  badminton: {
    text: "Josh played badminton in middle school and joined Stanford's badminton club his freshman year. These days he plays when he can.",
    ...ABOUT,
  },
  // Go: J Notes.tsx:86. Languages: J data.ts:118–120.
  go: {
    text: "Josh plays Go. He speaks Korean, English and Chinese.",
    ...ABOUT,
  },
  // Verses: J data.ts:82. Poetry, songwriting and essays: [owner]. No
  // quotes, at his request (and his site publishes none).
  writing: {
    text: "Josh loves to write: poetry, songwriting and essays. He even built Verses, a songwriting surface, for his songs.",
    link: "https://verses-zeta.vercel.app/",
    label: "Verses",
  },
  // "go 49ers!": J Notes.tsx:87. "Huge fan": [owner].
  stadium: {
    text: "Go 49ers! Josh is a huge fan.",
    ...ABOUT,
  },
  // Walked on as a coxswain: J Notes.tsx:19. As a sophomore: [owner] (the
  // athletics roster's year is wrong, so it is not linked).
  boathouse: {
    text: "Josh walked on to Stanford men's rowing as a sophomore. He's a coxswain: he steers the boat and calls the race.",
    ...ABOUT,
  },
  // LeBron: [owner]. Basketball: J Notes.tsx:87.
  basketball: {
    text: "Josh is a lifelong LeBron fan.",
    ...ABOUT,
  },
  // Alphag3n: [owner] confirmed 2026-11-27 and asked for it to be featured
  // (not on his site). CRV, NEAR, Pantera: J data.ts:68–70.
  office: {
    text: "Before Stanford, Josh founded Alphag3n, a startup backed by sponsors like Coinbase, Solana and Polygon. Today he's an investment intern at CRV, after NEAR Protocol and Pantera Capital.",
    ...LINKEDIN,
  },
  // Kappa Sigma, TreeHacks, Blockchain Club: J data.ts:49–53.
  kappa: {
    text: "Josh is in Kappa Sigma at Stanford. He helped organize TreeHacks and ran growth for the Stanford Blockchain Club.",
    ...ABOUT,
  },
  // Korea efforts, Devin: J data.ts:67, 101. Hiring line: [owner].
  // "Chief of Staff, APAC": [owner] confirmed 2026-11-27 (not on his site).
  cognition: {
    text: "Josh leads Cognition's Korea efforts as Chief of Staff, APAC. Cognition makes Devin, the AI software engineer. They're hiring for Korea: message or DM Joshua.",
    link: LINKEDIN.link,
    label: "Message Josh",
  },
  // Cooking, eating: J Notes.tsx:90, 94.
  kitchen: {
    text: "Josh likes cooking, and eating literally everything.",
    ...ABOUT,
  },
  // Lifting: J Notes.tsx:88. Rowing: J data.ts:49.
  gym: {
    text: "Josh lifts a lot, and trains with Stanford men's rowing, where he coxes.",
    ...ABOUT,
  },
  // Debut single "Fairytale", Dejavu Group: J data.ts:109; its video on
  // YouTube: data.ts:36. kelix on SoundCloud: data.ts:34. "all i need" on
  // Spotify: data.ts:35. @atkelix on Instagram: data.ts:33.
  // dreamr, his old music name: [owner] (no link exists, so none is given).
  // PENDING_OWNER: the tracks "back room" and "please be" (not on his site).
  music: {
    text: "Josh debuted with the digital single “Fairytale” under Korean hip hop label Dejavu Group (the video is on YouTube). On his own he posts as kelix on SoundCloud (try ‘back room’ or ‘please be’), “all i need” is on Spotify, and he's @atkelix on Instagram. He previously released music as dreamr.",
    link: "https://soundcloud.com/atkelix",
    label: "SoundCloud",
  },
  // USACO, M3, SMT: J data.ts:114–115, Notes.tsx:92, data.ts:54.
  // Olympiads and research with Euler Circle: [owner] (no link on his site).
  math: {
    text: "Josh made USACO Platinum in his freshman year of high school, earned an M3 Challenge honorable mention, and helped organize the Stanford Math Tournament. He's done a lot of math beyond that too, from olympiads to research with Euler Circle.",
    ...LINKEDIN,
  },
};

/**
 * For the town hall (Phase 2, WS-E): the plaque text. Top 6 and having
 * stopped playing: J Notes.tsx:95. Maxed at Town Hall 18: [owner].
 */
export const TOWN_HALL_STORY: RoomStoryEntry = {
  text: "Josh played Clash of Clans at a very high level: maxed out at Town Hall 18, and at one point top 6 in the US. He hasn't played in a while.",
};
