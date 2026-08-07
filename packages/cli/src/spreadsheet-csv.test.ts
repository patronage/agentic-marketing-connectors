import { describe, expect, it } from "vitest";

import {
  escapeCsvCell,
  neutralizeSpreadsheetCell,
  renderSpreadsheetCsv,
  spreadsheetCsvCell,
} from "./spreadsheet-csv.js";

describe("spreadsheet cell neutralization", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+cmd", "'+cmd"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\tremote", "'\tremote"],
    ["\rremote", "'\rremote"],
    ["   =1+1", "'   =1+1"],
    [" \t+cmd", "' \t+cmd"],
  ])("neutralizes externally controlled %j", (input, expected) => {
    expect(neutralizeSpreadsheetCell(input)).toBe(expected);
  });

  it.each([
    ["ordinary text", "ordinary text"],
    ["José 🗳️", "José 🗳️"],
    ["hello, world", "hello, world"],
    ["  ordinary text", "  ordinary text"],
    [42, "42"],
    [-42, "-42"],
    [3.14, "3.14"],
  ])("preserves non-formula value %j", (input, expected) => {
    expect(neutralizeSpreadsheetCell(input)).toBe(expected);
  });
});

describe("CSV syntax escaping", () => {
  it("quotes delimiters and doubles embedded quotes without applying policy", () => {
    expect(escapeCsvCell('hello, "world"')).toBe('"hello, ""world"""');
    expect(escapeCsvCell("=1+1")).toBe('"=1+1"');
  });

  it("composes neutralization before CSV escaping", () => {
    expect(spreadsheetCsvCell(' =HYPERLINK("https://example.test")')).toBe(
      '"\' =HYPERLINK(""https://example.test"")"'
    );
  });

  it("renders representative external-data rows with numerics intact", () => {
    expect(
      renderSpreadsheetCsv(
        [
          {
            clicks: 12,
            searchTerm: '=IMPORTDATA("https://example.test")',
            source: "café, organic",
          },
        ],
        { quoteHeaders: true }
      )
    ).toBe(
      '"clicks","searchTerm","source"\n"12","\'=IMPORTDATA(""https://example.test"")","café, organic"'
    );
  });
});
