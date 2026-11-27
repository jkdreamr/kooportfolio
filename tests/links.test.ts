import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OWNER_LINKS, ownerLinkGroups } from "../src/content/links";

// The owner's own site source (read-only clone). Every URL must appear in it
// byte-for-byte, or in today's profile.ts.
const OWNER_DATA = "/home/user/jkdreamr/josh/src/os/data.ts";
const PROFILE = new URL("../src/content/profile.ts", import.meta.url);

describe("owner links", () => {
  it("has a non-empty https URL, a label and a unique id for every entry", () => {
    expect(new Set(OWNER_LINKS.map((l) => l.id)).size).toBe(OWNER_LINKS.length);
    for (const link of OWNER_LINKS) {
      expect(link.url, link.id).toMatch(/^https:\/\/\S+$/);
      expect(link.label.trim(), link.id).not.toBe("");
    }
  });
  it("takes every URL byte-for-byte from the owner's site data or profile.ts", () => {
    const profile = readFileSync(PROFILE, "utf8");
    if (!existsSync(OWNER_DATA)) {
      console.warn(`\n!!! ${OWNER_DATA} is missing: links checked against profile.ts only !!!\n`);
      for (const link of OWNER_LINKS.filter((l) => l.group === "social"))
        expect(profile.includes(`"${link.url}"`), link.id).toBe(true);
      return;
    }
    const site = readFileSync(OWNER_DATA, "utf8");
    for (const link of OWNER_LINKS) {
      const inSite = site.includes(`'${link.url}'`);
      const inProfile = profile.includes(`"${link.url}"`);
      expect(inSite || inProfile, `${link.id}: ${link.url}`).toBe(true);
    }
  });
  it("puts Buy Me a Coffee in exactly one quiet Support row", () => {
    const coffee = OWNER_LINKS.filter((l) => l.url.includes("buymeacoffee.com"));
    expect(coffee).toHaveLength(1);
    expect(coffee[0].group).toBe("support");
    expect(coffee[0].url).toBe("https://buymeacoffee.com/joshuakoo");
  });
  it("orders the hub Music, Writing, Projects, Social, Support and drops empty groups", () => {
    expect(ownerLinkGroups().map((g) => g.id)).toEqual(["music", "writing", "projects", "social", "support"]);
    expect(ownerLinkGroups(OWNER_LINKS.filter((l) => l.group !== "writing")).map((g) => g.id)).not.toContain("writing");
  });
  it("adds no dreamr link (not a music name on the owner's site)", () => {
    expect(OWNER_LINKS.some((l) => /dreamr/i.test(l.label) && l.group === "music")).toBe(false);
  });
});

describe("owner embeds", () => {
  it("are the players from the owner's own site, with no autoplay", async () => {
    const { OWNER_EMBEDS } = await import("../src/content/links");
    expect(OWNER_EMBEDS.map((e) => e.id)).toEqual(["soundcloud", "spotify", "youtube"]);
    for (const e of OWNER_EMBEDS) {
      expect(e.src).toMatch(/^https:\/\/(w\.soundcloud\.com|open\.spotify\.com|www\.youtube-nocookie\.com)\//);
      expect(e.src).not.toMatch(/auto_?play=(true|1)/i);
      expect(e.href).toMatch(/^https:\/\//);
    }
    if (!existsSync(OWNER_DATA)) return;
    const site = readFileSync(OWNER_DATA, "utf8");
    for (const e of OWNER_EMBEDS) {
      expect(site.includes(`'${e.src}'`) || site.includes(`\n    '${e.src}'`), e.id).toBe(true);
      expect(site.includes(`'${e.href}'`), e.id).toBe(true);
    }
  });
});
