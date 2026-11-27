import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roomStories, TOWN_HALL_STORY } from "../src/content/room-stories";
import { TOWN_HALL_TOPIC, topicsFor } from "../src/game/core/npcTopics";
import { villagers } from "../src/game/core/npcs";

const STORY_MAX = 300;
const REPLY_MAX = 140;
const stories = Object.entries(roomStories);

/** Text Josh's site does not show and he has not confirmed yet: where each
 * phrase may appear (the test fails if one spreads anywhere else). */
const PENDING_OWNER: Record<string, string[]> = {
  "back room": ["story:music", "topic:musician/listen"],
  "please be": ["story:music", "topic:musician/listen"],
};

/** Villager topics added for the owner's facts (PLAN_FINAL C5). */
const ADDED: [string, string][] = [
  ["rower", "josh"],
  ["coxswain", "cox-job"],
  ["hooper", "greatest"],
  ["play-caller", "stadium"],
  ["shuttle-player", "josh"],
  ["math-tutor", "josh"],
  ["copy-editor", "josh"],
  ["producer", "tracks"],
  ["researcher", "hiring"],
  ["regular", "dinners"],
];

function everyText(): [string, string][] {
  const out: [string, string][] = stories.map(([id, s]) => [`story:${id}`, s.text]);
  for (const v of villagers)
    for (const t of topicsFor(v.id)) out.push([`topic:${v.id}/${t.id}`, `${t.label} ${t.reply}`]);
  return out;
}

describe("room stories", () => {
  it("fit the story card", () => {
    for (const [id, s] of [...stories, ["townhall", TOWN_HALL_STORY] as const])
      expect(s.text.length, id).toBeLessThanOrEqual(STORY_MAX);
  });
  it("never link to the athletics site (its walk-on year is wrong)", () => {
    for (const [id, s] of stories) expect(s.link ?? "", id).not.toMatch(/gostanford/);
    expect(readFileSync(new URL("../src/content/room-stories.ts", import.meta.url), "utf8")).not.toMatch(
      /gostanford\.com/,
    );
  });
  it("say Josh walked on as a sophomore, never a freshman", () => {
    expect(roomStories.boathouse?.text).toContain("sophomore");
    expect(roomStories.boathouse?.text).not.toContain("freshman");
    for (const [where, text] of everyText())
      if (/walk(ed)? on/i.test(text)) expect(text, where).not.toMatch(/freshman/i);
  });
  it("carry the owner's own lines", () => {
    expect(roomStories.cognition?.text).toMatch(/hiring for Korea: message or DM Joshua/);
    expect(roomStories.stadium?.text).toMatch(/huge fan/);
    expect(roomStories.badminton?.text).toMatch(/middle school/);
    expect(TOWN_HALL_STORY.text).toMatch(/Town Hall 18/);
    // Confirmed by the owner on 2026-11-27.
    expect(roomStories.cognition?.text).toMatch(/Chief of Staff, APAC/);
    expect(roomStories.office?.text).toMatch(/^Before Stanford, Josh founded Alphag3n/);
    expect(roomStories.music?.text).toMatch(/previously released music as dreamr/);
    expect(roomStories.writing?.text).toMatch(/poetry, songwriting and essays/);
  });
});

describe("villager topics", () => {
  it("adds the owner's topics to villagers that exist, short enough for a phone card", () => {
    const ids = new Set(villagers.map((v) => v.id));
    for (const [villager, topic] of ADDED) {
      expect(ids.has(villager), villager).toBe(true);
      const found = topicsFor(villager).find((t) => t.id === topic);
      expect(found, `${villager}/${topic}`).toBeTruthy();
      expect(found!.reply.length, `${villager}/${topic}`).toBeLessThanOrEqual(REPLY_MAX);
    }
    expect(TOWN_HALL_TOPIC.reply.length).toBeLessThanOrEqual(REPLY_MAX);
  });
  it("keeps topic ids unique per villager", () => {
    for (const v of villagers) {
      const list = topicsFor(v.id).map((t) => t.id);
      expect(new Set(list).size, v.id).toBe(list.length);
    }
  });
});

describe("unconfirmed text", () => {
  it("appears only where it already was, pending the owner", () => {
    for (const [phrase, allowed] of Object.entries(PENDING_OWNER)) {
      const found = everyText()
        .filter(([, text]) => text.includes(phrase))
        .map(([where]) => where)
        .sort();
      expect(found, phrase).toEqual([...allowed].sort());
    }
  });
});
