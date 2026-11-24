const KEY = "joshua:kitchen-day";
const validDay = (day: number) => Number.isSafeInteger(day) && day > 0;

export function readKitchenDay(): number {
  try {
    const day = Number(localStorage.getItem(KEY));
    return validDay(day) ? day : 1;
  } catch {
    return 1;
  }
}

export function saveKitchenDay(day: number): void {
  if (!validDay(day)) return;
  try {
    if (day > readKitchenDay()) localStorage.setItem(KEY, String(day));
  } catch {
    // Storage can be unavailable; the current session still keeps its unlock.
  }
}
