export type GoogleAdsRow = Record<string, unknown>;

export function normalizeCustomerId(customerId: string): string {
  return customerId.replaceAll("-", "");
}

export function microsToCurrency(value: unknown): number {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue / 1_000_000;
}
