# Zero incremental external cost audit

Checked 2026-11-23. This document is an audit, not an account-side spending cap.

| Product | Chosen use | Limits / boundary | Exhaustion behavior |
| --- | --- | --- | --- |
| Cloudflare Workers Static Assets | Separate staging only, conditional on access + verified Workers Free | Official docs: asset requests free and unlimited, storage included; Free asset count 20,000, individual file 25 MiB; build audit enforces both | Portfolio and client gameplay do not require API availability |
| Workers Free | Optional `/api/*` only | 100,000 requests/day, 10 ms CPU/request; account plan/shared usage must be checked before deployment | API may fail at quota; no auto-upgrade, no retry loop, no dependency on API for gameplay |
| D1, R2, KV, Durable Objects, AI, auth providers | **Not provisioned / not used** | No bindings, secrets or vendor accounts | Cloud saves and rankings explicitly unavailable |
| npm packages / local tools | Open-source libraries, local build/tests | License files in dependencies, lockfile committed | No subscriptions or hosted test runner |
| GitHub | Source + PR, public repository confirmed with API | Standard GitHub-hosted Linux runners in public repos are free; no larger runners, cache or uploaded artifacts | Local equivalents remain available; no paid CI services |
| Assets / fonts / sound | Original procedural art, system fonts, WebAudio effects and CC0 nature recordings | No paid models, remote textures, font calls or paid media API; recording licenses in `public/audio/LICENSES.md` | Everything ships as static source/bundles |
| Devin | User authorized **existing plan usage** in chat | Contract/remaining credits unavailable to this repo; no claim of a technical cap | No paid external models/tools or additional sessions launched by this child |

## Account verification status

Cloudflare API connection requested. **Workers Free account status and shared usage have not yet been verified; remote deployment remains blocked until verified.** `deploy:staging` exits unless the operator explicitly confirms Free and supplies the verified account ID. That environment flag is an attestation gate, not proof; never set it without checking the account.

No DNS, production domain or `joshuakoo.xyz` configuration has been touched. No payment method, trial, paid plan or billable add-on is requested. No remote load tests.

## References

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/d1/platform/pricing/ (not provisioned)
- https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions (public standard runners free; verified before enabling CI)

The [official asset billing page](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) explicitly states static requests are free and unlimited; Worker-first matching paths consume Worker quota. Configuration limits Worker-first routing to `/api/*`; public pages and game assets remain asset-first.
