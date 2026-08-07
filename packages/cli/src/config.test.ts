import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveCliConfig } from "./config.js";

describe(resolveCliConfig, () => {
  it("uses tmp/patronage by default", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "patronage-cli-"));
    try {
      expect(resolveCliConfig({ cwd, env: {} }).runLogDir).toBe(
        path.join(cwd, "tmp/patronage")
      );
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  it("resolves run log directory precedence", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "patronage-cli-"));
    try {
      writeFileSync(
        path.join(cwd, "patronage.config.json"),
        JSON.stringify({ runLogDir: "from-config" })
      );

      expect(resolveCliConfig({ cwd, env: {} }).runLogDir).toBe(
        path.join(cwd, "from-config")
      );
      expect(
        resolveCliConfig({
          cwd,
          env: { PATRONAGE_RUN_LOG_DIR: "from-env" },
        }).runLogDir
      ).toBe(path.join(cwd, "from-env"));
      expect(
        resolveCliConfig({
          cwd,
          env: { PATRONAGE_RUN_LOG_DIR: "from-env" },
          runLogDir: "from-option",
        }).runLogDir
      ).toBe(path.join(cwd, "from-option"));
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
