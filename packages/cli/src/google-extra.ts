import { readFileSync, writeFileSync } from "node:fs";

import { runComplianceChecks } from "@patronage/google-ads/compliance";
import type { ComplianceCheckName } from "@patronage/google-ads/compliance";
import { decodePartialFailureError } from "@patronage/google-ads/partial-failure";
import {
  getAdGroupPerformance,
  getCampaignPerformance,
  getDevicePerformance,
  getVideoPerformance,
} from "@patronage/google-ads/reports";
import {
  getAdGroupThemes,
  getKeywordForecastMetrics,
  getKeywordHistoricalMetrics,
  getKeywordIdeas,
} from "@patronage/google-ads/research";
import { resolveCampaign } from "@patronage/google-ads/resolvers";
import {
  addAdGroups,
  buildAddAdGroupOperations,
} from "@patronage/google-ads/workflows/add-ad-groups";
import type { Command } from "commander";
import { z } from "zod";

import { resolveCliConfig } from "./config.js";
import {
  createLocalGoogleAdsClient,
  readLocalGoogleAdsEnvironment,
} from "./google-client.js";
import { mintGoogleRefreshToken } from "./google-oauth.js";
import { runCliMutationHarness } from "./mutation-harness.js";

type CliOptions = Record<string, boolean | string | undefined>;

const dateOptions = (command: Command) =>
  command
    .option("-d, --days <number>", "Lookback days", "30")
    .option("--since <date>", "Start date")
    .option("--until <date>", "End date");
const reportOptions = (command: Command) =>
  dateOptions(
    command
      .requiredOption("--customer-id <id>", "Google Ads customer ID")
      .option("--campaign <name-or-id>", "Campaign name or ID")
      .option("--json", "JSON output", false)
      .option("--format <type>", "table, json, or csv", "table")
      .option("-o, --output <path>", "Write output file")
  );

export interface AddAdGroupsCliInput {
  adGroups: {
    ads: {
      descriptions: string[];
      finalUrl: string;
      headlines: string[];
      path1?: string;
      path2?: string;
    }[];
    cpcBidMicros?: number;
    keywords: { matchType: "BROAD" | "EXACT" | "PHRASE"; text: string }[];
    name: string;
  }[];
  customerId: string;
  parentCampaignResourceName: string;
  status?: "ENABLED" | "PAUSED";
}

const addAdGroupsInputSchema: z.ZodType<AddAdGroupsCliInput> = z.object({
  adGroups: z.array(
    z.object({
      ads: z.array(
        z.object({
          descriptions: z.array(z.string()),
          finalUrl: z.url(),
          headlines: z.array(z.string()),
          path1: z.string().optional(),
          path2: z.string().optional(),
        })
      ),
      cpcBidMicros: z.number().int().positive().optional(),
      keywords: z.array(
        z.object({
          matchType: z.enum(["BROAD", "EXACT", "PHRASE"]),
          text: z.string(),
        })
      ),
      name: z.string(),
    })
  ),
  customerId: z.string(),
  parentCampaignResourceName: z.string(),
  status: z.enum(["ENABLED", "PAUSED"]).optional(),
});
const forecastKeywordSchema = z.object({
  matchType: z.enum(["BROAD", "EXACT", "PHRASE"]).optional(),
  maxCpcDollars: z.number().nonnegative().optional(),
  text: z.string().min(1),
});
const forecastInputSchema = z.object({
  adGroups: z
    .array(
      z.object({
        keywords: z.array(forecastKeywordSchema).min(1),
        maxCpcDollars: z.number().nonnegative().optional(),
        negativeKeywords: z.array(forecastKeywordSchema).optional(),
      })
    )
    .min(1),
  campaignMaxCpcDollars: z.number().nonnegative().optional(),
  conversionRate: z.number().min(0).max(1).optional(),
  currencyCode: z.string().optional(),
  endDate: z.string().optional(),
  language: z.string().optional(),
  location: z.string().optional(),
  negativeKeywords: z.array(forecastKeywordSchema).optional(),
  startDate: z.string().optional(),
});

export function addGoogleExtraCommands(google: Command): void {
  const performance = google
    .command("performance")
    .description("Expanded Google Ads performance reports");
  reportOptions(
    performance.command("campaigns").description("Campaign performance")
  )
    .option("--compare", "Include previous-period comparison", false)
    .option("--ad-groups", "Report ad groups", false)
    .option("--device-breakdown", "Segment by device", false)
    .option("--video-only", "Limit device report to video campaigns", false)
    .action(runPerformance);
  reportOptions(
    performance.command("video").description("YouTube/video performance")
  ).action((options) => runSimpleReport(options, getVideoPerformance));

  const research = google
    .command("research")
    .description("Keyword planning research");
  research
    .command("ideas")
    .requiredOption("--customer-id <id>")
    .option("-k, --keywords <list>")
    .option("-u, --url <url>")
    .option("-l, --location <value>", "Geo name or ID", "United States")
    .option("--language <value>", "Language code or ID", "en")
    .option("--limit <number>", "Maximum ideas", "100")
    .option("--json", "JSON output", false)
    .option("--format <type>", "table, json, or csv", "table")
    .option("-o, --output <path>")
    .action(async (options) =>
      output(
        await getKeywordIdeas(createLocalGoogleAdsClient(), {
          customerId: options.customerId,
          keywords: list(options.keywords),
          language: options.language,
          limit: positive(options.limit),
          location: options.location,
          url: options.url,
        }),
        options
      )
    );
  research
    .command("volume")
    .requiredOption("--customer-id <id>")
    .option("-k, --keywords <list>")
    .option("-f, --file <path>")
    .option("-l, --location <value>", "Geo name or ID", "United States")
    .option("--language <value>", "Language code or ID", "en")
    .option("--json", "JSON output", false)
    .option("--format <type>", "table, json, or csv", "table")
    .option("-o, --output <path>")
    .action(async (options) =>
      output(
        await getKeywordHistoricalMetrics(createLocalGoogleAdsClient(), {
          customerId: options.customerId,
          keywords: [...list(options.keywords), ...fileLines(options.file)],
          language: options.language,
          location: options.location,
        }),
        options
      )
    );
  research
    .command("themes")
    .requiredOption("--customer-id <id>")
    .requiredOption("--keywords <list>")
    .requiredOption("--ad-groups <list>")
    .option("--json", "JSON output", false)
    .option("-o, --output <path>")
    .action(async (options) =>
      output(
        await getAdGroupThemes(createLocalGoogleAdsClient(), {
          adGroups: list(options.adGroups),
          customerId: options.customerId,
          keywords: list(options.keywords),
        }),
        options
      )
    );
  research
    .command("forecast")
    .requiredOption("--customer-id <id>")
    .requiredOption("--input <path>", "Forecast request JSON")
    .option("--json", "JSON output", false)
    .option("-o, --output <path>")
    .action(async (options) =>
      output(
        await getKeywordForecastMetrics(createLocalGoogleAdsClient(), {
          customerId: options.customerId,
          ...forecastInputSchema.parse(
            JSON.parse(readFileSync(options.input, "utf-8"))
          ),
        }),
        options
      )
    );

  google
    .command("compliance")
    .description("Run Google Ad Grant compliance checks")
    .requiredOption("--customer-id <id>")
    .option("--check <names>", "Comma-separated checks")
    .option("--json", "JSON output", false)
    .option("--verbose", "Show details", false)
    .action(async (options) => {
      const results = await runComplianceChecks(createLocalGoogleAdsClient(), {
        checks: list(options.check) as ComplianceCheckName[],
        customerId: options.customerId,
      });
      output(
        options.verbose
          ? results
          : results.map(({ check, message, passed, severity }) => ({
              check,
              message,
              passed,
              severity,
            })),
        options
      );
    });

  google
    .command("account-check")
    .description("Validate credentials and identify an accessible account")
    .requiredOption("--customer-id <id>")
    .option("--json", "JSON output", false)
    .action(async (options) => {
      const result = await createLocalGoogleAdsClient().search({
        customerId: options.customerId,
        query:
          "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
      });
      output(
        { requestId: result.requestId, row: result.rows[0] ?? null },
        options
      );
    });
  google
    .command("auth")
    .description("Mint a Google Ads refresh token using installed-app OAuth")
    .option("--client-id <id>")
    .option("--client-secret <secret>")
    .option("--port <number>", "Loopback callback port", "3000")
    .action(runAuth);

  google
    .command("ad-groups-add")
    .description("Add ad groups, keywords, and RSAs to an existing campaign")
    .requiredOption("-i, --input <path>")
    .option("--execute", "Apply live", false)
    .option("--json", "JSON output", false)
    .option("--run-log-dir <path>")
    .action(async (options) => {
      const input = addAdGroupsInputSchema.parse(
        JSON.parse(readFileSync(options.input, "utf-8"))
      );
      const operations = buildAddAdGroupOperations({
        ...input,
        mode: "validate",
      });
      await runCliMutationHarness({
        command: "google ad-groups-add",
        createClient: createLocalGoogleAdsClient,
        execute: Boolean(options.execute),
        format: options.json ? "json" : undefined,
        input,
        inputFile: options.input,
        logResult: flattenGoogleExtraLog,
        operations,
        provider: "google-ads",
        run: async (client, mode) => {
          const result = await addAdGroups(client, { ...input, mode });
          return {
            ...result,
            decodedPartialFailures: decodePartialFailureError(
              result.partialFailureError
            ),
          };
        },
        runLogDir: resolveCliConfig({ runLogDir: options.runLogDir }).runLogDir,
        validation: "provider",
      });
    });

  google
    .command("undo")
    .description("Invert a reversible prior Google Ads run log")
    .requiredOption("--from <path>", "Run-log JSON")
    .option("--execute", "Apply live", false)
    .option("--json", "JSON output", false)
    .option("--run-log-dir <path>")
    .action(runUndo);
}

export function parseAddAdGroupsInput(value: unknown): AddAdGroupsCliInput {
  return addAdGroupsInputSchema.parse(value);
}

async function runPerformance(options: CliOptions): Promise<void> {
  const client = createLocalGoogleAdsClient();
  const date = dates(options);
  const campaign = options.campaign
    ? await resolveCampaign(client, {
        customerId: String(options.customerId),
        value: String(options.campaign),
      })
    : undefined;
  const campaignId = campaign?.id;
  let rows: unknown[];
  if (options.adGroups) {
    rows = await getAdGroupPerformance(client, {
      campaignId,
      customerId: String(options.customerId),
      ...date,
    });
  } else if (options.deviceBreakdown) {
    rows = await getDevicePerformance(client, {
      campaignId,
      customerId: String(options.customerId),
      videoOnly: options.videoOnly === true,
      ...date,
    });
  } else {
    rows = await getCampaignPerformance(client, {
      campaignId,
      customerId: String(options.customerId),
      ...date,
    });
  }
  if (options.compare) {
    if (options.adGroups || options.deviceBreakdown) {
      throw new Error("--compare currently applies to campaign totals only.");
    }
    const previous = await getCampaignPerformance(client, {
      campaignId,
      customerId: String(options.customerId),
      ...previousDates(date),
    });
    rows = [{ current: totals(rows), previous: totals(previous) }];
  }
  output(rows, options);
}

async function runSimpleReport(
  options: CliOptions,
  fn: typeof getVideoPerformance
): Promise<void> {
  const client = createLocalGoogleAdsClient();
  const campaign = options.campaign
    ? await resolveCampaign(client, {
        customerId: String(options.customerId),
        value: String(options.campaign),
      })
    : undefined;
  const rows = await fn(client, {
    campaignId: campaign?.id,
    customerId: String(options.customerId),
    ...dates(options),
  });
  output(rows, options);
}

async function runAuth(options: {
  clientId?: string;
  clientSecret?: string;
  port?: string;
}): Promise<void> {
  const env = readLocalGoogleAdsEnvironment();
  const clientId = options.clientId ?? env.clientId;
  const clientSecret = options.clientSecret ?? env.clientSecret;
  const tokens = await mintGoogleRefreshToken({
    clientId,
    clientSecret,
    port: positive(options.port ?? "3000"),
  });
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app grant and retry with consent."
    );
  }
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`);
}

async function runUndo(options: CliOptions): Promise<void> {
  const prior = JSON.parse(readFileSync(String(options.from), "utf-8"));
  const operations = buildUndoOperationsFromRunLog(prior);
  const customerId = String(prior.input?.customerId ?? "");
  if (!customerId) {
    throw new Error("Run log has no customerId.");
  }
  await runCliMutationHarness({
    command: "google undo",
    createClient: createLocalGoogleAdsClient,
    execute: Boolean(options.execute),
    format: options.json ? "json" : undefined,
    input: { from: options.from },
    logResult: flattenGoogleExtraLog,
    operations,
    provider: "google-ads",
    run: (client, mode) =>
      client.mutate({
        customerId,
        operations,
        validateOnly: mode !== "execute",
      }),
    runLogDir: resolveCliConfig({
      runLogDir:
        typeof options.runLogDir === "string" ? options.runLogDir : undefined,
    }).runLogDir,
    validation: "provider",
  });
}

function flattenGoogleExtraLog(input: {
  lifecycle: string;
  result: unknown;
}): unknown {
  return {
    lifecycle: input.lifecycle,
    ...(input.result && typeof input.result === "object"
      ? input.result
      : { providerResult: input.result }),
  };
}
export function buildUndoOperationsFromRunLog(prior: unknown): unknown[] {
  const runLog = prior as Record<string, unknown>;
  if (runLog.mode !== "execute") {
    throw new Error("Only an execute-mode run log can be undone.");
  }
  const result = runLog.result as Record<string, unknown> | undefined;
  const planDiff = (result?.planDiff ?? []) as Record<string, unknown>[];
  const priorStatusById = new Map(
    planDiff.map((entry) => [String(entry.id), entry.current])
  );
  const operations = Array.isArray(runLog.operations) ? runLog.operations : [];
  return operations.map((operation) => {
    const value = operation as Record<string, unknown>;
    const wrapper = value.adGroupOperation as
      | Record<string, unknown>
      | undefined;
    const update = wrapper?.update as Record<string, unknown> | undefined;
    const resourceName = String(update?.resourceName ?? "");
    const id = resourceName.split("/").at(-1) ?? "";
    const priorStatus = priorStatusById.get(id);
    if (
      update?.status === "PAUSED" &&
      resourceName &&
      (priorStatus === "ENABLED" || priorStatus === "PAUSED")
    ) {
      return {
        adGroupOperation: {
          update: { resourceName, status: priorStatus },
          updateMask: "status",
        },
      };
    }
    throw new Error(
      "This run contains operations that cannot be safely inverted from the log."
    );
  });
}

function dates(
  options: CliOptions
): { days: number } | { since: string; until: string } {
  if (options.since || options.until) {
    if (!(options.since && options.until)) {
      throw new Error("Both --since and --until are required.");
    }
    return { since: String(options.since), until: String(options.until) };
  }
  return { days: positive(String(options.days ?? "30")) };
}
function previousDates(
  value: { days: number } | { since: string; until: string }
): { since: string; until: string } {
  const until =
    "until" in value
      ? new Date(`${value.until}T00:00:00Z`)
      : new Date(Date.now() - 86_400_000);
  const since =
    "since" in value
      ? new Date(`${value.since}T00:00:00Z`)
      : new Date(until.getTime() - (value.days - 1) * 86_400_000);
  const span = until.getTime() - since.getTime() + 86_400_000;
  const previousUntil = new Date(since.getTime() - 86_400_000);
  const previousSince = new Date(previousUntil.getTime() - span + 86_400_000);
  return {
    since: previousSince.toISOString().slice(0, 10),
    until: previousUntil.toISOString().slice(0, 10),
  };
}
function totals(rows: unknown[]): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of [
      "clicks",
      "conversions",
      "cost",
      "impressions",
      "views",
    ]) {
      sum[key] = (sum[key] ?? 0) + Number(row[key] ?? 0);
    }
  }
  return sum;
}
function positive(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("Expected a positive integer.");
  }
  return number;
}
function list(value?: string): string[] {
  return (
    value?.split(",").flatMap((item) => {
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    }) ?? []
  );
}
function fileLines(path?: string): string[] {
  return path
    ? readFileSync(path, "utf-8")
        .split(/\r?\n/u)
        .flatMap((line) => {
          const trimmed = line.trim();
          return trimmed ? [trimmed] : [];
        })
    : [];
}
function output(value: unknown, options: CliOptions): void {
  const json = JSON.stringify(value, null, 2);
  const format = options.json ? "json" : (options.format ?? "table");
  let rendered = json;
  if (format === "csv" && Array.isArray(value)) {
    rendered = renderCsv(value);
  }
  if (typeof options.output === "string") {
    writeFileSync(options.output, `${rendered}\n`);
  } else if (format === "table" && Array.isArray(value)) {
    console.table(value);
  } else {
    console.log(rendered);
  }
}
export function renderCsv(rows: unknown[]): string {
  if (!rows.length) {
    return "";
  }
  const values = rows.map((row) => row as Record<string, unknown>);
  const headers = [...new Set(values.flatMap(Object.keys))];
  return [
    headers.join(","),
    ...values.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");
}
