import { reward, type Save } from "../../shared/save";

export const HOOVER_KEY = "hoover-key";
export const HOOVER_STASH = "campus-stash";
export const HOOVER = {
  key: [5.65, 54.2] as const,
  door: [4.82, 53.8] as const,
  chest: [0, -3] as const,
};
export function collectHooverKey(save: Save): Save {
  if (save.memories.includes(HOOVER_KEY)) return save;
  return {
    ...save,
    memories: [...save.memories, HOOVER_KEY],
    revision: save.revision + 1,
  };
}
export function claimHooverStash(save: Save): Save {
  if (
    !save.memories.includes(HOOVER_KEY) ||
    save.memories.includes(HOOVER_STASH)
  )
    return save;
  return {
    ...reward(save, HOOVER_STASH, 75, 0),
    // Unlike recent run IDs, discovery memories are never evicted.
    memories: [...save.memories, HOOVER_STASH],
  };
}
