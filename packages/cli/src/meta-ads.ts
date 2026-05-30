import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBoostPostPlan,
  createMetaAdsClient,
  type BoostPostInput,
  type CreateAdInput,
  type CreateAdSetInput,
  type CreateCampaignInput,
  type CreateCustomAudienceInput,
  type CreateLookalikeAudienceInput,
  type MetaAdsClient,
  type MetaAdsInsight,
  type MetaAdsInsightLevel,
  type MetaCampaignStatus,
  type ReachEstimateInput,
  type SendConversionEventsInput,
  type SyncAudienceUsersInput,
} from "@patronage/meta-ads";
import { Command } from "commander";

import { loadLocalDotenv } from "./local-env.js";
import { writeRunLog } from "./run-log.js";

const cliSourceDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRunLogDir = ".patronage/run-logs/meta-ads";

type Mode = "execute" | "validate";

interface MetaAdsCommandOptions {
  accessToken?: string;
  adAccountId?: string;
  appSecretProof?: string;
  format?: string;
}

interface MutationOptions extends MetaAdsCommandOptions {
  execute?: boolean;
  runLogDir?: string;
}

interface PerformanceOptions extends MetaAdsCommandOptions {
  breakdown?: string;
  campaignId?: string;
  days?: string;
  level: MetaAdsInsightLevel;
  since?: string;
  until?: string;
}

interface DeployOptions extends MutationOptions {
  input: string;
}

interface BoostOptions extends MutationOptions {
  budget: string;
  days: string;
  instagramMediaId?: string;
  instagramUserId?: string;
  name?: string;
  pageId: string;
  platform?: "all" | "auto" | "facebook" | "instagram";
  postId?: string;
  specialAdCategories?: string;
  status?: MetaCampaignStatus;
}

export function createMetaAdsCommand(): Command {
  const ads = new Command("ads").description("Meta Ads commands");

  const campaigns = new Command("campaigns").description(
    "Meta Ads campaign commands"
  );
  campaigns
    .command("performance")
    .description("Fetch campaign, ad set, or ad insights")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--app-secret-proof <proof>", "Meta appsecret_proof")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--level <level>", "campaign, adset, or ad", "campaign")
    .option("--breakdown <name>", "Meta insights breakdown")
    .option("--days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--format <format>", "json or table", "table")
    .action((options: PerformanceOptions) => runPerformance(options));
  campaigns
    .command("deploy")
    .description("Create a campaign/ad-set/ad sequence from a JSON plan")
    .requiredOption("--input <path>", "Path to deployment JSON")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--app-secret-proof <proof>", "Meta appsecret_proof")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: DeployOptions) => runDeploy(options));
  ads.addCommand(campaigns);

  const boosts = new Command("boosts").description("Meta boost commands");
  boosts
    .command("create")
    .description("Create a paid boost for an existing Page or Instagram post")
    .requiredOption("--page-id <id>", "Meta Page ID")
    .option("--post-id <id>", "Facebook Page post ID")
    .option("--instagram-media-id <id>", "Instagram media ID")
    .option("--instagram-user-id <id>", "Instagram Business user ID")
    .option("--budget <amount>", "Total budget in USD", "50")
    .option("--days <number>", "Number of days to run", "1")
    .option("--platform <choice>", "auto, facebook, instagram, or all", "auto")
    .option("--status <status>", "PAUSED or ACTIVE", "PAUSED")
    .option("--special-ad-categories <csv>", "Comma-separated categories")
    .option("--name <name>", "Custom campaign name")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--app-secret-proof <proof>", "Meta appsecret_proof")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: BoostOptions) => runBoost(options));
  ads.addCommand(boosts);

  ads.addCommand(createAudiencesCommand());
  ads.addCommand(createConversionsCommand());
  ads.addCommand(createLeadsCommand());
  ads.addCommand(createTokenCommand());
  ads.addCommand(createOptimizationCommand());

  return ads;
}

function createAudiencesCommand(): Command {
  const audiences = new Command("audiences").description(
    "Meta custom audience commands"
  );
  audiences
    .command("list")
    .description("List custom audiences")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--format <format>", "json or table", "table")
    .action(async (options: MetaAdsCommandOptions) => {
      const rows =
        await createLocalMetaAdsClient(options).listCustomAudiences();
      writeOutput(renderOutput(rows, options.format));
    });
  audiences
    .command("create-custom")
    .description("Create a custom audience from a JSON input")
    .requiredOption("--input <path>", "Path to custom audience JSON")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { input: string }) =>
      runAudienceCreateCustom(options)
    );
  audiences
    .command("create-lookalike")
    .description("Create a lookalike audience from a JSON input")
    .requiredOption("--input <path>", "Path to lookalike audience JSON")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { input: string }) =>
      runAudienceCreateLookalike(options)
    );
  audiences
    .command("delete")
    .description("Delete a custom audience")
    .requiredOption("--audience-id <id>", "Custom audience ID")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { audienceId: string }) =>
      runAudienceDelete(options)
    );
  audiences
    .command("sync-users")
    .description("Sync pre-hashed user rows to a custom audience")
    .requiredOption("--audience-id <id>", "Custom audience ID")
    .requiredOption("--input <path>", "Path to pre-hashed audience JSON")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action(
      (options: MutationOptions & { audienceId: string; input: string }) =>
        runAudienceSyncUsers(options)
    );
  audiences
    .command("reach-estimate")
    .description("Estimate reach for a targeting JSON input")
    .requiredOption("--input <path>", "Path to reach estimate JSON")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--format <format>", "json or table", "table")
    .action(async (options: MetaAdsCommandOptions & { input: string }) => {
      const input = readJson<ReachEstimateInput>(options.input);
      const result =
        await createLocalMetaAdsClient(options).getAdSetReachEstimate(input);
      writeOutput(renderOutput(result, options.format));
    });
  return audiences;
}

function createConversionsCommand(): Command {
  const conversions = new Command("conversions").description(
    "Meta Conversions API commands"
  );
  conversions
    .command("send")
    .description("Send conversion events from a JSON input")
    .requiredOption("--pixel-id <id>", "Meta Pixel ID")
    .requiredOption("--input <path>", "Path to conversion events JSON")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--execute", "Send live events", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { input: string; pixelId: string }) =>
      runConversionsSend(options)
    );
  conversions
    .command("test")
    .description("Send a PageView test event")
    .requiredOption("--pixel-id <id>", "Meta Pixel ID")
    .requiredOption("--code <code>", "Meta test event code")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--execute", "Send live test event", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { code: string; pixelId: string }) =>
      runConversionsTest(options)
    );
  return conversions;
}

function createLeadsCommand(): Command {
  const leads = new Command("leads").description("Meta Lead Ads commands");
  const forms = new Command("forms").description("Meta lead form commands");
  forms
    .command("list")
    .description("List lead forms for a Page")
    .requiredOption("--page-id <id>", "Meta Page ID")
    .option("--page-access-token <token>", "Meta Page access token")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--format <format>", "json or table", "table")
    .action(
      async (
        options: MetaAdsCommandOptions & {
          pageAccessToken?: string;
          pageId: string;
        }
      ) => {
        const pageAccessToken = resolvePageAccessToken(options.pageAccessToken);
        const result = await createLocalMetaAdsClient(options, {
          fallbackAccessToken: pageAccessToken,
          requireAdAccount: false,
        }).listLeadForms({
          pageAccessToken,
          pageId: options.pageId,
        });
        writeOutput(renderOutput(result, options.format));
      }
    );
  leads.addCommand(forms);
  leads
    .command("retrieve")
    .description("Retrieve leads for a form")
    .requiredOption("--form-id <id>", "Lead form ID")
    .option("--page-access-token <token>", "Meta Page access token")
    .option("--since <unix>", "Unix timestamp lower bound")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--format <format>", "json or table", "table")
    .action(
      async (
        options: MetaAdsCommandOptions & {
          formId: string;
          pageAccessToken?: string;
          since?: string;
        }
      ) => {
        const pageAccessToken = resolvePageAccessToken(options.pageAccessToken);
        const result = await createLocalMetaAdsClient(options, {
          fallbackAccessToken: pageAccessToken,
          requireAdAccount: false,
        }).getLeads({
          formId: options.formId,
          pageAccessToken,
          since: options.since,
        });
        writeOutput(renderOutput(result, options.format));
      }
    );
  return leads;
}

function createTokenCommand(): Command {
  const token = new Command("token").description(
    "Meta token and account utilities"
  );
  token
    .command("exchange")
    .description("Exchange a short-lived user token")
    .argument("<short-lived-token>")
    .option("--app-id <id>", "Meta app ID")
    .option("--app-secret <secret>", "Meta app secret")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--format <format>", "json or env", "json")
    .action(
      async (
        shortLivedToken: string,
        options: MetaAdsCommandOptions & { appId?: string; appSecret?: string }
      ) => {
        const result = await createLocalMetaAdsUtilityClient(
          options.accessToken ?? shortLivedToken
        ).exchangeLongLivedUserToken({
          appId: resolveRequiredEnv(options.appId, "META_APP_ID"),
          appSecret: resolveRequiredEnv(options.appSecret, "META_APP_SECRET"),
          shortLivedToken,
        });
        writeOutput(
          options.format === "env"
            ? `META_ACCESS_TOKEN=${result.access_token}\n`
            : renderOutput(result, options.format)
        );
      }
    );
  token
    .command("inspect")
    .description("Inspect a Meta user token")
    .argument("[token]")
    .option("--app-id <id>", "Meta app ID")
    .option("--app-secret <secret>", "Meta app secret")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--format <format>", "json or table", "table")
    .action(
      async (
        tokenValue: string | undefined,
        options: MetaAdsCommandOptions & { appId?: string; appSecret?: string }
      ) => {
        const tokenToInspect = resolveRequiredEnv(
          tokenValue ?? options.accessToken,
          "META_ACCESS_TOKEN"
        );
        const result = await createLocalMetaAdsUtilityClient(
          tokenToInspect
        ).inspectToken({
          appId: resolveRequiredEnv(options.appId, "META_APP_ID"),
          appSecret: resolveRequiredEnv(options.appSecret, "META_APP_SECRET"),
          token: tokenToInspect,
        });
        writeOutput(renderOutput(result, options.format));
      }
    );
  token
    .command("accounts")
    .description("List managed Pages for a user token")
    .argument("[token]")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--client-id <id>", "Client ID for generated env aliases")
    .option("--page-id <id>", "Page ID for generated client-scoped env alias")
    .option("--show-tokens", "Include full page tokens", false)
    .option("--format <format>", "json or env", "json")
    .action(
      async (
        tokenValue: string | undefined,
        options: MetaAdsCommandOptions & {
          clientId?: string;
          pageId?: string;
          showTokens?: boolean;
        }
      ) => {
        const accessToken = resolveRequiredEnv(
          tokenValue ?? options.accessToken,
          "META_ACCESS_TOKEN"
        );
        const pages = await createLocalMetaAdsUtilityClient(
          accessToken
        ).listManagedPages({
          accessToken,
        });
        if (options.format === "env") {
          if (!options.showTokens) {
            throw new Error("--format env requires --show-tokens.");
          }
          writeOutput(`${renderPageTokenEnv(pages, options)}\n`);
          return;
        }
        writeOutput(
          `${JSON.stringify(
            options.showTokens
              ? pages
              : pages.map((page) => ({
                  category: page.category,
                  fan_count: page.fan_count,
                  followers_count: page.followers_count,
                  id: page.id,
                  link: page.link,
                  name: page.name,
                })),
            null,
            2
          )}\n`
        );
      }
    );
  return token;
}

function createOptimizationCommand(): Command {
  const optimization = new Command("optimization").description(
    "Meta Ads optimization reads"
  );
  optimization
    .command("budget")
    .description("Summarize spend and CPA signals from insights")
    .option("--ad-account-id <id>", "Meta ad account ID, e.g. act_123")
    .option("--access-token <token>", "Meta access token")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--days <number>", "Lookback period in days", "7")
    .option("--format <format>", "json or table", "table")
    .action(async (options: PerformanceOptions) => {
      const { since, until } = resolveDateRange(options);
      const rows = await createLocalMetaAdsClient(options).getInsights({
        campaignId: options.campaignId,
        level: "adset",
        since,
        until,
      });
      const summary = rows.map((row) => ({
        adsetId: row.adset_id,
        adsetName: row.adset_name,
        cpa: firstActionValue(row.cost_per_action_type),
        frequency: row.frequency,
        spend: row.spend,
      }));
      writeOutput(renderOutput(summary, options.format));
    });
  return optimization;
}

async function runPerformance(options: PerformanceOptions): Promise<void> {
  const { since, until } = resolveDateRange(options);
  const rows = await createLocalMetaAdsClient(options).getInsights({
    appSecretProof: options.appSecretProof,
    breakdown: options.breakdown,
    campaignId: options.campaignId,
    level: parseInsightLevel(options.level),
    since,
    until,
  });
  writeOutput(
    options.format === "json"
      ? renderOutput(rows, "json")
      : renderInsightsTable(rows)
  );
}

async function runDeploy(options: DeployOptions): Promise<void> {
  const input = readJson<{
    adSets?: CreateAdSetInput[];
    ads?: CreateAdInput[];
    campaign: CreateCampaignInput;
  }>(options.input);
  const mode = resolveMode(options);
  const operations = [
    { createCampaign: input.campaign },
    ...(input.adSets ?? []).map((adSet) => ({ createAdSet: adSet })),
    ...(input.ads ?? []).map((ad) => ({ createAd: ad })),
  ];
  const result =
    mode === "execute"
      ? await executeDeploy(createLocalMetaAdsClient(options), input)
      : { plan: operations };

  writeLoggedMutation({
    command: "meta ads campaigns deploy",
    input,
    inputFile: options.input,
    mode,
    operations,
    options,
    result,
  });
}

async function runBoost(options: BoostOptions): Promise<void> {
  const input: BoostPostInput = {
    budget: parsePositiveNumber(options.budget, "--budget"),
    days: parsePositiveInteger(options.days, "--days"),
    instagramMediaId: options.instagramMediaId,
    instagramUserId: options.instagramUserId,
    name: options.name,
    pageId: options.pageId,
    platform: options.platform,
    postId: options.postId,
    specialAdCategories: parseCsv(options.specialAdCategories),
    status: options.status ?? "PAUSED",
  };
  const mode = resolveMode(options);
  const plan = buildBoostPostPlan(input);
  const result =
    mode === "execute"
      ? await createLocalMetaAdsClient(options).boostPost(input)
      : { plan };

  writeLoggedMutation({
    command: "meta ads boosts create",
    input,
    mode,
    operations: [plan],
    options,
    result,
  });
}

async function runAudienceCreateCustom(
  options: MutationOptions & { input: string }
): Promise<void> {
  const input = readJson<CreateCustomAudienceInput>(options.input);
  await runSimpleMutation(options, {
    command: "meta ads audiences create-custom",
    input,
    inputFile: options.input,
    operation: { createCustomAudience: input },
    run: (client) => client.createCustomAudience(input),
  });
}

async function runAudienceCreateLookalike(
  options: MutationOptions & { input: string }
): Promise<void> {
  const input = readJson<CreateLookalikeAudienceInput>(options.input);
  await runSimpleMutation(options, {
    command: "meta ads audiences create-lookalike",
    input,
    inputFile: options.input,
    operation: { createLookalikeAudience: input },
    run: (client) => client.createLookalikeAudience(input),
  });
}

async function runAudienceDelete(
  options: MutationOptions & { audienceId: string }
): Promise<void> {
  await runSimpleMutation(options, {
    command: "meta ads audiences delete",
    input: { audienceId: options.audienceId },
    operation: { deleteCustomAudience: options.audienceId },
    run: (client) => client.deleteCustomAudience(options.audienceId),
  });
}

async function runAudienceSyncUsers(
  options: MutationOptions & { audienceId: string; input: string }
): Promise<void> {
  const input = readJson<SyncAudienceUsersInput>(options.input);
  await runSimpleMutation(options, {
    command: "meta ads audiences sync-users",
    input: { audienceId: options.audienceId, ...input },
    inputFile: options.input,
    operation: { syncAudienceUsers: options.audienceId },
    run: (client) => client.syncAudienceUsers(options.audienceId, input),
  });
}

async function runConversionsSend(
  options: MutationOptions & { input: string; pixelId: string }
): Promise<void> {
  const input = readJson<SendConversionEventsInput>(options.input);
  await runSimpleMutation(options, {
    command: "meta ads conversions send",
    input: { pixelId: options.pixelId, ...input },
    inputFile: options.input,
    operation: { sendConversionEvents: options.pixelId },
    requireAdAccount: false,
    run: (client) =>
      client.sendConversionEvents({ events: input, pixelId: options.pixelId }),
  });
}

async function runConversionsTest(
  options: MutationOptions & { code: string; pixelId: string }
): Promise<void> {
  const input: SendConversionEventsInput = {
    events: [
      {
        action_source: "website",
        event_name: "PageView",
        event_source_url: "https://test.paitronage.com",
        event_time: Math.floor(Date.now() / 1000),
        user_data: {
          client_ip_address: "0.0.0.0",
          client_user_agent: "Paitronage/1.0 (Conversions API Test)",
        },
      },
    ],
    testEventCode: options.code,
  };
  await runSimpleMutation(options, {
    command: "meta ads conversions test",
    input: { pixelId: options.pixelId, ...input },
    operation: { sendTestEvent: options.pixelId },
    requireAdAccount: false,
    run: (client) =>
      client.sendConversionEvents({ events: input, pixelId: options.pixelId }),
  });
}

async function runSimpleMutation<Input>(
  options: MutationOptions,
  definition: {
    command: string;
    input: Input;
    inputFile?: string;
    operation: unknown;
    requireAdAccount?: boolean;
    run(client: MetaAdsClient): Promise<unknown>;
  }
): Promise<void> {
  const mode = resolveMode(options);
  const result =
    mode === "execute"
      ? await definition.run(
          createLocalMetaAdsClient(options, {
            requireAdAccount: definition.requireAdAccount ?? true,
          })
        )
      : { plan: definition.operation };
  writeLoggedMutation({
    command: definition.command,
    input: definition.input,
    inputFile: definition.inputFile,
    mode,
    operations: [definition.operation],
    options,
    result,
  });
}

async function executeDeploy(
  client: MetaAdsClient,
  input: {
    adSets?: CreateAdSetInput[];
    ads?: CreateAdInput[];
    campaign: CreateCampaignInput;
  }
): Promise<unknown> {
  const campaign = await client.createCampaign(input.campaign);
  const adSets = [];
  const adSetPlaceholders = new Map<string, string>();
  for (const [index, adSet] of (input.adSets ?? []).entries()) {
    const createdAdSet = await client.createAdSet({
      ...adSet,
      campaignId:
        adSet.campaignId === "$campaignId" ? campaign.id : adSet.campaignId,
    });
    adSets.push(createdAdSet);
    adSetPlaceholders.set(`$adSetId${index + 1}`, createdAdSet.id);
    if (index === 0) {
      adSetPlaceholders.set("$adSetId", createdAdSet.id);
    }
  }
  const ads = [];
  for (const ad of input.ads ?? []) {
    ads.push(
      await client.createAd({
        ...ad,
        adsetId: adSetPlaceholders.get(ad.adsetId) ?? ad.adsetId,
      })
    );
  }
  return { ads, adSets, campaign };
}

function createLocalMetaAdsClient(
  options: MetaAdsCommandOptions,
  config: {
    fallbackAccessToken?: string;
    requireAdAccount?: boolean;
  } = {}
): MetaAdsClient {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
  const requireAdAccount = config.requireAdAccount ?? true;
  const envAccessToken = readOptionalEnv("META_ACCESS_TOKEN");
  const optionAccessToken = options.accessToken?.trim() || undefined;
  const fallbackAccessToken = config.fallbackAccessToken?.trim() || undefined;
  const accessToken =
    optionAccessToken ?? fallbackAccessToken ?? envAccessToken ?? "";
  const adAccountId = requireAdAccount
    ? normalizeAdAccountId(
        resolveRequiredEnv(options.adAccountId, "META_AD_ACCOUNT_ID")
      )
    : normalizeAdAccountId(
        options.adAccountId?.trim() ??
          readOptionalEnv("META_AD_ACCOUNT_ID") ??
          "act_0"
      );
  return createMetaAdsClient({
    accessToken: resolveRequiredEnv(accessToken, "META_ACCESS_TOKEN"),
    adAccountId,
    appSecretProof:
      options.appSecretProof ??
      (fallbackAccessToken
        ? undefined
        : readOptionalEnv("META_APPSECRET_PROOF")),
  });
}

function createLocalMetaAdsUtilityClient(accessToken: string): MetaAdsClient {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
  return createMetaAdsClient({
    accessToken: resolveRequiredEnv(accessToken, "META_ACCESS_TOKEN"),
    adAccountId: "act_0",
  });
}

function writeLoggedMutation(input: {
  command: string;
  input: unknown;
  inputFile?: string;
  mode: Mode;
  operations: unknown[];
  options: MutationOptions;
  result: unknown;
}): void {
  const runLog = writeRunLog({
    command: input.command,
    input: input.input,
    inputFile: input.inputFile,
    mode: input.mode,
    operations: input.operations,
    provider: "meta-ads",
    result: input.result,
    runLogDir: input.options.runLogDir ?? defaultRunLogDir,
  });
  writeOutput(
    input.options.format === "json"
      ? `${JSON.stringify({ result: input.result, runLogPath: runLog.path }, null, 2)}\n`
      : `${input.mode === "execute" ? "Executed" : "Validated"} ${input.command}\nRun log: ${runLog.path}\n${JSON.stringify(input.result, null, 2)}\n`
  );
}

function resolveMode(options: MutationOptions): Mode {
  return options.execute ? "execute" : "validate";
}

function resolveDateRange(options: {
  days?: string;
  since?: string;
  until?: string;
}) {
  const days = parsePositiveInteger(options.days ?? "30", "--days");
  if (options.since || options.until) {
    const untilDate = options.until
      ? parseCalendarDate(options.until, "--until")
      : new Date();
    const sinceDate = options.since
      ? parseCalendarDate(options.since, "--since")
      : new Date(untilDate.getTime() - (days - 1) * 86_400_000);
    const since = untilDateString(sinceDate);
    const until = untilDateString(untilDate);
    if (since > until) {
      throw new Error("--since must be on or before --until.");
    }
    return { since, until };
  }

  const untilDate = new Date();
  const sinceDate = new Date(untilDate.getTime() - (days - 1) * 86_400_000);
  return {
    since: untilDateString(sinceDate),
    until: untilDateString(untilDate),
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function resolveRequiredEnv(value: string | undefined, name: string): string {
  const resolved = value?.trim() || readOptionalEnv(name);
  if (!resolved) {
    throw new Error(`Missing ${name}. Pass the option or set ${name}.`);
  }
  return resolved;
}

function resolvePageAccessToken(value: string | undefined): string {
  const activeClient = readOptionalEnv("ACTIVE_CLIENT");
  const activeClientToken = activeClient
    ? readOptionalEnv(`META_PAGE_ACCESS_TOKEN_${slugEnv(activeClient)}`)
    : undefined;
  return resolveRequiredEnv(
    value ?? activeClientToken,
    "META_PAGE_ACCESS_TOKEN"
  );
}

function renderPageTokenEnv(
  pages: { access_token?: string; id: string; name: string }[],
  options: { clientId?: string; pageId?: string }
): string {
  const lines: string[] = [];
  const tokenPages = pages.filter((page) => page.access_token);
  const clientId = options.clientId ?? readOptionalEnv("ACTIVE_CLIENT");
  let clientPage: (typeof tokenPages)[number] | undefined;
  if (clientId) {
    if (!options.pageId) {
      throw new Error(
        "--page-id is required with --client-id or ACTIVE_CLIENT when generating env output."
      );
    }
    clientPage = tokenPages.find((page) => page.id === options.pageId);
    if (!clientPage) {
      throw new Error(`No page token found for --page-id ${options.pageId}.`);
    }
  }

  if (clientId && clientPage?.access_token) {
    lines.push(
      `META_PAGE_ACCESS_TOKEN_${slugEnv(clientId)}=${clientPage.access_token}`
    );
  }

  for (const page of tokenPages) {
    lines.push(
      `META_PAGE_ACCESS_TOKEN_${slugEnv(page.name)}=${page.access_token}`
    );
  }

  return lines.join("\n");
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizeAdAccountId(value: string): string {
  return value.startsWith("act_") ? value : `act_${value}`;
}

function parseInsightLevel(value: string): MetaAdsInsightLevel {
  if (value === "ad" || value === "adset" || value === "campaign") {
    return value;
  }
  throw new Error("--level must be campaign, adset, or ad.");
}

function parsePositiveInteger(value: string, optionName: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new TypeError(`${optionName} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(`${optionName} must be a positive number.`);
  }
  return parsed;
}

function parseCsv(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : undefined;
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

function renderInsightsTable(rows: MetaAdsInsight[]): string {
  const lines = [`Meta Ads Insights (${rows.length})`, ""];
  for (const row of rows) {
    lines.push(
      `- ${row.campaign_name ?? row.adset_name ?? row.ad_name ?? row.campaign_id ?? row.adset_id ?? row.ad_id ?? "unknown"} | spend ${row.spend ?? "0"} | impressions ${row.impressions ?? "0"} | clicks ${row.clicks ?? "0"}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function parseCalendarDate(value: string, optionName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${optionName} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${optionName} must be a valid calendar date.`);
  }
  return date;
}

function untilDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function writeOutput(value: string): void {
  process.stdout.write(value);
}

function slugEnv(value: string): string {
  return value
    .replaceAll(/[^a-z0-9]+/gi, "_")
    .replaceAll(/^_|_$/g, "")
    .toUpperCase();
}

function firstActionValue(
  values: { value: string }[] | undefined
): string | undefined {
  return values?.[0]?.value;
}
