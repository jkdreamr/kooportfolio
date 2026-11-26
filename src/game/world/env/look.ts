import type { WorldId } from "../../core/worlds";

/**
 * The island whose species character (tree palettes, bark) applies. Written
 * by Landscape — the first child Hub renders for an island — before any grove
 * renders, and read during render by NaturalTrees. A plain module value, not
 * store state: importing the game store from TreeArt would close an import
 * cycle (world → KoreaWorldEnvironment → TreeArt → store → world).
 */
let current: WorldId = "home";
export const setLookWorld = (world: WorldId) => {
  current = world;
};
export const lookWorld = () => current;
