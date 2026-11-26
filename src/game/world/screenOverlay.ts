// Keep screen HUDs at the CSS viewport origin. Drei's measured canvas-center
// translation can lag its fullscreen dimensions during a live viewport resize.
export const screenOverlayPosition = (): [number, number] => [0, 0];
export const screenOverlayStyle = {
  top: 0,
  left: 0,
  width: "100vw",
  // Keep a usable height when dynamic viewport units aren't supported.
  height: "100vh",
  maxHeight: "100dvh",
  pointerEvents: "none",
} as const;

/**
 * drei <Html> only re-tests "behind the camera" when its projected position
 * changes. Screen-fixed overlays return a constant position, so a hide decided
 * on the first frame (e.g. while the walk-view camera is still blending into a
 * room) would stick for good. Overlays pass this to opt out of hiding.
 */
export const screenOverlayNoOcclude = (): void => undefined;
