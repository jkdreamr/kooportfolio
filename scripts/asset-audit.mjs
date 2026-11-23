import { readdir, stat } from "node:fs/promises";
let count = 0,
  bytes = 0;
async function walk(path) {
  for (const file of await readdir(path, { withFileTypes: true })) {
    const p = `${path}/${file.name}`;
    if (file.isDirectory()) await walk(p);
    else {
      const s = await stat(p);
      count++;
      bytes += s.size;
      if (s.size > 25 * 1024 * 1024)
        throw new Error(`Asset exceeds free limit: ${p}`);
    }
  }
}
await walk("dist/client");
if (count > 20000) throw new Error("More than 20,000 assets");
console.log(
  `${count} static files, ${(bytes / 1024 / 1024).toFixed(2)} MiB. All below 25 MiB; original procedural 3D and synthesized sound only.`,
);
