import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: { generator: "oxc" },
  entry: ["src/index.ts"],
  fixedExtension: false,
  format: ["esm"],
  platform: "neutral",
});
