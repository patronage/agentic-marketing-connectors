import { describe, expect, it } from "vitest";

import { decodePartialFailureError } from "./partial-failure.js";

describe(decodePartialFailureError, () => {
  it("preserves the operation index and field path", () => {
    expect(
      decodePartialFailureError({
        details: [
          {
            errors: [
              {
                location: {
                  fieldPathElements: [
                    { fieldName: "mutate_operations", index: 2 },
                    { fieldName: "ad_group_operation" },
                  ],
                },
                message: "invalid status",
                trigger: { stringValue: "BAD" },
              },
            ],
          },
        ],
      })
    ).toStrictEqual([
      {
        fieldPath: "mutate_operations.ad_group_operation",
        message: "invalid status",
        operationIndex: 2,
        trigger: "BAD",
      },
    ]);
  });
});
