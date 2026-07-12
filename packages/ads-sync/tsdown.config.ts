import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: { generator: "tsgo" },
  entry: ["src/index.ts"],
  format: ["esm"],
});
