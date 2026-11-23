# Separate free staging deployment

1. Connect Cloudflare securely. Read the account’s Workers subscription and shared usage; confirm Workers **Free** independently of the zone plan. Do not add a payment method, start a trial or select Paid.
2. Run local checks/build/asset audit. Review `wrangler.jsonc`: no D1/R2/KV/DO/AI bindings, only `/api/*` Worker-first, no production routes.
3. Set the verified account ID and `CONFIRMED_WORKERS_FREE=yes` only after verification. Authenticate via secure environment credentials or Wrangler OAuth; never commit tokens. Run `npm run deploy:staging`. The only allowed name is `joshua-exe-staging` on a separate `workers.dev` URL.
4. Smoke the homepage, direct editorial routes, one static JS asset and `/api/health`; do not run a remote load test. The game must also work with `/api/*` blocked.
5. Rollback with `npx wrangler rollback --name joshua-exe-staging` to a known prior deployment. With no cloud DB there are no schema/data migrations. Guest data stays in the visitor’s browser; they can export it in Settings.

No production domain, DNS edits or account plan changes are part of this deployment. If Free cannot be confirmed, use a session browser preview instead and keep deployment blocked.
