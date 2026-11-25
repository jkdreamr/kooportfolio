// Keep screen HUDs at the CSS viewport origin. Drei's measured canvas-center
// translation can lag its fullscreen dimensions during a live viewport resize.
export const screenOverlayPosition = (): [number, number] => [0, 0];
export const screenOverlayStyle = {
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  maxHeight: "100dvh",
  pointerEvents: "none",
} as const;
