import { compareProviders, listRecentPosts } from "@patronage/x-posts";
import type {
  CompareProvidersResult,
  ListRecentPostsResult,
  XProviderName,
} from "@patronage/x-posts";
import { Command } from "commander";

import { loadLocalDotenv } from "./local-env.js";

const cliSourceDirectory = import.meta.dirname;

export interface CreateXCommandDependencies {
  compareProviders?: typeof compareProviders;
  env?: NodeJS.ProcessEnv;
  listRecentPosts?: typeof listRecentPosts;
  stderr?: NodeJS.WritableStream;
  stdout?: NodeJS.WritableStream;
}

export function createXCommand(deps: CreateXCommandDependencies = {}): Command {
  const x = new Command("x").description("X authored-post commands");
  const posts = new Command("posts").description("X post intake commands");

  posts
    .command("list")
    .description("List authored X posts for a handle and date window")
    .requiredOption("--handle <handle>", "X handle without @")
    .requiredOption("--since <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--until <date>", "End date (YYYY-MM-DD)")
    .option("--limit <number>", "Maximum posts to fetch")
    .option("--provider <provider>", "Provider: x-api or xai-grok")
    .option("--format <format>", "Output format: json or markdown", "json")
    .action((options: XPostsListOptions) => runPostsList(options, deps));

  posts
    .command("compare")
    .description("Compare X API and xAI Grok authored-post retrieval")
    .requiredOption("--handle <handle>", "X handle without @")
    .requiredOption("--since <date>", "Start date (YYYY-MM-DD)")
    .requiredOption("--until <date>", "End date (YYYY-MM-DD)")
    .option("--limit <number>", "Maximum posts to fetch")
    .option("--format <format>", "Output format: json or markdown", "markdown")
    .action((options: XPostsCompareOptions) => runPostsCompare(options, deps));

  x.addCommand(posts);
  return x;
}

interface XPostsListOptions {
  format: string;
  handle: string;
  limit?: string;
  provider?: string;
  since: string;
  until: string;
}

interface XPostsCompareOptions {
  format: string;
  handle: string;
  limit?: string;
  since: string;
  until: string;
}

async function runPostsList(
  options: XPostsListOptions,
  deps: CreateXCommandDependencies
): Promise<void> {
  loadCliEnv();
  validateDateWindow(options.since, options.until);

  const env = deps.env ?? process.env;
  const action = deps.listRecentPosts ?? listRecentPosts;
  const result = await action({
    handle: options.handle,
    limit: parseOptionalPositiveInteger(options.limit, "--limit"),
    provider: resolveProviderOption(options.provider, env),
    since: options.since,
    until: options.until,
    xAiApiKey: readOptionalEnv(env, "XAI_API_KEY"),
    xAiModel: readOptionalEnv(env, "XAI_MODEL"),
    xApiBearerToken: readOptionalEnv(env, "X_BEARER_TOKEN"),
  });

  writeOutput(deps, renderPostsOutput(result, options.format));
}

async function runPostsCompare(
  options: XPostsCompareOptions,
  deps: CreateXCommandDependencies
): Promise<void> {
  loadCliEnv();
  validateDateWindow(options.since, options.until);

  const env = deps.env ?? process.env;
  const action = deps.compareProviders ?? compareProviders;
  const result = await action({
    handle: options.handle,
    limit: parseOptionalPositiveInteger(options.limit, "--limit"),
    since: options.since,
    until: options.until,
    xAiApiKey: readOptionalEnv(env, "XAI_API_KEY"),
    xAiModel: readOptionalEnv(env, "XAI_MODEL"),
    xApiBearerToken: readOptionalEnv(env, "X_BEARER_TOKEN"),
  });

  writeOutput(deps, renderCompareOutput(result, options.format));
}

function loadCliEnv(): void {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
}

function renderPostsOutput(
  result: ListRecentPostsResult,
  format: string
): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `# X Posts - @${result.handle}`,
    "",
    `- Provider: ${result.provider}`,
    `- Window: ${result.since} to ${result.until}`,
    `- Posts: ${result.posts.length}`,
    "",
  ];

  if (result.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  if (result.posts.length === 0) {
    lines.push("No posts found.");
  } else {
    lines.push("## Posts", "");
    for (const post of result.posts) {
      const mediaLabel =
        post.mediaTypes.length > 0 ? post.mediaTypes.join(", ") : "text";
      lines.push(
        `- ${post.publishedAt} | ${post.id} | ${mediaLabel} | ${post.url}`,
        `  ${post.text}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderCompareOutput(
  result: CompareProvidersResult,
  format: string
): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `# X Provider Comparison - @${result.handle}`,
    "",
    `- Window: ${result.since} to ${result.until}`,
    `- Overlap URLs: ${result.comparison.overlapUrls.length}`,
    `- X API only: ${result.comparison.xApiOnlyUrls.length}`,
    `- xAI only: ${result.comparison.xAiOnlyUrls.length}`,
    `- Video agreement: ${result.comparison.videoAgreement.matched} matched / ${result.comparison.videoAgreement.mismatched} mismatched`,
    "",
  ];

  if (result.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  lines.push("## Overlap URLs", "");
  if (result.comparison.overlapUrls.length === 0) {
    lines.push("None.");
  } else {
    for (const url of result.comparison.overlapUrls) {
      lines.push(`- ${url}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function resolveProviderOption(
  provider: string | undefined,
  env: NodeJS.ProcessEnv
): XProviderName | undefined {
  if (provider === "x-api" || provider === "xai-grok") {
    return provider;
  }

  if (provider) {
    throw new Error("--provider must be x-api or xai-grok.");
  }

  const envDefault = env.X_PROVIDER_DEFAULT;
  if (envDefault === "x-api" || envDefault === "xai-grok") {
    return envDefault;
  }

  return undefined;
}

function validateDateWindow(since: string, until: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!datePattern.test(since) || !datePattern.test(until)) {
    throw new Error("Date window must use YYYY-MM-DD values.");
  }

  if (since > until) {
    throw new Error("--since must be on or before --until.");
  }
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

function readOptionalEnv(
  env: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function writeOutput(deps: CreateXCommandDependencies, value: string): void {
  (deps.stdout ?? process.stdout).write(value);
}
