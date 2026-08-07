/* oxlint-disable vitest/require-mock-type-parameters -- harness collaborator mocks are intentionally inferred from inline fixtures. */

import type { DeployCampaignLifecycleResult } from "@patronage/google-ads/workflows/deploy-campaign";
import { describe, expect, it, vi } from "vitest";

import {
  extractReceiptFailure,
  runCliMutationHarness,
} from "./mutation-harness.js";

describe(runCliMutationHarness, () => {
  it("turns a saved-plan mismatch into manual review guidance", async () => {
    const output = vi.fn();
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await runCliMutationHarness({
        command: "google campaigns deploy",
        createClient: () => ({ provider: true }),
        execute: true,
        input: {},
        operations: [],
        output,
        provider: "google-ads",
        run: vi.fn().mockRejectedValue(
          Object.assign(new Error("changed"), {
            name: "MutationPlanMismatchError",
          })
        ),
        runLogDir: "/tmp",
        validation: "provider",
        writeLog: () => ({ path: "/tmp/manual.json" }),
      });
      expect(output).toHaveBeenCalledWith(
        expect.stringContaining("MANUAL REVIEW")
      );
      expect(output).toHaveBeenCalledWith(
        expect.stringContaining("Do not retry")
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
  it("keeps local planning credential-free and labels it accurately", async () => {
    const createClient = vi.fn(() => ({ provider: true }));
    const run = vi.fn().mockResolvedValue({ id: "should-not-run" });
    const output = vi.fn();
    const writeLog = vi.fn(() => ({ path: "/tmp/local.json" }));

    const result = await runCliMutationHarness({
      command: "meta ads audiences delete",
      createClient,
      input: { audienceId: "1" },
      operations: [{ deleteAudience: "1" }],
      output,
      provider: "meta-ads",
      run,
      runLogDir: "/tmp",
      validation: "local",
      writeLog,
    });

    expect(result.lifecycle).toBe("local-planned");
    expect(createClient).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("Planned locally")
    );
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ lifecycle: "local-planned" }),
      })
    );
  });

  it("performs provider validation without claiming execution", async () => {
    const client = { provider: true };
    const run = vi.fn().mockResolvedValue({ requestId: "validate-request" });

    const result = await runCliMutationHarness({
      command: "google ad-groups pause",
      createClient: () => client,
      format: "json",
      input: {},
      operations: [{ pause: "1" }],
      output: vi.fn(),
      provider: "google-ads",
      run,
      runLogDir: "/tmp",
      validation: "provider",
      writeLog: () => ({ path: "/tmp/provider.json" }),
    });

    expect(result.lifecycle).toBe("provider-validated");
    expect(run).toHaveBeenCalledExactlyOnceWith(client, "validate");
  });

  it("reports a failed receipt instead of claiming success and exits non-zero", async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    const output = vi.fn();
    const run = vi.fn().mockResolvedValue({
      receipt: {
        stage: "provider-validated",
        status: "failed",
        steps: [
          { attempted: true, key: "local-plan", status: "succeeded" },
          {
            attempted: true,
            failureDetail: "campaign policy disapproved",
            key: "provider-validation",
            status: "failed",
          },
          { attempted: false, key: "execution", status: "pending" },
        ],
      },
    });

    try {
      await runCliMutationHarness({
        command: "google campaigns deploy",
        createClient: () => ({ provider: true }),
        execute: true,
        input: {},
        operations: [{ create: "campaign" }],
        output,
        provider: "google-ads",
        run,
        runLogDir: "/tmp",
        validation: "provider",
        writeLog: () => ({ path: "/tmp/failed.json" }),
      });

      expect(output).toHaveBeenCalledWith(
        expect.stringContaining("FAILED at provider-validated")
      );
      expect(output).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failure detail: provider-validation: campaign policy disapproved"
        )
      );
      expect(output).not.toHaveBeenCalledWith(
        expect.stringContaining("Executed")
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("exits non-zero on a failed receipt even in json output mode", async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    const output = vi.fn();

    try {
      await runCliMutationHarness({
        command: "google campaigns deploy",
        createClient: () => ({ provider: true }),
        execute: true,
        format: "json",
        input: {},
        operations: [{ create: "campaign" }],
        output,
        provider: "google-ads",
        run: vi.fn().mockResolvedValue({
          receipt: { stage: "provider-validated", status: "failed", steps: [] },
        }),
        runLogDir: "/tmp",
        validation: "provider",
        writeLog: () => ({ path: "/tmp/failed.json" }),
      });

      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("labels ambiguous and manual-review receipts and handles missing stages", async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    const output = vi.fn();

    try {
      await runCliMutationHarness({
        command: "meta ads campaigns deploy",
        createClient: () => ({ provider: true }),
        execute: true,
        input: {},
        operations: [{ create: "campaign" }],
        output,
        provider: "meta-ads",
        run: vi.fn().mockResolvedValue({
          receipt: { status: "manual-review", steps: [] },
        }),
        runLogDir: "/tmp",
        validation: "provider",
        writeLog: () => ({ path: "/tmp/manual.json" }),
      });

      expect(output).toHaveBeenCalledWith(
        expect.stringContaining("MANUAL REVIEW meta ads campaigns deploy")
      );
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }

    expect(
      extractReceiptFailure({
        receipt: { stage: "executed", status: "ambiguous" },
      })?.status
    ).toBe("ambiguous");
  });

  it("detects failure at the google deploy result's receipt location", () => {
    const receipt = {
      stage: "provider-validated",
      status: "failed",
      steps: [
        {
          attempted: true,
          failureDetail: "campaign policy disapproved",
          key: "provider-validation",
          status: "failed",
        },
      ],
    } as DeployCampaignLifecycleResult["receipt"];
    const result: Pick<DeployCampaignLifecycleResult, "receipt"> = { receipt };

    expect(extractReceiptFailure(result)?.status).toBe("failed");
    expect(extractReceiptFailure(result)?.failedSteps).toStrictEqual([
      "provider-validation: failed",
    ]);
    expect(extractReceiptFailure(result)?.failureDetails).toStrictEqual([
      "provider-validation: campaign policy disapproved",
    ]);
  });

  it("renders and logs provider receipts as opaque payloads", async () => {
    const receipt = {
      provider: "linkedin",
      steps: [{ privateProviderStep: "untouched" }],
    };
    const output = vi.fn();
    const writeLog = vi.fn(() => ({ path: "/tmp/execute.json" }));

    const result = await runCliMutationHarness({
      command: "linkedin ads optimization pause",
      createClient: () => ({ provider: true }),
      execute: true,
      format: "json",
      input: {},
      operations: [{ pause: "1" }],
      output,
      provider: "linkedin-ads",
      run: async () => ({ receipt }),
      runLogDir: "/tmp",
      validation: "local",
      writeLog,
    });

    expect(result.lifecycle).toBe("executed");
    expect(result.result).toStrictEqual({ receipt });
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("privateProviderStep")
    );
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: { lifecycle: "executed", providerResult: { receipt } },
      })
    );
  });
});
