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
  let stored = false;
  return {
    read(): WritingDraft {
      if (!memory || !dirty) {
        let value: Partial<WritingDraft> | null = null;
        try {
          value = JSON.parse(storage().getItem(key) ?? "null");
          stored = true;
        } catch {
          stored = false;
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
      stored = false;
      try {
        storage().setItem(key, JSON.stringify(memory));
        dirty = false;
        stored = true;
        return true;
      } catch {
        return false;
      }
    },
    isStored: () => stored,
  };
}

export const writingDraftSession = createWritingDraftSession();

/** A piece kept on this device while the shared shelf is offline. */
export type LocalPiece = WritingDraft & { id: string; savedAt: number };

const shelfKey = "joshua-writing-local-v1";
/** Oldest pieces fall off past this, so storage stays small. */
export const LOCAL_SHELF_LIMIT = 24;
type ShelfStorage = Pick<Storage, "getItem" | "setItem">;

function isPiece(value: unknown): value is LocalPiece {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.savedAt === "number" &&
    typeof v.title === "string" &&
    typeof v.author === "string" &&
    typeof v.body === "string"
  );
}

/**
 * The visitor's own shelf, in this browser only. Newest first. When storage
 * is blocked it keeps pieces in memory for the session and says so through
 * `isStored()`, never by throwing.
 */
export function createLocalShelf(
  storage: () => ShelfStorage = () => localStorage,
  now: () => number = () => Date.now(),
) {
  let memory: LocalPiece[] | null = null;
  let stored = true;
  const load = (): LocalPiece[] => {
    try {
      const raw: unknown = JSON.parse(storage().getItem(shelfKey) ?? "[]");
      memory = Array.isArray(raw) ? raw.filter(isPiece).slice(0, LOCAL_SHELF_LIMIT) : [];
      stored = true;
    } catch {
      stored = false;
      memory ??= [];
    }
    return memory;
  };
  const persist = (list: LocalPiece[]) => {
    memory = list;
    try {
      storage().setItem(shelfKey, JSON.stringify(list));
      stored = true;
    } catch {
      stored = false;
    }
  };
  return {
    list: (): LocalPiece[] => [...load()],
    add(draft: WritingDraft): LocalPiece {
      const savedAt = now();
      const piece: LocalPiece = {
        id: `${savedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt,
        title: draft.title.trim().slice(0, WRITING_LIMITS.title),
        author: draft.author.trim().slice(0, WRITING_LIMITS.author),
        body: draft.body.trim().slice(0, WRITING_LIMITS.body),
      };
      persist([piece, ...load()].slice(0, LOCAL_SHELF_LIMIT));
      return piece;
    },
    remove(id: string): void {
      persist(load().filter((p) => p.id !== id));
    },
    isStored: () => stored,
  };
}

export const localShelf = createLocalShelf();
