export const BOOTH_PATH = "/api/booth";
export const STRIP_WIDTH = 360;
export const STRIP_HEIGHT = 1128;
export const MAX_STRIP_BYTES = 160 * 1024;
export const WALL_LIMIT = 12;

export type WallStrip = { id: string; jpeg: string };

/** The client keeps strips it could not post (no shared wall yet) on this
 * device: newest first, a handful at most, as base64 JPEG like the wall. */
export const LOCAL_WALL_LIMIT = 6;
const localWallKey = "joshua-booth-local-v1";
type WallStorage = Pick<Storage, "getItem" | "setItem">;
const isStrip = (v: unknown): v is WallStrip =>
  !!v && typeof v === "object" && typeof (v as WallStrip).id === "string" && typeof (v as WallStrip).jpeg === "string";

export function createLocalWall(storage: () => WallStorage = () => localStorage) {
  let memory: WallStrip[] = [];
  let stored = true;
  const load = () => {
    try {
      const raw: unknown = JSON.parse(storage().getItem(localWallKey) ?? "[]");
      memory = Array.isArray(raw) ? raw.filter(isStrip).slice(0, LOCAL_WALL_LIMIT) : [];
      stored = true;
    } catch {
      stored = false;
    }
    return memory;
  };
  return {
    list: (): WallStrip[] => [...load()],
    add(strip: WallStrip): void {
      let next = [strip, ...load().filter((s) => s.id !== strip.id)].slice(0, LOCAL_WALL_LIMIT);
      memory = next;
      // A full quota drops the oldest strips until the newest fits.
      while (next.length) {
        try {
          storage().setItem(localWallKey, JSON.stringify(next));
          stored = true;
          return;
        } catch {
          next = next.slice(0, -1);
        }
      }
      stored = false;
    },
    isStored: () => stored,
  };
}
