import { describe, expect, it } from "vitest";

import {
  GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_DIMENSIONS,
  GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM,
  googleSearchConsoleProvider,
} from "./google-search-console.js";
import { catalogDriftIssues } from "./provider-contract.js";
import { sourceConfigForReporting } from "./providers.js";
import { reportingViewSql } from "./sql.js";

const exampleSourceConfig = {
  authorization: {
    auth_type: "Client",
    client_id: "example-client-id",
    client_secret: "example-client-secret",
    refresh_token: "example-refresh-token",
  },
  custom_reports_array: [
    {
      dimensions: [...GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_DIMENSIONS],
      name: GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM,
    },
  ],
  data_state: "final",
  site_urls: ["https://example.org/"],
  start_date: "2026-01-01",
};

const exampleCatalog = {
  streams: [
    {
      stream: {
        json_schema: {
          properties: {
            clicks: { type: ["null", "integer"] },
            ctr: { type: ["null", "number"] },
            date: { format: "date", type: ["null", "string"] },
            impressions: { type: ["null", "integer"] },
            page: { type: ["null", "string"] },
            position: { type: ["null", "number"] },
            query: { type: ["null", "string"] },
            search_type: { type: ["null", "string"] },
            site_url: { type: ["null", "string"] },
          },
        },
        name: GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_STREAM,
      },
    },
  ],
};

describe("google search console provider", () => {
  it("syncs the query+page custom report stream", () => {
    expect(googleSearchConsoleProvider.streamName).toBe(
      "search_analytics_query_page"
    );
    expect(GOOGLE_SEARCH_CONSOLE_QUERY_PAGE_DIMENSIONS).toStrictEqual([
      "query",
      "page",
    ]);
    const requiredFields =
      googleSearchConsoleProvider.reportingStreamRequirements.flatMap(
        (requirement) => requirement.fields.map(({ field }) => field)
      );
    expect(requiredFields).toContain("query");
    expect(requiredFields).toContain("page");
    expect(requiredFields).toContain("search_type");
  });

  it("uses a daily schedule and monthly backfill windows", () => {
    expect(googleSearchConsoleProvider.defaultScheduleEveryMinutes).toBe(
      24 * 60
    );
    expect(googleSearchConsoleProvider.backfillPolicy).toStrictEqual({
      maxWindowsPerRun: 4,
      windowStepDays: 30,
    });
  });

  it("derives identity and account id from site_urls without secrets", () => {
    expect(
      googleSearchConsoleProvider.sourceIdentity(exampleSourceConfig)
    ).toStrictEqual({ site_urls: ["https://example.org/"] });
    expect(
      googleSearchConsoleProvider.sourceAccountId(exampleSourceConfig)
    ).toBe("https://example.org/");
    expect(googleSearchConsoleProvider.sourceIdentity(null)).toStrictEqual({});
    expect(googleSearchConsoleProvider.sourceAccountId(null)).toBeNull();
  });

  it("rewrites the reporting window onto start_date and end_date", () => {
    const rewritten = sourceConfigForReporting(
      "google_search_console",
      exampleSourceConfig,
      exampleCatalog,
      { endDate: "2026-03-01", startDate: "2026-02-01" }
    );
    expect(rewritten).toMatchObject({
      end_date: "2026-02-28",
      start_date: "2026-02-01",
    });
  });

  it("keeps the source config when no window override is given", () => {
    const rewritten = sourceConfigForReporting(
      "google_search_console",
      exampleSourceConfig,
      exampleCatalog,
      {}
    );
    expect(rewritten).toMatchObject({ start_date: "2026-01-01" });
    expect(rewritten).not.toHaveProperty("end_date");
  });

  it("accepts the query+page catalog and flags drift", () => {
    expect(
      catalogDriftIssues(
        googleSearchConsoleProvider.reportingStreamRequirements,
        exampleCatalog
      )
    ).toStrictEqual([]);
    expect(
      catalogDriftIssues(
        googleSearchConsoleProvider.reportingStreamRequirements,
        { streams: [] }
      )
    ).toHaveLength(1);
  });

  it("normalizes an organic row without paid-campaign fields", () => {
    const normalized = googleSearchConsoleProvider.normalizeCampaignDailyRecord(
      {
        _airbyte_generation_id: "7",
        _airbyte_raw_id: "raw-1",
        clicks: "12",
        date: "2026-02-01",
        impressions: "340",
        site_url: "https://example.org/",
      }
    );
    expect(normalized).toMatchObject({
      account_id: "https://example.org/",
      campaign_id: null,
      clicks: 12,
      currency_code: null,
      date_day: "2026-02-01",
      impressions: 340,
      platform: "google_search_console",
      source_table: "airbyte_google_search_console.search_analytics_query_page",
      spend: null,
    });
  });

  it("creates the query+page reporting view with an empty fallback", () => {
    expect(googleSearchConsoleProvider.reportingViews).toStrictEqual([
      "ads_sync_reporting.gsc_query_page_daily",
    ]);
    expect(reportingViewSql).toContain(
      "ads_sync_reporting.gsc_query_page_daily"
    );
    expect(reportingViewSql).toContain(
      "airbyte_google_search_console.search_analytics_query_page"
    );
    expect(reportingViewSql).toContain(
      "DROP VIEW IF EXISTS ads_sync_reporting.gsc_query_page_daily;"
    );
  });
});
