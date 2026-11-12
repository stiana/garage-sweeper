import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@garage/sim-core": fileURLToPath(new URL("./packages/sim-core/src/index.ts", import.meta.url)) },
  },
  test: { include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"] },
});
