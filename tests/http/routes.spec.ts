import { expect, test } from "@playwright/test";
import { watchConsole } from "./console-gate";
// Built Worker + static asset integration; UI acceptance is recorded separately.
for (const [route, copy] of [
  ["/", "joshua koo"],
  ["/about", "stanford cs"],
  ["/work", "Code & experiments"],
  ["/contact", "joskoo@stanford.edu"],
]) {
  test(`${route} serves real readable portfolio HTML before JavaScript`, async ({
    request,
  }) => {
    const response = await request.get(route);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(copy);
    expect(html).toContain("<a href=");
    expect(html).toContain('<a href="/play">');
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+\.(js|css))"/g)];
    expect(assets.length).toBeGreaterThan(0);
    for (const [, url, extension] of assets) {
      const asset = await request.get(url);
      expect(asset.ok(), url).toBe(true);
      expect(asset.headers()["content-type"], url).toMatch(
        extension === "js"
          ? /^(?:text|application)\/javascript\b/
          : /^text\/css\b/,
      );
    }
  });
}
test("API health and explicit unavailable cloud features", async ({
  request,
}) => {
  expect(await (await request.get("/api/health")).json()).toMatchObject({
    mode: "local-guest",
  });
  const result = await request.get("/api/leaderboard");
  expect(result.status()).toBe(503);
  expect(await result.text()).toContain("not enabled");
});
test("unprovisioned public writing never reports local-only publication as public", async ({
  request,
}) => {
  const result = await request.get("/api/writing");
  expect(result.status()).toBe(503);
  expect(await result.json()).toMatchObject({
    error: expect.stringContaining("isn’t connected"),
  });
});
test("default preview serves the shared photo wall with local storage", async ({
  request,
}) => {
  const wall = await request.get("/api/booth");
  expect(wall.status()).toBe(200);
  expect(Array.isArray((await wall.json()).strips)).toBe(true);
});

// A2: the page the visitor first sees is the page React adopts.
for (const route of ["/", "/about", "/work", "/contact"]) {
  test(`${route} hydrates the prerendered page without a mismatch`, async ({ page, request }) => {
    const html = await (await request.get(route)).text();
    const prerendered = html
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
      .replace(/<[^>]+>/g, "");
    expect(prerendered).toBeTruthy();
    const gate = watchConsole(page);
    await page.goto(route, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    expect(await page.locator("h1").first().textContent()).toBe(prerendered);
    // React reports hydration mismatches as console errors: the gate fails on any.
    expect(gate.problems()).toEqual([]);
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
              if (!e.hadRecentInput) total += e.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 200);
        }),
    );
    expect(shift).toBeLessThanOrEqual(0.02);
  });
}
