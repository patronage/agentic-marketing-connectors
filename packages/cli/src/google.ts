import { readFileSync } from "node:fs";

import type { GoogleAdsClient, MutateResult } from "@patronage/google-ads";
import {
  parseBriefContent,
  parseJsonBriefContent,
} from "@patronage/google-ads/deploy/parse-brief";
import {
  getCampaignPerformance,
  getKeywordPerformance,
  getSearchTerms,
  type ReportDateRangeInput,
} from "@patronage/google-ads/reports";
import {
  addKeywords,
  buildAddKeywordsOperations,
} from "@patronage/google-ads/workflows/add-keywords";
import {
  deployCampaign,
  planDeployCampaign,
} from "@patronage/google-ads/workflows/deploy-campaign";
import {
  addCampaignNegativeKeywords,
  buildCampaignNegativeKeywordOperations,
} from "@patronage/google-ads/workflows/negative-keywords";
import {
  buildPauseAdGroupOperations,
  pauseAdGroups,
} from "@patronage/google-ads/workflows/pause-ad-groups";
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
import { printMutateResult } from "./output.js";
import { writeRunLog } from "./run-log.js";

type Mode = "execute" | "validate";

interface MutationCommandOptions {
  execute?: boolean;
  input: string;
  json?: boolean;
  runLogDir?: string;
}

export interface ReportCommandOptions {
  campaignId?: string;
  customerId: string;
  days?: string;
  json?: boolean;
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
  buildOperations(input: Input): unknown[];
  commandName: string;
  describe(input: Input): string[];
  run(client: GoogleAdsClient, input: Input, mode: Mode): Promise<MutateResult>;
  schema: z.ZodType<Input>;
  title: string;
}

const keywordMatchTypeSchema = z.enum(["EXACT", "PHRASE", "BROAD"]);
const negativeKeywordMatchTypeSchema = z.enum(["EXACT", "PHRASE"]);

const pauseAdGroupsSchema = z.object({
  adGroups: z.array(z.object({ id: z.string(), label: z.string().optional() })),
  customerId: z.string(),
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

export function createGoogleCommand(): Command {
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
      runDeployCampaignCommand(options)
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
    .option("-d, --days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--json", "Print machine-readable JSON output", false)
    .action(async (options: ReportCommandOptions) => {
      const client = createLocalGoogleAdsClient();
      const rows = await getKeywordPerformance(client, {
        campaignId: options.campaignId,
        customerId: options.customerId,
        ...dateRangeFromOptions(options),
      });
      printReportRows({
        json: Boolean(options.json),
        rows,
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
    .option("-d, --days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--json", "Print machine-readable JSON output", false)
    .action(async (options: ReportCommandOptions) => {
      const client = createLocalGoogleAdsClient();
      const rows = await getSearchTerms(client, {
        campaignId: options.campaignId,
        customerId: options.customerId,
        ...dateRangeFromOptions(options),
      });
      printReportRows({
        json: Boolean(options.json),
        rows,
        title: "Search Terms",
      });
    });

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
  const mode: Mode = options.execute ? "execute" : "validate";
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

  const client = createLocalGoogleAdsClient();
  const result = await definition.run(client, input, mode);
  const config = resolveCliConfig({ runLogDir: options.runLogDir });
  const runLog = writeRunLog({
    command: definition.commandName,
    input,
    inputFile: options.input,
    mode,
    operations,
    provider: "google-ads",
    result,
    runLogDir: config.runLogDir,
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          command: definition.commandName,
          mode,
          operationCount: operations.length,
          result,
          runLogPath: runLog.path,
        },
        null,
        2
      )
    );
    return;
  }

  printMutateResult({
    execute: Boolean(options.execute),
    result,
    runLogPath: runLog.path,
  });
}

async function runDeployCampaignCommand(
  options: DeployCampaignCommandOptions
): Promise<void> {
  const mode: Mode = options.execute ? "execute" : "validate";
  const status = options.status ?? "PAUSED";
  const brief = readBriefFile(options.brief);
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

  const client = createLocalGoogleAdsClient();
  const result = await deployCampaign(client, {
    brief,
    customerId: options.customerId,
    mode,
    status,
  });
  const config = resolveCliConfig({ runLogDir: options.runLogDir });
  const runLog = writeRunLog({
    command: "google campaigns deploy",
    input: brief,
    inputFile: options.brief,
    mode,
    operations: plan.operations,
    provider: "google-ads",
    result,
    runLogDir: config.runLogDir,
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          command: "google campaigns deploy",
          mode,
          operationCount: plan.operations.length,
          result,
          runLogPath: runLog.path,
          summary: plan.summary,
        },
        null,
        2
      )
    );
    return;
  }

  printMutateResult({
    execute: Boolean(options.execute),
    result,
    runLogPath: runLog.path,
  });
}

function readInputFile<Input>(
  filePath: string,
  schema: z.ZodType<Input>
): Input {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
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

function readBriefFile(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  return filePath.toLowerCase().endsWith(".json")
    ? parseJsonBriefContent(content)
    : parseBriefContent(content);
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
  if (!/^\d+$/.test(rawDays)) {
    throw new TypeError("--days must be a positive integer.");
  }

  const days = Number(rawDays);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new TypeError("--days must be a positive integer.");
  }

  return { days };
}

function printReportRows(input: {
  json: boolean;
  rows: unknown[];
  title: string;
}): void {
  if (input.json) {
    console.log(
      JSON.stringify(
        { rows: input.rows, totalRows: input.rows.length },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.bold(`\n${input.title}`));
  console.log(chalk.gray(`Rows: ${input.rows.length}\n`));
  console.table(input.rows);
}
