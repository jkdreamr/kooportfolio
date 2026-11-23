// Deployment is deliberately opt-in and never changes an account's plan.
if (process.env.CONFIRMED_WORKERS_FREE !== 'yes') {
  console.error('Deployment blocked. Verify the connected account is Workers Free, shared usage, and no billing changes; then set CONFIRMED_WORKERS_FREE=yes. See docs/ZERO_COST_AUDIT.md.');
  process.exit(1);
}
if (!process.env.CLOUDFLARE_ACCOUNT_ID) { console.error('Set the verified free CLOUDFLARE_ACCOUNT_ID.'); process.exit(1); }
