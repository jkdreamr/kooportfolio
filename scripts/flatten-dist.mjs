// Vercel publishes the project output directory (dist); the game builds to
// dist/client for the Cloudflare assets binding. Mirror client into dist so a
// static host rooted at dist serves index.html at /. Worker assets still use
// dist/client, so this only duplicates files for static hosting.
import { cpSync, existsSync } from "node:fs";
if (existsSync("dist/client"))
  cpSync("dist/client", "dist", { recursive: true });
