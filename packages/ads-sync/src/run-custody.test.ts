import { describe, expect, it } from "vitest";

import { providerModules } from "./providers.js";
import {
  ADS_SYNC_MANAGED_SECRET_NAMES,
  ADS_SYNC_RUNNER_TOKEN_SECRET_NAME,
  CustodyFenceError,
  POSTGRES_DESTINATION_CONFIG_SECRET_NAME,
  workerSecretsCustodyAdapter,
} from "./run-custody.js";
import { syncConnectionFixture } from "./test-fixtures/qualified-run-doubles.js";

const SOURCE_CONFIG = { site_urls: ["sc-domain:example.com"] };
const SEED_STATE = [{ type: "STREAM" }];
const DESTINATION_CONFIG = { host: "db.example.invalid" };

const connection = syncConnectionFixture();

const secretsRecord = {
  GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON: JSON.stringify(SOURCE_CONFIG),
  GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON: JSON.stringify(SEED_STATE),
  POSTGRES_DESTINATION_CONFIG_JSON: JSON.stringify(DESTINATION_CONFIG),
};

/**
 * `workerSecretsCustodyAdapter` throws synchronously on a fenced or invalid
 * secret, so tests normalize both throw forms into one rejected promise.
 */
async function resolved(call: () => Promise<unknown>) {
  return await call();
}

/** Records every field the adapter reads, so a fenced field can be proven unread. */
function watchedSecrets(record: Record<string, string | undefined>) {
  const readKeys: string[] = [];
  const proxy = new Proxy(record, {
    get(target, property, receiver) {
      if (typeof property === "string") {
        readKeys.push(property);
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return { proxy, readKeys };
}

describe("Ads Sync managed secret names", () => {
  it("covers the Google Search Console config and state secrets (issue #1525)", () => {
    expect(
      ADS_SYNC_MANAGED_SECRET_NAMES.has(
        "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON"
      )
    ).toBeTruthy();
    expect(
      ADS_SYNC_MANAGED_SECRET_NAMES.has(
        "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON"
      )
    ).toBeTruthy();
  });

  it("contains exactly the runner, destination, and per-provider secrets", () => {
    expect([...ADS_SYNC_MANAGED_SECRET_NAMES].toSorted()).toStrictEqual(
      [
        "ADS_SYNC_RUNNER_TOKEN",
        "POSTGRES_DESTINATION_CONFIG_JSON",
        "GOOGLE_ADS_SOURCE_CONFIG_JSON",
        "GOOGLE_ADS_SOURCE_STATE_JSON",
        "GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON",
        "GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON",
        "META_ADS_SOURCE_CONFIG_JSON",
        "META_ADS_SOURCE_STATE_JSON",
      ].toSorted()
    );
  });

  it("is derived from the Supported Provider modules", () => {
    expect([...ADS_SYNC_MANAGED_SECRET_NAMES].toSorted()).toStrictEqual(
      [
        ADS_SYNC_RUNNER_TOKEN_SECRET_NAME,
        POSTGRES_DESTINATION_CONFIG_SECRET_NAME,
        ...Object.values(providerModules).flatMap((module) => [
          module.sourceConfigSecret,
          module.stateSecret,
        ]),
      ].toSorted()
    );
  });
});

describe(workerSecretsCustodyAdapter, () => {
  it("resolves source config, seed state, and destination config", async () => {
    const custody = workerSecretsCustodyAdapter(secretsRecord);

    await expect(custody.sourceConfig(connection)).resolves.toStrictEqual(
      SOURCE_CONFIG
    );
    await expect(custody.seedState(connection)).resolves.toStrictEqual(
      SEED_STATE
    );
    await expect(custody.destinationConfig(connection)).resolves.toStrictEqual(
      DESTINATION_CONFIG
    );
  });

  it("returns undefined seed state when the secret is blank", async () => {
    const custody = workerSecretsCustodyAdapter({
      ...secretsRecord,
      GOOGLE_SEARCH_CONSOLE_SOURCE_STATE_JSON: "   ",
    });

    await expect(custody.seedState(connection)).resolves.toBeUndefined();
  });

  it.each(["HYPERDRIVE", "SOME_OTHER_SECRET"])(
    "refuses %s and never reads the fenced field",
    async (sourceConfigRef) => {
      const { proxy, readKeys } = watchedSecrets({ ...secretsRecord });
      const custody = workerSecretsCustodyAdapter(proxy);

      await expect(
        resolved(() =>
          custody.sourceConfig(syncConnectionFixture({ sourceConfigRef }))
        )
      ).rejects.toBeInstanceOf(CustodyFenceError);
      expect(readKeys).not.toContain(sourceConfigRef);
      expect(readKeys).toHaveLength(0);
    }
  );

  it("refuses a fenced state secret name", async () => {
    const custody = workerSecretsCustodyAdapter(secretsRecord);

    await expect(
      resolved(() =>
        custody.seedState(
          syncConnectionFixture({ stateConfigRef: "HYPERDRIVE" })
        )
      )
    ).rejects.toThrow(/is not an Ads Sync managed secret name/u);
  });

  it("rejects a managed secret that is not valid JSON", async () => {
    const custody = workerSecretsCustodyAdapter({
      ...secretsRecord,
      GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON: "{not json",
    });

    await expect(
      resolved(() => custody.sourceConfig(connection))
    ).rejects.toThrow(/is not valid JSON/u);
  });

  it("rejects a missing required secret", async () => {
    const custody = workerSecretsCustodyAdapter({});

    await expect(
      resolved(() => custody.sourceConfig(connection))
    ).rejects.toThrow(/is not configured/u);
    await expect(
      resolved(() => custody.destinationConfig(connection))
    ).rejects.toThrow(/is not configured/u);
  });
});
