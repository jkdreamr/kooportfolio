import { describe, expect, it } from "vitest";
import { createWritingDraftSession } from "../src/game/core/writingDraft";

const draft = {
  author: "Visitor",
  title: "Unfinished",
  body: "One line.\nAnother line.",
};
describe("writing draft session", () => {
  it("refreshes a stale tab before title-only edits can overwrite a newer body", () => {
    let persisted = JSON.stringify(draft);
    const storage = () => ({
      getItem: () => persisted,
      setItem: (_key: string, value: string) => {
        persisted = value;
      },
    });
    const olderTab = createWritingDraftSession(storage);
    const newerTab = createWritingDraftSession(storage);
    expect(olderTab.read()).toEqual(draft);
    const newer = { ...newerTab.read(), body: "Newer text in another tab" };
    newerTab.write(newer);
    // The editor refreshes on reopen and on a visible-tab return.
    const reopened = olderTab.read();
    expect(reopened).toEqual(newer);
    olderTab.write({ ...reopened, title: "A new title" });
    expect(JSON.parse(persisted)).toEqual({ ...newer, title: "A new title" });
  });
  it("retains exact unsaved text for a new reader when storage access is denied", () => {
    const session = createWritingDraftSession(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(session.read()).toEqual({ author: "", title: "", body: "" });
    expect(session.isStored()).toBe(false);
    expect(session.write(draft)).toBe(false);
    // A new modal's initializer must read memory, not the unavailable storage.
    expect(session.read()).toEqual(draft);
    expect(session.isStored()).toBe(false);
    const snapshot = session.read();
    snapshot.body = "A stale/unmounted reader";
    expect(session.read()).toEqual(draft);
  });
  it("does not revert to the last persisted draft after a quota failure", () => {
    let persisted = JSON.stringify({ ...draft, body: "Old saved text" });
    let full = true;
    const session = createWritingDraftSession(() => ({
      getItem: () => persisted,
      setItem: (_key, value) => {
        if (full) throw new DOMException("Full", "QuotaExceededError");
        persisted = value;
      },
    }));
    expect(session.read().body).toBe("Old saved text");
    expect(session.isStored()).toBe(true);
    expect(session.write(draft)).toBe(false);
    expect(session.read()).toEqual(draft);
    expect(session.isStored()).toBe(false);
    full = false;
    expect(session.write(draft)).toBe(true);
    expect(session.isStored()).toBe(true);
    expect(JSON.parse(persisted)).toEqual(draft);
    expect(session.write({ ...draft, title: "", body: "" })).toBe(true);
    expect(session.read()).toEqual({ ...draft, title: "", body: "" });
  });
  it("bounds saved input and tolerates corrupt or mismatched storage", () => {
    for (const value of [
      "invalid",
      "null",
      "1",
      JSON.stringify({ author: 22, title: "T".repeat(90), body: "b" }),
    ]) {
      const session = createWritingDraftSession(() => ({
        getItem: () => value,
        setItem: () => {},
      }));
      const saved = session.read();
      expect(saved.author).toBe("");
      expect(saved.title.length).toBeLessThanOrEqual(80);
      expect(typeof saved.body).toBe("string");
    }
  });
});

describe("local writing shelf", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return () => ({
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    });
  };
  it("keeps pieces newest first and survives a new session on the same storage", async () => {
    const { createLocalShelf } = await import("../src/game/core/writingDraft");
    const storage = memoryStorage();
    let t = 1000;
    const shelf = createLocalShelf(storage, () => t++);
    shelf.add({ author: " Me ", title: "First", body: "One" });
    shelf.add({ author: "Me", title: "Second", body: "Two" });
    const again = createLocalShelf(storage);
    expect(again.list().map((p) => p.title)).toEqual(["Second", "First"]);
    expect(again.list()[1].author).toBe("Me");
    again.remove(again.list()[0].id);
    expect(createLocalShelf(storage).list().map((p) => p.title)).toEqual(["First"]);
  });
  it("caps the shelf and ignores junk in storage", async () => {
    const { createLocalShelf, LOCAL_SHELF_LIMIT } = await import("../src/game/core/writingDraft");
    let raw = JSON.stringify([{ nope: 1 }, "x"]);
    const storage = () => ({ getItem: () => raw, setItem: (_k: string, v: string) => void (raw = v) });
    const shelf = createLocalShelf(storage);
    expect(shelf.list()).toEqual([]);
    for (let i = 0; i < LOCAL_SHELF_LIMIT + 5; i++) shelf.add({ author: "a", title: `t${i}`, body: "b" });
    expect(shelf.list()).toHaveLength(LOCAL_SHELF_LIMIT);
    expect(shelf.list()[0].title).toBe(`t${LOCAL_SHELF_LIMIT + 4}`);
  });
  it("works in memory when storage is blocked, and says so", async () => {
    const { createLocalShelf } = await import("../src/game/core/writingDraft");
    const shelf = createLocalShelf(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    shelf.add({ author: "a", title: "kept", body: "b" });
    expect(shelf.isStored()).toBe(false);
    expect(shelf.list().map((p) => p.title)).toEqual(["kept"]);
  });
});
