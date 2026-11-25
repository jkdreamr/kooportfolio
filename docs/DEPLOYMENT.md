# Separate free staging deployment

1. Connect Cloudflare securely. Read the account’s Workers subscription and shared usage; confirm Workers **Free** independently of the zone plan. Do not add a payment method, start a trial or select Paid.
2. Run local checks/build/asset audit. Review `wrangler.jsonc`: the photo wall D1 binding is local only and is not inherited by staging. Staging has no storage bindings; only `/api/*` is Worker-first, with no production routes.
3. Set the verified account ID and `CONFIRMED_WORKERS_FREE=yes` only after verification. Authenticate via secure environment credentials or Wrangler OAuth; never commit tokens. Run `npm run deploy:staging`. This selects `CLOUDFLARE_ENV=staging` at build time, asserts the generated Worker name and deploys that exact generated config. The only allowed name is `joshua-exe-staging` on a separate `workers.dev` URL.
4. Smoke the homepage, direct editorial routes, one static JS asset and `/api/health`; do not run a remote load test. The game must also work with `/api/*` blocked.
5. Rollback with `npx wrangler rollback --name joshua-exe-staging` to a known prior deployment. With no cloud DB there are no schema/data migrations. Guest data stays in the visitor’s browser; they can export it in Settings.

No production domain, DNS edits or account plan changes are part of this deployment. If Free cannot be confirmed, use a session browser preview instead and keep deployment blocked.

# Production API for the Vercel frontend

The site can also be hosted statically on Vercel (`vercel.json` builds to
`dist/client` with an SPA rewrite). In that mode `/api/*` is not served by the
host, so the frontend calls the Worker over CORS.

1. Build the Vercel project with `VITE_API_BASE=https://joshua-exe.<subdomain>.workers.dev` (set in the Vercel dashboard, not committed). With `VITE_API_BASE` unset the frontend keeps calling same-origin `/api/*`.
2. Provision remote D1 once per database: `wrangler d1 create joshua-booth`, `joshua-writing`. Put each `database_id` into `wrangler.production.jsonc`, then `wrangler d1 migrations apply <name> --remote --config wrangler.production.jsonc` for both.
3. `wrangler deploy --config wrangler.production.jsonc` deploys `joshua-exe` on `workers.dev`. `ALLOWED_ORIGINS` there permits the production Vercel origin plus `-jkdreamrs-projects.vercel.app` preview URLs; POST/DELETE from any other Origin stays 403. Deploying needs the same verified Free account as staging — never commit tokens or database IDs you did not provision.
