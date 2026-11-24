import type { GoGame } from "./go";
import { chooseGoMove, type GoLevel } from "./goBot";

self.onmessage = ({ data }: MessageEvent<{ game: GoGame; level: GoLevel }>) => {
  self.postMessage(chooseGoMove(data.game, data.level));
};
