import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  googleAdsProvider,
  googleSearchConsoleProvider,
  metaAdsProvider,
  providerModule,
  providerModules,
  supportedProviders,
} from "./index.js";
import { catalogDriftIssues } from "./provider-contract.js";
import type {
  AdsSyncProviderModule,
  SourceIdentity,
} from "./provider-contract.js";

/**
 * A synthetic provider that satisfies the package-owned provider interface
 * without touching the Google Ads or Meta Ads modules. It proves the seam:
 * a new source implements `AdsSyncProviderModule` and nothing else.
 */
function syntheticIdentity(sourceConfig: unknown): SourceIdentity {
  if (typeof sourceConfig !== "object" || sourceConfig === null) {
    return {};
  }
  const { account } = sourceConfig as Record<string, unknown>;
  return { account: typeof account === "string" ? account : null };
}

const syntheticProvider = {
  backfillPolicy: { maxWindowsPerRun: 2, windowStepDays: 1 },
  configuredCatalog: {
    streams: [
      {
        cursor_field: [],
        destination_sync_mode: "append",
        primary_key: [],
        stream: {
          json_schema: { properties: { account: { type: ["string"] } } },
          name: "daily",
          supported_sync_modes: ["full_refresh"],
        },
        sync_mode: "full_refresh",
      },
    ],
  },
  defaultAirbyteSchema: "airbyte_synthetic",
  defaultScheduleEveryMinutes: 60,
  displayName: "Synthetic Source",
  id: "synthetic_source",
  normalizeCampaignDailyRecord(record) {
    return {
      account_id: String(record.account ?? ""),
      account_name: null,
      campaign_id: String(record.campaign ?? ""),
      campaign_name: null,
      campaign_status: null,
      clicks: 0,
      conversions: null,
      conversions_value: null,
      currency_code: null,
      date_day: null,
      impressions: 0,
      platform: "synthetic_source",
      raw_record_id: null,
      source_generation_id: null,
      source_table: "airbyte_synthetic.daily",
      spend: 0,
    };
  },
  rateLimitPolicy: {},
  reportingStreamRequirements: [
    {
      fields: [{ allowedTypes: ["string"], field: "account" }],
      streamName: "daily",
    },
  ],
  reportingViews: ["ads_sync_reporting.synthetic_daily"],
  sourceAccountId(sourceConfig) {
    const identity = syntheticIdentity(sourceConfig);
    return typeof identity.account === "string" ? identity.account : null;
  },
  sourceConfigForReporting(sourceConfig, _catalog, window) {
    return {
      ...sourceConfig,
      ...(window.startDate ? { start_date: window.startDate } : {}),
    };
  },
  sourceConfigSecret: "SYNTHETIC_SOURCE_CONFIG_JSON",
  sourceIdentity: syntheticIdentity,
  sourceImage: "example/source-synthetic:0.0.1@sha256:0000000000000000",
  stateSecret: "SYNTHETIC_SOURCE_STATE_JSON",
  streamName: "daily",
} satisfies AdsSyncProviderModule;

describe("provider interface conformance", () => {
  const providerCases: [string, AdsSyncProviderModule][] = [
    ["google_ads", googleAdsProvider],
    ["google_search_console", googleSearchConsoleProvider],
    ["meta_ads", metaAdsProvider],
    ["synthetic_source", syntheticProvider],
  ];

  it.each(providerCases)("%s implements the provider module", (id, module) => {
    expect(module.id).toBe(id);
    expect(module.displayName.length).toBeGreaterThan(0);
    expect(module.defaultAirbyteSchema.length).toBeGreaterThan(0);
    expect(module.defaultScheduleEveryMinutes).toBeGreaterThan(0);
    expect(module.sourceImage).toContain("@sha256:");
    expect(module.sourceConfigSecret.length).toBeGreaterThan(0);
    expect(module.stateSecret.length).toBeGreaterThan(0);
    expect(module.streamName.length).toBeGreaterThan(0);
    expect(module.backfillPolicy.maxWindowsPerRun).toBeGreaterThan(0);
    expect(module.backfillPolicy.windowStepDays).toBeGreaterThan(0);
    expect(module.reportingStreamRequirements.length).toBeGreaterThan(0);
    expect(module.reportingViews.length).toBeGreaterThan(0);
    expect(module.sourceIdentity(null)).toStrictEqual({});
    expect(module.sourceAccountId(null)).toBeNull();
    const normalized = module.normalizeCampaignDailyRecord({});
    expect(normalized.platform).toBe(id);
    expect(normalized.source_table).toContain(module.defaultAirbyteSchema);
  });

  it("registers exactly the supported providers", () => {
    expect(Object.keys(providerModules).toSorted()).toStrictEqual([
      "google_ads",
      "google_search_console",
      "meta_ads",
    ]);
    for (const provider of supportedProviders) {
      expect(providerModule(provider)).toBe(providerModules[provider]);
      expect(providerModules[provider].id).toBe(provider);
    }
  });

  it("evaluates the synthetic provider's reporting requirements", () => {
    const catalog = {
      streams: [
        {
          stream: {
            json_schema: {
              properties: { account: { type: ["string"] } },
            },
            name: "daily",
          },
        },
      ],
    };
    expect(
      catalogDriftIssues(syntheticProvider.reportingStreamRequirements, catalog)
    ).toStrictEqual([]);
    expect(
      catalogDriftIssues(syntheticProvider.reportingStreamRequirements, {
        streams: [],
      })
    ).toHaveLength(1);
  });
});

describe("core.ts extraction", () => {
  const coreSource = readFileSync(new URL("core.ts", import.meta.url), "utf-8");

  it("contains no provider-specific identifiers or branches", () => {
    expect(coreSource).not.toMatch(/google/iu);
    expect(coreSource).not.toMatch(/\bmeta\b/iu);
    expect(coreSource).not.toMatch(/facebook/iu);
    expect(coreSource).not.toMatch(/provider ===/u);
    expect(coreSource).not.toMatch(/CREATE (?:TABLE|SCHEMA|OR REPLACE)/u);
  });

  it("keeps provider dispatch behind the registry modules", () => {
    expect(coreSource).toContain('from "./providers.js"');
    expect(coreSource).not.toContain("reportingStreamRequirements = {");
  });
});
