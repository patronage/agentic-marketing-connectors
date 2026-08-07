import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const privateConfigPackage = ["@paitronage", "config"].join("/");
const forbiddenRuntimeImports = [
  privateConfigPackage,
  "@patronage/cli",
  "automation/meta",
  "axios",
  "child_process",
  "commander",
  "dotenv",
  'from "fb"',
  'import("fb")',
  "facebook-nodejs-business-sdk",
  "node-fetch",
  "node:",
  'from "fs"',
  'import("fs")',
  'from "http"',
  'import("http")',
  'from "https"',
  'import("https")',
  'from "path"',
  'import("path")',
  'from "process"',
  'import("process")',
  "process.env",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = path.join(dir, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      return sourceFiles(filePath);
    }

    if (!filePath.endsWith(".ts") || filePath.endsWith(".test.ts")) {
      return [];
    }

    return [filePath];
  });
}

describe("worker-safe public boundary", () => {
  it("exports the Meta Social root surface", async () => {
    const root = await import("./index.js");

    expect(Object.keys(root).toSorted()).toStrictEqual([
      "MetaSocialApiError",
      "createMetaSocialClient",
    ]);
  });

  it("keeps runtime source files free of Node and legacy Meta dependencies", () => {
    const files = sourceFiles(new URL(".", import.meta.url).pathname);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const forbidden of forbiddenRuntimeImports) {
        expect(
          content,
          `${path.relative(process.cwd(), file)} should not include ${forbidden}`
        ).not.toContain(forbidden);
      }
    }
  });
});
