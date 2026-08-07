import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatTimestamp, writeRunLog } from "./run-log.js";

describe(formatTimestamp, () => {
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
      expect(JSON.parse(readFileSync(result.path, "utf-8"))).toMatchObject({
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

      expect(JSON.parse(readFileSync(result.path, "utf-8"))).toMatchObject({
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

  it("redacts canary credentials from arguments and nested mutation input", () => {
    const runLogDir = mkdtempSync(path.join(os.tmpdir(), "patronage-run-log-"));
    const originalArgv = process.argv;
    const canary = "canary-credential-must-not-appear";
    const testEventCode = "canary-test-event-code-must-not-appear";

    try {
      process.argv = [
        "node",
        "patronage",
        "meta",
        "ads",
        "conversions",
        "send",
        "--access-token",
        canary,
        `--app-secret-proof=${canary}`,
        "--code",
        testEventCode,
      ];
      const result = writeRunLog({
        command: "meta ads conversions send",
        input: {
          accessToken: canary,
          audience: { data: [[canary]], schema: ["EMAIL"] },
          audienceWithStringSchema: { data: canary, schema: "EMAIL" },
          events: [{ user_data: { em: canary } }],
          nested: { client_secret: canary },
          pixelId: "pixel-1",
          testEventCode,
        },
        mode: "validate",
        operations: [{ sendConversionEvents: "pixel-1" }],
        provider: "meta-ads",
        result: { ok: true },
        runLogDir,
      });

      const contents = readFileSync(result.path, "utf-8");
      expect(contents).not.toContain(canary);
      expect(contents).not.toContain(testEventCode);
      expect(JSON.parse(contents)).toMatchObject({
        context: {
          argv: [
            "meta",
            "ads",
            "conversions",
            "send",
            "--access-token",
            "[REDACTED]",
            "--app-secret-proof=[REDACTED]",
            "--code",
            "[REDACTED]",
          ],
        },
        input: {
          accessToken: "[REDACTED]",
          audience: { data: "[REDACTED]", schema: ["EMAIL"] },
          audienceWithStringSchema: { data: "[REDACTED]", schema: "EMAIL" },
          events: [{ user_data: "[REDACTED]" }],
          nested: { client_secret: "[REDACTED]" },
          pixelId: "pixel-1",
          testEventCode: "[REDACTED]",
        },
      });
    } finally {
      process.argv = originalArgv;
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });

  it("writes run logs with owner-only file permissions", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "patronage-run-log-"));
    const runLogDir = path.join(root, "logs");

    try {
      const result = writeRunLog({
        command: "google ad-groups pause",
        input: { customerId: "123" },
        mode: "validate",
        operations: [],
        provider: "google-ads",
        result: { ok: true },
        runLogDir,
      });

      expect(statSync(runLogDir).mode % 0o1000).toBe(0o700);
      expect(statSync(result.path).mode % 0o1000).toBe(0o600);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not change permissions on an existing operator-owned directory", () => {
    const runLogDir = mkdtempSync(
      path.join(os.tmpdir(), "patronage-shared-run-log-")
    );

    try {
      chmodSync(runLogDir, 0o750);
      const result = writeRunLog({
        command: "google ad-groups pause",
        input: { customerId: "123" },
        mode: "validate",
        operations: [],
        provider: "google-ads",
        result: { ok: true },
        runLogDir,
      });

      expect(statSync(runLogDir).mode % 0o1000).toBe(0o750);
      expect(statSync(result.path).mode % 0o1000).toBe(0o600);
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });
});
