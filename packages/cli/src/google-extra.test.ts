import { describe, expect, it } from "vitest";

import { buildUndoOperationsFromRunLog, renderCsv } from "./google-extra.js";

describe("Google CLI safety helpers", () => {
  it("refuses to undo a validate-mode log", () => {
    expect(() =>
      buildUndoOperationsFromRunLog({ mode: "validate", operations: [] })
    ).toThrow("execute-mode");
  });
  it("restores the logged prior status", () => {
    const operations = buildUndoOperationsFromRunLog({
      mode: "execute",
      operations: [
        {
          adGroupOperation: {
            update: {
              resourceName: "customers/123/adGroups/9",
              status: "PAUSED",
            },
          },
        },
      ],
      result: {
        planDiff: [{ current: "PAUSED", id: "9", proposed: "PAUSED" }],
      },
    });
    expect(operations).toStrictEqual([
      {
        adGroupOperation: {
          update: {
            resourceName: "customers/123/adGroups/9",
            status: "PAUSED",
          },
          updateMask: "status",
        },
      },
    ]);
  });
  it("restores prior state from lifecycle-labeled harness logs", () => {
    const operations = buildUndoOperationsFromRunLog({
      mode: "execute",
      operations: [
        {
          adGroupOperation: {
            update: {
              resourceName: "customers/123/adGroups/44",
              status: "PAUSED",
            },
          },
        },
      ],
      result: {
        lifecycle: "executed",
        planDiff: [
          {
            current: "ENABLED",
            id: "44",
            proposed: "PAUSED",
            resourceName: "customers/123/adGroups/44",
          },
        ],
      },
    });
    expect(operations).toStrictEqual([
      {
        adGroupOperation: {
          update: {
            resourceName: "customers/123/adGroups/44",
            status: "ENABLED",
          },
          updateMask: "status",
        },
      },
    ]);
  });
  it("refuses operations without prior state", () => {
    expect(() =>
      buildUndoOperationsFromRunLog({
        mode: "execute",
        operations: [{ adOperation: { update: {} } }],
        result: { planDiff: [] },
      })
    ).toThrow("cannot be safely inverted");
  });
  it("renders volume rows as CSV", () => {
    expect(
      renderCsv([{ avgMonthlySearches: 20, keyword: "tax help" }])
    ).toContain('"tax help"');
  });
});
