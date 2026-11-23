import { readFile } from "node:fs/promises";
const config = JSON.parse(
  await readFile("dist/joshua_exe_local/wrangler.json", "utf8"),
);
if (config.name !== "joshua-exe-staging") {
  throw new Error(
    "Deployment blocked: build must target joshua-exe-staging, never the local or production Worker.",
  );
}
console.log("Generated Worker target verified: joshua-exe-staging.");
