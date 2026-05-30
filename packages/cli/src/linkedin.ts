import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBoostPostPlan,
  createLinkedInAdsClient,
  type BoostLinkedInPostInput,
  type CreateLinkedInCampaignInput,
  type CreateLinkedInLeadFormInput,
  type LinkedInAdsClient,
  type LinkedInAnalyticsPivot,
  type LinkedInCampaignStatus,
  type LinkedInLeadForm,
  type LinkedInLeadFormResponse,
  type UpdateLinkedInCampaignInput,
} from "@patronage/linkedin-ads";
import { Command } from "commander";

import { loadLocalDotenv } from "./local-env.js";
import { writeRunLog } from "./run-log.js";

const cliSourceDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRunLogDir = ".patronage/run-logs/linkedin-ads";

type Mode = "execute" | "validate";

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
  campaignId?: string;
  creativeId?: string;
  days?: string;
  pivot: LinkedInAnalyticsPivot;
  since?: string;
  until?: string;
}

interface BoostOptions extends MutationOptions {
  campaignGroup: string;
  dailyBudget?: string;
  days?: string;
  name?: string;
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
    .option("--creative-id <id>", "Creative ID filter")
    .option("--pivot <pivot>", "CAMPAIGN or CREATIVE", "CAMPAIGN")
    .option("--days <number>", "Lookback period in days", "30")
    .option("--since <date>", "Start date (YYYY-MM-DD), overrides --days")
    .option("--until <date>", "End date (YYYY-MM-DD), overrides --days")
    .option("--format <format>", "json or table", "table")
    .action((options: PerformanceOptions) => runPerformance(options));
  campaigns
    .command("deploy")
    .description("Create a LinkedIn campaign from a JSON input")
    .requiredOption("--input <path>", "Path to campaign JSON")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--execute", "Apply changes live", false)
    .option("--format <format>", "json or table", "table")
    .option("--run-log-dir <path>", "Directory for mutation run logs")
    .action((options: MutationOptions & { input: string }) =>
      runCampaignDeploy(options)
    );
  ads.addCommand(campaigns);

  const boosts = new Command("boosts").description("LinkedIn boost commands");
  boosts
    .command("create")
    .description("Create a paid boost for an existing organic post")
    .requiredOption("--post-urn <urn>", "Organic post URN")
    .requiredOption("--campaign-group <urn>", "Sponsored campaign group URN/ID")
    .option("--organization-urn <urn>", "Organization URN")
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
    .requiredOption("--form-id <id>", "Lead Gen form URN/ID")
    .option("--since <date>", "Only leads submitted after YYYY-MM-DD")
    .option("--until <date>", "Only leads submitted before YYYY-MM-DD")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--format <format>", "json or table", "json")
    .action(
      async (
        options: LinkedInOptions & {
          formId: string;
          since?: string;
          until?: string;
        }
      ) => {
        const result = await downloadAllLeadFormResponses(
          createLocalLinkedInAdsClient(options),
          {
            formId: options.formId,
            submittedAfter: options.since
              ? parseCalendarDate(options.since).getTime()
              : undefined,
            submittedBefore: options.until
              ? parseCalendarDate(options.until).getTime()
              : undefined,
          }
        );
        writeOutput(renderOutput(result, options.format));
      }
    );
  return leads;
}

function createOptimizationCommand(): Command {
  const optimization = new Command("optimization").description(
    "LinkedIn optimization commands"
  );
  optimization
    .command("budget")
    .description("Summarize campaign performance for budget decisions")
    .option("--ad-account-id <id>", "LinkedIn ad account ID")
    .option("--access-token <token>", "LinkedIn access token")
    .option("--campaign-id <id>", "Campaign ID filter")
    .option("--days <number>", "Lookback period in days", "7")
    .option("--format <format>", "json or table", "table")
    .action(async (options: PerformanceOptions) => {
      const { since, until } = resolveDateRange(options);
      const rows = await createLocalLinkedInAdsClient(options).getAnalytics({
        campaigns: options.campaignId ? [options.campaignId] : undefined,
        pivot: "CAMPAIGN",
        since,
        until,
      });
      writeOutput(renderOutput(rows, options.format));
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
  return token;
}

async function runPerformance(options: PerformanceOptions): Promise<void> {
  const { since, until } = resolveDateRange(options);
  const rows = await createLocalLinkedInAdsClient(options).getAnalytics({
    campaigns: options.campaignId ? [options.campaignId] : undefined,
    creatives: options.creativeId ? [options.creativeId] : undefined,
    pivot: parsePivot(options.pivot),
    since,
    until,
  });
  writeOutput(renderOutput(rows, options.format));
}

async function runCampaignDeploy(
  options: MutationOptions & { input: string }
): Promise<void> {
  const input = readJson<CreateLinkedInCampaignInput>(options.input);
  await runSimpleMutation(options, {
    command: "linkedin ads campaigns deploy",
    input,
    inputFile: options.input,
    operation: { createCampaign: input },
    run: (client) => client.createCampaign(input),
    validate: validateCampaignInput,
  });
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
    postUrn: options.postUrn,
    status: parseBoostStatus(options.status),
    totalBudget: parseOptionalPositiveNumber(
      options.totalBudget,
      "--total-budget"
    ),
  };
  const plan = buildBoostPostPlan(
    clientInput,
    resolveRequiredEnv(options.adAccountId, "LINKEDIN_AD_ACCOUNT_ID")
  );
  const mode = resolveMode(options);
  const result =
    mode === "execute"
      ? await createLocalLinkedInAdsClient(options).boostPost(clientInput)
      : { plan };
  writeLoggedMutation({
    command: "linkedin ads boosts create",
    input: clientInput,
    mode,
    operations: [plan],
    options,
    result,
  });
}

async function runLeadFormCreate(
  options: MutationOptions & { input: string }
): Promise<void> {
  const input = readJson<CreateLinkedInLeadFormInput>(options.input);
  await runSimpleMutation(options, {
    command: "linkedin ads leads forms create",
    input,
    inputFile: options.input,
    operation: { createLeadForm: input },
    run: (client) => client.createLeadForm(input),
    validate: validateLeadFormInput,
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
    run(client: LinkedInAdsClient): Promise<unknown>;
    validate?(input: Input): void;
  }
): Promise<void> {
  const mode = resolveMode(options);
  definition.validate?.(definition.input);
  const result =
    mode === "execute"
      ? await definition.run(createLocalLinkedInAdsClient(options))
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
    provider: "linkedin-ads",
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

function validateCampaignInput(input: CreateLinkedInCampaignInput): void {
  requireString(input.name, "input.name");
  requireString(input.campaignGroup, "input.campaignGroup");
}

function validateLeadFormInput(input: CreateLinkedInLeadFormInput): void {
  requireString(input.name, "input.name");
  requireString(input.headline, "input.headline");
  requireString(input.description, "input.description");
  requireString(input.privacyPolicyUrl, "input.privacyPolicyUrl");
  if (!Array.isArray(input.questions)) {
    throw new TypeError("input.questions must be an array.");
  }
  requireObject(input.thankYouMessage, "input.thankYouMessage");
  requireString(input.thankYouMessage.message, "input.thankYouMessage.message");
}

function requireString(value: unknown, path: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} is required.`);
  }
}

function requireObject(value: unknown, path: string): asserts value is object {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} is required.`);
  }
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
    submittedAfter?: number;
    submittedBefore?: number;
  }
) {
  const count = 100;
  const leads: LinkedInLeadFormResponse[] = [];
  let start = 0;
  let total = 0;

  do {
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
  } while (leads.length < total && start > 0);

  return { leads, total };
}

async function listAllLeadForms(client: LinkedInAdsClient) {
  const count = 100;
  const forms: LinkedInLeadForm[] = [];
  let start = 0;
  let total = 0;

  do {
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

function parsePivot(value: string): LinkedInAnalyticsPivot {
  if (value === "CAMPAIGN" || value === "CREATIVE") {
    return value;
  }
  throw new Error("--pivot must be CAMPAIGN or CREATIVE.");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
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
