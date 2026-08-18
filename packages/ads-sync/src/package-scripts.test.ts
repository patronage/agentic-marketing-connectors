import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf-8"
  )
) as { scripts: { check: string }; version: string };

describe("package check script", () => {
  it("builds dist before typecheck and test so a fresh checkout can pass", () => {
    expect(packageJson.scripts.check).toBe(
      "pnpm build && pnpm typecheck && pnpm test"
    );
  });

  it("is the 0.2.0 release unit", () => {
    expect(packageJson.version).toBe("0.2.0");
  });
});
