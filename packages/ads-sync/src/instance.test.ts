import { describe, expect, it } from "vitest";

import {
  defineAdsSyncInstance,
  planAdsSyncModeTransition,
  resolveAdsSyncInstanceDeployment,
} from "./instance.js";

const instance = {
  clientKey: "example",
  connections: ["google_ads_default"] as "google_ads_default"[],
  hyperdriveId: "a".repeat(32),
  instanceKey: "example",
  mode: "disabled" as const,
  placement: { region: "aws:us-west-2" as const },
  postgres: {
    airbyteRole: "example_airbyte",
    branch: "main",
    branchId: "branchid",
    database: "example-ads-sync",
    host: "example.pg.psdb.cloud",
    migrationRole: "example_migration",
    organization: "example-org",
    runtimeRole: "example_runtime",
  },
  resourcePrefix: "paitronage-ads-sync-example",
  schemaVersion: 1 as const,
};

const identityOnlyInstance = {
  clientKey: instance.clientKey,
  connections: instance.connections,
  hyperdriveId: instance.hyperdriveId,
  instanceKey: instance.instanceKey,
  placement: instance.placement,
  postgres: instance.postgres,
  resourcePrefix: instance.resourcePrefix,
  schemaVersion: 2 as const,
};

describe("Ads Sync instance contract", () => {
  it("derives isolated resource identities and a disabled deployment", () => {
    expect(resolveAdsSyncInstanceDeployment(instance)).toMatchObject({
      connectionProfiles: ["google_ads_default"],
      crons: [],
      disabled: true,
      providers: ["google_ads"],
      r2Name: "paitronage-ads-sync-example-raw",
      requiredSecretNames: [
        "ADS_SYNC_RUNNER_TOKEN",
        "POSTGRES_DESTINATION_CONFIG_JSON",
        "GOOGLE_ADS_SOURCE_CONFIG_JSON",
      ],
      workerName: "paitronage-ads-sync-example-container-runner",
      workflowName: "paitronage-ads-sync-example-workflow",
    });
  });

  it("enables only the thin scheduler in scheduled mode", () => {
    const deployment = resolveAdsSyncInstanceDeployment({
      ...instance,
      mode: "scheduled",
      qualification: {
        backfill: {
          completedAt: "2026-07-28T12:00:00.000Z",
          evidenceRef: "issue:1#backfill",
          runId: "backfill-run",
        },
        canary: {
          completedAt: "2026-07-28T10:00:00.000Z",
          evidenceRef: "issue:1#canary",
          runId: "canary-run",
        },
        comparison: {
          completedAt: "2026-07-28T13:00:00.000Z",
          evidenceRef: `ads-sync-comparison:sha256:${"b".repeat(64)}`,
          runId: "comparison-run",
        },
      },
    });
    expect(deployment.disabled).toBeFalsy();
    expect(deployment.crons).toStrictEqual(["*/15 * * * *"]);
  });

  it("makes identity-only v2 deployments lifecycle-invariant", () => {
    const deployments = [
      "scaffolded",
      "canary",
      "backfill",
      "scheduled",
      "paused",
    ].map(() => resolveAdsSyncInstanceDeployment(identityOnlyInstance));

    expect(
      new Set(deployments.map((deployment) => JSON.stringify(deployment)))
    ).toHaveLength(1);
    expect(deployments[0]).toMatchObject({
      crons: ["*/15 * * * *"],
      disabled: false,
      schemaVersion: 2,
    });
    expect(deployments[0]).not.toHaveProperty("mode");
  });

  it("strictly distinguishes v1 lifecycle fields from identity-only v2", () => {
    expect(defineAdsSyncInstance(instance)).toMatchObject({
      mode: "disabled",
      schemaVersion: 1,
    });
    expect(defineAdsSyncInstance(identityOnlyInstance)).toMatchObject({
      schemaVersion: 2,
    });
    expect(() =>
      defineAdsSyncInstance({ ...identityOnlyInstance, mode: "disabled" })
    ).toThrow(/Unrecognized key/u);
    expect(() =>
      defineAdsSyncInstance({
        ...identityOnlyInstance,
        qualification: {},
      })
    ).toThrow(/Unrecognized key/u);
  });

  it.each([
    ["sample-one", "paitronage-ads-sync-sample-one"],
    ["sample-two", "paitronage-ads-sync-sample-two"],
    ["patronage", "patronage-ads-sync"],
  ])("accepts the %s resource namespace", (clientKey, resourcePrefix) => {
    expect(
      defineAdsSyncInstance({
        ...identityOnlyInstance,
        clientKey,
        instanceKey: clientKey,
        resourcePrefix,
      })
    ).toMatchObject({ clientKey, resourcePrefix, schemaVersion: 2 });
  });

  it("rejects a resource namespace for a different client", () => {
    expect(() =>
      defineAdsSyncInstance({
        ...identityOnlyInstance,
        clientKey: "sample-two",
        instanceKey: "sample-two",
        resourcePrefix: "patronage-ads-sync",
      })
    ).toThrow(/resourcePrefix must contain clientKey/u);
  });

  it("rejects exact placeholder identities without matching host substrings", () => {
    expect(() =>
      defineAdsSyncInstance({
        ...identityOnlyInstance,
        clientKey: "placeholder",
        instanceKey: "placeholder",
        resourcePrefix: "placeholder-ads-sync",
      })
    ).toThrow(/Placeholder identity/u);
    expect(
      defineAdsSyncInstance({
        ...identityOnlyInstance,
        postgres: {
          ...identityOnlyInstance.postgres,
          host: "example.pg.psdb.cloud",
        },
      })
    ).toMatchObject({ schemaVersion: 2 });
  });

  it("derives both providers without duplicating shared secrets", () => {
    const deployment = resolveAdsSyncInstanceDeployment({
      ...instance,
      connections: [
        "google_ads_default",
        "meta_ads_performance",
        "meta_ads_metadata",
      ],
    });
    expect(deployment.providers).toStrictEqual(["google_ads", "meta_ads"]);
    expect(new Set(deployment.requiredSecretNames).size).toBe(
      deployment.requiredSecretNames.length
    );
  });

  it.each(["patronage", "sample-one", "sample-two", "fictional"])(
    "resolves the %s shape through the same public planner",
    (clientKey) => {
      const deployment = resolveAdsSyncInstanceDeployment({
        ...instance,
        clientKey,
        instanceKey: clientKey,
        resourcePrefix: `paitronage-ads-sync-${clientKey}`,
      });

      expect(deployment).toMatchObject({
        clientKey,
        instanceKey: clientKey,
        workerName: `paitronage-ads-sync-${clientKey}-container-runner`,
      });
    }
  );

  it("rejects duplicate profiles and unsafe resource identifiers", () => {
    expect(() =>
      defineAdsSyncInstance({
        ...instance,
        connections: ["google_ads_default", "google_ads_default"],
      })
    ).toThrow(/must be unique/u);
    expect(() =>
      defineAdsSyncInstance({ ...instance, resourcePrefix: "Unsafe_Name" })
    ).toThrow(/Invalid string/u);
    expect(() =>
      defineAdsSyncInstance({ ...instance, secret: "must-not-be-accepted" })
    ).toThrow(/Unrecognized key/u);
    expect(() =>
      defineAdsSyncInstance({
        ...instance,
        postgres: { ...instance.postgres, runtimeRole: 'unsafe"role' },
      })
    ).toThrow(/Invalid string/u);
  });

  it("requires durable qualification evidence before scheduling", () => {
    expect(() =>
      defineAdsSyncInstance({ ...instance, mode: "scheduled" })
    ).toThrow(/durable canary evidence/u);
    expect(() =>
      defineAdsSyncInstance({
        ...instance,
        mode: "scheduled",
        qualification: {
          backfill: {
            completedAt: "2026-07-28T12:00:00.000Z",
            evidenceRef: "issue:1#backfill",
            runId: "backfill-run",
          },
          canary: {
            completedAt: "2026-07-28T10:00:00.000Z",
            evidenceRef: "issue:1#canary",
            runId: "canary-run",
          },
          comparison: {
            completedAt: "2026-07-28T13:00:00.000Z",
            evidenceRef: "issue:1#comparison",
            runId: "comparison-run",
          },
        },
      })
    ).toThrow(/comparison artifact hash reference/u);
  });
});

describe("Ads Sync mode transitions", () => {
  it("requires canary, backfill, and comparison evidence for scheduling", () => {
    expect(() =>
      planAdsSyncModeTransition({
        evidence: { canaryPassed: true, comparisonPassed: true },
        from: "canary",
        to: "scheduled",
      })
    ).toThrow(/backfillComplete/u);
    expect(() =>
      planAdsSyncModeTransition({
        evidence: { canaryPassed: true },
        from: "backfill",
        to: "scheduled",
      })
    ).toThrow(/backfillComplete, comparisonPassed/u);
    expect(
      planAdsSyncModeTransition({
        evidence: {
          backfillComplete: true,
          canaryPassed: true,
          comparisonPassed: true,
        },
        from: "backfill",
        to: "scheduled",
      })
    ).toMatchObject({ changed: true, to: "scheduled" });
  });

  it("always permits returning an instance to disabled", () => {
    expect(
      planAdsSyncModeTransition({ from: "scheduled", to: "disabled" })
    ).toMatchObject({ changed: true, to: "disabled" });
  });
});
