import { Console } from "node:console";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import nodePath from "node:path";

import type {
  GoogleAdsClient,
  MutateResult,
  SearchInput,
} from "@patronage/google-ads";
import { parseCampaignBrief } from "@patronage/google-ads/deploy/parse-brief";
import type {
  BriefBiddingStrategy,
  CampaignBrief,
} from "@patronage/google-ads/deploy/types";
import { decodePartialFailureError } from "@patronage/google-ads/partial-failure";
import {
  getCampaignPerformance,
  getKeywordPerformance,
  getSearchTerms,
} from "@patronage/google-ads/reports";
import type { ReportDateRangeInput } from "@patronage/google-ads/reports";
import { resolveCampaign } from "@patronage/google-ads/resolvers";
import {
  addKeywords,
  buildAddKeywordsOperations,
} from "@patronage/google-ads/workflows/add-keywords";
import {
  planDeployCampaign,
  runDeployCampaignLifecycle,
} from "@patronage/google-ads/workflows/deploy-campaign";
import type { DeployCampaignLifecycleOptions } from "@patronage/google-ads/workflows/deploy-campaign";
import {
  addCampaignNegativeKeywords,
  buildCampaignNegativeKeywordOperations,
} from "@patronage/google-ads/workflows/negative-keywords";
import {
  buildPauseAdGroupOperations,
  pauseAdGroups,
} from "@patronage/google-ads/workflows/pause-ad-groups";
import {
  buildRemoveKeywordsOperations,
  removeKeywords,
} from "@patronage/google-ads/workflows/remove-keywords";
import {
  buildSetCampaignMaxCpcOperations,
  setCampaignMaxCpc,
} from "@patronage/google-ads/workflows/set-campaign-max-cpc";
import {
  applyAccountNegativeKeywordList,
  buildApplyAccountNegativeKeywordListOperations,
} from "@patronage/google-ads/workflows/shared-set-negative-keywords";
import {
  buildUpdateAdFinalUrlOperations,
  updateAdFinalUrls,
} from "@patronage/google-ads/workflows/update-ad-final-urls";
import chalk from "chalk";
import { Command } from "commander";
import { z } from "zod";

import { resolveCliConfig } from "./config.js";
import { createLocalGoogleAdsClient } from "./google-client.js";
import { addGoogleExtraCommands } from "./google-extra.js";
import { runCliMutationHarness } from "./mutation-harness.js";
import type { CliRunMode } from "./run-log.js";
import { renderSpreadsheetCsv } from "./spreadsheet-csv.js";

interface MutationCommandOptions {
  execute?: boolean;
  input: string;
  json?: boolean;
  runLogDir?: string;
}

export interface ReportCommandOptions {
  campaign?: string;
  campaignId?: string;
  customerId: string;
  days?: string;
  json?: boolean;
  format?: "csv" | "json" | "table";
  lowPerformers?: boolean;
  minCost?: string;
  minImpressions?: string;
  output?: string;
  recommendations?: boolean;
  since?: string;
  until?: string;
}

interface DeployCampaignCommandOptions {
  brief: string;
  customerId: string;
  execute?: boolean;
  json?: boolean;
  runLogDir?: string;
  status?: "ENABLED" | "PAUSED";
}

interface MutationCommandDefinition<Input> {
  buildOperations: (input: Input) => unknown[];
  commandName: string;
  describe: (input: Input) => string[];
  run: (
    client: GoogleAdsClient,
    input: Input,
    mode: CliRunMode
  ) => Promise<MutateResult>;
  schema: z.ZodType<Input>;
  title: string;
}

const keywordMatchTypeSchema = z.enum(["EXACT", "PHRASE", "BROAD"]);
const negativeKeywordMatchTypeSchema = z.enum(["EXACT", "PHRASE"]);

const pauseAdGroupsSchema = z.object({
  adGroups: z.array(z.object({ id: z.string(), label: z.string().optional() })),
  customerId: z.string(),
});

const setCampaignMaxCpcSchema = z.object({
  campaigns: z.array(
    z.object({ id: z.string(), label: z.string().optional() })
  ),
  customerId: z.string(),
  maxCpc: z
    .number()
    .min(0.01)
    .max(1000)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) <= 1e-6,
      "maxCpc must be a whole number of cents"
    ),
});

const addKeywordsSchema = z.object({
  adGroupId: z.string(),
  adGroupLabel: z.string().optional(),
  customerId: z.string(),
  keywords: z.array(
    z.object({
      matchType: keywordMatchTypeSchema,
      text: z.string(),
    })
  ),
});

const removeKeywordsSchema = z.object({
  criteria: z.array(
    z.object({
      adGroupId: z.string(),
      criterionId: z.string(),
      matchType: z.string().optional(),
      negative: z.boolean(),
      text: z.string().optional(),
    })
  ),
  customerId: z.string(),
  expect: z.enum(["negative", "positive"]),
});

const addCampaignNegativesSchema = z.object({
  campaignId: z.string(),
  campaignLabel: z.string().optional(),
  customerId: z.string(),
  keywords: z.array(
    z.object({
      matchType: negativeKeywordMatchTypeSchema,
      text: z.string(),
    })
  ),
});

const applyAccountNegativesSchema = z.object({
  campaignIds: z.array(z.string()),
  campaignLabels: z.array(z.string()).optional(),
  customerId: z.string(),
  keywords: z.array(
    z.object({
      matchType: negativeKeywordMatchTypeSchema,
      text: z.string(),
    })
  ),
  listName: z.string(),
});

const updateAdFinalUrlsSchema = z.object({
  ads: z.array(
    z.object({
      adId: z.string(),
      finalUrls: z.array(z.string()),
      label: z.string().optional(),
    })
  ),
  customerId: z.string(),
});

export interface GoogleCommandOptions {
  defaultBiddingForCustomerId?: (customerId: string) => BriefBiddingStrategy;
}

const publicDefaultBiddingForCustomerId = (): BriefBiddingStrategy =>
  "manual-cpc";

export function createGoogleCommand(
  commandOptions: GoogleCommandOptions = {}
): Command {
  const defaultBiddingForCustomerId =
    commandOptions.defaultBiddingForCustomerId ??
    publicDefaultBiddingForCustomerId;
  const google = new Command("google").description("Google Ads commands");

  const campaigns = new Command("campaigns").description(
    "Google Ads campaign commands"
  );
  campaigns
    .command("performance")
    .description("Fetch campaign performance metrics")
    .requiredOption("--customer-id <id>", "Google Ads customer ID")
    .option("-d, --days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--json", "Print machine-readable JSON output", false)
    .action(async (options: ReportCommandOptions) => {
      const client = createLocalGoogleAdsClient();
      const rows = await getCampaignPerformance(client, {
        customerId: options.customerId,
        ...dateRangeFromOptions(options),
      });
      printReportRows({
        json: Boolean(options.json),
        rows,
        title: "Campaign Performance",
      });
    });
  campaigns
    .command("deploy")
    .description("Deploy a Google Ads search campaign from a brief")
    .requiredOption("--customer-id <id>", "Google Ads customer ID")
    .requiredOption("--brief <path>", "Path to JSON or markdown campaign brief")
    .option("--status <status>", "Campaign status: PAUSED or ENABLED", "PAUSED")
    .option("--execute", "Apply changes live", false)
    .option("--json", "Print machine-readable JSON output", false)
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: DeployCampaignCommandOptions) =>
      runDeployCampaignCommand(options, defaultBiddingForCustomerId)
    );
  addMutationCommand(
    campaigns,
    "set-max-cpc",
    "Set a Maximize Clicks CPC ceiling on existing campaigns",
    {
      buildOperations(input) {
        return buildSetCampaignMaxCpcOperations({
          campaignIds: input.campaigns.map((campaign) => campaign.id),
          customerId: input.customerId,
          maxCpc: input.maxCpc,
        });
      },
      commandName: "google campaigns set-max-cpc",
      describe(input) {
        return [
          `Customer: ${input.customerId}`,
          `CPC ceiling: $${input.maxCpc.toFixed(2)}`,
          `Campaigns: ${input.campaigns.length}`,
          ...input.campaigns.map(
            (campaign) =>
              `  - ${campaign.id}${campaign.label ? ` (${campaign.label})` : ""}`
          ),
        ];
      },
      async run(client, input, mode) {
        return setCampaignMaxCpc(client, {
          campaignIds: input.campaigns.map((campaign) => campaign.id),
          customerId: input.customerId,
          maxCpc: input.maxCpc,
          mode,
        });
      },
      schema: setCampaignMaxCpcSchema,
      title: "Set Campaign Max CPC",
    }
  );
  google.addCommand(campaigns);

  const adGroups = new Command("ad-groups").description(
    "Google Ads ad group commands"
  );
  addMutationCommand(adGroups, "pause", "Pause Google Ads ad groups", {
    buildOperations(input) {
      return buildPauseAdGroupOperations({
        adGroupIds: input.adGroups.map((adGroup) => adGroup.id),
        customerId: input.customerId,
      });
    },
    commandName: "google ad-groups pause",
    describe(input) {
      return [
        `Customer: ${input.customerId}`,
        `Ad groups: ${input.adGroups.length}`,
        ...input.adGroups.map(
          (adGroup) =>
            `  - ${adGroup.id}${adGroup.label ? ` (${adGroup.label})` : ""}`
        ),
      ];
    },
    async run(client, input, mode) {
      return pauseAdGroups(client, {
        adGroupIds: input.adGroups.map((adGroup) => adGroup.id),
        customerId: input.customerId,
        mode,
      });
    },
    schema: pauseAdGroupsSchema,
    title: "Pause Ad Groups",
  });
  google.addCommand(adGroups);

  const keywords = new Command("keywords").description(
    "Google Ads keyword commands"
  );
  keywords
    .command("report")
    .description("Fetch keyword performance metrics")
    .requiredOption("--customer-id <id>", "Google Ads customer ID")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--campaign <name-or-id>", "Campaign name or ID filter")
    .option("-d, --days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--json", "Print machine-readable JSON output", false)
    .option("--format <type>", "Output format: table, json, csv", "table")
    .option("-o, --output <path>", "Write report to a file")
    .option("--min-impressions <number>", "Minimum impressions", "0")
    .option(
      "--low-performers",
      "Only CTR below 5% or quality score below 3",
      false
    )
    .option(
      "--recommendations",
      "Add deterministic optimization recommendations",
      false
    )
    .action(async (options: ReportCommandOptions) => {
      const client = createLocalGoogleAdsClient();
      const campaignId = await resolveCampaignOption(client, options);
      let rows = await getKeywordPerformance(client, {
        campaignId,
        customerId: options.customerId,
        ...dateRangeFromOptions(options),
      });
      const minimum = Number(options.minImpressions ?? 0);
      rows = rows.filter(
        (row) =>
          row.impressions >= minimum &&
          (!options.lowPerformers ||
            (row.impressions > 100 && row.ctr < 0.02) ||
            (row.qualityScore !== null && row.qualityScore < 3) ||
            row.avgCpc > 1.8)
      );
      const outputRows = options.recommendations
        ? rows.map((row) => ({
            ...row,
            recommendation: keywordRecommendation(row),
          }))
        : rows;
      printReportRows({
        format: options.format,
        json: Boolean(options.json),
        output: options.output,
        rows: outputRows,
        title: "Keyword Performance",
      });
    });
  addMutationCommand(keywords, "add", "Add keywords to an existing ad group", {
    buildOperations(input) {
      return buildAddKeywordsOperations({
        adGroupId: input.adGroupId,
        customerId: input.customerId,
        keywords: input.keywords,
      });
    },
    commandName: "google keywords add",
    describe(input) {
      return [
        `Customer: ${input.customerId}`,
        `Ad group: ${input.adGroupId}${
          input.adGroupLabel ? ` (${input.adGroupLabel})` : ""
        }`,
        `Keywords: ${input.keywords.length}`,
        ...describeKeywords(input.keywords),
      ];
    },
    async run(client, input, mode) {
      return addKeywords(client, {
        adGroupId: input.adGroupId,
        customerId: input.customerId,
        keywords: input.keywords,
        mode,
      });
    },
    schema: addKeywordsSchema,
    title: "Add Keywords",
  });
  addMutationCommand(
    keywords,
    "remove",
    "Remove keywords from an ad group. Requires an explicit positive/negative scope",
    {
      buildOperations(input) {
        return buildRemoveKeywordsOperations({
          criteria: input.criteria,
          customerId: input.customerId,
          expect: input.expect,
        });
      },
      commandName: "google keywords remove",
      describe(input) {
        return [
          `Customer: ${input.customerId}`,
          `Scope: ${input.expect} keywords`,
          `Criteria: ${input.criteria.length}`,
          // The scope shown here is what the input file claims, not what the
          // account says. Labelling it as declared keeps the summary from
          // reading like confirmation; the account is read in the plan diff.
          ...input.criteria.map(
            (criterion) =>
              `  declared ${criterion.negative ? "negative" : "positive"} ${criterion.matchType ?? ""} "${criterion.text ?? criterion.criterionId}" (ad group ${criterion.adGroupId})`
          ),
        ];
      },
      async run(client, input, mode) {
        return removeKeywords(client, {
          criteria: input.criteria,
          customerId: input.customerId,
          expect: input.expect,
          mode,
        });
      },
      schema: removeKeywordsSchema,
      title: "Remove Keywords",
    }
  );
  google.addCommand(keywords);

  const negatives = new Command("negatives").description(
    "Google Ads negative keyword commands"
  );
  addMutationCommand(
    negatives,
    "add-campaign",
    "Add campaign-level negative keywords",
    {
      buildOperations(input) {
        return buildCampaignNegativeKeywordOperations({
          campaignId: input.campaignId,
          customerId: input.customerId,
          keywords: input.keywords,
        });
      },
      commandName: "google negatives add-campaign",
      describe(input) {
        return [
          `Customer: ${input.customerId}`,
          `Campaign: ${input.campaignId}${
            input.campaignLabel ? ` (${input.campaignLabel})` : ""
          }`,
          `Negatives: ${input.keywords.length}`,
          ...describeKeywords(input.keywords),
        ];
      },
      async run(client, input, mode) {
        return addCampaignNegativeKeywords(client, {
          campaignId: input.campaignId,
          customerId: input.customerId,
          keywords: input.keywords,
          mode,
        });
      },
      schema: addCampaignNegativesSchema,
      title: "Add Campaign Negatives",
    }
  );
  addMutationCommand(
    negatives,
    "apply-account",
    "Create and attach an account-level negative keyword list",
    {
      buildOperations(input) {
        return buildApplyAccountNegativeKeywordListOperations({
          campaignIds: input.campaignIds,
          customerId: input.customerId,
          keywords: input.keywords,
          listName: input.listName,
        });
      },
      commandName: "google negatives apply-account",
      describe(input) {
        return [
          `Customer: ${input.customerId}`,
          `List name: ${input.listName}`,
          `Campaigns: ${input.campaignIds.length}`,
          ...input.campaignIds.map((campaignId, index) => {
            const label = input.campaignLabels?.[index];
            return `  - ${campaignId}${label ? ` (${label})` : ""}`;
          }),
          `Negatives: ${input.keywords.length}`,
          ...describeKeywords(input.keywords),
        ];
      },
      async run(client, input, mode) {
        return applyAccountNegativeKeywordList(client, {
          campaignIds: input.campaignIds,
          customerId: input.customerId,
          keywords: input.keywords,
          listName: input.listName,
          mode,
        });
      },
      schema: applyAccountNegativesSchema,
      title: "Apply Account Negatives",
    }
  );
  google.addCommand(negatives);

  const ads = new Command("ads").description("Google Ads ad commands");
  addMutationCommand(ads, "update-final-urls", "Update ad final URLs", {
    buildOperations(input) {
      return buildUpdateAdFinalUrlOperations({
        ads: input.ads.map((ad) => ({
          adId: ad.adId,
          finalUrls: ad.finalUrls,
        })),
        customerId: input.customerId,
      });
    },
    commandName: "google ads update-final-urls",
    describe(input) {
      return [
        `Customer: ${input.customerId}`,
        `Ads: ${input.ads.length}`,
        ...input.ads.flatMap((ad) => [
          `  - ${ad.adId}${ad.label ? ` (${ad.label})` : ""}`,
          ...ad.finalUrls.map((url) => `    -> ${url}`),
        ]),
      ];
    },
    async run(client, input, mode) {
      return updateAdFinalUrls(client, {
        ads: input.ads.map((ad) => ({
          adId: ad.adId,
          finalUrls: ad.finalUrls,
        })),
        customerId: input.customerId,
        mode,
      });
    },
    schema: updateAdFinalUrlsSchema,
    title: "Update Ad Final URLs",
  });
  google.addCommand(ads);

  google
    .command("search-terms")
    .description("Fetch search term performance metrics")
    .requiredOption("--customer-id <id>", "Google Ads customer ID")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--campaign <name-or-id>", "Campaign name or ID filter")
    .option("-d, --days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--json", "Print machine-readable JSON output", false)
    .option("--format <type>", "Output format: table, json, csv", "table")
    .option("-o, --output <path>", "Write report to a file")
    .option("--min-impressions <number>", "Minimum impressions", "1")
    .option("--min-cost <number>", "Minimum cost", "0")
    .action(async (options: ReportCommandOptions) => {
      const client = createLocalGoogleAdsClient();
      const campaignId = await resolveCampaignOption(client, options);
      const result = await getSearchTerms(client, {
        campaignId,
        customerId: options.customerId,
        ...dateRangeFromOptions(options),
      });
      const rows = result.filter(
        (row) =>
          row.impressions >= Number(options.minImpressions ?? 1) &&
          row.cost >= Number(options.minCost ?? 0)
      );
      printReportRows({
        format: options.format,
        json: Boolean(options.json),
        output: options.output,
        rows,
        title: "Search Terms",
      });
    });

  addGoogleExtraCommands(google);

  return google;
}

function addMutationCommand<Input>(
  parent: Command,
  name: string,
  description: string,
  definition: MutationCommandDefinition<Input>
): void {
  parent
    .command(name)
    .description(
      `${description}. Defaults to validation; pass --execute to apply.`
    )
    .requiredOption("-i, --input <path>", "Path to JSON input file")
    .option("--execute", "Apply changes live", false)
    .option("--json", "Print machine-readable JSON output", false)
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationCommandOptions) =>
      runMutationCommand(definition, options)
    );
}

async function runMutationCommand<Input>(
  definition: MutationCommandDefinition<Input>,
  options: MutationCommandOptions
): Promise<void> {
  const input = readInputFile(options.input, definition.schema);
  const operations = definition.buildOperations(input);

  if (!options.json) {
    const label = options.execute
      ? chalk.red.bold("LIVE")
      : chalk.yellow.bold("DRY-RUN (validate only)");
    console.log(chalk.bold(`\n${definition.title} - ${label}`));
    for (const line of definition.describe(input)) {
      console.log(chalk.gray(line));
    }
    console.log();
  }

  const config = resolveCliConfig({ runLogDir: options.runLogDir });
  await runCliMutationHarness({
    command: definition.commandName,
    createClient: createLocalGoogleAdsClient,
    execute: options.execute,
    format: options.json ? "json" : undefined,
    input,
    inputFile: options.input,
    logResult: flattenGoogleHarnessLog,
    operations,
    provider: "google-ads",
    run: async (providerClient, runMode) => {
      const planDiff = await readCurrentStateDiff(
        providerClient,
        definition.commandName,
        input as Record<string, unknown>
      );
      let providerResult: MutateResult;
      try {
        // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- current state must be captured before a possible execute-mode mutation.
        providerResult = await definition.run(providerClient, input, runMode);
      } catch (error) {
        // A refusal aborts before the harness writes its run log, so the
        // account state that justified it would otherwise be lost. Print it
        // here: on a guarded command, why it said no is the useful artifact.
        if (planDiff.length > 0) {
          console.error(chalk.gray("\nAccount state at refusal:"));
          new Console({ stderr: process.stderr, stdout: process.stderr }).table(
            planDiff
          );
        }
        throw error;
      }
      return {
        decodedPartialFailures: decodePartialFailureError(
          providerResult.partialFailureError
        ),
        planDiff,
        providerResult,
      };
    },
    runLogDir: config.runLogDir,
    validation: "provider",
  });
}

function formatMicrosAsDollars(micros: unknown): string | undefined {
  const numericMicros = Number(micros);
  // Absent, empty-string, zero, and malformed micros all mean "no ceiling":
  // Number("") is 0, and a zero ceiling is not a state the API stores.
  if (
    !(micros !== undefined && Number.isFinite(numericMicros)) ||
    numericMicros <= 0
  ) {
    return undefined;
  }
  return `$${(numericMicros / 1_000_000).toFixed(2)}`;
}

export async function readCurrentStateDiff(
  client: GoogleAdsClient,
  commandName: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const customerId = String(input.customerId ?? "");
  if (commandName === "google campaigns set-max-cpc") {
    const ids = (input.campaigns as { id: string }[]).map((item) => item.id);
    if (!ids.length) {
      return [];
    }
    const rows = await readAllGoogleSearchRows(client, {
      customerId,
      query: `SELECT campaign.id, campaign.name, campaign.bidding_strategy_type, campaign.target_spend.cpc_bid_ceiling_micros FROM campaign WHERE campaign.id IN (${ids.join(",")})`,
    });
    const maxCpc = input.maxCpc as number;
    return rows.map((row) => {
      const campaign = (row.campaign ?? {}) as Record<string, unknown>;
      const targetSpend = (campaign.targetSpend ??
        campaign.target_spend ??
        {}) as Record<string, unknown>;
      const currentMicros =
        targetSpend.cpcBidCeilingMicros ?? targetSpend.cpc_bid_ceiling_micros;
      return {
        id: campaign.id,
        name: campaign.name,
        biddingStrategyType:
          campaign.biddingStrategyType ?? campaign.bidding_strategy_type,
        current: formatMicrosAsDollars(currentMicros) ?? "(no ceiling)",
        proposed: `$${maxCpc.toFixed(2)}`,
      };
    });
  }
  if (commandName === "google ad-groups pause") {
    const ids = (input.adGroups as { id: string }[]).map((item) => item.id);
    if (!ids.length) {
      return [];
    }
    const { rows } = await client.search({
      customerId,
      query: `SELECT ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.id IN (${ids.join(",")})`,
    });
    return rows.map((row) => {
      const group = (row.adGroup ?? row.ad_group ?? {}) as Record<
        string,
        unknown
      >;
      return {
        id: group.id,
        name: group.name,
        current: group.status,
        proposed: "PAUSED",
      };
    });
  }
  if (commandName === "google keywords remove") {
    const criteria = input.criteria as {
      adGroupId: string;
      criterionId: string;
      negative: boolean;
      text?: string;
    }[];
    const ids = [...new Set(criteria.map((item) => item.criterionId))];
    if (!ids.length) {
      return [];
    }
    const rows = await readAllGoogleSearchRows(client, {
      customerId,
      query: `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.negative, ad_group_criterion.status, ad_group_criterion.type FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.criterion_id IN (${ids.join(",")})`,
    });
    const actual = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const criterion = (row.adGroupCriterion ??
        row.ad_group_criterion ??
        {}) as Record<string, unknown>;
      const criterionId = criterion.criterionId ?? criterion.criterion_id ?? "";
      const group = (row.adGroup ?? row.ad_group ?? {}) as Record<
        string,
        unknown
      >;
      actual.set(`${group.id}~${criterionId}`, criterion);
    }
    return criteria.map((item) => {
      const found = actual.get(`${item.adGroupId}~${item.criterionId}`);
      const keyword = (found?.keyword ?? {}) as Record<string, unknown>;
      let actualScope = "NOT FOUND";
      if (found) {
        actualScope = found.negative === true ? "negative" : "positive";
      }
      return {
        adGroupId: item.adGroupId,
        criterionId: item.criterionId,
        keyword: keyword.text ?? item.text ?? null,
        declaredScope: item.negative ? "negative" : "positive",
        // Read from the account, not from the input. A declared scope that
        // disagrees with this is the failure this command exists to catch.
        actualScope,
        current: found?.status ?? "NOT FOUND",
        proposed: "REMOVED",
      };
    });
  }
  if (commandName === "google ads update-final-urls") {
    const ids = (input.ads as { adId: string; finalUrls: string[] }[]).map(
      (item) => item.adId
    );
    const proposed = new Map(
      (input.ads as { adId: string; finalUrls: string[] }[]).map((item) => [
        item.adId,
        item.finalUrls,
      ])
    );
    if (!ids.length) {
      return [];
    }
    const { rows } = await client.search({
      customerId,
      query: `SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE ad_group_ad.ad.id IN (${ids.join(",")})`,
    });
    return rows.map((row) => {
      const wrapper = (row.adGroupAd ?? row.ad_group_ad ?? {}) as Record<
        string,
        unknown
      >;
      const ad = (wrapper.ad ?? {}) as Record<string, unknown>;
      return {
        id: ad.id,
        current: ad.finalUrls ?? ad.final_urls,
        proposed: proposed.get(String(ad.id)),
      };
    });
  }
  return [];
}

async function readAllGoogleSearchRows(
  client: GoogleAdsClient,
  input: SearchInput
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- Each request needs the preceding page token.
    const response = await client.search({
      ...input,
      ...(pageToken ? { pageToken } : {}),
    });
    rows.push(...response.rows);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return rows;
}

async function runDeployCampaignCommand(
  options: DeployCampaignCommandOptions,
  defaultBiddingForCustomerId: (customerId: string) => BriefBiddingStrategy
): Promise<void> {
  const status = options.status ?? "PAUSED";
  const brief = readBriefFile(
    options.brief,
    options.customerId,
    defaultBiddingForCustomerId
  );
  const plan = planDeployCampaign({
    brief,
    customerId: options.customerId,
    status,
  });

  if (!options.json) {
    const label = options.execute
      ? chalk.red.bold("LIVE")
      : chalk.yellow.bold("DRY-RUN (validate only)");
    console.log(chalk.bold(`\nDeploy Campaign - ${label}`));
    console.log(chalk.gray(`Customer: ${options.customerId}`));
    console.log(chalk.gray(`Campaign: ${brief.frontmatter.campaign_name}`));
    console.log(chalk.gray(`Status: ${status}`));
    console.log(chalk.gray(`Operations: ${plan.operations.length}`));
    console.log(chalk.gray(`Ad groups: ${plan.summary.adGroups}`));
    console.log(chalk.gray(`Ads: ${plan.summary.ads}`));
    console.log();
  }

  const config = resolveCliConfig({ runLogDir: options.runLogDir });
  const deploymentKey = googleDeploymentResumeKey({
    brief,
    customerId: options.customerId,
    status,
  });
  const resumeReceipt = readLatestDeployReceipt(
    config.runLogDir,
    options.brief,
    deploymentKey
  );
  const operationId = resumeReceipt?.operationId ?? `cli-${randomUUID()}`;
  await runCliMutationHarness({
    command: "google campaigns deploy",
    createClient: createLocalGoogleAdsClient,
    execute: options.execute,
    format: options.json ? "json" : undefined,
    input: brief,
    inputFile: options.brief,
    logOperations: (result) =>
      extractGoogleDeployOperations(result, plan.operations),
    logResult: (result) => ({
      ...asRecord(flattenGoogleHarnessLog(result)),
      deploymentKey,
    }),
    operations: plan.operations,
    provider: "google-ads",
    run: (client, runMode) =>
      runDeployCampaignLifecycle(
        client,
        { brief, customerId: options.customerId, status },
        {
          operationId,
          ...(resumeReceipt ? { resumeReceipt } : {}),
          targetStage:
            runMode === "execute" ? "executed" : "provider-validated",
        }
      ),
    runLogDir: config.runLogDir,
    validation: "provider",
  });
}

type GoogleDeployReceipt = NonNullable<
  DeployCampaignLifecycleOptions["resumeReceipt"]
>;

function readLatestDeployReceipt(
  runLogDir: string,
  briefPath: string,
  deploymentKey: string
): GoogleDeployReceipt | undefined {
  let filenames: string[];
  try {
    filenames = readdirSync(runLogDir).toSorted((left, right) => {
      const leftTime = statSync(nodePath.join(runLogDir, left), {
        bigint: true,
      }).mtimeNs;
      const rightTime = statSync(nodePath.join(runLogDir, right), {
        bigint: true,
      }).mtimeNs;
      if (leftTime === rightTime) {
        return 0;
      }
      return leftTime > rightTime ? -1 : 1;
    });
  } catch {
    return undefined;
  }
  const resolvedBriefPath = nodePath.resolve(briefPath);
  for (const filename of filenames) {
    if (!filename.includes("google-ads-google-campaigns-deploy-")) {
      continue;
    }
    try {
      const runLog = JSON.parse(
        readFileSync(nodePath.join(runLogDir, filename), "utf-8")
      ) as Record<string, unknown>;
      if (
        runLog.command !== "google campaigns deploy" ||
        runLog.inputFile !== resolvedBriefPath
      ) {
        continue;
      }
      const result = asRecord(runLog.result);
      if (result.deploymentKey !== deploymentKey) {
        continue;
      }
      const providerResult = asRecord(result.providerResult);
      const receipt = asRecord(result.receipt ?? providerResult.receipt);
      if (typeof receipt.operationId === "string") {
        const cleanupStep = Array.isArray(receipt.steps)
          ? receipt.steps.find(
              (step) =>
                asRecord(step).key === "operation-label-cleanup" &&
                asRecord(step).status === "succeeded"
            )
          : undefined;
        return receipt.status === "succeeded" && cleanupStep
          ? undefined
          : (receipt as unknown as GoogleDeployReceipt);
      }
    } catch {
      // Ignore malformed or unrelated historical logs and keep searching.
    }
  }
  return undefined;
}

export function googleDeploymentResumeKey(input: {
  brief: unknown;
  customerId: string;
  status: string;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function flattenGoogleHarnessLog(input: {
  lifecycle: string;
  result: unknown;
}): unknown {
  return {
    lifecycle: input.lifecycle,
    ...asRecord(input.result),
  };
}

function extractGoogleDeployOperations(
  result: unknown,
  fallback: unknown[]
): unknown[] {
  const plan = asRecord(asRecord(result).plan);
  return Array.isArray(plan.operations) ? plan.operations : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readInputFile<Input>(
  filePath: string,
  schema: z.ZodType<Input>
): Input {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const result = schema.safeParse(raw);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    });
    throw new Error(`Invalid input file:\n${messages.join("\n")}`);
  }

  return result.data;
}

export function readBriefFile(
  filePath: string,
  customerId: string,
  defaultBiddingForCustomerId: (
    customerId: string
  ) => BriefBiddingStrategy = publicDefaultBiddingForCustomerId
): CampaignBrief {
  const content = readFileSync(filePath, "utf-8");
  return parseCampaignBrief(content, {
    defaultBidding: defaultBiddingForCustomerId(customerId),
    format: filePath.toLowerCase().endsWith(".json") ? "json" : "markdown",
  });
}

function describeKeywords(
  keywords: { matchType: string; text: string }[]
): string[] {
  const byType = new Map<string, string[]>();

  for (const keyword of keywords) {
    const entries = byType.get(keyword.matchType) ?? [];
    entries.push(keyword.text);
    byType.set(keyword.matchType, entries);
  }

  return [...byType].flatMap(([matchType, entries]) => [
    `  [${matchType}] (${entries.length})`,
    ...entries.map((entry) => `    - ${entry}`),
  ]);
}

export function dateRangeFromOptions(
  options: ReportCommandOptions
): ReportDateRangeInput {
  if (options.since || options.until) {
    if (!options.since || !options.until) {
      throw new Error("Explicit date ranges require both --since and --until.");
    }

    return { since: options.since, until: options.until };
  }

  const rawDays = options.days ?? "30";
  if (!/^\d+$/u.test(rawDays)) {
    throw new TypeError("--days must be a positive integer.");
  }

  const days = Number(rawDays);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new TypeError("--days must be a positive integer.");
  }

  return { days };
}

function printReportRows(input: {
  format?: string;
  json: boolean;
  output?: string;
  rows: unknown[];
  title: string;
}): void {
  if (
    input.json ||
    input.format === "json" ||
    input.format === "csv" ||
    input.output
  ) {
    const rendered =
      input.format === "csv"
        ? toCsv(input.rows)
        : JSON.stringify(
            { rows: input.rows, totalRows: input.rows.length },
            null,
            2
          );
    if (input.output) {
      writeFileSync(input.output, `${rendered}\n`);
    } else {
      console.log(rendered);
    }
    return;
  }

  console.log(chalk.bold(`\n${input.title}`));
  console.log(chalk.gray(`Rows: ${input.rows.length}\n`));
  console.table(input.rows);
}

async function resolveCampaignOption(
  client: GoogleAdsClient,
  options: ReportCommandOptions
): Promise<string | undefined> {
  if (options.campaignId) {
    return options.campaignId;
  }
  if (!options.campaign) {
    return undefined;
  }
  const campaign = await resolveCampaign(client, {
    customerId: options.customerId,
    value: options.campaign,
  });
  return campaign.id;
}

function keywordRecommendation(row: {
  avgCpc: number;
  clicks: number;
  conversions: number;
  ctr: number;
  impressions: number;
  keyword: string;
  qualityScore: number | null;
}): {
  action: "expand" | "improve" | "monitor" | "pause";
  reason: string;
} | null {
  if (row.impressions > 100 && row.ctr < 0.02) {
    return {
      action: "pause",
      reason: `CTR ${(row.ctr * 100).toFixed(2)}% below 2% threshold`,
    };
  }
  if (row.qualityScore !== null && row.qualityScore < 3) {
    return {
      action: "pause",
      reason: `Quality Score ${row.qualityScore} below minimum 3`,
    };
  }
  if (row.ctr > 0.08 && row.conversions > 0 && row.impressions > 50) {
    return {
      action: "expand",
      reason: "High CTR with conversions — add variations",
    };
  }
  if (row.ctr > 0.05 && row.impressions > 200 && row.conversions === 0) {
    return {
      action: "monitor",
      reason: "Good CTR but no conversions — check landing page",
    };
  }
  if (row.avgCpc > 1.8) {
    return {
      action: "improve",
      reason: `CPC $${row.avgCpc.toFixed(2)} near $2.00 limit`,
    };
  }
  return null;
}

export function toCsv(rows: unknown[]): string {
  return renderSpreadsheetCsv(rows as Record<string, unknown>[]);
}
