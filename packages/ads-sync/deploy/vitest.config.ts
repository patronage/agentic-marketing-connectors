import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageBuild = fileURLToPath(
  new URL("../dist/index.mjs", import.meta.url)
);
const packageSource = (file: string) =>
  fileURLToPath(new URL(`../src/${file}`, import.meta.url));

// Without a package build, resolve the public entry points from source.
export default defineConfig(
  existsSync(packageBuild)
    ? {}
    : {
        resolve: {
          alias: [
            {
              find: /^@patronage\/ads-sync\/run$/u,
              replacement: packageSource("run.ts"),
            },
            {
              find: /^@patronage\/ads-sync$/u,
              replacement: packageSource("index.ts"),
            },
          ],
        },
      }
);
