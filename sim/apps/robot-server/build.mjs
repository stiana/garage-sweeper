import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [resolve(here, "src/server.ts")],
  outfile: resolve(here, "dist/server.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  alias: {
    "@garage/sim-core": resolve(here, "../../packages/sim-core/src/index.ts"),
    "@garage/gui-protocol": resolve(here, "../../packages/gui-protocol/src/index.ts"),
  },
});
console.log("Built dist/server.js");
