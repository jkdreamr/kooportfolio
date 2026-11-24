import type { PlaceId } from "../game/core/world";

// Checked against joshuakoo.xyz and its linked public profiles on 2026-11-23.
// Requested fictional rooms do not imply fraternity membership or employment.
export const roomStories: Partial<
  Record<PlaceId, { text: string; link: string; label: string }>
> = {
  boathouse: {
    text: "Josh is a coxswain and studies computer science and mathematics at Stanford.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  office: {
    text: "Josh studies CS and math at Stanford. His public bio also lists an investment internship at CRV.",
    link: "https://linkedin.com/in/joshuaykoo",
    label: "LinkedIn",
  },
  kappa: {
    text: "Josh studies computer science and mathematics at Stanford.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  cognition: {
    text: "Josh studies CS and math at Stanford. His public code is on GitHub as jkdreamr.",
    link: "https://github.com/jkdreamr",
    label: "GitHub",
  },
  kitchen: {
    text: "Stanford CS + math. Coxswain. Investment intern at CRV. That’s Josh’s public bio, in his own words.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
  gym: {
    text: "Josh is a coxswain. In rowing, the coxswain steers the boat and coordinates the crew.",
    link: "https://joshuakoo.xyz",
    label: "About Josh",
  },
};
