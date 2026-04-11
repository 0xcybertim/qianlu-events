import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/server.ts"],
  format: ["esm"],
  noExternal: [
    "@qianlu-events/config",
    "@qianlu-events/domain",
    "@qianlu-events/schemas",
  ],
  outDir: "dist",
  platform: "node",
  target: "node22",
});
