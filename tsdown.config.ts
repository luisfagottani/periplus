import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/cli.ts"],
  format: "esm",
  outDir: "dist",
  platform: "node",
  target: "node20",
});
