import { expect, test, type Page } from "@playwright/test";
// Keyboard-only room flow on the built site, observed through the DOM alone
// (no QA hooks): `data-scene-ready` on .game-shell marks a presented scene
// with an interactive HUD.
const SAVE = {
  version: 1,
  revision: 0,
  coins: 0,
  xp: 0,
  // On the Kitchen's door approach, so the door prompt shows at once.
  position: [-11, -5.4],
  world: "home",
  upgrades: { boathouse: 1, garden: 1 },
  color: "#6f8670",
  hat: true,
  bestRace: null,
  bestBasket: 0,
  memories: [],
  rewards: [],
};
const ready = (page: Page, scene: string, timeout = 240_000) =>
  page.waitForSelector(`.game-shell[data-scene-ready="${scene}"]`, {
    state: "attached",
    timeout,
  });
const focusedText = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return (el?.innerText || el?.getAttribute("aria-label") || "").trim();
  });
async function tabUntil(page: Page, pattern: RegExp, max: number) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press("Tab");
    if (pattern.test(await focusedText(page))) return i;
  }
  return -1;
}

test("keyboard only: E enters, Tab reaches Exit and Play, one Enter leaves", async ({
  page,
}) => {
  test.slow();
  test.setTimeout(900_000);
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem("kb-seeded")) {
      localStorage.setItem("joshua-exe-save-v1", JSON.stringify(save));
      sessionStorage.setItem("kb-seeded", "1");
    }
  }, SAVE);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.goto("/play?tier=low");
  await ready(page, "hub", 600_000);
  await page.waitForSelector('.context-action.visible[data-action="kitchen"]', {
    timeout: 240_000,
  });
  await page.keyboard.press("e");
  await ready(page, "kitchen");
  // Focus lands on the room, not back at the top of the page.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className ?? ""), {
      timeout: 30_000,
    })
    .toContain("interior-title");
  expect(await tabUntil(page, /Exit/, 2)).toBeGreaterThan(0);
  expect(await tabUntil(page, /^Play Kitchen/, 1)).toBe(1);
  // Space activates the focused launcher (no longer swallowed by the game).
  await page.keyboard.press("Space");
  await page.waitForSelector('.game-shell[data-game-mode="kitchen"]', {
    timeout: 120_000,
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector(".game-shell")?.hasAttribute("data-game-mode"),
    null,
    { timeout: 60_000 },
  );
  const exitTabs = await tabUntil(page, /Exit/, 8);
  expect(exitTabs).toBeGreaterThan(0);
  // One step: Exit walks to the door and steps outside, no E needed.
  await page.keyboard.press("Enter");
  await ready(page, "hub");
});
