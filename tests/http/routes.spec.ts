import { expect, test } from '@playwright/test';
// Built Worker + static asset integration; UI acceptance is recorded separately.
for (const [route, copy] of [['/', 'joshua koo'], ['/about', 'stanford cs'], ['/work', 'Code & experiments'], ['/contact', 'joskoo@stanford.edu']]) {
  test(`${route} serves real readable portfolio HTML before JavaScript`, async ({ request }) => {
    const response = await request.get(route); expect(response.ok()).toBe(true);
    const html = await response.text(); expect(html).toContain(copy); expect(html).toContain('<a href=');
  });
}
test('API health and explicit unavailable cloud features', async ({ request }) => {
  expect(await (await request.get('/api/health')).json()).toMatchObject({ mode: 'local-guest' });
  const result = await request.get('/api/leaderboard'); expect(result.status()).toBe(503);
  expect(await result.text()).toContain('not enabled');
});
