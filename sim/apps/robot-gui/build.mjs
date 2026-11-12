// Bundles the GUI into one self-contained HTML file.
//   dist/index.html     full document, open it directly in a browser
//   dist/fragment.html  the same page without <html>/<head>/<body>, for embedding
import { build, context } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [resolve(here, "src/main.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: !watch,
  write: false,
  alias: { "@garage/sim-core": resolve(here, "../../packages/sim-core/src/index.ts") },
  plugins: [{
    name: "write-html",
    setup(builder) {
      builder.onEnd(async (result) => {
        if (result.errors.length) return;
        const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
        const template = await readFile(resolve(here, "template.html"), "utf8");
        const fragment = `${template}\n<script>\n${script}</script>\n`;
        const full = `<!doctype html>\n<html lang="nb">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${fragment}</body>\n</html>\n`;
        await mkdir(resolve(here, "dist"), { recursive: true });
        await writeFile(resolve(here, "dist/fragment.html"), fragment);
        await writeFile(resolve(here, "dist/index.html"), full);
        console.log(`Built dist/index.html (${Math.round(full.length / 1024)} kB)`);
      });
    },
  }],
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
}
