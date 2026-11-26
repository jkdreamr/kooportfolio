import { useMemo } from "react";
import type { WorldId } from "../../core/worlds";
import { NaturalTrees } from "../TreeArt";
import { groveField } from "./placement";

const cache = new Map<WorldId, ReturnType<typeof groveField>>();
/** Scenic groves on unwalkable land (see placement.groveField). */
export function Groves({ world }: { world: WorldId }) {
  const trees = useMemo(() => {
    let value = cache.get(world);
    if (!value) cache.set(world, (value = groveField(world)));
    return value;
  }, [world]);
  return trees.length ? <NaturalTrees trees={trees} /> : null;
}
