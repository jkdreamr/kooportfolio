import { useEffect, useMemo, useState } from "react";
import { runtime, useGame, walkTo } from "../core/store";
import { bestUse, carriedIn, destinations, ITEM_NAMES, purposeOf } from "../core/carry";
import { stampMemory } from "../core/passport";
import { carryView, useActivities } from "../world/RegionalActivities";
import { CarryChip } from "./CarryChip";

const ICONS = { basket: "basket", parcel: "parcel", ramen: "ramen", book: "book" } as const;

/** The carry chip's data (WS-M's `useCarry`): null with empty hands. */
export function useCarry() {
  const world = useGame((s) => s.world);
  const memories = useGame((s) => s.save.memories);
  const play = useActivities((s) => s.play);
  const held = carriedIn(world, play);
  const key = held ? `${held.kind}:${held.count}:${held.parcel}` : "";
  // The best use depends on where you stand: re-check four times a second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    const id = setInterval(() => setTick((n) => (n + 1) % 1e6), 250);
    return () => clearInterval(id);
  }, [key]);
  const target = useMemo(() => (held ? destinations(held)[0] : null), [key]);
  if (!held || !target) return null;
  const use = bestUse(world, held, play, runtime.x, runtime.z, performance.now() / 1000);
  return {
    icon: ICONS[held.kind],
    name: ITEM_NAMES[held.kind],
    count: held.count,
    purpose: purposeOf(world, held, play, (stamp) => memories.includes(stampMemory(stamp))),
    distance: () => Math.hypot(target[0] - runtime.x, target[1] - runtime.z),
    bearing: () => carryView.camYaw - Math.atan2(target[0] - runtime.x, target[1] - runtime.z),
    use: { label: use.label, disabled: use.disabled, reason: use.reason },
    onUse: () => useActivities.getState().use(world),
    onDrop: () => useActivities.getState().dropHeld(world),
    onShow: () => walkTo(target[0], target[1]),
  };
}

/** Mounted by the HUD in the hub, outside game modes. */
export function CarryHud() {
  const carry = useCarry();
  return carry ? <CarryChip {...carry} /> : null;
}
