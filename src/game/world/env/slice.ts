/**
 * Yield a macrotask (not a whole frame) between slices of CPU work: input and
 * paint get their turn, yet the work still finishes in about its CPU time.
 * Shared by the grass placement, the understory and the surface detail bake.
 */
const sliceChannel = typeof MessageChannel === "function" ? new MessageChannel() : null;
const sliceQueue: (() => void)[] = [];
if (sliceChannel) {
  sliceChannel.port1.onmessage = () => sliceQueue.shift()?.();
  // Node (tests): never keep the process alive for this port.
  for (const port of [sliceChannel.port1, sliceChannel.port2])
    (port as MessagePort & { unref?: () => void }).unref?.();
}
export const nextSlice = () =>
  new Promise<void>((resolve) => {
    if (!sliceChannel) return void setTimeout(resolve, 0);
    sliceQueue.push(resolve);
    sliceChannel.port2.postMessage(0);
  });

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** A budget clock: `over()` is true once `ms` have passed since the last reset. */
export function sliceBudget(ms: number) {
  let start = now();
  return {
    over: () => now() - start > ms,
    reset: () => void (start = now()),
  };
}
