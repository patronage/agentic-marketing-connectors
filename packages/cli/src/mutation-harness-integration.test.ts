import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGoogleCommand } from "./google.js";
import { createLinkedInCommand } from "./linkedin.js";
import { createMetaCommand } from "./meta.js";

const tempDirectories: string[] = [];

describe("unified mutation harness command adoption", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("plans the representative Meta command without credentials", async () => {
    const runLogDir = temporaryDirectory("meta-harness-");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await createMetaCommand().parseAsync(
      [
        "ads",
        "audiences",
        "delete",
        "--audience-id",
        "audience-1",
        "--format",
        "json",
        "--run-log-dir",
        runLogDir,
      ],
      { from: "user" }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readOnlyRunLog(runLogDir)).toMatchObject({
      result: { lifecycle: "local-planned" },
    });
  });

  it("plans the representative LinkedIn command without credentials", async () => {
    const runLogDir = temporaryDirectory("linkedin-harness-");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await createLinkedInCommand().parseAsync(
      [
        "ads",
        "optimization",
        "pause",
        "--campaign-id",
        "campaign-1",
        "--format",
        "json",
        "--run-log-dir",
        runLogDir,
      ],
      { from: "user" }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readOnlyRunLog(runLogDir)).toMatchObject({
      result: { lifecycle: "local-planned" },
    });
  });

  it("provider-validates the representative Google command", async () => {
    const runLogDir = temporaryDirectory("google-harness-");
    const inputPath = path.join(runLogDir, "pause.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        adGroups: [{ id: "1", label: "One" }],
        customerId: "1234567890",
      })
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(
        Response.json(
          { mutateOperationResponses: [] },
          { headers: { "request-id": "validation-request" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockReturnValue();
    const env = {
      GOOGLE_ADS_CLIENT_ID: "client",
      GOOGLE_ADS_CLIENT_SECRET: "secret",
      GOOGLE_ADS_DEVELOPER_TOKEN: "developer",
      GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    };
    const previous = Object.fromEntries(
      Object.keys(env).map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, env);

    try {
      await createGoogleCommand().parseAsync(
        [
          "ad-groups",
          "pause",
          "--input",
          inputPath,
          "--json",
          "--run-log-dir",
          runLogDir,
        ],
        { from: "user" }
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key);
        } else {
          process.env[key] = value;
        }
      }
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readOnlyRunLog(runLogDir)).toMatchObject({
      mode: "validate",
      result: { lifecycle: "provider-validated" },
    });
  });

  it("provider-validates keyword removal with composite plan evidence", async () => {
    const runLogDir = temporaryDirectory("google-remove-keywords-");
    const inputPath = path.join(runLogDir, "remove-keywords-input.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        criteria: [
          {
            adGroupId: "999",
            criterionId: "111",
            negative: false,
            text: "housing help",
          },
        ],
        customerId: "1234567890",
        expect: "positive",
      })
    );
    const keywordRow = {
      adGroup: { id: "999" },
      adGroupCriterion: {
        criterionId: "111",
        keyword: { text: "housing help" },
        negative: false,
        status: "ENABLED",
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        Response.json({ nextPageToken: "plan-page-2", results: [] })
      )
      .mockResolvedValueOnce(Response.json({ results: [keywordRow] }))
      .mockResolvedValueOnce(Response.json({ results: [keywordRow] }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(
        Response.json(
          { mutateOperationResponses: [] },
          { headers: { "request-id": "validation-request" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockReturnValue();
    const restoreEnvironment = setGoogleEnvironment();

    try {
      await createGoogleCommand().parseAsync(
        [
          "keywords",
          "remove",
          "--input",
          inputPath,
          "--json",
          "--run-log-dir",
          runLogDir,
        ],
        { from: "user" }
      );
    } finally {
      restoreEnvironment();
    }

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const requestBodies = fetchMock.mock.calls
      .slice(1)
      .map(
        ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>
      );
    expect(requestBodies[0]?.query).toContain(
      "ad_group_criterion.type = 'KEYWORD'"
    );
    expect(requestBodies[1]).toMatchObject({ pageToken: "plan-page-2" });
    expect(requestBodies[2]?.query).toContain(
      "ad_group_criterion.negative = FALSE"
    );
    expect(requestBodies[3]?.query).toContain(
      "ad_group_criterion.negative = TRUE"
    );
    expect(requestBodies[4]).toMatchObject({
      partialFailure: false,
      validateOnly: true,
    });
    expect(
      findCommandRunLog(runLogDir, "google-keywords-remove")
    ).toMatchObject({
      mode: "validate",
      result: {
        lifecycle: "provider-validated",
        planDiff: [
          {
            actualScope: "positive",
            adGroupId: "999",
            criterionId: "111",
            proposed: "REMOVED",
          },
        ],
      },
    });
  });

  it("keeps keyword-removal refusal evidence on stderr", async () => {
    const runLogDir = temporaryDirectory("google-remove-refusal-");
    const inputPath = path.join(runLogDir, "remove-keywords-input.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        criteria: [
          {
            adGroupId: "999",
            criterionId: "222",
            negative: false,
            text: "texas",
          },
        ],
        customerId: "1234567890",
        expect: "positive",
      })
    );
    const negativeKeywordRow = {
      adGroup: { id: "999" },
      adGroupCriterion: {
        criterionId: "222",
        keyword: { text: "texas" },
        negative: true,
        status: "ENABLED",
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(Response.json({ results: [negativeKeywordRow] }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ results: [negativeKeywordRow] }));
    vi.stubGlobal("fetch", fetchMock);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    const restoreEnvironment = setGoogleEnvironment();

    try {
      await expect(
        createGoogleCommand().parseAsync(
          [
            "keywords",
            "remove",
            "--input",
            inputPath,
            "--json",
            "--run-log-dir",
            runLogDir,
          ],
          { from: "user" }
        )
      ).rejects.toThrow(/account reports/iu);
    } finally {
      restoreEnvironment();
    }

    const stdout = stdoutWrite.mock.calls
      .map(([chunk]) => String(chunk))
      .join("");
    const stderr = stderrWrite.mock.calls
      .map(([chunk]) => String(chunk))
      .join("");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Account state at refusal")
    );
    expect(stderr).toContain("texas");
    expect(stdout).not.toContain("Account state at refusal");
    expect(stdout).not.toContain("texas");
    expect(
      readdirSync(runLogDir).some((name) =>
        name.includes("google-keywords-remove")
      )
    ).toBeFalsy();
  });

  it("resumes Google campaign deployment and logs the bound provider plan", async () => {
    const runLogDir = temporaryDirectory("google-deploy-harness-");
    const briefPath = path.join(runLogDir, "campaign.json");
    writeFileSync(briefPath, JSON.stringify(googleCampaignBrief()));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        Response.json(
          { mutateOperationResponses: [] },
          { headers: { "request-id": "validation-request" } }
        )
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            mutateOperationResponses: [
              {
                campaignResult: {
                  resourceName: "customers/1234567890/campaigns/9",
                },
              },
              {
                labelResult: {
                  resourceName: "customers/1234567890/labels/10",
                },
              },
            ],
          },
          { headers: { "request-id": "execution-request" } }
        )
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        Response.json(
          { mutateOperationResponses: [] },
          { headers: { "request-id": "cleanup-request" } }
        )
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: "token", expires_in: 3600 })
      )
      .mockResolvedValueOnce(
        Response.json(
          { mutateOperationResponses: [] },
          { headers: { "request-id": "validation-request-2" } }
        )
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            mutateOperationResponses: [
              {
                campaignResult: {
                  resourceName: "customers/1234567890/campaigns/10",
                },
              },
              {
                labelResult: {
                  resourceName: "customers/1234567890/labels/11",
                },
              },
            ],
          },
          { headers: { "request-id": "execution-request-2" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const consoleLog = vi.spyOn(console, "log").mockReturnValue();
    const restoreEnvironment = setGoogleEnvironment();

    try {
      const commandArguments = [
        "campaigns",
        "deploy",
        "--customer-id",
        "1234567890",
        "--brief",
        briefPath,
        "--json",
        "--run-log-dir",
        runLogDir,
      ];
      await createGoogleCommand().parseAsync(commandArguments, {
        from: "user",
      });
      const validationLog = findRunLog(runLogDir, "validate");
      const validationReceipt = asTestRecord(validationLog.result).receipt;

      await createGoogleCommand().parseAsync(
        [...commandArguments, "--execute"],
        { from: "user" }
      );
      const executionLog = findRunLog(runLogDir, "execute");
      const executionReceipt = asTestRecord(executionLog.result).receipt;

      expect(asTestRecord(validationReceipt).operationId).toBe(
        asTestRecord(executionReceipt).operationId
      );
      expect(executionLog).toMatchObject({
        result: { lifecycle: "executed", receipt: { status: "succeeded" } },
      });
      expect(JSON.stringify(executionLog.operations)).toContain(
        "patronage:cli-"
      );
      expect(consoleLog.mock.calls.flat().join("\n")).toContain(
        '"lifecycle": "executed"'
      );

      await createGoogleCommand().parseAsync(
        [...commandArguments, "--execute"],
        { from: "user" }
      );
      await createGoogleCommand().parseAsync(
        [...commandArguments, "--execute"],
        { from: "user" }
      );
      const freshExecutionLog = findExecutionLogWithDifferentOperationId(
        runLogDir,
        String(asTestRecord(executionReceipt).operationId)
      );
      expect(
        asTestRecord(asTestRecord(freshExecutionLog.result).receipt).operationId
      ).not.toBe(asTestRecord(executionReceipt).operationId);
    } finally {
      restoreEnvironment();
    }

    expect(fetchMock).toHaveBeenCalledTimes(9);
    const mutateBodies = [1, 3, 5, 7, 8].map(
      (index) =>
        JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body)) as {
          validateOnly: boolean;
        }
    );
    expect(mutateBodies.map(({ validateOnly }) => validateOnly)).toStrictEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
  });
});

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function readOnlyRunLog(directory: string): Record<string, unknown> {
  const file = readdirSync(directory).find(
    (name) => name.endsWith(".json") && name !== "pause.json"
  );
  if (!file) {
    throw new Error(`Expected a run log in ${directory}.`);
  }
  return JSON.parse(
    readFileSync(path.join(directory, file), "utf-8")
  ) as Record<string, unknown>;
}

function findRunLog(
  directory: string,
  mode: "execute" | "validate"
): Record<string, unknown> {
  const filename = readdirSync(directory)
    .toSorted()
    .toReversed()
    .find(
      (name) =>
        name.includes("google-campaigns-deploy") &&
        name.endsWith(`-${mode}.json`)
    );
  if (!filename) {
    throw new Error(`Expected ${mode} deployment run log.`);
  }
  return JSON.parse(
    readFileSync(path.join(directory, filename), "utf-8")
  ) as Record<string, unknown>;
}

function findCommandRunLog(
  directory: string,
  commandSlug: string
): Record<string, unknown> {
  const filename = readdirSync(directory).find(
    (name) => name.includes(commandSlug) && name.endsWith("-validate.json")
  );
  if (!filename) {
    throw new Error(`Expected ${commandSlug} validation run log.`);
  }
  return JSON.parse(
    readFileSync(path.join(directory, filename), "utf-8")
  ) as Record<string, unknown>;
}

function findExecutionLogWithDifferentOperationId(
  directory: string,
  operationId: string
): Record<string, unknown> {
  for (const filename of readdirSync(directory)) {
    if (
      !filename.includes("google-campaigns-deploy") ||
      !filename.endsWith("-execute.json")
    ) {
      continue;
    }
    const runLog = JSON.parse(
      readFileSync(path.join(directory, filename), "utf-8")
    ) as Record<string, unknown>;
    const candidate = asTestRecord(
      asTestRecord(runLog.result).receipt
    ).operationId;
    if (candidate !== operationId) {
      return runLog;
    }
  }
  throw new Error("Expected a fresh execution operation ID.");
}

function asTestRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function setGoogleEnvironment(): () => void {
  const env = {
    GOOGLE_ADS_CLIENT_ID: "client",
    GOOGLE_ADS_CLIENT_SECRET: "secret",
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, env);
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  };
}

function googleCampaignBrief(): Record<string, unknown> {
  return {
    ad_groups: [
      {
        ads: [
          {
            descriptions: ["Description one", "Description two"],
            final_url: "https://example.com",
            headlines: ["Headline One", "Headline Two", "Headline Three"],
          },
        ],
        keywords: [{ match_type: "PHRASE", text: "housing help" }],
        name: "Housing",
        negative_keywords: [],
        theme: "Housing",
      },
    ],
    campaign_negative_keywords: [],
    extensions: { callouts: [], sitelinks: [], structured_snippets: [] },
    frontmatter: {
      budget_daily: 50,
      campaign_name: "Search Housing",
      campaign_type: "SEARCH",
      client: "example",
      end_date: "2026-12-31",
      geographic_targets: ["2840"],
      language: "English",
      start_date: "2026-07-11",
    },
    objective: "Housing support",
  };
}
