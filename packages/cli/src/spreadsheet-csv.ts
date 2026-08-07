/**
 * Convert a value to spreadsheet-safe cell text.
 *
 * Strings that a spreadsheet can interpret as formulas are prefixed with a
 * single quote. Numbers are deliberately left as ordinary numeric text.
 */
export function neutralizeSpreadsheetCell(value: unknown): string {
  const rendered = value === null || value === undefined ? "" : String(value);

  if (
    typeof value === "string" &&
    (/^[\t\r]/u.test(rendered) || /^\s*[=+@-]/u.test(rendered))
  ) {
    return `'${rendered}`;
  }

  return rendered;
}

/** Escape already-neutralized cell text for CSV syntax. */
export function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Apply the spreadsheet-cell policy before applying CSV syntax escaping. */
export function spreadsheetCsvCell(value: unknown): string {
  return escapeCsvCell(neutralizeSpreadsheetCell(value));
}

export function renderSpreadsheetCsv(
  rows: Record<string, unknown>[],
  options: { quoteHeaders?: boolean } = {}
): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = [...new Set(rows.flatMap(Object.keys))];
  return [
    (options.quoteHeaders ? headers.map(escapeCsvCell) : headers).join(","),
    ...rows.map((row) =>
      headers.map((header) => spreadsheetCsvCell(row[header])).join(",")
    ),
  ].join("\n");
}
