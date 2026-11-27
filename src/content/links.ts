/**
 * Every public link of the site's owner, grouped for the in-world links hub
 * and info panels. Owned by the game UI/content workstream; this is the
 * shared contract. Only verified links belong here (see profile.ts).
 */
import { profile } from "./profile";

export type OwnerLinkGroup = "music" | "writing" | "projects" | "social" | "support";
export type OwnerLink = { id: string; group: OwnerLinkGroup; label: string; note?: string; url: string };

const SOCIAL_LABELS: Record<string, { label: string; group: OwnerLinkGroup }> = {
  github: { label: "GitHub", group: "social" },
  linkedin: { label: "LinkedIn", group: "social" },
  soundcloud: { label: "SoundCloud (atkelix)", group: "music" },
  instagram: { label: "Instagram", group: "social" },
  x: { label: "X", group: "social" },
};

export const OWNER_LINKS: OwnerLink[] = profile.socials.map(([id, url]) => ({
  id,
  url,
  label: SOCIAL_LABELS[id]?.label ?? id,
  group: SOCIAL_LABELS[id]?.group ?? "social",
}));
