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
