import { startGameMode } from "../core/gameMode";

/** Opening the booth lives apart from the dialog, so the engine chunk keeps
 * this one function and the dialog itself loads on demand. */
let launcher: HTMLElement | null = null;

export function openPhotoBooth() {
  const from = document.activeElement as HTMLElement | null;
  if (startGameMode("photo-booth")) launcher = from;
}

/** The element focus returns to when the booth closes (read once). */
export function takeBoothLauncher() {
  const from = launcher;
  launcher = null;
  return from;
}
