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

import { createLinkedInCommand } from "./linkedin.js";

describe("LinkedIn ads CLI commands", () => {
  it("validates boost creation without constructing a LinkedIn client", async () => {
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-run-log-"));
    const command = createLinkedInCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

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
      readFileSync(path.join(runLogDir, runLogFile ?? ""), "utf8")
    ) as { mode: string; operations: unknown[] };
    expect(runLog.mode).toBe("validate");
    expect(runLog.operations).toHaveLength(1);

    rmSync(runLogDir, { force: true, recursive: true });
  });

  it("loads ad account defaults from .env before boost validation", async () => {
    const previousCwd = process.cwd();
    const previousAdAccountId = process.env.LINKEDIN_AD_ACCOUNT_ID;
    const workDir = mkdtempSync(path.join(tmpdir(), "linkedin-env-"));
    const runLogDir = mkdtempSync(path.join(tmpdir(), "linkedin-run-log-"));
    writeFileSync(path.join(workDir, ".env"), "LINKEDIN_AD_ACCOUNT_ID=456\n");
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

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
      ).rejects.toThrow("input.name is required.");
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
      ).rejects.toThrow("input.thankYouMessage is required.");
    } finally {
      rmSync(runLogDir, { force: true, recursive: true });
    }
  });

  it("ignores invalid days when explicit performance dates are supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const command = createLinkedInCommand();
    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

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

  it("lists all lead form pages", async () => {
    const fetchMock = vi
      .fn()
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
      .fn()
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
      .fn()
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
