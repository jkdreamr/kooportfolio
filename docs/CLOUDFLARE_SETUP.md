# Turning on the shared photo wall and writing shelf (Cloudflare, free)

The game works without this. Until it is set up, the photo booth and the
writing room keep things on the visitor's own device and say so. Once it is
set up, strips and posts are shared between all visitors.

You need: the repository on your computer (with `npm install` done), a
browser, and about 15 minutes. **Nothing here needs a card or costs money.**
It uses Cloudflare's free plan only: one Worker and one D1 database. There is
no R2 (object storage), because R2 asks for a card. Photos are stored as text
in the database, and only the newest 12 are kept.

Run every command from the repository folder.

---

## 1. Create a free Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and sign up with your email.
2. Confirm the email Cloudflare sends you.
3. Don't add a domain and don't choose a paid plan. If Cloudflare offers
   "Workers Paid", skip it. The free plan is the default.

## 2. Log in from your computer

```sh
npx wrangler login
```

A browser tab opens. Click **Allow**. Then check that it worked:

```sh
npx wrangler whoami
```

It prints your email and account. That is all it needs to print.

## 3. Create the database

```sh
npx wrangler d1 create joshua-api
```

The output includes a line like `"database_id": "1a2b3c4d-…"`. Open
`wrangler.production.jsonc` and replace `FILL_FROM_WRANGLER_D1_CREATE` with
that id, keeping the quotes. Save the file.

## 4. Create the tables

```sh
npx wrangler d1 migrations apply joshua-api --remote --config wrangler.production.jsonc
```

Answer **y** when it asks. It applies four files and marks each with ✅:
`0001_writing.sql`, `0002_booth.sql`, `0003_booth_post_limits.sql` and
`0004_reports.sql`.

## 5. Make your admin token (for removing posts)

The admin token lets you, and only you, delete any strip or post and see what
visitors have reported. Make a random one:

```sh
openssl rand -hex 32
```

That prints 64 letters and digits. Keep them in your password manager. Then
store the token in the Worker as a secret. Paste it when the command asks:

```sh
npx wrangler secret put ADMIN_TOKEN --config wrangler.production.jsonc
```

(If the Worker doesn't exist yet, wrangler offers to create it. Say yes.)

## 6. Check which sites may use it

In `wrangler.production.jsonc`, `ALLOWED_ORIGINS` lists the websites that may
post to the wall. It already has `https://kooportfolio.vercel.app`, plus
`-jkdreamrs-projects.vercel.app`, which covers your Vercel preview links. If
the site lives anywhere else (a custom domain, for example), add it with a
comma and no spaces, like `https://kooportfolio.vercel.app,https://joshuakoo.com`.

## 7. Deploy the Worker

```sh
npx wrangler deploy --config wrangler.production.jsonc
```

The first time, Cloudflare may ask you to choose a `workers.dev` subdomain.
Any name is fine. At the end it prints the Worker's address, for example:

```
https://joshua-exe.<your-subdomain>.workers.dev
```

Copy that address. (The repo's `npm run deploy:staging` script is a different,
gated staging setup. It isn't needed here.)

## 8. Check that the Worker is working

```sh
curl https://joshua-exe.<your-subdomain>.workers.dev/api/health
```

It must print exactly:

```
{"ok":true,"features":{"report":true}}
```

If it prints `{"ok":false,…}`, the database isn't connected: check step 3
(the id in the file) and redeploy (step 7).

Optional cross-site check (the `Origin` line must come back):

```sh
curl -si -H "Origin: https://kooportfolio.vercel.app" \
  https://joshua-exe.<your-subdomain>.workers.dev/api/health | grep -i access-control-allow-origin
```

It should print `access-control-allow-origin: https://kooportfolio.vercel.app`.

## 9. Tell the website where the Worker is (Vercel)

1. Open the project on <https://vercel.com> and go to **Settings** →
   **Environment Variables**.
2. Add one variable:
   - **Key:** `VITE_API_BASE`
   - **Value:** the Worker address from step 7, for example
     `https://joshua-exe.<your-subdomain>.workers.dev`. Don't add a slash or
     `/api` at the end.
   - **Environments:** tick Production and Preview.
3. Save.

## 10. Redeploy the website

The address is read when the site is built, so the site needs a new build:
**Deployments** → the latest one → **⋯** → **Redeploy**. Pushing a new commit
also works.

## 11. Check that it works on the site

1. Open the site, press **Play**, and travel to Korea. Take a strip in the
   photo booth and choose to post it. It should say **"Posted to the wall."**
   and not "Saved on this device."
2. Open the site in another browser, or in a private window. The strip is on
   the wall there too.
3. In Joshua's home, the writing room's shelf now shows posts from everyone.
4. Optional: open the browser's developer tools, go to the **Network** tab,
   and reload. `/api/health` returns 200.

---

## Looking after it

**See what visitors reported.** An item with 3 reports is hidden at once, so
you only need to decide whether to delete it for good:

```sh
curl -H "Authorization: Bearer <your admin token>" \
  https://joshua-exe.<your-subdomain>.workers.dev/api/report
```

**Delete a strip or a post.** Use the `id` from the report list:

```sh
curl -X DELETE -H "Authorization: Bearer <your admin token>" \
  https://joshua-exe.<your-subdomain>.workers.dev/api/booth/<id>
curl -X DELETE -H "Authorization: Bearer <your admin token>" \
  https://joshua-exe.<your-subdomain>.workers.dev/api/writing/<id>
```

**What protects the wall and the shelf:**
- Links and abusive words are refused on the server, whatever the browser
  sends.
- Each visitor can post 3 times an hour, with a minute between posts.
- The whole room is capped at 100 posts an hour and 500 kept in all.
- No IP addresses are stored, only daily-rotating hashes.
- Only the sites in `ALLOWED_ORIGINS` can post.

**Free-plan limits** (as of late 2026; Cloudflare's pricing pages have the
current figures):
- Workers: 100,000 requests a day.
- D1: 5 GB of storage, 5 million rows read and 100,000 rows written a day.

This site uses a tiny share of that. If a limit is ever hit, requests fail
for the rest of the day and the game falls back to on-device copies. Nothing
is charged, because the free plan has no card attached.

**Undo everything:**

```sh
npx wrangler delete --config wrangler.production.jsonc
npx wrangler d1 delete joshua-api
```

Then remove `VITE_API_BASE` in Vercel and redeploy.

**Try it locally first (optional, no account needed):**

```sh
npx wrangler d1 migrations apply joshua-booth-local --local
npm run build && npm run preview
```
