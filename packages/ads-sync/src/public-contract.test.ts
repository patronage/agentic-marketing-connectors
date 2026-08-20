/**
 * Contract tests for the documented public API. Each test name states the
 * invariant that `apps/ads-sync-docs/docs/reference/public-contract.mdx`
 * and the package README document.
 */
import { describe, expect, it } from "vitest";

import { supportedImageVersions } from "./config.js";
import {
  committedStateAfterSuccessfulDestinationWrite,
  compileDestinationInput,
  destinationConfigForProvider,
  enforceTextArtifactLimits,
} from "./core.js";
import { googleAdsProvider } from "./google-ads.js";
import { googleSearchConsoleProvider } from "./google-search-console.js";
import { metaAdsProvider } from "./meta-ads.js";
import type { AdsSyncProvider } from "./provider-contract.js";
import {
  accessTokenSourceConfigForProvider,
  accessTokenSourceConfigProviders,
  configuredCatalogForProvider,
  providerModules,
  supportedProviders,
  validateCatalogForReporting,
} from "./providers.js";
import { createQualifiedRunAdapter, DEFAULT_ARTIFACT_LIMITS } from "./run.js";

const providerCases = supportedProviders.map(
  (provider) => [provider] as [AdsSyncProvider]
);

const stateMessage = (date: string) =>
  JSON.stringify({
    state: {
      stream: {
        stream_descriptor: { name: "daily" },
        stream_state: { date },
      },
      type: "STREAM",
    },
    type: "STATE",
  });

const recordMessage = JSON.stringify({
  record: { data: { clicks: 1 }, emitted_at: 1, stream: "daily" },
  type: "RECORD",
});

describe(configuredCatalogForProvider, () => {
  it.each(providerCases)(
    "%s ships a configured catalog that passes its own reporting requirements",
    (provider) => {
      const catalog = configuredCatalogForProvider(provider);
      expect(validateCatalogForReporting(provider, catalog)).toStrictEqual([]);
    }
  );

  it.each(providerCases)(
    "%s configured catalog names the provider default stream first",
    (provider) => {
      const catalog = configuredCatalogForProvider(provider);
      expect(catalog.streams[0]?.stream.name).toBe(
        providerModules[provider].streamName
      );
      expect(catalog).toBe(providerModules[provider].configuredCatalog);
    }
  );

  it("does not tie the catalog to a run generation", () => {
    for (const provider of supportedProviders) {
      for (const stream of configuredCatalogForProvider(provider).streams) {
        expect(stream.generation_id).toBe(0);
        expect(stream.minimum_generation_id).toBe(0);
        expect(stream.sync_id).toBe(0);
      }
    }
  });
});

describe(accessTokenSourceConfigForProvider, () => {
  const input = {
    accessToken: "example-access-token",
    accountIds: ["https://example.org/"],
    endDate: "2026-02-01",
    startDate: "2026-01-01",
  };

  it("lists exactly the providers whose pinned image reads a bearer token", () => {
    expect(accessTokenSourceConfigProviders).toStrictEqual([
      "google_search_console",
      "meta_ads",
    ]);
    expect(googleAdsProvider).not.toHaveProperty("accessTokenSourceConfig");
  });

  it("throws for a provider without an access-token-only builder", () => {
    expect(() =>
      accessTokenSourceConfigForProvider(
        "google_ads" as "google_search_console",
        input
      )
    ).toThrow(/google_ads has no access-token-only source config/u);
  });

  it("emits authorization.access_token and no refresh-token OAuth fields for Google Search Console", () => {
    const config = accessTokenSourceConfigForProvider(
      "google_search_console",
      input
    );
    expect(config).toStrictEqual({
      authorization: {
        access_token: "example-access-token",
        auth_type: "Client",
      },
      custom_reports_array: [
        { dimensions: ["query", "page"], name: "search_analytics_query_page" },
      ],
      data_state: "final",
      end_date: "2026-01-31",
      site_urls: ["https://example.org/"],
      start_date: "2026-01-01",
    });
    expect(JSON.stringify(config)).not.toMatch(
      /refresh_token|client_secret|client_id/u
    );
  });

  it("derives Meta custom insights from the configured catalog", () => {
    const config = accessTokenSourceConfigForProvider("meta_ads", {
      ...input,
      accountIds: ["act_0000000000"],
    });
    expect(config).toMatchObject({
      access_token: "example-access-token",
      account_ids: ["act_0000000000"],
      start_date: "2026-01-01T00:00:00Z",
    });
    const insights = config.custom_insights as { name: string }[];
    expect(insights.map(({ name }) => name)).toStrictEqual([
      "campaign_daily_performance",
      "adset_daily_performance",
      "ad_daily_performance",
    ]);
    expect(insights[0]).toMatchObject({
      end_date: "2026-01-31T00:00:00Z",
      level: "campaign",
      time_increment: 1,
    });
  });

  it.each(accessTokenSourceConfigProviders.map((provider) => [provider]))(
    "%s built config reports the first account id as its source account",
    (provider) => {
      const config = accessTokenSourceConfigForProvider(provider, input);
      expect(providerModules[provider].sourceAccountId(config)).toBe(
        input.accountIds[0]
      );
    }
  );

  it.each(accessTokenSourceConfigProviders.map((provider) => [provider]))(
    "%s rejects a startDate or endDate that is not an ISO date",
    (provider) => {
      expect(() =>
        accessTokenSourceConfigForProvider(provider, {
          ...input,
          startDate: "yesterday",
        })
      ).toThrow(/startDate must be an ISO date/u);
      expect(() =>
        accessTokenSourceConfigForProvider(provider, {
          ...input,
          endDate: "tomorrow",
        })
      ).toThrow(/endDate must be an ISO date/u);
    }
  );

  it("never reads an environment or secret store", () => {
    const originalEnv = { ...process.env };
    process.env = {};
    try {
      expect(
        accessTokenSourceConfigForProvider("google_search_console", input)
      ).toMatchObject({ authorization: { access_token: input.accessToken } });
    } finally {
      process.env = originalEnv;
    }
  });
});

describe(compileDestinationInput, () => {
  it("keeps only RECORD, STATE, and STREAM_STATUS trace messages in source order", () => {
    const text = [
      JSON.stringify({ log: { message: "hi" }, type: "LOG" }),
      recordMessage,
      "not json",
      JSON.stringify({ trace: { type: "ERROR" }, type: "TRACE" }),
      JSON.stringify({ trace: { type: "STREAM_STATUS" }, type: "TRACE" }),
      stateMessage("2026-01-01"),
    ].join("\n");

    const compiled = compileDestinationInput(text);

    expect(compiled.droppedLines).toBe(3);
    expect(compiled.messages.split("\n").filter(Boolean)).toHaveLength(3);
    expect(compiled.messages.endsWith("\n")).toBeTruthy();
    expect(compiled.messages.indexOf('"RECORD"')).toBeLessThan(
      compiled.messages.indexOf('"STREAM_STATUS"')
    );
    expect(compiled.summary).toMatchObject({
      records: 1,
      states: 1,
      traces: 1,
    });
  });

  it("returns an empty destination input for empty source stdout", () => {
    expect(compileDestinationInput("")).toStrictEqual({
      droppedLines: 0,
      messages: "",
      summary: expect.objectContaining({ records: 0, states: 0, total: 0 }),
    });
  });

  it("throws instead of truncating when the compiled input exceeds a limit", () => {
    const text = `${recordMessage}\n${recordMessage}\n`;
    expect(() =>
      compileDestinationInput(text, {
        maxDestinationInputBytes: 1_000_000,
        maxLines: 1,
      })
    ).toThrow(/above limit 1$/u);
    expect(() =>
      compileDestinationInput(text, {
        maxDestinationInputBytes: 10,
        maxLines: 10,
      })
    ).toThrow(/bytes, above limit 10/u);
  });
});

describe(enforceTextArtifactLimits, () => {
  it("accepts text at the exact byte and line limits", () => {
    const text = "ab\ncd\n";
    expect(() =>
      enforceTextArtifactLimits("source stdout", text, {
        maxLines: 2,
        maxSourceStdoutBytes: 6,
      })
    ).not.toThrow();
  });

  it("throws with the label when one byte or one line exceeds the limit", () => {
    const text = "ab\ncd\n";
    expect(() =>
      enforceTextArtifactLimits("source stdout", text, {
        maxLines: 2,
        maxSourceStdoutBytes: 5,
      })
    ).toThrow(/^source stdout is 6 bytes, above limit 5$/u);
    expect(() =>
      enforceTextArtifactLimits("source stdout", text, {
        maxLines: 1,
        maxSourceStdoutBytes: 6,
      })
    ).toThrow(/^source stdout has 2 lines, above limit 1$/u);
  });

  it("counts UTF-8 bytes, not characters", () => {
    expect(() =>
      enforceTextArtifactLimits("label", "é", {
        maxLines: 1,
        maxSourceStdoutBytes: 1,
      })
    ).toThrow(/is 2 bytes/u);
  });
});

describe(committedStateAfterSuccessfulDestinationWrite, () => {
  it("returns the last destination STATE and ignores source stdout", () => {
    const destinationStdout = `${stateMessage("2026-01-01")}\n${stateMessage("2026-01-02")}\n`;
    const sourceStdout = stateMessage("2026-03-03");

    const state = committedStateAfterSuccessfulDestinationWrite(
      destinationStdout,
      sourceStdout
    );

    expect(state).toStrictEqual([
      {
        stream: {
          stream_descriptor: { name: "daily" },
          stream_state: { date: "2026-01-02" },
        },
        type: "STREAM",
      },
    ]);
  });

  it("returns null when the destination emitted no STATE, even if the source did", () => {
    expect(
      committedStateAfterSuccessfulDestinationWrite(
        `${recordMessage}\n`,
        stateMessage("2026-01-01")
      )
    ).toBeNull();
  });
});

describe(destinationConfigForProvider, () => {
  const config = { host: "db.example", schema: "public" };

  it("returns a copy with the provider default schema and leaves the input unchanged", () => {
    const result = destinationConfigForProvider(config, "meta_ads");
    expect(result).toStrictEqual({
      host: "db.example",
      schema: "airbyte_meta_ads",
    });
    expect(config.schema).toBe("public");
  });

  it("uses an explicit schema over the provider default", () => {
    expect(
      destinationConfigForProvider(config, "google_ads", "custom_schema")
    ).toMatchObject({ schema: "custom_schema" });
  });

  it("returns a non-object config unchanged", () => {
    expect(destinationConfigForProvider(null, "google_ads")).toBeNull();
    expect(destinationConfigForProvider("text", "google_ads")).toBe("text");
  });
});

describe("supported image versions", () => {
  it("pins every image by digest", () => {
    for (const image of Object.values(supportedImageVersions)) {
      expect(image).toMatch(/^[a-z0-9./-]+:[^@]+@sha256:[a-f0-9]{64}$/u);
    }
  });

  it("lists one destination plus the source image of every Supported Provider", () => {
    expect(Object.keys(supportedImageVersions).toSorted()).toStrictEqual(
      ["destination", ...supportedProviders].toSorted()
    );
    expect(supportedImageVersions.google_ads).toBe(
      googleAdsProvider.sourceImage
    );
    expect(supportedImageVersions.google_search_console).toBe(
      googleSearchConsoleProvider.sourceImage
    );
    expect(supportedImageVersions.meta_ads).toBe(metaAdsProvider.sourceImage);
  });
});

describe(createQualifiedRunAdapter, () => {
  it("exposes the run entry point and every documented phase", () => {
    const adapter = createQualifiedRunAdapter({
      artifacts: {} as never,
      connections: {} as never,
      containers: {} as never,
      custody: {} as never,
      sql: () => {
        throw new Error("not under test");
      },
    });
    expect(Object.keys(adapter).toSorted()).toStrictEqual([
      "acquireLease",
      "commitState",
      "compileDestinationInput",
      "finalizeFailed",
      "finalizeSucceeded",
      "prepare",
      "readSource",
      "recordGeneration",
      "releaseLease",
      "run",
      "writeDestination",
    ]);
  });

  it("defaults artifact limits to the documented bounds", () => {
    expect(DEFAULT_ARTIFACT_LIMITS).toStrictEqual({
      maxDestinationInputBytes: 25 * 1024 * 1024,
      maxLines: 250_000,
      maxSourceStdoutBytes: 50 * 1024 * 1024,
    });
  });
});
