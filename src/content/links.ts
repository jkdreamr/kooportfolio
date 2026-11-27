/**
 * Every public link of the site's owner, grouped for the in-world links hub
 * ("Josh" in the dock, and the Bulletin board in each world).
 *
 * Source for every entry: the owner's own site repo (read-only clone at
 * /home/user/jkdreamr/josh), `src/os/data.ts`, cited per line below, or
 * today's `profile.ts` for the socials. Nothing here is guessed; a test
 * checks each URL byte-for-byte against those two files.
 */
import { profile } from "./profile";

export type OwnerLinkGroup = "music" | "writing" | "projects" | "social" | "support";
export type OwnerLink = { id: string; group: OwnerLinkGroup; label: string; note?: string; url: string };

/** Display order of the groups in the links hub. */
export const OWNER_LINK_GROUPS: readonly { id: OwnerLinkGroup; title: string }[] = [
  { id: "music", title: "Music" },
  { id: "writing", title: "Writing" },
  { id: "projects", title: "Projects" },
  { id: "social", title: "Social" },
  { id: "support", title: "Support" },
];

const social = (id: string) => {
  const url = profile.socials.find(([name]) => name === id)?.[1];
  if (!url) throw new Error(`links: no ${id} in profile.socials`);
  return url;
};

export const OWNER_LINKS: OwnerLink[] = [
  // data.ts:35 (links.spotifyAlbum), listed as "all i need" · Spotify at :89
  { id: "spotify", group: "music", label: "all i need", note: "Spotify", url: "https://open.spotify.com/album/2ckdlSbzkVukYqvSwZIiUp" },
  // data.ts:34 (links.soundcloud), "kelix" · SoundCloud at :90
  { id: "soundcloud", group: "music", label: "kelix", note: "SoundCloud", url: "https://soundcloud.com/atkelix" },
  // data.ts:36 (links.youtube), "fairytale" · YouTube at :91
  { id: "youtube", group: "music", label: "fairytale", note: "YouTube", url: "https://www.youtube.com/watch?v=nw2rOUypDHE" },
  // data.ts:33 (links.instagramMusic), "@atkelix" · Instagram at :92
  { id: "instagram-music", group: "music", label: "@atkelix", note: "Instagram", url: "https://www.instagram.com/atkelix/" },
  // data.ts:82
  { id: "verses", group: "writing", label: "Verses", note: "a songwriting surface", url: "https://verses-zeta.vercel.app/" },
  // data.ts:78–81
  { id: "kookwleigh", group: "projects", label: "kookwleigh", note: "intimate dinners, by invitation", url: "https://kookwleigh.vercel.app/" },
  { id: "novum", group: "projects", label: "NOVUM", note: "artist-led creative technology", url: "https://novumworld.vercel.app/" },
  { id: "livex", group: "projects", label: "LiveX", note: "NBA Summer League hoodie designer", url: "https://livex-nba.vercel.app/" },
  // Access-gated on the owner's side; kept exactly as his site has it.
  { id: "harbor", group: "projects", label: "Harbor", note: "make sense of your work", url: "https://personal-seven-orpin.vercel.app/access?next=%2F" },
  // profile.ts (data.ts:28–32 lists the same accounts)
  { id: "github", group: "social", label: "GitHub", url: social("github") },
  { id: "linkedin", group: "social", label: "LinkedIn", url: social("linkedin") },
  { id: "x", group: "social", label: "X", url: social("x") },
  { id: "instagram", group: "social", label: "Instagram", url: social("instagram") },
  // data.ts:31 (links.coffee); tagline from apps/BuyMeACoffee.tsx:50
  { id: "coffee", group: "support", label: "Buy me a coffee", note: "if you enjoy the site, a coffee goes a long way.", url: "https://buymeacoffee.com/joshuakoo" },
];

/** The hub's groups in order, each with its links; empty groups are left out. */
export function ownerLinkGroups(links: readonly OwnerLink[] = OWNER_LINKS) {
  return OWNER_LINK_GROUPS.map((group) => ({
    ...group,
    links: links.filter((link) => link.group === group.id),
  })).filter((group) => group.links.length > 0);
}
