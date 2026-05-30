import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMetaSocialClient,
  type InstagramMedia,
  type MetaSocialClient,
  type PageInfo,
  type PagePost,
} from "@patronage/meta-social";
import { Command } from "commander";

import { loadLocalDotenv } from "./local-env.js";
import { createMetaAdsCommand } from "./meta-ads.js";

const cliSourceDirectory = dirname(fileURLToPath(import.meta.url));

export interface CreateMetaCommandDependencies {
  createMetaSocialClient?: typeof createMetaSocialClient;
  env?: NodeJS.ProcessEnv;
  stderr?: NodeJS.WritableStream;
  stdout?: NodeJS.WritableStream;
}

export function createMetaCommand(
  deps: CreateMetaCommandDependencies = {}
): Command {
  const meta = new Command("meta").description("Meta provider commands");
  meta.addCommand(createMetaAdsCommand());
  meta.addCommand(createMetaSocialCommand(deps));
  return meta;
}

function createMetaSocialCommand(deps: CreateMetaCommandDependencies): Command {
  const social = new Command("social").description(
    "Meta organic social commands"
  );

  const pages = new Command("pages").description("Meta Page commands");
  pages
    .command("list")
    .description("List managed Meta Pages")
    .option("--access-token <token>", "Meta user access token")
    .option("--format <format>", "Output format: json or table", "table")
    .action((options: MetaPagesListOptions) => listPages(options, deps));
  social.addCommand(pages);

  const posts = new Command("posts").description("Meta Page post commands");
  posts
    .command("list")
    .description("List posts for a Meta Page")
    .requiredOption("--page-id <id>", "Meta Page ID")
    .option("--access-token <token>", "Meta page access token")
    .option("--since <date>", "Start date (YYYY-MM-DD)")
    .option("--until <date>", "End date (YYYY-MM-DD)")
    .option("--limit <number>", "Maximum posts to fetch", "10")
    .option("--format <format>", "Output format: json or table", "table")
    .action((options: MetaPostsListOptions) => listPosts(options, deps));
  social.addCommand(posts);

  const instagram = new Command("instagram").description(
    "Meta Instagram Business commands"
  );
  const media = new Command("media").description("Instagram media commands");
  media
    .command("list")
    .description("List Instagram Business media")
    .requiredOption("--instagram-user-id <id>", "Instagram Business user ID")
    .option("--access-token <token>", "Meta page access token")
    .option("--limit <number>", "Maximum media items to fetch", "10")
    .option("--format <format>", "Output format: json or table", "table")
    .action((options: MetaInstagramMediaListOptions) =>
      listInstagramMedia(options, deps)
    );
  instagram.addCommand(media);
  social.addCommand(instagram);

  return social;
}

interface MetaPagesListOptions {
  accessToken?: string;
  format: string;
}

interface MetaPostsListOptions {
  accessToken?: string;
  format: string;
  limit: string;
  pageId: string;
  since?: string;
  until?: string;
}

interface MetaInstagramMediaListOptions {
  accessToken?: string;
  format: string;
  instagramUserId: string;
  limit: string;
}

async function listPages(
  options: MetaPagesListOptions,
  deps: CreateMetaCommandDependencies
): Promise<void> {
  const client = createLocalMetaSocialClient(deps, {
    accessToken: options.accessToken,
    tokenKind: "user",
  });
  const pages = await client.listManagedPages();
  writeOutput(deps, renderPages(pages, options.format));
}

async function listPosts(
  options: MetaPostsListOptions,
  deps: CreateMetaCommandDependencies
): Promise<void> {
  validateDateWindow(options.since, options.until);

  const client = createLocalMetaSocialClient(deps, {
    accessToken: options.accessToken,
    tokenKind: "page",
  });
  const posts = await client.getPagePosts({
    limit: parsePositiveInteger(options.limit, "--limit"),
    pageId: options.pageId,
    since: options.since,
    until: normalizeUntilDate(options.until),
  });

  writeOutput(deps, renderPosts(posts, options.format));
}

async function listInstagramMedia(
  options: MetaInstagramMediaListOptions,
  deps: CreateMetaCommandDependencies
): Promise<void> {
  const client = createLocalMetaSocialClient(deps, {
    accessToken: options.accessToken,
    tokenKind: "page",
  });
  const media = await client.getInstagramMedia({
    instagramUserId: options.instagramUserId,
    limit: parsePositiveInteger(options.limit, "--limit"),
  });

  writeOutput(deps, renderInstagramMedia(media, options.format));
}

function createLocalMetaSocialClient(
  deps: CreateMetaCommandDependencies,
  input: { accessToken?: string; tokenKind: "page" | "user" }
): MetaSocialClient {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);

  const env = deps.env ?? process.env;
  const createClient = deps.createMetaSocialClient ?? createMetaSocialClient;
  const accessToken =
    input.accessToken ??
    (input.tokenKind === "page"
      ? resolvePageAccessToken(env)
      : readOptionalEnv(env, "META_ACCESS_TOKEN")) ??
    readOptionalEnv(env, "META_ACCESS_TOKEN");

  if (!accessToken) {
    throw new Error(
      input.tokenKind === "page"
        ? "Missing Meta page access token. Pass --access-token or set META_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN_{ACTIVE_CLIENT}."
        : "Missing Meta user access token. Pass --access-token or set META_ACCESS_TOKEN."
    );
  }

  return createClient({ accessToken });
}

function resolvePageAccessToken(env: NodeJS.ProcessEnv): string | undefined {
  const activeClient = readOptionalEnv(env, "ACTIVE_CLIENT");
  if (activeClient) {
    const token = readOptionalEnv(
      env,
      `META_PAGE_ACCESS_TOKEN_${activeClient.toUpperCase()}`
    );
    if (token) {
      return token;
    }
  }

  return readOptionalEnv(env, "META_PAGE_ACCESS_TOKEN");
}

function renderPages(pages: PageInfo[], format: string): string {
  if (format === "json") {
    return `${JSON.stringify(pages, null, 2)}\n`;
  }

  const lines = [`Managed Meta Pages (${pages.length})`, ""];
  for (const page of pages) {
    lines.push(
      `- ${page.name} (${page.id}) - ${page.category ?? "uncategorized"}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderPosts(posts: PagePost[], format: string): string {
  if (format === "json") {
    return `${JSON.stringify(posts, null, 2)}\n`;
  }

  const lines = [`Meta Page Posts (${posts.length})`, ""];
  for (const post of posts) {
    const permalink = post.permalink_url ?? post.id;
    const message = (post.message ?? "").replaceAll(/\s+/g, " ").trim();
    lines.push(`- ${post.created_time} | ${permalink}`);
    if (message) {
      lines.push(`  ${message}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderInstagramMedia(media: InstagramMedia[], format: string): string {
  if (format === "json") {
    return `${JSON.stringify(media, null, 2)}\n`;
  }

  const lines = [`Instagram Media (${media.length})`, ""];
  for (const item of media) {
    lines.push(
      `- ${item.timestamp ?? "unknown"} | ${item.media_type ?? "unknown"} | ${item.permalink}`
    );
    if (item.caption) {
      lines.push(`  ${item.caption.replaceAll(/\s+/g, " ").trim()}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function validateDateWindow(
  since: string | undefined,
  until: string | undefined
) {
  if (since) {
    validateCalendarDate(since, "--since");
  }

  if (until) {
    validateCalendarDate(until, "--until");
  }

  if (since && until && since > until) {
    throw new Error("--since must be on or before --until.");
  }
}

function validateCalendarDate(value: string, optionName: string): void {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) {
    throw new Error(`${optionName} must use YYYY-MM-DD.`);
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    Number(match.groups.month) < 1 ||
    Number(match.groups.month) > 12
  ) {
    throw new Error(`${optionName} must be a valid calendar date.`);
  }
}

function normalizeUntilDate(until: string | undefined): string | undefined {
  if (!until) {
    return undefined;
  }

  const value = new Date(`${until}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
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

function readOptionalEnv(
  env: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function writeOutput(deps: CreateMetaCommandDependencies, value: string): void {
  (deps.stdout ?? process.stdout).write(value);
}
