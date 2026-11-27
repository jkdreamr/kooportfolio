import { create } from "zustand";
import type { WorldId } from "../../shared/worlds";

/** The last finished journey: the arrival title card shows its world once.
 * `serial` restarts the card when two arrivals follow each other. */
export const useArrival = create<{ world: WorldId | null; serial: number }>(() => ({
  world: null,
  serial: 0,
}));

export function announceArrival(world: WorldId) {
  useArrival.setState((state) => ({ world, serial: state.serial + 1 }));
}

export function clearArrival(serial: number) {
  if (useArrival.getState().serial === serial) useArrival.setState({ world: null });
}

/** Total time on screen, fades included (the CSS animation matches). */
export const ARRIVAL_CARD_MS = 1500;
