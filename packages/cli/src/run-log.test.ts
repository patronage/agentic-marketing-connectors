import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatTimestamp, writeRunLog } from "./run-log.js";

describe("formatTimestamp", () => {
  it("keeps a single-level filename-safe UTC timestamp", () => {
    expect(formatTimestamp(new Date("2026-05-22T15:30:00.123Z"))).toBe(
      "2026-05-22T153000.123Z"
    );
  });

  it("preserves millisecond precision to avoid rapid retry collisions", () => {
    expect(formatTimestamp(new Date("2026-05-22T15:30:00.123Z"))).not.toBe(
      formatTimestamp(new Date("2026-05-22T15:30:00.456Z"))
    );
  });

  it("writes provider-neutral mutation logs", () => {
    const runLogDir = mkdtempSync(path.join(os.tmpdir(), "patronage-run-log-"));

    try {
      const result = writeRunLog({
        command: "meta ads boosts create",
        input: { postId: "post-1" },
        mode: "validate",
        operations: [{ method: "POST", path: "/act_123/campaigns" }],
        provider: "meta-ads",
        result: { id: "planned-1", ok: true },
        runLogDir,
      });

      expect(path.basename(result.path)).toContain(
        "meta-ads-meta-ads-boosts-create-validate.json"
      );
      expect(JSON.parse(readFileSync(result.path, "utf8"))).toMatchObject({
        command: "meta ads boosts create",
        inputFile: null,
        provider: "meta-ads",
        result: { id: "planned-1", ok: true },
      });
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });

  it("preserves provider-specific result payloads that include request IDs", () => {
    const runLogDir = mkdtempSync(path.join(os.tmpdir(), "patronage-run-log-"));

    try {
      const result = writeRunLog({
        command: "linkedin ads campaigns create",
        input: { name: "Campaign" },
        mode: "execute",
        operations: [{ method: "POST", path: "/rest/adCampaigns" }],
        provider: "linkedin-ads",
        result: {
          id: "campaign-1",
          requestId: "linkedin-request-1",
          status: "PAUSED",
        },
        runLogDir,
      });

      expect(JSON.parse(readFileSync(result.path, "utf8"))).toMatchObject({
        result: {
          id: "campaign-1",
          requestId: "linkedin-request-1",
          status: "PAUSED",
        },
      });
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });
});
