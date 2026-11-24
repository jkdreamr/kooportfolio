import { WRITING_LIMITS, type WritingDraft } from "../../shared/writing";

const key = "joshua-writing-draft-v1";
const blank: WritingDraft = { title: "", author: "", body: "" };
type DraftStorage = Pick<Storage, "getItem" | "setItem">;

// Failed writes remain authoritative in memory. Clean drafts refresh on open
// or tab return so an older tab cannot overwrite another tab's newer draft.
export function createWritingDraftSession(
  storage: () => DraftStorage = () => localStorage,
) {
  let memory: WritingDraft | undefined;
  let dirty = false;
  return {
    read(): WritingDraft {
      if (!memory || !dirty) {
        let value: Partial<WritingDraft> | null = null;
        try {
          value = JSON.parse(storage().getItem(key) ?? "null");
        } catch {
          // A formerly clean draft is still safe if storage becomes denied.
          return { ...(memory ?? blank) };
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
      dirty = true;
      try {
        storage().setItem(key, JSON.stringify(memory));
        dirty = false;
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const writingDraftSession = createWritingDraftSession();
