// Vercel publishes the project output directory (dist); the game builds to
// dist/client for the Cloudflare assets binding. Mirror client into dist so a
// static host rooted at dist serves index.html at /. Worker assets still use
// dist/client, so this only duplicates files for static hosting.
// On Vercel (VERCEL=1) also drop everything else from the publish root —
// the plugin's Worker bundle (dist/joshua_exe_local) must not be served.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
if (!existsSync("dist/client")) process.exit(0);
cpSync("dist/client", "dist", { recursive: true });
if (process.env.VERCEL) {
  const keep = new Set(readdirSync("dist/client"));
  for (const entry of readdirSync("dist"))
    if (!keep.has(entry))
      rmSync(`dist/${entry}`, { recursive: true, force: true });
}
