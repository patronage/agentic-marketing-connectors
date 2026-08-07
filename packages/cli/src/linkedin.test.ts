import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createLinkedInCommand } from "./linkedin.js";

describe("LinkedIn ads CLI commands", () => {
  it("lists organization posts for boost discovery", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [{ id: "urn:li:share:1", commentary: "Post" }],
        paging: { total: 1 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "posts",
          "list",
          "--organization-urn",
          "99",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }
    expect(stdout.text).toContain("urn:li:share:1");
  });

  it("downloads leads by form name as CSV", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "form-1", name: "Signup" }],
          paging: { total: 1 },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          elements: [
            {
              id: "lead-1",
              answers: {
                email: "person@example.com",
                name: '=HYPERLINK("https://example.test")',
                note: "café, volunteer",
              },
            },
          ],
          paging: { total: 1 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "leads",
          "download",
          "--form",
          "Signup",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--stdout",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }
    expect(stdout.text).toContain('"email"');
    expect(stdout.text).toContain('"person@example.com"');
    expect(stdout.text).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(stdout.text).toContain('"café, volunteer"');
  });

  it("reports performance target and fatigue analysis", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            clicks: 1,
            impressions: 2000,
            oneClickLeadFormOpens: 10,
            oneClickLeads: 1,
            costInLocalCurrency: "20",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "campaigns",
          "performance",
          "--campaign-id",
          "1",
          "--vs-targets",
          "--check-fatigue",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }
    expect(stdout.text).toContain('"comparison"');
    expect(stdout.text).toContain('"fatigued": true');
    expect(stdout.text).toContain('"healthScore"');
  });
  it("resolves optimization fatigue campaigns by name", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "urn:li:sponsoredCampaign:1", name: "Campaign" }],
          paging: { total: 1 },
        })
      )
      .mockResolvedValueOnce(Response.json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "optimization",
          "fatigue",
          "--campaign-name",
          "Campaign",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const analyticsUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(analyticsUrl.searchParams.get("campaigns")).toContain(
      "urn:li:sponsoredCampaign:1"
    );
  });
  it("lists campaign groups through the provider client", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [{ id: "group-1", name: "Default", status: "ACTIVE" }],
        paging: { total: 1 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "campaign-groups",
          "list",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }
    expect(stdout.text).toContain("Default");
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toContain(
      "adCampaignGroups"
    );
  });

  it("validates a brief deployment plan without provider access", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-brief-log-"));
    const briefPath = path.join(runLogDir, "brief.html");
    writeFileSync(
      briefPath,
      '<html><title>Test Campaign | Patronage</title><section class="cover"><h1>Test Campaign</h1><p>for Patronage</p><p>$3,000</p></section></html>'
    );
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "campaigns",
          "deploy",
          "--brief",
          briefPath,
          "--campaign-group",
          "group-1",
          "--privacy-policy-url",
          "https://patronage.org/privacy",
          "--run-log-dir",
          runLogDir,
          "--format",
          "json",
        ],
        { from: "user" }
      );
      expect(
        readdirSync(runLogDir).some(
          (file) => file.endsWith(".json") && file !== "brief.html"
        )
      ).toBeTruthy();
      expect(JSON.parse(stdout.text)).toStrictEqual({
        lifecycle: "local-planned",
        result: {
          plan: {
            campaign: {
              campaignGroup: "group-1",
              dailyBudget: { amount: "100", currencyCode: "USD" },
              name: "Test Campaign",
              objectiveType: "LEAD_GENERATION",
              status: "PAUSED",
              targetingCriteria: {
                includedTargetingFacets: {
                  industries: [],
                  locations: ["urn:li:geo:103644278"],
                },
              },
              totalBudget: { amount: "3000", currencyCode: "USD" },
            },
            concepts: [],
            leadForm: {
              description: "Sign up to learn more.",
              headline: "Get Updates",
              name: "Test Campaign - Lead Gen",
              privacyPolicyUrl: "https://patronage.org/privacy",
              questions: [
                { predefinedField: "FIRST_NAME", required: true },
                { predefinedField: "LAST_NAME", required: true },
                { predefinedField: "EMAIL", required: true },
                { label: "ZIP Code", name: "zipCode", required: true },
              ],
              thankYouMessage: {
                landingPageCallToAction: "Learn More",
                landingPageUrl: "",
                message: "Thanks for signing up!",
              },
            },
          },
        },
        runLogPath: expect.stringContaining(runLogDir),
      });
    } finally {
      stdoutWrite.mockRestore();
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });
  it("rejects brief deployment without a real privacy policy URL", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-brief-log-"));
    const briefPath = path.join(runLogDir, "brief.html");
    writeFileSync(briefPath, "<html><title>Campaign</title></html>");
    try {
      await expect(
        createLinkedInCommand().parseAsync(
          [
            "ads",
            "campaigns",
            "deploy",
            "--brief",
            briefPath,
            "--campaign-group",
            "group-1",
          ],
          { from: "user" }
        )
      ).rejects.toThrow("--privacy-policy-url is required with --brief.");
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });
  it("scopes brief resume identity to the effective dotenv account", async () => {
    const previousCwd = process.cwd();
    const previousAccount = process.env.LINKEDIN_AD_ACCOUNT_ID;
    const root = mkdtempSync(path.join(tmpdir(), "linkedin-brief-account-"));
    const runLogDir = path.join(root, "logs");
    const accounts = ["111", "222"];
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      delete process.env.LINKEDIN_AD_ACCOUNT_ID;
      for (const account of accounts) {
        const workDir = path.join(root, account);
        mkdirSync(workDir, { recursive: true });
        writeFileSync(
          path.join(workDir, ".env"),
          `LINKEDIN_AD_ACCOUNT_ID=${account}\n`
        );
        const briefPath = path.join(workDir, "brief.html");
        writeFileSync(briefPath, "<html><title>Campaign</title></html>");
        process.chdir(workDir);
        // oxlint-disable-next-line no-await-in-loop -- each iteration intentionally swaps process.cwd and dotenv state.
        await createLinkedInCommand().parseAsync(
          [
            "ads",
            "campaigns",
            "deploy",
            "--brief",
            briefPath,
            "--campaign-group",
            "group-1",
            "--privacy-policy-url",
            "https://example.com/privacy",
            "--run-log-dir",
            runLogDir,
            "--format",
            "json",
          ],
          { from: "user" }
        );
        delete process.env.LINKEDIN_AD_ACCOUNT_ID;
      }
      const resumeKeys = readdirSync(runLogDir).map((file) => {
        const log = JSON.parse(
          readFileSync(path.join(runLogDir, file), "utf-8")
        ) as { result: { resumeKey: string } };
        return log.result.resumeKey;
      });
      expect(new Set(resumeKeys).size).toBe(2);
    } finally {
      process.chdir(previousCwd);
      if (previousAccount === undefined) {
        delete process.env.LINKEDIN_AD_ACCOUNT_ID;
      } else {
        process.env.LINKEDIN_AD_ACCOUNT_ID = previousAccount;
      }
      stdoutWrite.mockRestore();
      rmSync(root, { force: true, recursive: true });
    }
  });
  it("preflights every brief asset before execute can reach the provider", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-brief-asset-"));
    const briefPath = path.join(runLogDir, "brief.html");
    writeFileSync(
      briefPath,
      '<html><title>Campaign</title><div class="image-card"><img src="missing.png"><h4>Concept</h4></div></html>'
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(
        createLinkedInCommand().parseAsync(
          [
            "ads",
            "campaigns",
            "deploy",
            "--brief",
            briefPath,
            "--campaign-group",
            "group-1",
            "--privacy-policy-url",
            "https://example.com/privacy",
            "--ad-account-id",
            "123",
            "--access-token",
            "token",
            "--execute",
            "--run-log-dir",
            runLogDir,
          ],
          { from: "user" }
        )
      ).rejects.toThrow("missing.png");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });
  it("validates boost creation without constructing a LinkedIn client", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-run-log-"));
    const command = createLinkedInCommand();
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));

    try {
      await command.parseAsync(
        [
          "ads",
          "boosts",
          "create",
          "--post-urn",
          "urn:li:share:123",
          "--organization-urn",
          "urn:li:organization:999",
          "--campaign-group",
          "group-1",
          "--ad-account-id",
          "12345",
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
    expect(runLogFile).toContain(
      "linkedin-ads-linkedin-ads-boosts-create-validate"
    );
    const runLog = JSON.parse(
      readFileSync(path.join(runLogDir, runLogFile ?? ""), "utf-8")
    ) as { mode: string; operations: unknown[] };
    expect(runLog.mode).toBe("validate");
    expect(runLog.operations).toHaveLength(1);
    const output = JSON.parse(stdout.text) as {
      lifecycle: string;
      result: {
        plan: {
          campaign: Record<string, unknown>;
          creative: Record<string, unknown>;
        };
      };
      runLogPath: string;
    };
    expect({
      lifecycle: output.lifecycle,
      plan: {
        campaign: {
          account: output.result.plan.campaign.account,
          campaignGroup: output.result.plan.campaign.campaignGroup,
          dailyBudget: output.result.plan.campaign.dailyBudget,
          objectiveType: output.result.plan.campaign.objectiveType,
          status: output.result.plan.campaign.status,
          targetingCriteria: output.result.plan.campaign.targetingCriteria,
        },
        creative: output.result.plan.creative,
      },
      runLogPath: output.runLogPath.replace(runLogDir, "<run-log-dir>"),
    }).toStrictEqual({
      lifecycle: "local-planned",
      plan: {
        campaign: {
          account: "urn:li:sponsoredAccount:12345",
          campaignGroup: "urn:li:sponsoredCampaignGroup:group-1",
          dailyBudget: { amount: "25", currencyCode: "USD" },
          objectiveType: "ENGAGEMENT",
          status: "PAUSED",
          targetingCriteria: {
            includedTargetingFacets: {
              interfaceLocales: ["urn:li:locale:en_US"],
              locations: ["urn:li:geo:103644278"],
            },
          },
        },
        creative: {
          account: "urn:li:sponsoredAccount:12345",
          campaign: "$campaignId",
          content: { reference: "urn:li:share:123" },
          intendedStatus: "ACTIVE",
        },
      },
      runLogPath: expect.stringMatching(
        /^<run-log-dir>\/.*linkedin-ads-boosts-create-validate\.json$/u
      ),
    });

    rmSync(runLogDir, { force: true, recursive: true });
  });

  it("labels optimization reads as local planning and never mutates without execute", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-opt-log-"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ elements: [] }))
      .mockResolvedValueOnce(
        Response.json({
          elements: [
            { id: "urn:li:sponsoredCreative:1", status: "ACTIVE" },
            { id: "urn:li:sponsoredCreative:2", status: "PAUSED" },
          ],
          paging: { total: 2 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));

    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "optimization",
          "budget",
          "--campaign-id",
          "urn:li:sponsoredCampaign:1",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--run-log-dir",
          runLogDir,
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every((call) => {
        const [request] = call;
        return !(request instanceof Request) || request.method === "GET";
      })
    ).toBeTruthy();
    const output = JSON.parse(stdout.text) as {
      lifecycle: string;
      result: { applied: unknown[]; recommendation: { guardrails: unknown } };
    };
    expect(output).toMatchObject({
      lifecycle: "local-planned",
      result: { applied: [], recommendation: { hasSufficientEvidence: false } },
    });
    const [runLogFile] = readdirSync(runLogDir);
    const runLog = JSON.parse(
      readFileSync(path.join(runLogDir, runLogFile ?? ""), "utf-8")
    ) as { operations: unknown[]; result: { lifecycle: string } };
    expect(runLog).toMatchObject({
      operations: [],
      result: { lifecycle: "local-planned" },
    });

    rmSync(runLogDir, { force: true, recursive: true });
  });

  it("executes only evidence-backed optimization actions", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-opt-log-"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: [
            {
              clicks: 200,
              costInLocalCurrency: "1",
              impressions: 1000,
              oneClickLeads: 20,
              pivotValues: ["urn:li:sponsoredCreative:1"],
            },
            {
              clicks: 0,
              costInLocalCurrency: "10000",
              impressions: 1000,
              oneClickLeads: 0,
              pivotValues: ["urn:li:sponsoredCreative:2"],
            },
            {
              clicks: 100,
              costInLocalCurrency: "5",
              impressions: 1000,
              oneClickLeads: 10,
              pivotValues: ["urn:li:sponsoredCreative:3"],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          elements: [
            { id: "urn:li:sponsoredCreative:1", status: "ACTIVE" },
            { id: "urn:li:sponsoredCreative:2", status: "ACTIVE" },
            { id: "urn:li:sponsoredCreative:3", status: "ACTIVE" },
          ],
          paging: { total: 3 },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "optimization",
          "budget",
          "--campaign-id",
          "urn:li:sponsoredCampaign:1",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
          "--execute",
          "--run-log-dir",
          runLogDir,
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [request, init] = fetchMock.mock.calls[2] ?? [];
    expect(String(request)).toContain("/creatives/2");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(stdout.text)).toMatchObject({
      lifecycle: "executed",
      result: {
        actions: [
          { creativeId: "urn:li:sponsoredCreative:2", status: "PAUSED" },
        ],
        applied: [
          { creativeId: "urn:li:sponsoredCreative:2", status: "PAUSED" },
        ],
      },
    });
    rmSync(runLogDir, { force: true, recursive: true });
  });

  it("loads ad account defaults from .env before boost validation", async () => {
    const previousCwd = process.cwd();
    const previousAdAccountId = process.env.LINKEDIN_AD_ACCOUNT_ID;
    const workDir = mkdtempSync(path.join(tmpdir(), "linkedin-env-"));
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-run-log-"));
    writeFileSync(path.join(workDir, ".env"), "LINKEDIN_AD_ACCOUNT_ID=456\n");
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      delete process.env.LINKEDIN_AD_ACCOUNT_ID;
      process.chdir(workDir);
      const command = createLinkedInCommand();
      await command.parseAsync(
        [
          "ads",
          "boosts",
          "create",
          "--post-urn",
          "urn:li:share:123",
          "--organization-urn",
          "urn:li:organization:999",
          "--campaign-group",
          "group-1",
          "--run-log-dir",
          runLogDir,
          "--format",
          "json",
        ],
        { from: "user" }
      );
      expect(readdirSync(runLogDir)).toHaveLength(1);
    } finally {
      process.chdir(previousCwd);
      if (previousAdAccountId === undefined) {
        delete process.env.LINKEDIN_AD_ACCOUNT_ID;
      } else {
        process.env.LINKEDIN_AD_ACCOUNT_ID = previousAdAccountId;
      }
      stdoutWrite.mockRestore();
      rmSync(workDir, { force: true, recursive: true });
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });

  it("rejects invalid boost statuses in validation mode", async () => {
    const command = createLinkedInCommand();

    await expect(
      command.parseAsync(
        [
          "ads",
          "boosts",
          "create",
          "--post-urn",
          "urn:li:share:123",
          "--campaign-group",
          "group-1",
          "--ad-account-id",
          "456",
          "--status",
          "ACTVE",
        ],
        { from: "user" }
      )
    ).rejects.toThrow("--status must be DRAFT, PAUSED, or ACTIVE.");
  });

  it("rejects invalid campaign deploy payloads in validation mode", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-run-log-"));
    const inputPath = path.join(runLogDir, "campaign.json");
    writeFileSync(inputPath, JSON.stringify({ campaignGroup: "group-1" }));
    const command = createLinkedInCommand();

    try {
      await expect(
        command.parseAsync(
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
        )
      ).rejects.toThrow("Invalid input file:\nname:");
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });

  it("rejects invalid lead form payloads in validation mode", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-run-log-"));
    const inputPath = path.join(runLogDir, "lead-form.json");
    writeFileSync(
      inputPath,
      JSON.stringify({
        description: "Description",
        headline: "Headline",
        name: "Lead Form",
        privacyPolicyUrl: "https://example.com/privacy",
        questions: [],
      })
    );
    const command = createLinkedInCommand();

    try {
      await expect(
        command.parseAsync(
          [
            "ads",
            "leads",
            "forms",
            "create",
            "--input",
            inputPath,
            "--run-log-dir",
            runLogDir,
          ],
          { from: "user" }
        )
      ).rejects.toThrow("Invalid input file:\nthankYouMessage:");
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });

  it.each([
    {
      args: ["campaign-groups", "create", "--name", "Launch"],
      command: "linkedin ads campaign-groups create",
      input: { name: "Launch", status: "ACTIVE" },
      operation: {
        createCampaignGroup: { name: "Launch", status: "ACTIVE" },
      },
    },
    {
      args: ["optimization", "pause", "--campaign-id", "campaign-1"],
      command: "linkedin ads optimization pause",
      input: { campaignId: "campaign-1", status: "PAUSED" },
      operation: { pauseCampaign: "campaign-1" },
    },
  ])(
    "preserves exact $command local output and run-log contracts",
    async ({ args, command, input, operation }) => {
      const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-golden-"));
      const stdout = createStream();
      const stdoutWrite = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk) => stdout.write(String(chunk)));
      try {
        await createLinkedInCommand().parseAsync(
          ["ads", ...args, "--run-log-dir", runLogDir, "--format", "json"],
          { from: "user" }
        );
      } finally {
        stdoutWrite.mockRestore();
      }

      const output = JSON.parse(stdout.text) as Record<string, unknown>;
      expect({ ...output, runLogPath: "<run-log>" }).toStrictEqual({
        lifecycle: "local-planned",
        result: { plan: operation },
        runLogPath: "<run-log>",
      });
      expect(readNormalizedRunLog(runLogDir)).toStrictEqual({
        command,
        input,
        inputFile: null,
        mode: "validate",
        operations: [operation],
        provider: "linkedin-ads",
        result: { lifecycle: "local-planned", plan: operation },
        schemaVersion: 1,
      });
      rmSync(runLogDir, { force: true, recursive: true });
    }
  );

  it.each([
    {
      command: "linkedin ads campaigns deploy",
      fileName: "campaign.json",
      input: { campaignGroup: "group-1", name: "Launch" },
      operationKey: "createCampaign",
      route: ["campaigns", "deploy"],
    },
    {
      command: "linkedin ads leads forms create",
      fileName: "lead-form.json",
      input: {
        description: "Description",
        headline: "Headline",
        name: "Signup",
        privacyPolicyUrl: "https://example.com/privacy",
        questions: [],
        thankYouMessage: { message: "Thanks" },
      },
      operationKey: "createLeadForm",
      route: ["leads", "forms", "create"],
    },
  ])(
    "preserves exact $command file-backed golden contracts",
    async ({ command, fileName, input, operationKey, route }) => {
      const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-golden-"));
      const inputPath = path.join(runLogDir, fileName);
      writeFileSync(inputPath, JSON.stringify(input));
      const operation = { [operationKey]: input };
      const stdout = createStream();
      const stdoutWrite = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk) => stdout.write(String(chunk)));
      try {
        await createLinkedInCommand().parseAsync(
          [
            "ads",
            ...route,
            "--input",
            inputPath,
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

      const output = JSON.parse(stdout.text) as Record<string, unknown>;
      expect({ ...output, runLogPath: "<run-log>" }).toStrictEqual({
        lifecycle: "local-planned",
        result: { plan: operation },
        runLogPath: "<run-log>",
      });
      expect(readNormalizedRunLog(runLogDir)).toStrictEqual({
        command,
        input,
        inputFile: "<input>",
        mode: "validate",
        operations: [operation],
        provider: "linkedin-ads",
        result: { lifecycle: "local-planned", plan: operation },
        schemaVersion: 1,
      });
      rmSync(runLogDir, { force: true, recursive: true });
    }
  );

  it("ignores invalid days when explicit performance dates are supplied", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const command = createLinkedInCommand();
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    try {
      await command.parseAsync(
        [
          "ads",
          "campaigns",
          "performance",
          "--since",
          "2026-05-01",
          "--until",
          "2026-05-10",
          "--days",
          "abc",
          "--ad-account-id",
          "456",
          "--access-token",
          "token",
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
    expect(requestUrl.searchParams.get("dateRange")).toBe(
      "(start:(year:2026,month:5,day:1),end:(year:2026,month:5,day:10))"
    );
  });

  it("defaults campaign performance to a seven-day lookback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00Z"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await createLinkedInCommand().parseAsync(
        [
          "ads",
          "campaigns",
          "performance",
          "--campaign-id",
          "1",
          "--ad-account-id",
          "123",
          "--access-token",
          "token",
        ],
        { from: "user" }
      );
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(url.searchParams.get("dateRange")).toBe(
        "(start:(year:2026,month:7,day:4),end:(year:2026,month:7,day:10))"
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("lists all lead form pages", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: Array.from({ length: 100 }, (_, index) => ({
            id: `form-${index + 1}`,
            name: `Form ${index + 1}`,
          })),
          paging: { count: 100, start: 0, total: 101 },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "form-101", name: "Form 101" }],
          paging: { count: 100, start: 100, total: 101 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const command = createLinkedInCommand();
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));

    try {
      await command.parseAsync(
        [
          "ads",
          "leads",
          "forms",
          "list",
          "--ad-account-id",
          "456",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stdout.text).toContain("form-101");
    expect(
      new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("start")
    ).toBe("100");
  });

  it("downloads all lead response pages", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: Array.from({ length: 100 }, (_, index) => ({
            id: `lead-${index + 1}`,
          })),
          paging: { count: 100, start: 0, total: 101 },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "lead-101" }],
          paging: { count: 100, start: 100, total: 101 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const command = createLinkedInCommand();
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));

    try {
      await command.parseAsync(
        [
          "ads",
          "leads",
          "download",
          "--form-id",
          "123",
          "--ad-account-id",
          "456",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stdout.text).toContain("lead-101");
    expect(
      new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("start")
    ).toBe("100");
  });

  it("stops lead pagination when a stale total returns an empty page", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "lead-1" }],
          paging: { count: 100, start: 0, total: 2 },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          elements: [],
          paging: { count: 100, start: 1, total: 2 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const command = createLinkedInCommand();
    const stdout = createStream();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => stdout.write(String(chunk)));

    try {
      await command.parseAsync(
        [
          "ads",
          "leads",
          "download",
          "--form-id",
          "123",
          "--ad-account-id",
          "456",
          "--access-token",
          "token",
          "--format",
          "json",
        ],
        { from: "user" }
      );
    } finally {
      stdoutWrite.mockRestore();
      vi.unstubAllGlobals();
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stdout.text).toContain("lead-1");
  });
});

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

function readNormalizedRunLog(runLogDir: string): Record<string, unknown> {
  const runLog = readdirSync(runLogDir)
    .filter((file) => file.endsWith(".json"))
    .map(
      (file) =>
        JSON.parse(readFileSync(path.join(runLogDir, file), "utf-8")) as Record<
          string,
          unknown
        >
    )
    .find((candidate) => candidate.schemaVersion === 1);
  if (!runLog) {
    throw new Error("Expected a schema-versioned run log.");
  }
  const { command, input, inputFile, mode, operations, provider, result } =
    runLog;
  return {
    command,
    input,
    inputFile: inputFile === null ? null : "<input>",
    mode,
    operations,
    provider,
    result,
    schemaVersion: runLog.schemaVersion,
  };
}
