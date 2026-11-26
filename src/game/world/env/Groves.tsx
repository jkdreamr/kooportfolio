import { useMemo } from "react";
import type { WorldId } from "../../core/worlds";
import { NaturalTrees } from "../TreeArt";
import { groveField } from "./placement";
import { useEnvTier } from "./tier";

const cache = new Map<WorldId, ReturnType<typeof groveField>>();
/** Scenic groves on unwalkable land (see placement.groveField). Below high,
 * every third tree is left out (medium's triangle budget, §2). */
export function Groves({ world }: { world: WorldId }) {
  const tier = useEnvTier();
  const trees = useMemo(() => {
    let value = cache.get(world);
    if (!value) cache.set(world, (value = groveField(world)));
    return tier === "high" ? value : value.filter((_, i) => i % 3 !== 2);
  }, [world, tier]);
  return trees.length ? <NaturalTrees trees={trees} lod="low" /> : null;
}
