import { describe, expect, it } from "vitest";

import {
  artifactManifestForText,
  artifactKeys,
  backfillWindowDispatchAction,
  compileDestinationInput,
  committedStateAfterDestinationResult,
  committedStateAfterSuccessfulDestinationWrite,
  configuredCatalogForSelectedStreams,
  controlSchemaCatalogSnapshotSql,
  controlSchemaSql,
  defaultSyncConnectionDefinition,
  defineAdsSyncConfig,
  defineProvider,
  destinationConfigForProvider,
  enforceTextArtifactLimits,
  extractLastStateInput,
  firstConfiguredStreamGeneration,
  isRecord,
  normalizeCampaignDailyRecord,
  progressEventPayload,
  providerDefinitions,
  requiredReportingViewTables,
  reportingViewSql,
  requestedProviders,
  sourceConfigForReporting,
  sourceConfigStateKeyInput,
  stampConfiguredCatalog,
  summarizeAirbyteMessages,
  supportedImageVersions,
  supportedProviderDefinitions,
  syncConnectionDefinitionFromConfig,
  validateCatalogForReporting,
} from "./index.js";
import metaCatalog from "./test-fixtures/meta-catalog.example.json" with { type: "json" };

describe(requestedProviders, () => {
  it("defaults to all providers", () => {
    expect(requestedProviders()).toStrictEqual(["google_ads", "meta_ads"]);
    expect(requestedProviders("all")).toStrictEqual(["google_ads", "meta_ads"]);
  });

  it("accepts one provider or a deduped provider list", () => {
    expect(requestedProviders("google_ads")).toStrictEqual(["google_ads"]);
    expect(requestedProviders(["meta_ads", "meta_ads"])).toStrictEqual([
      "meta_ads",
    ]);
  });

  it("rejects unsupported providers", () => {
    expect(() => requestedProviders("linkedin_ads")).toThrow(/providers/u);
  });
});

describe(summarizeAirbyteMessages, () => {
  it("counts record streams, state messages, and invalid lines", () => {
    expect(
      summarizeAirbyteMessages(
        [
          JSON.stringify({
            record: { stream: "campaign_daily_performance" },
            type: "RECORD",
          }),
          JSON.stringify({ state: { data: { cursor: "1" } }, type: "STATE" }),
          "not-json",
          "",
        ].join("\n")
      )
    ).toStrictEqual({
      firstRecordEmittedAt: null,
      invalid: 1,
      lastRecordEmittedAt: null,
      logs: 0,
      records: 1,
      recordsByStream: { campaign_daily_performance: 1 },
      states: 1,
      traces: 0,
      total: 3,
    });
  });
});

describe(extractLastStateInput, () => {
  it("returns the final state as Airbyte state input", () => {
    expect(
      extractLastStateInput(
        [
          JSON.stringify({ state: { data: { cursor: "old" } }, type: "STATE" }),
          JSON.stringify({ state: { data: { cursor: "new" } }, type: "STATE" }),
        ].join("\n")
      )
    ).toStrictEqual([{ data: { cursor: "new" } }]);
  });

  it("preserves the latest Airbyte state for each stream descriptor", () => {
    const campaignState = {
      state: {
        stream: {
          stream_descriptor: { name: "campaign_daily_performance" },
          stream_state: { cursor: "campaign-old" },
        },
        type: "STREAM",
      },
      type: "STATE",
    };
    const adSetState = {
      state: {
        stream: {
          stream_descriptor: { name: "adset_daily_performance" },
          stream_state: { cursor: "adset" },
        },
        type: "STREAM",
      },
      type: "STATE",
    };
    const updatedCampaignState = {
      state: {
        stream: {
          stream_descriptor: { name: "campaign_daily_performance" },
          stream_state: { cursor: "campaign-new" },
        },
        type: "STREAM",
      },
      type: "STATE",
    };

    expect(
      extractLastStateInput(
        [campaignState, adSetState, updatedCampaignState]
          .map((message) => JSON.stringify(message))
          .join("\n")
      )
    ).toStrictEqual([updatedCampaignState.state, adSetState.state]);
  });
});

describe(committedStateAfterSuccessfulDestinationWrite, () => {
  it("prefers destination-emitted state after a successful write", () => {
    expect(
      committedStateAfterSuccessfulDestinationWrite(
        JSON.stringify({
          state: { data: { cursor: "destination" } },
          type: "STATE",
        }),
        JSON.stringify({ state: { data: { cursor: "source" } }, type: "STATE" })
      )
    ).toStrictEqual([{ data: { cursor: "destination" } }]);
  });

  it("does not fall back to source state when the destination emits no state", () => {
    expect(
      committedStateAfterSuccessfulDestinationWrite(
        JSON.stringify({ log: { message: "done" }, type: "LOG" }),
        JSON.stringify({ state: { data: { cursor: "source" } }, type: "STATE" })
      )
    ).toBeNull();
  });
});

describe(committedStateAfterDestinationResult, () => {
  it("does not expose state for commit when the destination write failed", () => {
    expect(
      committedStateAfterDestinationResult({
        destinationStdout: "",
        sourceStdout: JSON.stringify({
          state: { data: { cursor: "unsafe" } },
          type: "STATE",
        }),
        writeSucceeded: false,
      })
    ).toBeNull();
  });

  it("does not expose source state for commit when destination emits no state", () => {
    expect(
      committedStateAfterDestinationResult({
        destinationStdout: "",
        sourceStdout: JSON.stringify({
          state: { data: { cursor: "source-only" } },
          type: "STATE",
        }),
        writeSucceeded: true,
      })
    ).toBeNull();
  });
});

describe(compileDestinationInput, () => {
  it("passes record, state, and stream status trace messages to the destination", () => {
    const record = {
      record: { data: { id: 1 }, stream: "campaign_daily_performance" },
      type: "RECORD",
    };
    const state = { state: { data: { cursor: "1" } }, type: "STATE" };
    const streamComplete = {
      trace: {
        stream_status: {
          status: "COMPLETE",
          stream_descriptor: { name: "campaign_daily_performance" },
        },
        type: "STREAM_STATUS",
      },
      type: "TRACE",
    };

    expect(
      compileDestinationInput(
        [
          JSON.stringify(record),
          JSON.stringify({ log: { message: "debug" }, type: "LOG" }),
          JSON.stringify({ trace: { type: "ERROR" }, type: "TRACE" }),
          "not-json",
          JSON.stringify(streamComplete),
          JSON.stringify(state),
        ].join("\n")
      )
    ).toStrictEqual({
      droppedLines: 3,
      messages: `${JSON.stringify(record)}\n${JSON.stringify(
        streamComplete
      )}\n${JSON.stringify(state)}\n`,
      summary: {
        firstRecordEmittedAt: null,
        invalid: 0,
        lastRecordEmittedAt: null,
        logs: 0,
        records: 1,
        recordsByStream: { campaign_daily_performance: 1 },
        states: 1,
        traces: 1,
        total: 3,
      },
    });
  });

  it("enforces destination input byte and line limits before writes", () => {
    const record = JSON.stringify({
      record: { data: { id: 1 }, stream: "campaign_daily_performance" },
      type: "RECORD",
    });

    expect(() =>
      compileDestinationInput(`${record}\n${record}\n`, {
        maxDestinationInputBytes: 10_000,
        maxLines: 1,
      })
    ).toThrow(/above limit 1/u);
    expect(() =>
      compileDestinationInput(`${record}\n`, {
        maxDestinationInputBytes: 10,
        maxLines: 10,
      })
    ).toThrow(/above limit 10/u);
  });
});

describe("artifact manifests", () => {
  it("records hashes, sizes, line counts, and message counts", async () => {
    const record = JSON.stringify({
      record: {
        emitted_at: Date.parse("2026-05-13T08:01:00.000Z"),
        stream: "campaign_daily_performance",
      },
      type: "RECORD",
    });
    const manifest = await artifactManifestForText(
      "source_stdout",
      `${record}\n${JSON.stringify({ log: {}, type: "LOG" })}\n`
    );

    expect(manifest).toMatchObject({
      firstRecordEmittedAt: "2026-05-13T08:01:00.000Z",
      kind: "source_stdout",
      lastRecordEmittedAt: "2026-05-13T08:01:00.000Z",
      lineCount: 2,
      logCount: 1,
      recordCount: 1,
      stateCount: 0,
      traceCount: 0,
    });
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("enforces source artifact limits", () => {
    expect(() =>
      enforceTextArtifactLimits("Source stdout", "a\nb\n", {
        maxLines: 1,
        maxSourceStdoutBytes: 100,
      })
    ).toThrow(/above limit 1/u);
  });
});

describe(stampConfiguredCatalog, () => {
  it("stamps generation metadata and prevents stale overwrite replay", () => {
    expect(
      stampConfiguredCatalog(
        {
          streams: [
            {
              destination_sync_mode: "overwrite",
              generation_id: 1,
              minimum_generation_id: 1,
              sync_id: 1,
            },
          ],
        },
        123
      )
    ).toStrictEqual({
      streams: [
        {
          destination_sync_mode: "overwrite",
          generation_id: 123,
          minimum_generation_id: 123,
          sync_id: 123,
        },
      ],
    });
  });

  it("does not carry stale append minimum generations into reruns", () => {
    expect(
      stampConfiguredCatalog(
        {
          streams: [
            {
              destination_sync_mode: "append_dedup",
              generation_id: 1,
              minimum_generation_id: 1,
              sync_id: 1,
            },
          ],
        },
        456
      )
    ).toStrictEqual({
      streams: [
        {
          destination_sync_mode: "append_dedup",
          generation_id: 456,
          minimum_generation_id: 0,
          sync_id: 456,
        },
      ],
    });
  });
});

describe(firstConfiguredStreamGeneration, () => {
  it("returns the stamped generation metadata from the first configured stream", () => {
    expect(
      firstConfiguredStreamGeneration(
        {
          streams: [
            {
              generation_id: 456,
              minimum_generation_id: 0,
              sync_id: 456,
            },
          ],
        },
        999
      )
    ).toStrictEqual({
      generationId: 456,
      minimumGenerationId: 0,
      syncId: 456,
    });
  });

  it("falls back to the run generation when catalog metadata is missing", () => {
    expect(
      firstConfiguredStreamGeneration({ streams: [{}] }, 123)
    ).toStrictEqual({
      generationId: 123,
      minimumGenerationId: 123,
      syncId: 123,
    });
  });
});

describe(artifactKeys, () => {
  it("partitions replay artifacts by provider, stream, and run id", () => {
    expect(
      artifactKeys({
        provider: "meta_ads",
        runId: "run-1",
        streamName: "customcampaign_daily_performance",
      })
    ).toStrictEqual({
      catalogKey:
        "meta_ads/customcampaign_daily_performance/run-1/configured-catalog.json",
      destinationInputKey:
        "meta_ads/customcampaign_daily_performance/run-1/destination-input.jsonl",
      destinationStderrKey:
        "meta_ads/customcampaign_daily_performance/run-1/destination-write.stderr.log",
      destinationStdoutKey:
        "meta_ads/customcampaign_daily_performance/run-1/destination-write.stdout.jsonl",
      prefix: "meta_ads/customcampaign_daily_performance/run-1",
      sourceStderrKey:
        "meta_ads/customcampaign_daily_performance/run-1/source-read.stderr.log",
      sourceStdoutKey:
        "meta_ads/customcampaign_daily_performance/run-1/source-read.stdout.jsonl",
      stateInputKey:
        "meta_ads/customcampaign_daily_performance/run-1/state-input.json",
      summaryKey:
        "meta_ads/customcampaign_daily_performance/run-1/summary.json",
    });
  });
});

describe(destinationConfigForProvider, () => {
  it("routes provider writes to provider-specific Airbyte schemas", () => {
    expect(
      destinationConfigForProvider({ schema: "airbyte" }, "google_ads")
    ).toMatchObject({
      schema: "airbyte_google_ads",
    });
    expect(
      destinationConfigForProvider({ schema: "airbyte" }, "meta_ads")
    ).toMatchObject({
      schema: "airbyte_meta_ads",
    });
  });
});

describe(sourceConfigStateKeyInput, () => {
  it("preserves source identity while excluding rotating credentials", () => {
    expect(
      sourceConfigStateKeyInput({
        credentials: {
          client_id: "rotating-client",
          client_secret: "rotating-secret",
          developer_token: "rotating-token",
          refresh_token: "rotating-refresh",
        },
        custom_queries_array: [
          { query: "select campaign.id", table_name: "t" },
        ],
        customer_id: "123",
        start_date: "2026-05-01",
      })
    ).toStrictEqual({
      custom_queries_array: [{ query: "select campaign.id", table_name: "t" }],
      customer_id: "123",
      start_date: "2026-05-01",
    });
  });

  it("keeps Meta account and stream semantics while excluding access tokens", () => {
    expect(
      sourceConfigStateKeyInput({
        access_token: "rotating-token",
        account_ids: ["act_123"],
        insights_jobs: [{ breakdowns: ["publisher_platform"] }],
        start_date: "2026-05-01T00:00:00Z",
      })
    ).toStrictEqual({
      account_ids: ["act_123"],
      insights_jobs: [{ breakdowns: ["publisher_platform"] }],
      start_date: "2026-05-01T00:00:00Z",
    });
  });
});

describe("sync connections", () => {
  it("derives default connection metadata from non-secret source identity", async () => {
    await expect(
      defaultSyncConnectionDefinition({
        catalog: { streams: [] },
        provider: "google_ads",
        sourceConfig: {
          credentials: { refresh_token: "secret" },
          customer_id: "123",
          login_customer_id: "999",
        },
      })
    ).resolves.toMatchObject({
      accountId: "123",
      airbyteSchema: "airbyte_google_ads",
      catalogConfigRef: "ads-sync.config.ts#google_ads_default.catalog",
      connectionId: "google_ads_default",
      provider: "google_ads",
      reportingEnabled: true,
      sourceConfigRef: "GOOGLE_ADS_SOURCE_CONFIG_JSON",
      sourceIdentity: {
        customer_id: "123",
        login_customer_id: "999",
      },
      selectedStreams: ["campaign_daily_performance"],
      streamName: "campaign_daily_performance",
    });
  });

  it("tracks every configured stream in default connection metadata", async () => {
    await expect(
      defaultSyncConnectionDefinition({
        catalog: metaCatalog,
        provider: "meta_ads",
        sourceConfig: {
          account_ids: ["act_123"],
          access_token: "secret",
        },
      })
    ).resolves.toMatchObject({
      selectedStreams: [
        "customcampaign_daily_performance",
        "customadset_daily_performance",
        "customad_daily_performance",
        "ads",
        "ad_creatives",
        "images",
        "videos",
      ],
    });
  });
});

describe("Ads Sync declarative config", () => {
  it("turns config-declared catalogs and secret names into sync connections", async () => {
    const config = defineAdsSyncConfig({
      connections: [
        {
          catalog: metaCatalog,
          connectionId: "meta_ads_metadata",
          destinationSchema: "airbyte_meta_ads_metadata",
          displayName: "Meta metadata",
          provider: "meta_ads",
          selectedStreams: ["ads", "ad_creatives"],
          sourceConfigSecret: "META_ADS_SOURCE_CONFIG_JSON",
          stateSecret: "META_ADS_SOURCE_STATE_JSON",
          streamGroup: "metadata",
          streamName: "ads",
        },
      ],
    });
    const [connectionConfig] = config.connections;
    if (!connectionConfig) {
      throw new Error("Expected test connection config");
    }

    const connection = await syncConnectionDefinitionFromConfig(
      connectionConfig,
      { account_ids: ["act_123"], access_token: "secret" }
    );

    expect(connection).toMatchObject({
      airbyteSchema: "airbyte_meta_ads_metadata",
      catalogConfigRef: "ads-sync.config.ts#meta_ads_metadata.catalog",
      connectionId: "meta_ads_metadata",
      displayName: "Meta metadata",
      provider: "meta_ads",
      selectedStreams: ["ads", "ad_creatives"],
      sourceConfigRef: "META_ADS_SOURCE_CONFIG_JSON",
      stateConfigRef: "META_ADS_SOURCE_STATE_JSON",
      streamGroup: "metadata",
      streamName: "ads",
    });
    expect(connection.catalogConfigRef).not.toContain("CONFIGURED_CATALOG");
  });

  it("filters configured catalogs by selected stream ids", () => {
    const filtered = configuredCatalogForSelectedStreams(metaCatalog, [
      "ads",
      "ad_creatives",
    ]);

    expect(
      isRecord(filtered) &&
        Array.isArray(filtered.streams) &&
        filtered.streams.map((stream) =>
          isRecord(stream) && isRecord(stream.stream)
            ? stream.stream.name
            : null
        )
    ).toStrictEqual(["ads", "ad_creatives"]);
  });

  it("rejects selected streams that are not in the catalog", () => {
    expect(() =>
      configuredCatalogForSelectedStreams(metaCatalog, ["missing_stream"])
    ).toThrow(/missing_stream/u);
  });

  it("does not derive empty Meta insights for metadata-only catalogs", () => {
    const metadataCatalog = configuredCatalogForSelectedStreams(metaCatalog, [
      "ads",
      "ad_creatives",
      "images",
      "videos",
    ]);
    const sourceConfig = sourceConfigForReporting(
      "meta_ads",
      { custom_insights: [] },
      metadataCatalog
    );

    expect(
      isRecord(sourceConfig) && sourceConfig.custom_insights
    ).toStrictEqual([]);
  });
});

describe("supported providers", () => {
  it("exports curated image versions for deployments to assert", () => {
    expect(supportedImageVersions).toStrictEqual({
      destination:
        "airbyte/destination-postgres:3.0.13@sha256:0b310bd46ba0e006757ea3dc1d3b8ef8e3bcf51c3a96f5460a836653b5ac4f4c",
      google_ads:
        "airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed",
      meta_ads:
        "airbyte/source-facebook-marketing:5.2.11@sha256:4d6c916b29862ded4b5b94feea0b8ef75899f34c364e4884312e50414b6d447c",
    });
    expect(supportedProviderDefinitions.meta_ads.rateLimitPolicy).toMatchObject(
      {
        cooldownSeconds: 60 * 60,
        stopOnCode: 17,
      }
    );
  });

  it("keeps custom provider definitions explicit", () => {
    expect(
      defineProvider({
        backfillPolicy: { maxWindowsPerRun: 1, windowStepDays: 1 },
        defaultAirbyteSchema: "airbyte_custom",
        displayName: "Custom",
        id: "custom_ads",
        rateLimitPolicy: {},
        reportingViews: [],
        sourceImage: "example/custom:1",
      })
    ).toMatchObject({ sourceImage: "example/custom:1" });
  });
});

describe(backfillWindowDispatchAction, () => {
  it("starts pending, failed, and orphan queued windows", () => {
    expect(backfillWindowDispatchAction({ status: "pending" })).toBe("start");
    expect(backfillWindowDispatchAction({ status: "failed" })).toBe("start");
    expect(backfillWindowDispatchAction({ status: "queued" })).toBe("start");
  });

  it("waits for queued or running windows that already have a run", () => {
    expect(
      backfillWindowDispatchAction({ runId: "run-1", status: "queued" })
    ).toBe("wait");
    expect(
      backfillWindowDispatchAction({ runId: "run-1", status: "running" })
    ).toBe("wait");
  });
});

describe(validateCatalogForReporting, () => {
  it("accepts the checked-in Meta campaign catalog", () => {
    expect(validateCatalogForReporting("meta_ads", metaCatalog)).toStrictEqual(
      []
    );
  });

  it("reports missing reporting fields", () => {
    expect(
      validateCatalogForReporting("google_ads", {
        streams: [
          {
            stream: {
              json_schema: {
                properties: { segments_date: { type: "string" } },
              },
              name: "campaign_daily_performance",
            },
          },
        ],
      })
    ).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "campaign_id",
          type: "missing_required_field",
        }),
      ])
    );
  });

  it("allows selected-stream catalogs that omit schema properties", () => {
    expect(
      validateCatalogForReporting("google_ads", {
        streams: [
          {
            stream: {
              name: "campaign_daily_performance",
            },
          },
        ],
      })
    ).toStrictEqual([]);
  });

  it("requires ad-level Meta ranking fields used by reporting views", () => {
    const adStream = structuredClone(metaCatalog.streams[2]);
    if (adStream?.stream.json_schema.properties) {
      delete adStream.stream.json_schema.properties.quality_ranking;
      delete adStream.stream.json_schema.properties.engagement_rate_ranking;
      delete adStream.stream.json_schema.properties.conversion_rate_ranking;
    }

    expect(
      validateCatalogForReporting("meta_ads", {
        streams: [metaCatalog.streams[0], metaCatalog.streams[1], adStream],
      })
    ).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "quality_ranking",
          streamName: "customad_daily_performance",
          type: "missing_required_field",
        }),
        expect.objectContaining({
          field: "engagement_rate_ranking",
          streamName: "customad_daily_performance",
          type: "missing_required_field",
        }),
        expect.objectContaining({
          field: "conversion_rate_ranking",
          streamName: "customad_daily_performance",
          type: "missing_required_field",
        }),
      ])
    );
  });

  it("requires Meta creative context streams used by reporting views", () => {
    const adsStream = structuredClone(metaCatalog.streams[3]);
    const creativesStream = structuredClone(metaCatalog.streams[4]);
    if (adsStream?.stream.json_schema.properties) {
      delete adsStream.stream.json_schema.properties.id;
      delete adsStream.stream.json_schema.properties.creative;
    }
    if (creativesStream?.stream.json_schema.properties) {
      delete creativesStream.stream.json_schema.properties.thumbnail_url;
    }

    expect(
      validateCatalogForReporting("meta_ads", {
        streams: [
          metaCatalog.streams[0],
          metaCatalog.streams[1],
          metaCatalog.streams[2],
          adsStream,
          creativesStream,
          metaCatalog.streams[5],
          metaCatalog.streams[6],
        ],
      })
    ).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "id",
          streamName: "ads",
          type: "missing_required_field",
        }),
        expect.objectContaining({
          field: "creative",
          streamName: "ads",
          type: "missing_required_field",
        }),
        expect.objectContaining({
          field: "thumbnail_url",
          streamName: "ad_creatives",
          type: "missing_required_field",
        }),
      ])
    );
  });

  it("validates top-level Meta context identity field types", () => {
    const adsStream = structuredClone(metaCatalog.streams[3]);
    if (adsStream?.stream.json_schema.properties?.id) {
      adsStream.stream.json_schema.properties.id = { type: ["object", "null"] };
    }

    expect(
      validateCatalogForReporting("meta_ads", {
        streams: [
          metaCatalog.streams[0],
          metaCatalog.streams[1],
          metaCatalog.streams[2],
          adsStream,
          metaCatalog.streams[4],
          metaCatalog.streams[5],
          metaCatalog.streams[6],
        ],
      })
    ).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "id",
          streamName: "ads",
          type: "type_change",
        }),
      ])
    );
  });

  it("accepts supported Meta creative id and optional media enrichment shapes", () => {
    const adsStream = structuredClone(metaCatalog.streams[3]);
    const imagesStream = structuredClone(metaCatalog.streams[5]);
    const videosStream = structuredClone(metaCatalog.streams[6]);
    if (adsStream?.stream.json_schema.properties) {
      const properties = adsStream.stream.json_schema.properties as Record<
        string,
        unknown
      >;
      delete properties.creative;
      properties.creative_id = {
        type: ["string", "null"],
      };
    }
    if (imagesStream?.stream.json_schema.properties) {
      delete imagesStream.stream.json_schema.properties.url;
    }
    if (videosStream?.stream.json_schema.properties) {
      delete videosStream.stream.json_schema.properties.picture;
    }

    expect(
      validateCatalogForReporting("meta_ads", {
        streams: [
          metaCatalog.streams[0],
          metaCatalog.streams[1],
          metaCatalog.streams[2],
          adsStream,
          metaCatalog.streams[4],
          imagesStream,
          videosStream,
        ],
      })
    ).toStrictEqual([]);
  });

  it("accepts dotted Airbyte field names for destination-normalized reporting fields", () => {
    expect(
      validateCatalogForReporting("google_ads", {
        streams: [
          {
            stream: {
              json_schema: {
                properties: {
                  "campaign.id": { type: ["integer", "null"] },
                  "campaign.name": { type: ["string", "null"] },
                  "campaign.status": { type: ["string", "null"] },
                  "customer.id": { type: ["integer", "null"] },
                  "metrics.clicks": { type: ["integer", "null"] },
                  "metrics.conversions": { type: ["number", "null"] },
                  "metrics.conversions_value": { type: ["number", "null"] },
                  "metrics.costMicros": { type: ["integer", "null"] },
                  "metrics.impressions": { type: ["integer", "null"] },
                  "segments.date": { type: ["string", "null"] },
                },
              },
              name: "campaign_daily_performance",
            },
          },
        ],
      })
    ).toStrictEqual([]);
  });
});

describe(normalizeCampaignDailyRecord, () => {
  it("normalizes Google cost micros into spend", () => {
    expect(
      normalizeCampaignDailyRecord("google_ads", {
        _airbyte_generation_id: "1",
        _airbyte_raw_id: "raw",
        campaign_id: "10",
        campaign_name: "Search",
        campaign_status: "ENABLED",
        customer_currency_code: "USD",
        customer_id: "123",
        metrics_clicks: "5",
        metrics_conversions: "2",
        metrics_conversions_value: "20",
        metrics_cost_micros: "1500000",
        metrics_impressions: "50",
        segments_date: "2026-05-10",
      })
    ).toMatchObject({
      account_id: "123",
      campaign_id: "10",
      clicks: 5,
      conversions: 2,
      conversions_value: 20,
      currency_code: "USD",
      date_day: "2026-05-10",
      impressions: 50,
      platform: "google_ads",
      spend: 1.5,
    });
  });

  it("normalizes Meta action arrays into conversions", () => {
    expect(
      normalizeCampaignDailyRecord("meta_ads", {
        _airbyte_generation_id: "2",
        _airbyte_raw_id: "raw",
        account_currency: "USD",
        account_id: "act_123",
        action_values: [
          { action_type: "purchase", value: "40.5" },
          { action_type: "link_click", value: "99" },
        ],
        actions: [
          { action_type: "lead", value: "3" },
          { action_type: "link_click", value: "10" },
        ],
        campaign_id: "99",
        campaign_name: "Prospecting",
        clicks: "12",
        date_start: "2026-05-10",
        impressions: "1200",
        spend: "7.25",
      })
    ).toMatchObject({
      account_id: "act_123",
      campaign_id: "99",
      clicks: 12,
      conversions: 3,
      conversions_value: 40.5,
      currency_code: "USD",
      date_day: "2026-05-10",
      impressions: 1200,
      platform: "meta_ads",
      spend: 7.25,
    });
  });

  it("handles scalar Meta action fields from Direct Load without throwing", () => {
    expect(
      normalizeCampaignDailyRecord("meta_ads", {
        actions: { action_type: "lead", value: "3" },
        campaign_id: "99",
        date_start: "2026-05-10",
      })
    ).toMatchObject({
      campaign_id: "99",
      conversions: 0,
      conversions_value: 0,
      date_day: "2026-05-10",
      platform: "meta_ads",
    });
  });
});

describe("Meta configured catalog", () => {
  it("matches the stream emitted by the Airbyte Facebook Marketing connector", () => {
    expect(providerDefinitions.meta_ads.streamName).toBe(
      "customcampaign_daily_performance"
    );
    expect(metaCatalog.streams[0]?.stream.name).toBe(
      "customcampaign_daily_performance"
    );
    expect(metaCatalog.streams[0]?.stream).not.toHaveProperty("namespace");
    expect(metaCatalog.streams[0]?.primary_key).toStrictEqual([
      ["date_start"],
      ["account_id"],
      ["campaign_id"],
    ]);
    expect(
      metaCatalog.streams[0]?.stream.json_schema.properties
    ).not.toHaveProperty("campaign_status");
    expect(metaCatalog.streams.map(({ stream }) => stream.name)).toStrictEqual([
      "customcampaign_daily_performance",
      "customadset_daily_performance",
      "customad_daily_performance",
      "ads",
      "ad_creatives",
      "images",
      "videos",
    ]);
    expect(metaCatalog.streams[1]?.primary_key).toStrictEqual([
      ["date_start"],
      ["account_id"],
      ["adset_id"],
    ]);
    expect(metaCatalog.streams[2]?.primary_key).toStrictEqual([
      ["date_start"],
      ["account_id"],
      ["ad_id"],
    ]);
  });
});

describe(sourceConfigForReporting, () => {
  it("bounds Google Ads source config for backfill windows", () => {
    const sourceConfig = {
      custom_queries_array: [
        {
          query:
            "SELECT segments.date, campaign.id, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS",
          table_name: "campaign_daily_performance",
        },
      ],
      credentials_json: "secret-json",
      customer_id: "1234567890",
      end_date: "2026-05-31",
      start_date: "2026-05-01",
    };

    const derived = sourceConfigForReporting(
      "google_ads",
      sourceConfig,
      {},
      {
        endDate: "2026-04-08T00:00:00.000Z",
        startDate: "2026-04-01T00:00:00.000Z",
      }
    );

    expect(derived).toStrictEqual({
      credentials_json: "secret-json",
      customer_id: "1234567890",
      custom_queries_array: [
        {
          query:
            "SELECT segments.date, campaign.id, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2026-04-01' AND '2026-04-07'",
          table_name: "campaign_daily_performance",
        },
      ],
      end_date: "2026-04-07",
      start_date: "2026-04-01",
    });
    expect(derived).toMatchObject({
      end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
    });
  });

  it("converts adjacent exclusive backfill windows into non-overlapping provider dates", () => {
    const firstWindow = sourceConfigForReporting(
      "google_ads",
      { customer_id: "1234567890" },
      {},
      {
        endDate: "2026-04-08T00:00:00.000Z",
        startDate: "2026-04-01T00:00:00.000Z",
      }
    );
    const secondWindow = sourceConfigForReporting(
      "google_ads",
      { customer_id: "1234567890" },
      {},
      {
        endDate: "2026-04-15T00:00:00.000Z",
        startDate: "2026-04-08T00:00:00.000Z",
      }
    );

    expect(firstWindow).toMatchObject({
      end_date: "2026-04-07",
      start_date: "2026-04-01",
    });
    expect(secondWindow).toMatchObject({
      end_date: "2026-04-14",
      start_date: "2026-04-08",
    });
  });

  it("derives Meta custom insights from the configured catalog without changing credentials", () => {
    const sourceConfig = {
      access_token: "secret-token",
      account_ids: ["act_123"],
      custom_insights: [
        {
          action_breakdowns: ["action_type"],
          breakdowns: ["age"],
          fields: ["account_id"],
          level: "campaign",
          name: "campaign_daily_performance",
          start_date: "2026-05-01T00:00:00Z",
          time_increment: 7,
        },
      ],
      start_date: "2026-05-01T00:00:00Z",
    };

    const derived = sourceConfigForReporting(
      "meta_ads",
      sourceConfig,
      metaCatalog,
      {
        endDate: "2026-04-08T00:00:00Z",
        startDate: "2026-04-01T00:00:00Z",
      }
    );

    expect(derived).toMatchObject({
      access_token: "secret-token",
      account_ids: ["act_123"],
      start_date: "2026-04-01T00:00:00Z",
    });
    expect(isRecord(derived)).toBeTruthy();
    if (!isRecord(derived) || !Array.isArray(derived.custom_insights)) {
      throw new Error("Expected derived custom insights");
    }
    expect(derived.start_date).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u
    );
    for (const insight of derived.custom_insights) {
      if (!isRecord(insight)) {
        throw new Error("Expected derived custom insight config");
      }
      expect(insight.start_date).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u
      );
      expect(insight.end_date).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u
      );
    }
    expect(
      derived.custom_insights.map((insight) =>
        isRecord(insight) ? insight.name : null
      )
    ).toStrictEqual([
      "campaign_daily_performance",
      "adset_daily_performance",
      "ad_daily_performance",
    ]);
    const [campaignInsight] = derived.custom_insights;
    expect(campaignInsight).toMatchObject({
      action_breakdowns: [],
      breakdowns: [],
      end_date: "2026-04-07T00:00:00Z",
      time_increment: 1,
    });
    expect(
      isRecord(campaignInsight) && Array.isArray(campaignInsight.fields)
        ? campaignInsight.fields
        : []
    ).not.toContain("campaign_status");
    expect(
      isRecord(campaignInsight) && Array.isArray(campaignInsight.fields)
        ? campaignInsight.fields
        : []
    ).not.toContain("unique_clicks");
    expect(
      isRecord(campaignInsight) && Array.isArray(campaignInsight.fields)
        ? campaignInsight.fields
        : []
    ).not.toContain("unique_ctr");
    const [adInsight] = derived.custom_insights.slice(2);
    expect(isRecord(adInsight) ? adInsight.fields : []).toContain(
      "video_continuous_2_sec_watched_actions"
    );
  });

  it("removes blank Meta insight end dates when no window end is supplied", () => {
    const derived = sourceConfigForReporting(
      "meta_ads",
      {
        custom_insights: [
          {
            end_date: "",
            level: "campaign",
            name: "campaign_daily_performance",
          },
          {
            end_date: "",
            level: "adset",
            name: "adset_daily_performance",
          },
          {
            end_date: "",
            level: "ad",
            name: "ad_daily_performance",
          },
        ],
        start_date: "2026-05-01T00:00:00Z",
      },
      metaCatalog
    );

    expect(isRecord(derived)).toBeTruthy();
    if (!isRecord(derived) || !Array.isArray(derived.custom_insights)) {
      throw new Error("Expected derived custom insights");
    }
    expect(derived.custom_insights).toHaveLength(3);
    for (const insight of derived.custom_insights) {
      expect(insight).not.toHaveProperty("end_date");
    }
  });

  it("normalizes a stored date-only Meta start date to ISO seconds", () => {
    const derived = sourceConfigForReporting(
      "meta_ads",
      {
        custom_insights: [],
        start_date: "2026-05-01",
      },
      metaCatalog
    );

    expect(derived).toMatchObject({
      start_date: "2026-05-01T00:00:00Z",
    });
    expect(isRecord(derived)).toBeTruthy();
    if (!isRecord(derived) || !Array.isArray(derived.custom_insights)) {
      throw new Error("Expected derived custom insights");
    }
    for (const insight of derived.custom_insights) {
      expect(insight).toMatchObject({
        start_date: "2026-05-01T00:00:00Z",
      });
    }
  });
});

describe(reportingViewSql, () => {
  it("uses the bootstrap-owned reporting schema without database CREATE", () => {
    expect(reportingViewSql).not.toContain("CREATE SCHEMA");
    expect(reportingViewSql).toContain(
      "CREATE OR REPLACE VIEW ads_sync_reporting.ads_campaign_daily"
    );
  });

  it("preflights required campaign tables before dropping/recreating views", () => {
    expect(requiredReportingViewTables).toStrictEqual([]);
    expect(reportingViewSql).toContain(
      "to_regclass('airbyte_google_ads.campaign_daily_performance')"
    );
    expect(reportingViewSql).toContain(
      "to_regclass('airbyte_meta_ads.customcampaign_daily_performance')"
    );
    expect(reportingViewSql).toContain("SELECT NULL::jsonb AS row WHERE false");
  });

  it("defines the stable ads_campaign_daily row shape for both platforms", () => {
    for (const column of [
      "platform",
      "account_id",
      "account_name",
      "date_day",
      "campaign_id",
      "campaign_name",
      "campaign_status",
      "impressions",
      "clicks",
      "spend",
      "conversions",
      "conversions_value",
      "currency_code",
      "source_table",
      "source_generation_id",
      "extracted_at",
      "raw_record_id",
    ]) {
      expect(reportingViewSql).toContain(` AS ${column}`);
    }

    expect(reportingViewSql).toContain(
      "FROM airbyte_google_ads.campaign_daily_performance AS g"
    );
    expect(reportingViewSql).toContain(
      "FROM airbyte_meta_ads.customcampaign_daily_performance AS m"
    );
    expect(reportingViewSql).toContain(
      "PARTITION BY account_id, date_day, campaign_id"
    );
    expect(reportingViewSql).toContain("WHERE row_rank = 1");
    expect(reportingViewSql).toContain("jsonb_typeof(actions) = 'array'");
    expect(reportingViewSql).toContain(
      "CREATE OR REPLACE VIEW ads_sync_reporting.ads_group_daily"
    );
    expect(reportingViewSql).toContain(
      "CREATE OR REPLACE VIEW ads_sync_reporting.ads_ad_daily"
    );
    expect(reportingViewSql).toContain(
      "DROP VIEW IF EXISTS ads_sync_reporting.ads_ad_daily"
    );
    expect(reportingViewSql).toContain(
      "DROP VIEW IF EXISTS ads_sync_reporting.meta_ad_creative_context"
    );
    expect(reportingViewSql).toContain(
      "FROM airbyte_meta_ads.customadset_daily_performance AS m"
    );
    expect(reportingViewSql).toContain(
      "FROM airbyte_meta_ads.customad_daily_performance AS m"
    );
    expect(reportingViewSql).toContain("AS hook_rate");
    expect(reportingViewSql).toContain(
      "airbyte_action_total(row -> 'video_continuous_2_sec_watched_actions') AS video_2_sec_views"
    );
    expect(reportingViewSql).toContain("AS inline_link_clicks");
    expect(reportingViewSql).toContain("AS cost_per_inline_link_click");
    expect(reportingViewSql).toContain("AS outbound_clicks");
    expect(reportingViewSql).toContain("AS website_purchase_roas");
  });

  it("defines Meta creative context beside ads_ad_daily", () => {
    expect(reportingViewSql).toContain(
      "CREATE OR REPLACE VIEW ads_sync_reporting.meta_ad_creative_context"
    );
    expect(reportingViewSql).toContain(
      "to_regclass('airbyte_meta_ads_metadata.ads')"
    );
    expect(reportingViewSql).toContain(
      "FROM airbyte_meta_ads_metadata.ads AS a"
    );
    expect(reportingViewSql).toContain(
      "FROM airbyte_meta_ads_metadata.ad_creatives AS c"
    );
    expect(reportingViewSql).toContain(
      "to_regclass('airbyte_meta_ads_metadata.images')"
    );
    expect(reportingViewSql).toContain(
      "to_regclass('airbyte_meta_ads_metadata.videos')"
    );
    expect(reportingViewSql).toContain("'airbyte_meta_ads_metadata.ads'");
    expect(reportingViewSql).toContain(
      "'airbyte_meta_ads_metadata.ad_creatives'"
    );
    expect(reportingViewSql).not.toContain("FROM airbyte_meta_ads.ads AS a");
    expect(reportingViewSql).not.toContain(
      "FROM airbyte_meta_ads.ad_creatives AS c"
    );
    expect(reportingViewSql).toContain("AS creative_thumbnail_url");
    expect(reportingViewSql).toContain("AS post_permalink_url");
    expect(reportingViewSql).toContain("NULL::text AS creative_body");
    expect(reportingViewSql).not.toContain(
      "ads_sync_reporting.ads_ad_daily AS\n      SELECT\n        NULL::text AS platform,\n        NULL::text AS creative_body"
    );
  });
});

describe(controlSchemaSql, () => {
  it("defines backfill plans and idempotent run windows", () => {
    expect(controlSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.scheduler_tick_health"
    );
    expect(controlSchemaSql).toContain(
      "INSERT INTO ads_sync.scheduler_tick_health"
    );
    expect(controlSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.backfill_plans"
    );
    expect(controlSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.sync_run_windows"
    );
    expect(controlSchemaSql).toContain("sync_run_windows_plan_window_idx");
    expect(controlSchemaSql).toContain("backfill_plans_active_window_idx");
    expect(controlSchemaSql).toContain("backfill_plan_id text");
    expect(controlSchemaSql).toContain("run_window_id text");
    expect(controlSchemaSql).toContain("stream_group text NOT NULL DEFAULT");
    expect(controlSchemaSql).toContain("SET next_window_start = window_start");
    expect(controlSchemaSql).toContain(
      "ALTER COLUMN next_window_start SET NOT NULL"
    );
    expect(controlSchemaSql).toContain("lease_expires_at timestamptz");
    expect(controlSchemaSql).toContain("backfill_plans_window_order_chk");
    expect(controlSchemaSql).toContain("backfill_plans_window_step_days_chk");
    expect(controlSchemaSql).toContain(
      "backfill_plans_max_windows_per_run_chk"
    );
    expect(controlSchemaSql).toContain("sync_run_windows_window_order_chk");
  });

  it("persists state secret references on sync connections", () => {
    expect(controlSchemaSql).toContain("state_config_ref text");
    expect(controlSchemaSql).toContain(
      "ADD COLUMN IF NOT EXISTS state_config_ref text"
    );
  });

  it("defines database-owned lifecycle authority and append-only audit", () => {
    expect(controlSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.instance_lifecycle"
    );
    expect(controlSchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ads_sync.lifecycle_transitions"
    );
    expect(controlSchemaSql).toContain(
      "CONSTRAINT instance_lifecycle_singleton_chk CHECK (id = 'instance')"
    );
    expect(controlSchemaSql).toContain(
      "BEFORE UPDATE OR DELETE ON ads_sync.lifecycle_transitions"
    );
    expect(controlSchemaSql).toContain("lifecycle_transitions_single_init_idx");
    expect(controlSchemaSql).toContain(
      "Ads Sync lifecycle transitions are append-only"
    );
    expect(controlSchemaSql).toContain(
      "ads_sync.lifecycle_evidence_is_valid(evidence)"
    );
    expect(controlSchemaSql).toContain(
      "ads_sync.lifecycle_waivers_are_valid(waivers)"
    );
  });

  it("records non-secret Workflow dispatch outcomes per connection", () => {
    expect(controlSchemaSql).toContain(
      "last_dispatch_succeeded_at timestamptz"
    );
    expect(controlSchemaSql).toContain("last_dispatch_failed_at timestamptz");
  });

  it("enforces current connection uniqueness without mutating existing rows", () => {
    expect(controlSchemaSql).toContain("sync_connections_enabled_schema_idx");
    expect(controlSchemaSql).toContain(
      "sync_connections_enabled_reporting_provider_idx"
    );
    expect(controlSchemaSql).not.toContain("enabled_schema_duplicates");
    expect(controlSchemaSql).not.toContain("enabled_reporting_duplicates");
  });
});

describe(controlSchemaCatalogSnapshotSql, () => {
  it("fingerprints definitions, validity, ownership, and privilege boundaries", () => {
    expect(controlSchemaCatalogSnapshotSql).toContain("pg_get_constraintdef");
    expect(controlSchemaCatalogSnapshotSql).toContain("convalidated");
    expect(controlSchemaCatalogSnapshotSql).toContain("pg_get_indexdef");
    expect(controlSchemaCatalogSnapshotSql).toContain("indisvalid");
    expect(controlSchemaCatalogSnapshotSql).toContain("format_type");
    expect(controlSchemaCatalogSnapshotSql).toContain("pg_get_functiondef");
    expect(controlSchemaCatalogSnapshotSql).toContain("pg_default_acl");
  });
});

describe(progressEventPayload, () => {
  it("adds emittedAt to progress events before fanout", () => {
    expect(
      progressEventPayload(
        { event: "stream_succeeded", runId: "run-1" },
        "2026-05-12T00:00:00.000Z"
      )
    ).toStrictEqual({
      emittedAt: "2026-05-12T00:00:00.000Z",
      event: "stream_succeeded",
      runId: "run-1",
    });
  });
});
