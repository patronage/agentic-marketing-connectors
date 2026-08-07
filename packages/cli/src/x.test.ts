import { describe, expect, it, vi } from "vitest";

import { createXCommand } from "./x.js";

type XCommandDependencies = NonNullable<Parameters<typeof createXCommand>[0]>;
type CompareProviders = NonNullable<XCommandDependencies["compareProviders"]>;
type ListRecentPosts = NonNullable<XCommandDependencies["listRecentPosts"]>;

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

describe("X CLI commands", () => {
  it("lists posts with provider credentials from env", async () => {
    const stdout = createStream();
    const listRecentPosts = vi.fn<ListRecentPosts>().mockResolvedValue({
      handle: "ExampleCommunityFund",
      posts: [],
      provider: "x-api",
      since: "2026-03-31",
      until: "2026-03-31",
      warnings: [],
    });
    const command = createXCommand({
      env: { X_BEARER_TOKEN: "token" },
      listRecentPosts,
      stdout: stdout as never,
    });

    await command.parseAsync(
      [
        "posts",
        "list",
        "--handle",
        "ExampleCommunityFund",
        "--since",
        "2026-03-31",
        "--until",
        "2026-03-31",
        "--format",
        "json",
      ],
      { from: "user" }
    );

    expect(listRecentPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: "ExampleCommunityFund",
        provider: undefined,
        xApiBearerToken: "token",
      })
    );
    expect(stdout.text).toContain('"provider": "x-api"');
  });

  it("compares providers with markdown output by default", async () => {
    const stdout = createStream();
    const compareProviders = vi.fn<CompareProviders>().mockResolvedValue({
      comparison: {
        metricsAvailability: {
          "x-api": 1,
          "xai-grok": 0,
        },
        overlapUrls: ["https://x.com/ExampleCommunityFund/status/1"],
        videoAgreement: {
          matched: 1,
          mismatched: 0,
        },
        xAiOnlyUrls: [],
        xApiOnlyUrls: [],
      },
      handle: "ExampleCommunityFund",
      results: {},
      since: "2026-03-31",
      until: "2026-03-31",
      warnings: [],
    });
    const command = createXCommand({
      compareProviders,
      env: { XAI_API_KEY: "key", X_BEARER_TOKEN: "token" },
      stdout: stdout as never,
    });

    await command.parseAsync(
      [
        "posts",
        "compare",
        "--handle",
        "ExampleCommunityFund",
        "--since",
        "2026-03-31",
        "--until",
        "2026-03-31",
      ],
      { from: "user" }
    );

    expect(compareProviders).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: "ExampleCommunityFund",
        xAiApiKey: "key",
        xApiBearerToken: "token",
      })
    );
    expect(stdout.text).toContain(
      "# X Provider Comparison - @ExampleCommunityFund"
    );
  });

  it("rejects invalid date windows", async () => {
    const command = createXCommand({
      listRecentPosts: vi.fn<ListRecentPosts>(),
      stderr: createStream() as never,
      stdout: createStream() as never,
    });

    await expect(
      command.parseAsync(
        [
          "posts",
          "list",
          "--handle",
          "ExampleCommunityFund",
          "--since",
          "2026-04-01",
          "--until",
          "2026-03-31",
        ],
        { from: "user" }
      )
    ).rejects.toThrow("--since must be on or before --until.");
  });
});
