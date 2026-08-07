import { normalizeCustomerId } from "../core/index.js";

export type WorkflowMode = "execute" | "validate";

export function customerResourceName(
  customerId: string,
  collection: string,
  id: string,
  fieldName = "resource id"
): string {
  const normalizedCustomerId = normalizeCustomerId(customerId);

  assertNumericId(normalizedCustomerId, "customerId");
  assertNumericId(id, fieldName);

  return `customers/${normalizedCustomerId}/${collection}/${id}`;
}

export function normalizeAndAssertCustomerId(customerId: string): string {
  const normalizedCustomerId = normalizeCustomerId(customerId);

  assertNumericId(normalizedCustomerId, "customerId");

  return normalizedCustomerId;
}

export function assertNonEmptyArray<T>(
  value: T[],
  message: string
): asserts value is [T, ...T[]] {
  if (value.length === 0) {
    throw new Error(message);
  }
}

export function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

export function assertResourceName(
  value: string,
  pattern: RegExp,
  fieldName: string
): void {
  if (!pattern.test(value)) {
    throw new Error(
      `${fieldName} is not a supported Google Ads resource name.`
    );
  }
}

export function assertCustomerResourceMatches(
  resourceName: string,
  customerId: string,
  fieldName: string
): void {
  const expectedPrefix = `customers/${customerId}/`;

  if (!resourceName.startsWith(expectedPrefix)) {
    throw new Error(`${fieldName} must belong to customer ${customerId}.`);
  }
}

export function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

export function assertNonEmptyString(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must not be empty.`);
  }
}

export function validateOnlyFromMode(mode: WorkflowMode | undefined): boolean {
  return mode !== "execute";
}

export function updateMask(fields: string[]): string {
  if (fields.length === 0) {
    throw new Error("At least one update field is required.");
  }

  return fields.join(",");
}
