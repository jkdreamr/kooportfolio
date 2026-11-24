# Writing room

Original chunky library with bound books, timber drawers, tufted chairs, green-shade lamps and a typewriter. No decorative in-world prose. Reading and composing open only on request in a keyboard-trapped native dialog. Public posts are plain text; author names are explicitly unverified. No seeded posts or local-only feed presented as public.

## Integration

The shared world builder mounts `WritingInterior` from `src/game/scenes/WritingInterior.tsx` in the existing 22×26 shell for scene `writing`, and positions `WritingShell` from `src/game/world/WritingShell.tsx` at the reserved village location. These components do not own the shared shell, Walker, doorway, labels or HUD.

## Storage boundary

Default configuration has **no D1 binding**. The API returns 503 and the reader explains that public writing is not connected. Drafts remain in this browser; a successful publication is reported only after the shared server accepts it. Delete credentials are random, stored in the browser before posting, and never included in public responses. Clearing browser storage loses the ability to remove one's own post; the moderator can still remove it. Private/incognito or storage-denied users are warned. No accounts or claim that a name belongs to Joshua.

Nothing has been provisioned or deployed. No remote API calls, new paid services, or production DNS changes are part of this PR.

## Local shared-storage development

Use Node 24 from the environment blueprint. Commands below are local only:

```sh
npm ci
npx wrangler d1 migrations apply joshua-writing-local --local --config wrangler.writing-local.jsonc
WRITING_LOCAL=1 npm run dev
```

The opt-in config uses local emulated D1 under `.wrangler`, shared across browser contexts on this server and persisted across restarts. Normal `npm run dev`, preview and build keep the original unprovisioned configuration. Do not deploy the local config; omission of a database ID is for local development, not authorization to auto-provision.

## Enable public posting later

1. Independently verify account access, Workers Free and D1 Free allowances and shared usage first. Follow the existing deployment gate. D1 Free currently includes 5 million rows read/day, 100,000 rows written/day and 5 GB total; quota failures produce an honest unavailable response, not a local success.
2. Create a dedicated D1 database only after authorization; add its real ID with binding `WRITING_DB` to the **intended deployment environment**, not to the default/local config. D1 bindings are not inherited between Wrangler environments. Apply `migrations/0001_writing.sql` to that database.
3. Configure a random 64-character hexadecimal `WRITING_ADMIN_TOKEN` as a Wrangler secret for that environment. The token is optional for posting, but should be set before opening a public room for moderation. Never put it in source or client variables.
4. Deploy through the existing free-tier gate, then publish from one browser and read from an unrelated browser. Verify failed quota/storage states leave the draft intact.

## API and moderation

- `GET /api/writing`: latest 24 posts, newest first. Opaque `next` cursor accepted via `?before=...`; ordered by timestamp and ID to handle ties. No polling, credentials, tracking pixels, rendered HTML or attachments.
- `POST /api/writing`: JSON `{ id, deleteToken, title, author, body }`, same-origin browser request. Title ≤80, name ≤32, body ≤6,000 UTF-16 code units, streamed request ≤32 KB. Parameterized SQL, control-character rejection and plain-text rendering. Client-generated random UUID and delete token make retries idempotent in the open dialog.
- `DELETE /api/writing/:id`: same-origin request with `Authorization: Bearer <deleteToken>`, or the moderator token. UI offers two-step self-removal; moderators can call this endpoint from an authenticated operator script with the token kept out of logs.
- Atomic SQL admission limits: 3 posts/hour per daily-rotating network hash, 100 posts/hour globally, 500 extant posts total. Hour receipts survive post deletion and prune to an hour. Network hashes are not returned; raw IPs are not stored. Midnight rotates a network's bucket. No automatic deletion of published writing.
- This is basic anonymous-room moderation, not an identity, spam-filter or pre-moderation service. Shared networks share a limit; distributed abuse can exhaust the global cap. Existing posts remain readable at capacity. Review/manage public content before increasing limits; add stronger moderation before wider launch if needed.

## Checks and references

`tests/writing.test.ts` exercises the actual Worker handler against the migration in SQLite: cross-request persistence, unavailable storage, input and byte caps, same-origin writes, idempotency, deletion authorization, non-resettable limits, global capacity and tied-cursor pagination. Built Worker/HTTP checks also assert the default unconfigured state.

Design references: [Book of Clash scenery credited artist page](https://surfacedigital.artstation.com/projects/Ge3XmV?album_id=4552773), [frontend-design review guidance](https://github.com/anthropics/skills/tree/main/skills/frontend-design). All meshes are original procedural source; no assets copied. Anti-slop pass: no welcome essay, decorative labels, fake social proof or paper-like panels. Controls use the shared slate/brass skin and sans-serif type; the furnishings carry the identity.

Backend references: [D1 get started](https://developers.cloudflare.com/d1/get-started/), [prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [local development](https://developers.cloudflare.com/d1/best-practices/local-development/), [pricing](https://developers.cloudflare.com/d1/platform/pricing/).
