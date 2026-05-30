import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createMetaCommand } from "./meta.js";

function createStream() {
  let text = "";

  return {
    get text() {
      return text;
    },
    write(chunk: string) {
      text += chunk;
      return true;
    },
  };
}

describe("Meta social CLI commands", () => {
  it("lists managed pages with a user token", async () => {
    const stdout = createStream();
    const client = {
      listManagedPages: vi.fn().mockResolvedValue([
        {
          category: "Nonprofit Organization",
          id: "123",
          name: "Example Community Fund",
        },
      ]),
    };
    const createMetaSocialClient = vi.fn(() => client);
    const command = createMetaCommand({
      createMetaSocialClient: createMetaSocialClient as never,
      env: { META_ACCESS_TOKEN: "user-token" },
      stdout: stdout as never,
    });

    await command.parseAsync(["social", "pages", "list"], { from: "user" });

    expect(createMetaSocialClient).toHaveBeenCalledWith({
      accessToken: "user-token",
    });
    expect(stdout.text).toContain("Example Community Fund (123)");
  });

  it("lists page posts with an active-client page token", async () => {
    const stdout = createStream();
    const client = {
      getPagePosts: vi.fn().mockResolvedValue([
        {
          created_time: "2026-05-01T12:00:00+0000",
          id: "post-1",
          message: "Hello",
          permalink_url: "https://facebook.com/post-1",
        },
      ]),
    };
    const createMetaSocialClient = vi.fn(() => client);
    const command = createMetaCommand({
      createMetaSocialClient: createMetaSocialClient as never,
      env: {
        ACTIVE_CLIENT: "example_nonprofit",
        META_PAGE_ACCESS_TOKEN_EXAMPLE_NONPROFIT: "page-token",
      },
      stdout: stdout as never,
    });

    await command.parseAsync(
      [
        "social",
        "posts",
        "list",
        "--page-id",
        "123",
        "--since",
        "2026-05-01",
        "--until",
        "2026-05-01",
      ],
      { from: "user" }
    );

    expect(createMetaSocialClient).toHaveBeenCalledWith({
      accessToken: "page-token",
    });
    expect(client.getPagePosts).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "123",
        since: "2026-05-01",
        until: "2026-05-02",
      })
    );
    expect(stdout.text).toContain("https://facebook.com/post-1");
  });

  it("rejects impossible post window dates", async () => {
    const command = createMetaCommand({
      createMetaSocialClient: vi.fn() as never,
      env: { META_PAGE_ACCESS_TOKEN: "page-token" },
    });

    await expect(
      command.parseAsync(
        [
          "social",
          "posts",
          "list",
          "--page-id",
          "123",
          "--since",
          "2026-02-31",
        ],
        { from: "user" }
      )
    ).rejects.toThrow("--since must be a valid calendar date.");
  });

  it("rejects invalid post window months with CLI validation errors", async () => {
    const command = createMetaCommand({
      createMetaSocialClient: vi.fn() as never,
      env: { META_PAGE_ACCESS_TOKEN: "page-token" },
    });

    await expect(
      command.parseAsync(
        [
          "social",
          "posts",
          "list",
          "--page-id",
          "123",
          "--since",
          "2026-13-01",
        ],
        { from: "user" }
      )
    ).rejects.toThrow("--since must be a valid calendar date.");
  });

  it("lists Instagram media with an explicit token", async () => {
    const stdout = createStream();
    const client = {
      getInstagramMedia: vi.fn().mockResolvedValue([
        {
          id: "media-1",
          media_type: "REELS",
          permalink: "https://instagram.com/reel/1",
          timestamp: "2026-05-01T12:00:00+0000",
        },
      ]),
    };
    const createMetaSocialClient = vi.fn(() => client);
    const command = createMetaCommand({
      createMetaSocialClient: createMetaSocialClient as never,
      stdout: stdout as never,
    });

    await command.parseAsync(
      [
        "social",
        "instagram",
        "media",
        "list",
        "--instagram-user-id",
        "ig-1",
        "--access-token",
        "token",
        "--format",
        "json",
      ],
      { from: "user" }
    );

    expect(createMetaSocialClient).toHaveBeenCalledWith({
      accessToken: "token",
    });
    expect(client.getInstagramMedia).toHaveBeenCalledWith({
      instagramUserId: "ig-1",
      limit: 10,
    });
    expect(stdout.text).toContain('"media_type": "REELS"');
  });
});

describe("Meta ads CLI commands", () => {
  it("validates boost creation without constructing a Meta client", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "meta-ads-run-log-"));
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      await command.parseAsync(
        [
          "ads",
          "boosts",
          "create",
          "--page-id",
          "page-1",
          "--post-id",
          "page-1_post-1",
          "--budget",
          "25",
          "--days",
          "2",
          "--run-log-dir",
          runLogDir,
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
    }

    const [runLogFile] = readdirSync(runLogDir);
    expect(runLogFile).toContain("meta-ads-meta-ads-boosts-create-validate");
    const runLogPath = path.join(runLogDir, runLogFile ?? "");
    const runLog = JSON.parse(readFileSync(runLogPath, "utf8")) as {
      mode: string;
      operations: unknown[];
    };
    expect(runLog.mode).toBe("validate");
    expect(runLog.operations).toHaveLength(1);

    rmSync(runLogDir, { force: true, recursive: true });
  });

  it("inspects explicit tokens without requiring ad account env", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { is_valid: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      await command.parseAsync(
        [
          "ads",
          "token",
          "inspect",
          "user-token",
          "--app-id",
          "app",
          "--app-secret",
          "secret",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/debug_token");
    expect(requestUrl.searchParams.get("access_token")).toBe("app|secret");
    expect(requestUrl.searchParams.get("input_token")).toBe("user-token");
  });

  it("prints active-client page token aliases for token account env output", async () => {
    const previousActiveClient = process.env.ACTIVE_CLIENT;
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            access_token: "page-token",
            id: "page-1",
            name: "Different Page Name",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    const command = createMetaCommand();

    try {
      process.env.ACTIVE_CLIENT = "example_nonprofit";
      await command.parseAsync(
        [
          "ads",
          "token",
          "accounts",
          "user-token",
          "--page-id",
          "page-1",
          "--show-tokens",
          "--format",
          "env",
        ],
        { from: "user" }
      );
    } finally {
      restoreEnv("ACTIVE_CLIENT", previousActiveClient);
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    expect(stdout.text).toContain(
      "META_PAGE_ACCESS_TOKEN_EXAMPLE_NONPROFIT=page-token"
    );
    expect(stdout.text).toContain(
      "META_PAGE_ACCESS_TOKEN_DIFFERENT_PAGE_NAME=page-token"
    );
  });

  it("requires a page id before printing active-client page token aliases", async () => {
    const previousActiveClient = process.env.ACTIVE_CLIENT;
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            access_token: "page-token",
            id: "page-1",
            name: "Different Page Name",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const command = createMetaCommand();

    try {
      process.env.ACTIVE_CLIENT = "example_nonprofit";
      await expect(
        command.parseAsync(
          [
            "ads",
            "token",
            "accounts",
            "user-token",
            "--show-tokens",
            "--format",
            "env",
          ],
          { from: "user" }
        )
      ).rejects.toThrow("--page-id is required");
    } finally {
      restoreEnv("ACTIVE_CLIENT", previousActiveClient);
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("resolves deploy ad-set placeholders before creating ads", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "meta-ads-run-log-"));
    const inputPath = path.join(runLogDir, "deploy.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        ads: [
          {
            adsetId: "$adSetId",
            creativeId: "creative-1",
            name: "Ad",
          },
        ],
        adSets: [
          {
            billingEvent: "IMPRESSIONS",
            campaignId: "$campaignId",
            dailyBudget: 25,
            name: "Ad Set",
            optimizationGoal: "REACH",
            targeting: { geo_locations: { countries: ["US"] } },
          },
        ],
        campaign: {
          name: "Campaign",
          objective: "OUTCOME_AWARENESS",
        },
      })
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "campaign-1" }))
      .mockResolvedValueOnce(Response.json({ id: "adset-1" }))
      .mockResolvedValueOnce(Response.json({ id: "ad-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      await command.parseAsync(
        [
          "ads",
          "campaigns",
          "deploy",
          "--input",
          inputPath,
          "--ad-account-id",
          "act_123",
          "--access-token",
          "token",
          "--execute",
          "--run-log-dir",
          runLogDir,
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
      rmSync(runLogDir, { force: true, recursive: true });
    }

    const adBody = fetchMock.mock.calls[2]?.[1]?.body as URLSearchParams;
    expect(adBody.get("adset_id")).toBe("adset-1");
  });

  it("validates deploy plans without Meta credentials", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "meta-ads-run-log-"));
    const inputPath = path.join(runLogDir, "deploy.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        campaign: {
          name: "Campaign",
          objective: "OUTCOME_AWARENESS",
        },
      })
    );
    const previousAccessToken = process.env.META_ACCESS_TOKEN;
    const previousAdAccountId = process.env.META_AD_ACCOUNT_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      delete process.env.META_ACCESS_TOKEN;
      delete process.env.META_AD_ACCOUNT_ID;
      await command.parseAsync(
        [
          "ads",
          "campaigns",
          "deploy",
          "--input",
          inputPath,
          "--run-log-dir",
          runLogDir,
        ],
        { from: "user" }
      );
    } finally {
      restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
      restoreEnv("META_AD_ACCOUNT_ID", previousAdAccountId);
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
      rmSync(runLogDir, { force: true, recursive: true });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists lead forms with an active-client page token and no ad account", async () => {
    const previousActiveClient = process.env.ACTIVE_CLIENT;
    const previousPageToken =
      process.env.META_PAGE_ACCESS_TOKEN_EXAMPLE_NONPROFIT;
    const previousAccessToken = process.env.META_ACCESS_TOKEN;
    const previousAppSecretProof = process.env.META_APPSECRET_PROOF;
    const previousAdAccountId = process.env.META_AD_ACCOUNT_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ id: "form-1", name: "Lead Form", status: "ACTIVE" }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      process.env.ACTIVE_CLIENT = "example_nonprofit";
      process.env.META_PAGE_ACCESS_TOKEN_EXAMPLE_NONPROFIT = "page-token";
      process.env.META_APPSECRET_PROOF = "user-token-proof";
      delete process.env.META_ACCESS_TOKEN;
      delete process.env.META_AD_ACCOUNT_ID;
      await command.parseAsync(
        [
          "ads",
          "leads",
          "forms",
          "list",
          "--page-id",
          "page-1",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      restoreEnv("ACTIVE_CLIENT", previousActiveClient);
      restoreEnv("META_PAGE_ACCESS_TOKEN_EXAMPLE_NONPROFIT", previousPageToken);
      restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
      restoreEnv("META_APPSECRET_PROOF", previousAppSecretProof);
      restoreEnv("META_AD_ACCOUNT_ID", previousAdAccountId);
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/page-1/leadgen_forms");
    expect(requestUrl.searchParams.get("access_token")).toBe("page-token");
    expect(requestUrl.searchParams.has("appsecret_proof")).toBe(false);
  });

  it("preserves global appsecret proof for explicit access tokens", async () => {
    const previousAccessToken = process.env.META_ACCESS_TOKEN;
    const previousAppSecretProof = process.env.META_APPSECRET_PROOF;
    const previousAdAccountId = process.env.META_AD_ACCOUNT_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ id: "audience-1", name: "Audience" }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      process.env.META_APPSECRET_PROOF = "explicit-token-proof";
      delete process.env.META_ACCESS_TOKEN;
      delete process.env.META_AD_ACCOUNT_ID;
      await command.parseAsync(
        [
          "ads",
          "audiences",
          "list",
          "--access-token",
          "explicit-token",
          "--ad-account-id",
          "act_123",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
      restoreEnv("META_APPSECRET_PROOF", previousAppSecretProof);
      restoreEnv("META_AD_ACCOUNT_ID", previousAdAccountId);
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("access_token")).toBe("explicit-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe(
      "explicit-token-proof"
    );
  });

  it("sends conversion events without requiring an ad account", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "meta-ads-run-log-"));
    const inputPath = path.join(runLogDir, "events.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        events: [
          {
            action_source: "website",
            event_name: "PageView",
            event_time: 1_777_000_000,
            user_data: {},
          },
        ],
      })
    );
    const previousAdAccountId = process.env.META_AD_ACCOUNT_ID;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ events_received: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const command = createMetaCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      delete process.env.META_AD_ACCOUNT_ID;
      await command.parseAsync(
        [
          "ads",
          "conversions",
          "send",
          "--pixel-id",
          "pixel-1",
          "--input",
          inputPath,
          "--access-token",
          "pixel-token",
          "--execute",
          "--run-log-dir",
          runLogDir,
        ],
        { from: "user" }
      );
    } finally {
      restoreEnv("META_AD_ACCOUNT_ID", previousAdAccountId);
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
      rmSync(runLogDir, { force: true, recursive: true });
    }

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/pixel-1/events");
    expect(requestUrl.searchParams.get("access_token")).toBe("pixel-token");
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  process.env[name] = value === undefined ? "" : value;
}
