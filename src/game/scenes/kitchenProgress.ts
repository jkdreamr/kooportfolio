/** Whether this browser has finished (or skipped) the kitchen's practice order. */
const KEY = "joshua:kitchen-tutorial";

export function readKitchenTutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveKitchenTutorialDone(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage can be unavailable; the practice order simply shows again.
  }
}
