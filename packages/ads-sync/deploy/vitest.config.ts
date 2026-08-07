import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const packageBuild = fileURLToPath(
  new URL("../dist/index.mjs", import.meta.url)
);

export default defineConfig(
  existsSync(packageBuild)
    ? {}
    : {
        resolve: {
          alias: {
            "@patronage/ads-sync": fileURLToPath(
              new URL("../src/index.ts", import.meta.url)
            ),
          },
        },
      }
);
