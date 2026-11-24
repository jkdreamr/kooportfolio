import { WRITING_LIMITS, type WritingDraft } from "../../shared/writing";

const key = "joshua-writing-draft-v1";
const blank: WritingDraft = { title: "", author: "", body: "" };
type DraftStorage = Pick<Storage, "getItem" | "setItem">;

// Session memory is authoritative once read: storage may be denied, full, or
// become unavailable. Neither a modal/portal remount nor a room exit loses it.
export function createWritingDraftSession(
  storage: () => DraftStorage = () => localStorage,
) {
  let memory: WritingDraft | undefined;
  return {
    read(): WritingDraft {
      if (!memory) {
        let value: Partial<WritingDraft> | null = null;
        try {
          value = JSON.parse(storage().getItem(key) ?? "null");
        } catch {
          /* Session-only drafts still work. */
        }
        memory = { ...blank };
        for (const field of ["title", "author", "body"] as const)
          if (typeof value?.[field] === "string")
            memory[field] = value[field].slice(0, WRITING_LIMITS[field]);
      }
      return { ...memory };
    },
    write(draft: WritingDraft): boolean {
      // Update synchronously, before persistence or React's next render.
      memory = { ...draft };
      try {
        storage().setItem(key, JSON.stringify(memory));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const writingDraftSession = createWritingDraftSession();
