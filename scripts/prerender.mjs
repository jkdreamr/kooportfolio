import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = "dist/client";
const html = await readFile(`${root}/index.html`, "utf8");
const copy = {
  about:
    "<h1>A little about Joshua Koo.</h1><p>stanford cs + math · coxswain · investment intern @ crv</p><p>This is my personal corner of the internet. There is also an optional original game world.</p>",
  work: '<h1>Things in motion.</h1><p><a href="https://github.com/jkdreamr">Code & experiments — public projects on GitHub ↗</a></p><p><a href="https://soundcloud.com/atkelix">Music & sounds — SoundCloud ↗</a></p><p><a href="/play">JOSHUA.EXE — explore the playable world ↗</a></p>',
  contact:
    '<h1>Good things start with hello.</h1><p><a href="mailto:joskoo@stanford.edu">joskoo@stanford.edu</a></p><p><a href="https://linkedin.com/in/joshuaykoo">LinkedIn</a> · <a href="https://github.com/jkdreamr">GitHub</a> · <a href="https://x.com/joshuaykoo">X</a> · <a href="https://www.instagram.com/joshuaykoo/">Instagram</a> · <a href="https://soundcloud.com/atkelix">SoundCloud</a></p>',
};
if (!/<title>[^<]*<\/title>/.test(html))
  throw new Error("prerender: index.html has no <title> to replace");
for (const [route, body] of Object.entries(copy)) {
  await mkdir(`${root}/${route}`, { recursive: true });
  const fallback = `<div id="root"><main style="max-width:660px;margin:15vh auto;padding:28px;font:18px/1.8 Georgia,serif"><nav><a href="/">home</a> · <a href="/about">about</a> · <a href="/work">work</a> · <a href="/contact">contact</a> · <a href="/play">play</a></nav>${body}<noscript>The optional game requires JavaScript; all portfolio links work without it.</noscript></main></div>`;
  await writeFile(
    `${root}/${route}/index.html`,
    html
      .replace(/<div id="root">[\s\S]*?<\/div>/, fallback)
      .replace(
        /<title>[^<]*<\/title>/,
        `<title>${route[0].toUpperCase()}${route.slice(1)} — Joshua Koo</title>`,
      ),
  );
}
await writeFile(`${root}/robots.txt`, "User-agent: *\nDisallow: /api/\n");
console.log("Static /about, /work and /contact fallbacks generated.");
