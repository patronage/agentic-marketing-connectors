import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findDotenvPath } from "./local-env.js";

describe("findDotenvPath", () => {
  it("walks up from a package cwd to find the monorepo .env", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "patronage-cli-env-"));

    try {
      const envPath = path.join(root, ".env");
      const packageCwd = path.join(root, "src/packages/cli");

      mkdirSync(packageCwd, { recursive: true });
      writeFileSync(envPath, "GOOGLE_ADS_CLIENT_ID=test\n");

      expect(findDotenvPath([packageCwd])).toBe(envPath);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("falls back to later start directories", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "patronage-cli-env-"));

    try {
      const outsideCwd = path.join(root, "outside/project");
      const packageCwd = path.join(root, "repo/src/packages/cli");
      const envPath = path.join(root, "repo/.env");

      mkdirSync(outsideCwd, { recursive: true });
      mkdirSync(packageCwd, { recursive: true });
      writeFileSync(envPath, "GOOGLE_ADS_CLIENT_ID=test\n");

      expect(findDotenvPath([outsideCwd, packageCwd])).toBe(envPath);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
