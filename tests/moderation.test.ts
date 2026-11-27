import { describe, expect, it } from "vitest";
import { checkPublicText, cooldownLeft, notePost, POST_COOLDOWN_MS } from "../src/shared/writing";
import { createLocalWall, LOCAL_WALL_LIMIT } from "../src/shared/booth";

const memory = () => {
  const data = new Map<string, string>();
  return () => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
};

describe("public text filter", () => {
  it("lets ordinary writing through", () => {
    for (const t of [
      "A poem about the bay at night.",
      "I wrote this. Me and my sister walked to Scunthorpe.",
      "Grapes, a cocktail, the class assignment, Dickinson.",
      "Mr. Me and Joe. Co-workers forever.",
    ])
      expect(checkPublicText(t), t).toEqual({ ok: true });
  });
  it("stops links", () => {
    for (const t of ["see https://spam.example", "www.spam.example", "go to spam.com now", "spam (dot) com", "bit.ly/x"])
      expect(checkPublicText(t), t).toEqual({ ok: false, reason: "link" });
  });
  it("stops abusive words, including common disguises", () => {
    const word = "shpx".replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
    for (const t of [word, `${word}ing`, word.toUpperCase(), word.replace("u", "*").replace("*", "u").replace("c", "c"), word.split("").join(" ")])
      expect(checkPublicText(`oh ${t} this`).ok, t).toBe(false);
  });
});

describe("post cooldown", () => {
  it("waits a minute between posts of a kind", () => {
    const storage = memory();
    expect(cooldownLeft("booth", 1000, storage)).toBe(0);
    notePost("booth", 1000, storage);
    expect(cooldownLeft("booth", 1000 + 10_000, storage)).toBe(POST_COOLDOWN_MS - 10_000);
    expect(cooldownLeft("writing", 1000 + 10_000, storage)).toBe(0);
    expect(cooldownLeft("booth", 1000 + POST_COOLDOWN_MS, storage)).toBe(0);
  });
});

describe("local wall", () => {
  it("keeps the newest strips on this device, up to a few", () => {
    const storage = memory();
    const wall = createLocalWall(storage);
    for (let i = 0; i < LOCAL_WALL_LIMIT + 2; i++) wall.add({ id: `s${i}`, jpeg: "AAAA" });
    const again = createLocalWall(storage).list();
    expect(again).toHaveLength(LOCAL_WALL_LIMIT);
    expect(again[0].id).toBe(`s${LOCAL_WALL_LIMIT + 1}`);
  });
  it("drops the oldest when storage is full", () => {
    let raw = "[]";
    let writes = 0;
    const storage = () => ({
      getItem: () => raw,
      setItem: (_k: string, v: string) => {
        writes++;
        if (JSON.parse(v).length > 2) throw new DOMException("full", "QuotaExceededError");
        raw = v;
      },
    });
    const wall = createLocalWall(storage);
    for (let i = 0; i < 4; i++) wall.add({ id: `s${i}`, jpeg: "AAAA" });
    expect(createLocalWall(storage).list().map((s) => s.id)).toEqual(["s3", "s2"]);
    expect(writes).toBeGreaterThan(4);
  });
});
