import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyLinkedInOptimizationActions,
  buildBoostPostPlan,
  buildLinkedInBriefDeploymentPlan,
  buildLinkedInOptimizationActions,
  createLinkedInAdsClient,
  detectLinkedInCreativeFatigue,
  recommendLinkedInCreativeAllocation,
  parseLinkedInCampaignBrief,
} from "@patronage/linkedin-ads";
import type {
  BoostLinkedInPostInput,
  LinkedInAdsClient,
  LinkedInAnalyticsPivot,
  LinkedInCampaignStatus,
  LinkedInLeadForm,
  LinkedInLeadFormResponse,
  UpdateLinkedInCampaignInput,
} from "@patronage/linkedin-ads";
import {
  deployLinkedInBoostResumable,
  deployLinkedInBriefResumable,
} from "@patronage/linkedin-ads/deployment";
import type { LinkedInDeploymentReceipt } from "@patronage/linkedin-ads/deployment";
import { Command } from "commander";
import { z } from "zod";

import { mintLinkedInAccessToken } from "./linkedin-oauth.js";
import { loadLocalDotenv } from "./local-env.js";
import { runCliMutationHarness } from "./mutation-harness.js";
import { renderSpreadsheetCsv } from "./spreadsheet-csv.js";

const cliSourceDirectory = import.meta.dirname;
const defaultRunLogDir = "run-logs/linkedin-ads";

const linkedInCampaignInputSchema = z
  .object({
    campaignGroup: z.string().trim().min(1),
    name: z.string().trim().min(1),
  })
  .loose();

const linkedInLeadFormInputSchema = z
  .object({
    description: z.string().trim().min(1),
    headline: z.string().trim().min(1),
    name: z.string().trim().min(1),
    privacyPolicyUrl: z.url(),
    questions: z.array(z.unknown()),
    thankYouMessage: z.object({ message: z.string().trim().min(1) }).loose(),
  })
  .loose();

interface LinkedInOptions {
  accessToken?: string;
  adAccountId?: string;
  format?: string;
}

interface MutationOptions extends LinkedInOptions {
  execute?: boolean;
  runLogDir?: string;
}

interface PerformanceOptions extends LinkedInOptions {
  all?: boolean;
  campaignId?: string;
  campaignName?: string;
  checkFatigue?: boolean;
  creativeId?: string;
  days?: string;
  pivot: LinkedInAnalyticsPivot;
  since?: string;
  until?: string;
  vsTargets?: boolean;
}

interface BoostOptions extends MutationOptions {
  campaignGroup: string;
  dailyBudget?: string;
  days?: string;
  geo?: string;
  name?: string;
  objective?: string;
  organizationUrn?: string;
  postUrn: string;
  status?: string;
  totalBudget?: string;
}

export function createLinkedInCommand(): Command {
  const linkedin = new Command("linkedin").description(
    "LinkedIn provider commands"
  );
  const ads = new Command("ads").description("LinkedIn Ads commands");

  const campaigns = new Command("campaigns").description(
    "LinkedIn campaign commands"
  );
  campaigns
    .command("performance")
    .description("Fetch LinkedIn campaign or creative analytics")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--campaign-name <name>", "Campaign name filter")
    .option("--all", "Include all active and paused campaigns", false)
    .option("--vs-targets", "Compare aggregate metrics with targets", false)
    .option("--check-fatigue", "Include creative fatigue signals", false)
    .option("--creative-id <id>", "Creative ID filter")
    .option("--pivot <pivot>", "CAMPAIGN or CREATIVE", "CAMPAIGN")
    .option("--days <number>", "Lookback period in days", "7")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--format <format>", "json or table", "table")
    .action((options: PerformanceOptions) => runPerformance(options));
  campaigns
    .command("deploy")
    .description("Create a campaign from JSON or deploy a campaign brief")
    .option("--input <path>", "Path to campaign JSON")
    .option("--brief <path>", "Path to campaign-intel HTML brief")
    .option("--campaign-group <urn>", "Campaign group for brief deployment")
    .option("--privacy-policy-url <url>", "Lead form privacy policy URL")
    .option("--max-creatives <number>", "Maximum brief creatives", "10")
    .option("--status <status>", "DRAFT, PAUSED, or ACTIVE", "PAUSED")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action(
      (
        options: MutationOptions & {
          brief?: string;
          campaignGroup?: string;
          input?: string;
          maxCreatives?: string;
          privacyPolicyUrl?: string;
          status?: string;
        }
      ) => runCampaignDeploy(options)
    );
  ads.addCommand(campaigns);
  ads.addCommand(createCampaignGroupsCommand());
  ads.addCommand(createBriefsCommand());

  const boosts = new Command("boosts").description("LinkedIn boost commands");
  boosts
    .command("create")
    .description("Create a paid boost for an existing organic post")
    .requiredOption("--post-urn <urn>", "Organic post URN")
    .requiredOption("--campaign-group <urn>", "Sponsored campaign group URN/ID")
    .option("--organization-urn <urn>", "Organization URN")
    .option("--objective <type>", "Campaign objective", "ENGAGEMENT")
    .option("--geo <name>", "Broad geography", "us")
    .option("--daily-budget <amount>", "Daily budget in USD", "25")
    .option("--total-budget <amount>", "Total budget in USD")
    .option("--days <number>", "Number of days to run")
    .option("--status <status>", "DRAFT, PAUSED, or ACTIVE", "PAUSED")
    .option("--name <name>", "Custom campaign name")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: BoostOptions) => runBoost(options));
  ads.addCommand(boosts);
  ads.addCommand(createPostsCommand());

  ads.addCommand(createLeadsCommand());
  ads.addCommand(createOptimizationCommand());
  ads.addCommand(createTokenCommand());

  linkedin.addCommand(ads);
  return linkedin;
}

function createLeadsCommand(): Command {
  const leads = new Command("leads").description("LinkedIn Lead Gen commands");
  const forms = new Command("forms").description("LinkedIn Lead Gen forms");
  forms
    .command("list")
    .description("List Lead Gen forms")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "json or table", "table")
    .action(async (options: LinkedInOptions) => {
      const result = await listAllLeadForms(
        createLocalLinkedInAdsClient(options)
      );
      writeOutput(renderOutput(result, options.format));
    });
  forms
    .command("create")
    .description("Create a Lead Gen form from JSON")
    .requiredOption("--input <path>", "Path to Lead Gen form JSON")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { input: string }) =>
      runLeadFormCreate(options)
    );
  leads.addCommand(forms);
  leads
    .command("download")
    .description("Download Lead Gen form responses")
    .option("--form-id <id>", "Lead Gen form URN/ID")
    .option("--form <name>", "Lead Gen form name")
    .option("--since <date>", "Only leads submitted after YYYY-MM-DD")
    .option("--until <date>", "Only leads submitted before YYYY-MM-DD")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "csv or json", "csv")
    .option("--limit <number>", "Maximum leads to download", "1000")
    .option("--output <path>", "Write leads to a file")
    .option("--stdout", "Write lead data to stdout", false)
    .action(
      async (
        options: LinkedInOptions & {
          form?: string;
          formId?: string;
          limit?: string;
          output?: string;
          since?: string;
          stdout?: boolean;
          until?: string;
        }
      ) => {
        const client = createLocalLinkedInAdsClient(options);
        const formId =
          options.formId ??
          (options.form
            ? await findLeadFormId(client, options.form)
            : undefined);
        if (!formId) {
          throw new Error("Pass --form-id <id> or --form <name>.");
        }
        const result = await downloadAllLeadFormResponses(client, {
          formId,
          limit: parseOptionalPositiveInteger(options.limit, "--limit"),
          submittedAfter: options.since
            ? parseCalendarDate(options.since).getTime()
            : undefined,
          submittedBefore: options.until
            ? parseCalendarDate(options.until).getTime()
            : undefined,
        });
        const content =
          options.format === "json"
            ? `${JSON.stringify(result.leads, null, 2)}\n`
            : renderLeadsCsv(result.leads);
        const outputPath =
          options.output ??
          (options.stdout || options.format === "json"
            ? undefined
            : "leads.csv");
        if (outputPath) {
          writeFileSync(outputPath, content);
        }
        if (options.stdout || !outputPath) {
          writeOutput(content);
        } else if (outputPath) {
          writeOutput(`Wrote ${result.leads.length} leads to ${outputPath}\n`);
        }
      }
    );
  return leads;
}

function createPostsCommand(): Command {
  const posts = new Command("posts").description("LinkedIn organization posts");
  posts
    .command("list")
    .description("List recent organization posts available for boosting")
    .option("--organization-urn <urn>", "LinkedIn organization URN")
    .option("--count <number>", "Number of posts", "10")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "json or table", "table")
    .action(
      async (
        options: LinkedInOptions & {
          count?: string;
          organizationUrn?: string;
        }
      ) => {
        loadLocalDotenv([process.cwd(), cliSourceDirectory]);
        const organizationUrn = resolveRequiredEnv(
          options.organizationUrn,
          "LINKEDIN_ORGANIZATION_ID"
        );
        const result = await createLocalLinkedInAdsClient(
          options
        ).listOrganizationPosts({
          count: parseOptionalPositiveInteger(options.count, "--count"),
          organizationUrn,
        });
        writeOutput(renderOutput(result, options.format));
      }
    );
  return posts;
}

function createOptimizationCommand(): Command {
  const optimization = new Command("optimization").description(
    "LinkedIn optimization commands"
  );
  optimization
    .command("budget")
    .description("Recommend creative allocation from campaign performance")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--campaign-name <name>", "Campaign name filter")
    .option("--days <number>", "Lookback period in days", "7")
    .option("--max-allocation <number>", "Maximum creative allocation", "0.60")
    .option("--min-allocation <number>", "Minimum creative allocation", "0.10")
    .option("--execute", "Apply recommended creative status changes", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action(
      async (
        options: PerformanceOptions &
          MutationOptions & { maxAllocation?: string; minAllocation?: string }
      ) => {
        const { since, until } = resolveDateRange(options);
        await runCliMutationHarness({
          command: "linkedin ads optimization budget",
          createClient: () => createLocalLinkedInAdsClient(options),
          execute: options.execute,
          format: options.format,
          input: {
            campaignId: options.campaignId,
            campaignName: options.campaignName,
            days: options.days,
          },
          logResult: flattenLinkedInSimpleLog,
          operations: [],
          output: writeOutput,
          prepare: async (client) => {
            const campaignId =
              options.campaignId ??
              (options.campaignName
                ? await findCampaignId(client, options.campaignName)
                : undefined);
            if (!campaignId) {
              throw new Error(
                "Pass --campaign-id <id> or --campaign-name <name>."
              );
            }
            const [metrics, creativePage] = await Promise.all([
              client.getAnalytics({
                creatives: undefined,
                campaigns: [campaignId],
                pivot: "CREATIVE",
                since,
                until,
              }),
              client.listCreatives({ campaignId }),
            ]);
            const recommendation = recommendLinkedInCreativeAllocation({
              creatives: creativePage.creatives,
              guardrails: {
                maxAllocation: parseAllocation(
                  options.maxAllocation,
                  "--max-allocation"
                ),
                minAllocation: parseAllocation(
                  options.minAllocation,
                  "--min-allocation"
                ),
              },
              metrics,
            });
            const actions = buildLinkedInOptimizationActions(recommendation);
            return {
              context: { actions, recommendation },
              localResult: { actions, applied: [], recommendation },
              operations: actions,
            };
          },
          presentation: linkedInHarnessPresentation,
          provider: "linkedin-ads",
          run: async (client, _mode, prepared) => ({
            actions: prepared?.actions ?? [],
            applied: await applyLinkedInOptimizationActions({
              actions: prepared?.actions ?? [],
              client,
            }),
            recommendation: prepared?.recommendation,
          }),
          runLogDir: options.runLogDir ?? defaultRunLogDir,
          validation: "local",
        });
      }
    );
  optimization
    .command("fatigue")
    .description("Analyze campaign delivery for creative fatigue signals")
    .option("--campaign-id <id>", "Campaign ID/URN")
    .option("--campaign-name <name>", "Campaign name")
    .option("--days <number>", "Lookback period in days", "7")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "json or table", "table")
    .action(async (options: PerformanceOptions) => {
      const { since, until } = resolveDateRange(options);
      const client = createLocalLinkedInAdsClient(options);
      const campaignId =
        options.campaignId ??
        (options.campaignName
          ? await findCampaignId(client, options.campaignName)
          : undefined);
      if (!campaignId) {
        throw new Error("Pass --campaign-id <id> or --campaign-name <name>.");
      }
      const metrics = await client.getAnalytics({
        campaigns: [campaignId],
        pivot: "CAMPAIGN",
        since,
        until,
        timeGranularity: "DAILY",
      });
      writeOutput(
        renderOutput(detectLinkedInCreativeFatigue(metrics), options.format)
      );
    });
  optimization
    .command("pause")
    .description("Pause a LinkedIn campaign")
    .requiredOption("--campaign-id <id>", "Campaign ID/URN")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { campaignId: string }) =>
      runCampaignPause(options)
    );
  return optimization;
}

function createTokenCommand(): Command {
  const token = new Command("token").description("LinkedIn token utilities");
  token
    .command("check")
    .description("Validate access token and ad account access")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "json or table", "table")
    .action(async (options: LinkedInOptions) => {
      const client = createLocalLinkedInAdsClient(options);
      const [tokenResult, account] = await Promise.all([
        client.checkToken(),
        client.getAdAccount().catch((error: unknown) => ({ error })),
      ]);
      writeOutput(renderOutput({ account, ...tokenResult }, options.format));
    });
  token
    .command("mint")
    .description("Run local LinkedIn OAuth and mint an access token")
    .option("--client-id <id>", "LinkedIn OAuth client ID")
    .option("--client-secret <secret>", "LinkedIn OAuth client secret")
    .option("--port <number>", "Local callback port", "3001")
    .option("--no-open-browser", "Print authorization URL without opening it")
    .option(
      "--scope <scopes>",
      "Comma-separated OAuth scopes; defaults to the full set, which requires the Advertising and Community Management products"
    )
    .option("--format <format>", "json or table", "table")
    .action(
      async (options: {
        clientId?: string;
        clientSecret?: string;
        format?: string;
        openBrowser?: boolean;
        scope?: string;
        port: string;
      }) => {
        loadLocalDotenv([process.cwd(), cliSourceDirectory]);
        const tokens = await mintLinkedInAccessToken({
          clientId: resolveRequiredEnv(options.clientId, "LINKEDIN_CLIENT_ID"),
          clientSecret: resolveRequiredEnv(
            options.clientSecret,
            "LINKEDIN_CLIENT_SECRET"
          ),
          openBrowser: options.openBrowser,
          port: parseOptionalPositiveInteger(options.port, "--port"),
          ...(options.scope === undefined
            ? {}
            : {
                scopes: options.scope
                  .split(",")
                  .map((scope) => scope.trim())
                  .filter((scope) => scope.length > 0),
              }),
        });
        const result = {
          ...tokens,
          expires_at: Date.now() + tokens.expires_in * 1000,
        };
        writeOutput(renderOutput(result, options.format));
      }
    );
  return token;
}

function createCampaignGroupsCommand(): Command {
  const groups = new Command("campaign-groups").description(
    "LinkedIn campaign group commands"
  );
  groups
    .command("list")
    .description("List LinkedIn campaign groups")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "json or table", "table")
    .action(async (options: LinkedInOptions) => {
      const result =
        await createLocalLinkedInAdsClient(options).listCampaignGroups();
      writeOutput(renderOutput(result, options.format));
    });
  groups
    .command("create")
    .description("Create a LinkedIn campaign group")
    .requiredOption("--name <name>", "Campaign group name")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action(async (options: MutationOptions & { name: string }) => {
      const input = { name: options.name, status: "ACTIVE" as const };
      await runSimpleMutation(options, {
        command: "linkedin ads campaign-groups create",
        input,
        operation: { createCampaignGroup: input },
        run: (client) => client.createCampaignGroup(input),
      });
    });
  return groups;
}

async function runPerformance(options: PerformanceOptions): Promise<void> {
  const { since, until } = resolveDateRange(options);
  const client = createLocalLinkedInAdsClient(options);
  const campaignId = options.campaignName
    ? await findCampaignId(client, options.campaignName)
    : options.campaignId;
  if (options.campaignName && !campaignId) {
    throw new Error(`Campaign not found: ${options.campaignName}`);
  }
  const campaignPage = options.all
    ? await client.listCampaigns({ statuses: ["ACTIVE", "PAUSED"] })
    : undefined;
  const campaignIds = campaignPage?.campaigns.map((campaign) => campaign.id);
  const rows = await client.getAnalytics({
    campaigns: campaignIds ?? (campaignId ? [campaignId] : undefined),
    creatives: options.creativeId ? [options.creativeId] : undefined,
    pivot: parsePivot(options.pivot),
    since,
    until,
  });
  const metrics = summarizeLinkedInAnalytics(rows);
  const result = {
    campaigns: campaignPage?.campaigns,
    comparison: options.vsTargets ? compareLinkedInTargets(metrics) : undefined,
    fatigue: options.checkFatigue
      ? detectLinkedInCreativeFatigue(rows)
      : undefined,
    metrics,
    rows,
  };
  writeOutput(renderOutput(result, options.format));
}

async function findCampaignId(
  client: LinkedInAdsClient,
  name: string
): Promise<string | undefined> {
  let start = 0;
  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- campaign name resolution follows paginated provider results.
    const page = await client.listCampaigns({ count: 100, start });
    const match = page.campaigns.find((campaign) => campaign.name === name);
    if (match) {
      return match.id;
    }
    start += page.campaigns.length;
    if (page.campaigns.length === 0 || start >= page.total) {
      return undefined;
    }
  } while (start > 0);
  return undefined;
}

function summarizeLinkedInAnalytics(
  rows: Awaited<ReturnType<LinkedInAdsClient["getAnalytics"]>>
) {
  const metrics = {
    clicks: 0,
    costPerLead: 0,
    formFillRate: 0,
    impressions: 0,
    leads: 0,
    opens: 0,
    spend: 0,
  };
  for (const row of rows) {
    metrics.clicks += row.clicks ?? 0;
    metrics.impressions += row.impressions ?? 0;
    metrics.leads += row.oneClickLeads ?? 0;
    metrics.opens += row.oneClickLeadFormOpens ?? 0;
    metrics.spend += Number(row.costInLocalCurrency ?? 0);
  }
  metrics.costPerLead = metrics.leads ? metrics.spend / metrics.leads : 0;
  metrics.formFillRate = metrics.opens ? metrics.leads / metrics.opens : 0;
  return {
    ...metrics,
    ctr: metrics.impressions ? metrics.clicks / metrics.impressions : 0,
  };
}

function compareLinkedInTargets(
  metrics: ReturnType<typeof summarizeLinkedInAnalytics>
) {
  const comparison = {
    costPerLead: {
      actual: metrics.costPerLead,
      status: metrics.costPerLead <= 15 ? "on_target" : "above_target",
      target: 15,
    },
    ctr: {
      actual: metrics.ctr,
      status: metrics.ctr >= 0.005 ? "on_target" : "below_target",
      target: 0.005,
    },
    formFillRate: {
      actual: metrics.formFillRate,
      status: metrics.formFillRate >= 0.25 ? "on_target" : "below_target",
      target: 0.25,
    },
  };
  const scores = [
    Math.min((15 / metrics.costPerLead) * 100, 100),
    Math.min((metrics.ctr / 0.005) * 100, 100),
    Math.min((metrics.formFillRate / 0.25) * 100, 100),
  ].map((score) => (Number.isFinite(score) ? score : 0));
  return {
    ...comparison,
    healthScore: Math.round(
      scores.reduce((total, score) => total + score, 0) / scores.length
    ),
  };
}

async function runCampaignDeploy(
  options: MutationOptions & {
    brief?: string;
    campaignGroup?: string;
    input?: string;
    maxCreatives?: string;
    privacyPolicyUrl?: string;
    status?: string;
  }
): Promise<void> {
  if (options.brief) {
    await runBriefDeploy({ ...options, brief: options.brief });
    return;
  }
  if (!options.input) {
    throw new Error("Pass --input <json> or --brief <html>.");
  }
  const input = readInputFile(options.input, linkedInCampaignInputSchema);
  await runSimpleMutation(options, {
    command: "linkedin ads campaigns deploy",
    input,
    inputFile: options.input,
    operation: { createCampaign: input },
    run: (client) => client.createCampaign(input),
  });
}

async function runBriefDeploy(
  options: MutationOptions & {
    brief: string;
    campaignGroup?: string;
    maxCreatives?: string;
    privacyPolicyUrl?: string;
    status?: string;
  }
): Promise<void> {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
  const campaignGroup = options.campaignGroup?.trim();
  if (!campaignGroup) {
    throw new Error("--campaign-group is required with --brief.");
  }
  const privacyPolicyUrl = options.privacyPolicyUrl?.trim();
  if (!privacyPolicyUrl) {
    throw new Error("--privacy-policy-url is required with --brief.");
  }
  const brief = parseLinkedInCampaignBrief(
    readFileSync(options.brief, "utf-8"),
    path.dirname(options.brief)
  );
  const plan = buildLinkedInBriefDeploymentPlan({
    brief,
    campaignGroup,
    maxCreatives: parseOptionalPositiveInteger(
      options.maxCreatives,
      "--max-creatives"
    ),
    privacyPolicyUrl,
    status: parseBoostStatus(options.status),
  });
  const validatedAssets = options.execute
    ? new Map(
        plan.concepts.map(({ image }) => {
          const bytes = readFileSync(image);
          return [
            image,
            {
              bytes,
              contentType: imageContentType(image),
              sha256: createHash("sha256").update(bytes).digest("hex"),
            },
          ] as const;
        })
      )
    : undefined;
  const command = "linkedin ads campaigns deploy";
  const resumeKey = linkedInResumeKey(command, {
    account: linkedInResumeAccount(options),
    assets: plan.concepts.map(({ image }) => ({
      image,
      sha256: validatedAssets?.get(image)?.sha256 ?? fileHash(image),
    })),
    plan,
  });
  const resumeReceipt = readLatestLinkedInReceipt(
    options.runLogDir ?? defaultRunLogDir,
    command,
    resumeKey
  );
  const operationId = resumeReceipt?.operationId ?? `cli-${randomUUID()}`;
  await runCliMutationHarness({
    command,
    createClient: () => createLocalLinkedInAdsClient(options),
    execute: options.execute,
    format: options.format,
    input: brief,
    inputFile: options.brief,
    localPlan: plan,
    logOperations: (result) => [asRecord(result).plan ?? plan],
    logResult: (result) => flattenLinkedInLog(result, resumeKey),
    operations: [plan],
    output: writeOutput,
    presentation: linkedInHarnessPresentation,
    provider: "linkedin-ads",
    run: (client) =>
      deployLinkedInBriefResumable({
        client,
        options: {
          operationId,
          ...(resumeReceipt ? { resumeReceipt } : {}),
        },
        plan,
        resolveImage: (imagePath) => {
          const asset = validatedAssets?.get(imagePath);
          if (!asset) {
            throw new Error(
              `LinkedIn brief asset was not preflighted: ${imagePath}`
            );
          }
          return Promise.resolve(asset);
        },
      }),
    runLogDir: options.runLogDir ?? defaultRunLogDir,
    validation: "local",
  });
}

function createBriefsCommand(): Command {
  const briefs = new Command("briefs").description(
    "LinkedIn campaign brief tools"
  );
  briefs
    .command("parse")
    .description("Parse a campaign-intel HTML brief")
    .requiredOption("--input <path>", "Path to HTML brief")
    .option("--output <path>", "Write parsed JSON to a file")
    .option("--format <format>", "json or table", "json")
    .action((options: { format?: string; input: string; output?: string }) => {
      const parsed = parseLinkedInCampaignBrief(
        readFileSync(options.input, "utf-8"),
        path.dirname(options.input)
      );
      const output = `${JSON.stringify(parsed, null, 2)}\n`;
      if (options.output) {
        writeFileSync(options.output, output);
      }
      writeOutput(renderOutput(parsed, options.format));
    });
  return briefs;
}

function imageContentType(
  filePath: string
): "image/gif" | "image/jpeg" | "image/png" {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  throw new Error(`Unsupported LinkedIn image type: ${extension || "none"}.`);
}

async function runBoost(options: BoostOptions): Promise<void> {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
  const clientInput: BoostLinkedInPostInput = {
    campaignGroup: options.campaignGroup,
    campaignName: options.name,
    dailyBudget: parseOptionalPositiveNumber(
      options.dailyBudget,
      "--daily-budget"
    ),
    days: parseOptionalPositiveInteger(options.days, "--days"),
    organizationUrn: options.organizationUrn,
    objectiveType: options.objective,
    postUrn: options.postUrn,
    status: parseBoostStatus(options.status),
    targetingCriteria: buildBoostTargeting(options.geo),
    totalBudget: parseOptionalPositiveNumber(
      options.totalBudget,
      "--total-budget"
    ),
  };
  const plan = buildBoostPostPlan(
    clientInput,
    resolveRequiredEnv(options.adAccountId, "LINKEDIN_AD_ACCOUNT_ID")
  );
  const command = "linkedin ads boosts create";
  const resumeKey = linkedInResumeKey(command, {
    account: linkedInResumeAccount(options),
    input: clientInput,
  });
  const resumeReceipt = readLatestLinkedInReceipt(
    options.runLogDir ?? defaultRunLogDir,
    command,
    resumeKey
  );
  const operationId = resumeReceipt?.operationId ?? `cli-${randomUUID()}`;
  await runCliMutationHarness({
    command,
    createClient: () => createLocalLinkedInAdsClient(options),
    execute: options.execute,
    format: options.format,
    input: clientInput,
    localPlan: plan,
    logOperations: (result) => [asRecord(result).plan ?? plan],
    logResult: (result) => flattenLinkedInLog(result, resumeKey),
    operations: [plan],
    output: writeOutput,
    presentation: linkedInHarnessPresentation,
    provider: "linkedin-ads",
    run: (client) =>
      deployLinkedInBoostResumable({
        client,
        options: {
          operationId,
          ...(resumeReceipt ? { resumeReceipt } : {}),
        },
        plan,
      }),
    runLogDir: options.runLogDir ?? defaultRunLogDir,
    validation: "local",
  });
}

async function runLeadFormCreate(
  options: MutationOptions & { input: string }
): Promise<void> {
  const input = readInputFile(options.input, linkedInLeadFormInputSchema);
  await runSimpleMutation(options, {
    command: "linkedin ads leads forms create",
    input,
    inputFile: options.input,
    operation: { createLeadForm: input },
    run: (client) => client.createLeadForm(input),
  });
}

async function runCampaignPause(
  options: MutationOptions & { campaignId: string }
): Promise<void> {
  const input: UpdateLinkedInCampaignInput = { status: "PAUSED" };
  await runSimpleMutation(options, {
    command: "linkedin ads optimization pause",
    input: { campaignId: options.campaignId, ...input },
    operation: { pauseCampaign: options.campaignId },
    run: (client) => client.pauseCampaign(options.campaignId),
  });
}

async function runSimpleMutation<Input>(
  options: MutationOptions,
  definition: {
    command: string;
    input: Input;
    inputFile?: string;
    operation: unknown;
    run: (client: LinkedInAdsClient) => Promise<unknown>;
    validate?: (input: Input) => void;
  }
): Promise<void> {
  definition.validate?.(definition.input);
  await runCliMutationHarness({
    command: definition.command,
    createClient: () => createLocalLinkedInAdsClient(options),
    execute: options.execute,
    format: options.format,
    input: definition.input,
    inputFile: definition.inputFile,
    localPlan: definition.operation,
    logResult: flattenLinkedInSimpleLog,
    operations: [definition.operation],
    output: writeOutput,
    presentation: linkedInHarnessPresentation,
    provider: "linkedin-ads",
    run: (client) => definition.run(client),
    runLogDir: options.runLogDir ?? defaultRunLogDir,
    validation: "local",
  });
}

function createLocalLinkedInAdsClient(
  options: LinkedInOptions
): LinkedInAdsClient {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
  return createLinkedInAdsClient({
    accessToken: resolveRequiredEnv(
      options.accessToken,
      "LINKEDIN_ACCESS_TOKEN"
    ),
    adAccountId: resolveRequiredEnv(
      options.adAccountId,
      "LINKEDIN_AD_ACCOUNT_ID"
    ),
  });
}

function linkedInResumeKey(command: string, input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ command, input }))
    .digest("hex");
}

function linkedInResumeAccount(options: LinkedInOptions): string {
  return (
    options.adAccountId?.trim() ||
    process.env.LINKEDIN_AD_ACCOUNT_ID?.trim() ||
    "unspecified"
  );
}

function fileHash(filePath: string): string {
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return "unavailable";
  }
}

function readLatestLinkedInReceipt(
  runLogDir: string,
  command: string,
  resumeKey: string
): LinkedInDeploymentReceipt | undefined {
  let files: string[];
  try {
    files = readdirSync(runLogDir)
      .flatMap((file) =>
        file.endsWith(".json") ? [path.join(runLogDir, file)] : []
      )
      .toSorted(
        (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs
      );
  } catch {
    return undefined;
  }
  for (const file of files) {
    try {
      const log = asRecord(JSON.parse(readFileSync(file, "utf-8")));
      if (log.command !== command) {
        continue;
      }
      const result = asRecord(log.result);
      if (result.resumeKey !== resumeKey) {
        continue;
      }
      const receipt = result.receipt as LinkedInDeploymentReceipt | undefined;
      return receipt?.status === "succeeded" ? undefined : receipt;
    } catch {
      // Ignore unrelated or malformed historical logs.
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function flattenLinkedInLog(
  input: {
    lifecycle: string;
    result: unknown;
  },
  resumeKey: string
): unknown {
  return { lifecycle: input.lifecycle, resumeKey, ...asRecord(input.result) };
}

function flattenLinkedInSimpleLog(input: {
  lifecycle: string;
  result: unknown;
}): unknown {
  const result = asRecord(input.result);
  return Object.keys(result).length > 0
    ? { lifecycle: input.lifecycle, ...result }
    : { lifecycle: input.lifecycle, providerResult: input.result };
}

function linkedInHarnessPresentation(input: {
  lifecycle: string;
  result: unknown;
  runLogPath: string;
}): unknown {
  return {
    lifecycle: input.lifecycle,
    result: input.result,
    runLogPath: input.runLogPath,
  };
}

function resolveDateRange(options: {
  days?: string;
  since?: string;
  until?: string;
}) {
  if (options.since || options.until) {
    const untilDate = options.until
      ? parseCalendarDate(options.until)
      : new Date();
    const days =
      options.since && options.until
        ? 1
        : (parseOptionalPositiveInteger(options.days ?? "30", "--days") ?? 30);
    const sinceDate = options.since
      ? parseCalendarDate(options.since)
      : new Date(untilDate.getTime() - (days - 1) * 86_400_000);
    const since = untilDateString(sinceDate);
    const until = untilDateString(untilDate);
    if (since > until) {
      throw new Error("--since must be on or before --until.");
    }
    return {
      since: parseLinkedInDate(since),
      until: parseLinkedInDate(until),
    };
  }
  const days =
    parseOptionalPositiveInteger(options.days ?? "30", "--days") ?? 30;
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  return {
    since: parseLinkedInDate(untilDateString(since)),
    until: parseLinkedInDate(untilDateString(until)),
  };
}

function parseLinkedInDate(value: string) {
  parseCalendarDate(value);
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) {
    throw new Error("Dates must use YYYY-MM-DD.");
  }
  return {
    day: Number(match.groups.day),
    month: Number(match.groups.month),
    year: Number(match.groups.year),
  };
}

function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("Dates must use YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error("Dates must be valid calendar dates.");
  }
  return date;
}

async function downloadAllLeadFormResponses(
  client: LinkedInAdsClient,
  input: {
    formId: string;
    limit?: number;
    submittedAfter?: number;
    submittedBefore?: number;
  }
) {
  const limit = input.limit ?? 1000;
  const count = Math.min(100, limit);
  const leads: LinkedInLeadFormResponse[] = [];
  let start = 0;
  let total = 0;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- CLI API mutations are intentionally serialized for deterministic review and rate limits (#507).
    const page = await client.getLeadFormResponses({
      ...input,
      count,
      start,
    });
    leads.push(...page.leads);
    ({ total } = page);
    if (page.leads.length === 0) {
      break;
    }
    start += page.leads.length;
  } while (leads.length < total && leads.length < limit && start > 0);

  return { leads: leads.slice(0, limit), total };
}

async function findLeadFormId(
  client: LinkedInAdsClient,
  name: string
): Promise<string | undefined> {
  const { forms } = await listAllLeadForms(client);
  return forms.find((form) => form.name === name)?.id;
}

function renderLeadsCsv(leads: LinkedInLeadFormResponse[]): string {
  const rows = leads.map((lead) => flattenLead(lead));
  return `${renderSpreadsheetCsv(rows, { quoteHeaders: true })}\n`;
}

function flattenLead(lead: LinkedInLeadFormResponse): Record<string, unknown> {
  return {
    id: lead.id,
    submittedAt: lead.submittedAt,
    ...lead.answers,
  };
}

async function listAllLeadForms(client: LinkedInAdsClient) {
  const count = 100;
  const forms: LinkedInLeadForm[] = [];
  let start = 0;
  let total = 0;

  do {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- CLI API mutations are intentionally serialized for deterministic review and rate limits (#507).
    const page = await client.listLeadForms({ count, start });
    forms.push(...page.forms);
    ({ total } = page);
    if (page.forms.length === 0) {
      break;
    }
    start += page.forms.length;
  } while (forms.length < total && start > 0);

  return { forms, total };
}

function parseBoostStatus(
  value: string | undefined
): LinkedInCampaignStatus | undefined {
  if (
    value === undefined ||
    value === "ACTIVE" ||
    value === "DRAFT" ||
    value === "PAUSED"
  ) {
    return value;
  }
  throw new Error("--status must be DRAFT, PAUSED, or ACTIVE.");
}

function buildBoostTargeting(geo = "us") {
  const geographies: Record<string, string> = {
    california: "urn:li:geo:102095887",
    "new-york": "urn:li:geo:105080838",
    texas: "urn:li:geo:102748797",
    us: "urn:li:geo:103644278",
  };
  const location = geographies[geo.toLowerCase()];
  if (!location) {
    throw new Error("--geo must be us, california, new-york, or texas.");
  }
  return {
    includedTargetingFacets: {
      interfaceLocales: ["urn:li:locale:en_US"],
      locations: [location],
    },
  };
}

function parsePivot(value: string): LinkedInAnalyticsPivot {
  if (value === "CAMPAIGN" || value === "CREATIVE") {
    return value;
  }
  throw new Error("--pivot must be CAMPAIGN or CREATIVE.");
}

function readInputFile<Input>(
  filePath: string,
  schema: z.ZodType<Input>
): Input {
  const result = schema.safeParse(JSON.parse(readFileSync(filePath, "utf-8")));
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${issuePath}: ${issue.message}`;
    });
    throw new Error(`Invalid input file:\n${messages.join("\n")}`);
  }
  return result.data;
}

function resolveRequiredEnv(value: string | undefined, name: string): string {
  const resolved = value?.trim() || process.env[name]?.trim();
  if (!resolved) {
    throw new Error(`Missing ${name}. Pass the option or set ${name}.`);
  }
  return resolved;
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  optionName: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/u.test(value)) {
    throw new TypeError(`${optionName} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parseOptionalPositiveNumber(
  value: string | undefined,
  optionName: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(`${optionName} must be a positive number.`);
  }
  return parsed;
}

function parseAllocation(
  value: string | undefined,
  optionName: string
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new TypeError(`${optionName} must be between 0 and 1.`);
  }
  return parsed;
}

function renderOutput(value: unknown, format = "table"): string {
  if (format === "json") {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (Array.isArray(value)) {
    return `${value.map((item) => JSON.stringify(item)).join("\n")}\n`;
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function untilDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function writeOutput(value: string): void {
  process.stdout.write(value);
}
