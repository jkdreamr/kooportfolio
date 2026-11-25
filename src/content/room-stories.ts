import type { PlaceId } from "../game/core/world";

// Checked against joshuakoo.xyz and its linked public profiles on 2026-11-25.
// Requested fictional rooms do not imply fraternity membership or employment.
export const roomStories: Partial<
  Record<PlaceId, { text: string; link: string; label: string }>
> = {
  skate: {
    text: "Josh picked up skateboarding as a freshman at Stanford and still rides for fun.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  theater: {
    text: "Josh grew up in Los Altos, just down the road from Stanford. He studies CS and math there now.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  badminton: {
    text: "Josh is a Division I student athlete at Stanford, where he studies CS and math.",
    link: "https://gostanford.com/sports/mens-rowing/roster/player/joshua-koo",
    label: "Roster",
  },
  go: {
    text: "Josh speaks Korean and leads Cognition's efforts in Korea. Before that he worked at a coding-education startup in Seoul.",
    link: "https://linkedin.com/in/joshuaykoo",
    label: "LinkedIn",
  },
  writing: {
    text: "Josh's bio in his own words: Stanford CS and math, coxswain, investment intern at CRV.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  stadium: {
    text: "Josh is a lifelong 49ers fan. He grew up in Los Altos, deep in Niners country.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  boathouse: {
    text: "Josh walked on to Stanford men's rowing as a freshman. As coxswain he steers the boat and coordinates the crew.",
    link: "https://gostanford.com/sports/mens-rowing/roster/player/joshua-koo",
    label: "Roster",
  },
  basketball: {
    text: "Josh is a lifelong LeBron fan.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  office: {
    text: "Josh is an investment intern at CRV. Before Stanford he founded Alphag3n, a startup backed by sponsors like Coinbase, Solana and Polygon.",
    link: "https://linkedin.com/in/joshuaykoo",
    label: "LinkedIn",
  },
  kappa: {
    text: "Josh is a junior studying computer science and mathematics at Stanford. He ran growth and operations for the Stanford Blockchain Club.",
    link: "https://linkedin.com/in/joshuaykoo",
    label: "LinkedIn",
  },
  cognition: {
    text: "Josh works at Cognition. He joined as a GTM engineer and now leads the company's Korea efforts as Chief of Staff, APAC.",
    link: "https://linkedin.com/in/joshuaykoo",
    label: "LinkedIn",
  },
  kitchen: {
    text: "Stanford CS and math. Coxswain. Investment intern at CRV. That's Josh's public bio, in his own words.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  gym: {
    text: "Josh trains with Stanford men's rowing, where he coxes for the crew.",
    link: "https://gostanford.com/sports/mens-rowing/roster/player/joshua-koo",
    label: "Roster",
  },
  music: {
    text: "Josh shares music as kelix. His SoundCloud has original tracks and demos, including ‘back room’ and ‘please be’.",
    link: "https://soundcloud.com/atkelix",
    label: "SoundCloud",
  },
  math: {
    text: "Josh studies computer science and mathematics at Stanford. He also spent a summer as an ecosystem engineer at NEAR Protocol.",
    link: "https://linkedin.com/in/joshuaykoo",
    label: "LinkedIn",
  },
};
