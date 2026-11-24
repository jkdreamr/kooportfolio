import { expect, test } from "@playwright/test";
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
