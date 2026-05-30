import { describe, expect, it } from "vitest";

import { dateRangeFromOptions } from "./google.js";

describe("Google CLI option parsing", () => {
  it("uses a positive integer days range", () => {
    expect(dateRangeFromOptions({ customerId: "123", days: "30" })).toEqual({
      days: 30,
    });
  });

  it("rejects malformed days input instead of truncating it", () => {
    expect(() =>
      dateRangeFromOptions({ customerId: "123", days: "30days" })
    ).toThrow("--days must be a positive integer");
    expect(() =>
      dateRangeFromOptions({ customerId: "123", days: "1.5" })
    ).toThrow("--days must be a positive integer");
  });

  it("keeps explicit date ranges separate from days parsing", () => {
    expect(
      dateRangeFromOptions({
        customerId: "123",
        since: "2026-05-01",
        until: "2026-05-22",
      })
    ).toEqual({ since: "2026-05-01", until: "2026-05-22" });
  });
});
