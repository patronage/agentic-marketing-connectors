import { normalizeCustomerId, type GoogleAdsRow } from "../core/index.js";

export interface GoogleAdsAuthProvider {
  getAccessToken(): Promise<string>;
}

export interface GoogleAdsClientOptions {
  apiVersion?: string;
  auth: GoogleAdsAuthProvider;
  developerToken: string;
  fetch?: typeof fetch;
  loginCustomerId?: string;
}

export interface SearchInput {
  customerId: string;
  pageToken?: string;
  query: string;
  signal?: AbortSignal;
}

export interface SearchResult {
  nextPageToken?: string;
  requestId: string | null;
  rows: GoogleAdsRow[];
  summaryRow?: GoogleAdsRow;
}

export interface MutateInput {
  customerId: string;
  operations: unknown[];
  partialFailure?: boolean;
  validateOnly: boolean;
}

export interface MutateResult {
  /**
   * Per-operation result envelopes from the batched googleAds:mutate
   * endpoint. Each entry looks like { adGroupResult: { resourceName },
   * adGroupCriterionResult: { resourceName }, ... } depending on the
   * operation type. Empty when validateOnly is true.
   */
  mutateOperationResponses: unknown[];
  partialFailureError?: unknown;
  requestId: string | null;
}

export interface MutateExperimentInput {
  customerId: string;
  operations: unknown[];
  partialFailure?: boolean;
  validateOnly: boolean;
}

export interface MutateExperimentResult {
  partialFailureError?: unknown;
  requestId: string | null;
  results: unknown[];
}

export interface MutateExperimentArmInput {
  customerId: string;
  operations: unknown[];
  partialFailure?: boolean;
  responseContentType?: "MUTABLE_RESOURCE" | "RESOURCE_NAME_ONLY";
  validateOnly: boolean;
}

export interface MutateExperimentArmResult {
  partialFailureError?: unknown;
  requestId: string | null;
  results: unknown[];
}

export interface ScheduleExperimentInput {
  resourceName: string;
  validateOnly: boolean;
}

export interface ScheduleExperimentResult {
  done?: boolean;
  error?: unknown;
  metadata?: unknown;
  name: string | null;
  requestId: string | null;
  response?: unknown;
}

export interface EndExperimentInput {
  experimentResourceName: string;
  validateOnly: boolean;
}

export interface EndExperimentResult {
  experiment?: unknown;
  requestId: string | null;
}

export interface GoogleAdsClient {
  mutate(input: MutateInput): Promise<MutateResult>;
  search(input: SearchInput): Promise<SearchResult>;
  searchStream(input: SearchInput): Promise<SearchResult>;
}

export interface GoogleAdsExperimentClient {
  endExperiment(input: EndExperimentInput): Promise<EndExperimentResult>;
  mutateExperimentArms(
    input: MutateExperimentArmInput
  ): Promise<MutateExperimentArmResult>;
  mutateExperiments(
    input: MutateExperimentInput
  ): Promise<MutateExperimentResult>;
  scheduleExperiment(
    input: ScheduleExperimentInput
  ): Promise<ScheduleExperimentResult>;
}

export function createGoogleAdsClient(
  options: GoogleAdsClientOptions
): GoogleAdsClient & GoogleAdsExperimentClient {
  const apiVersion = options.apiVersion ?? "v24";
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  if (!fetchImplementation) {
    throw new Error("A fetch implementation is required.");
  }

  async function requestGoogleAdsServiceJson(
    customerId: string,
    methodName: "mutate" | "search" | "searchStream",
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ data: unknown; requestId: string | null }> {
    return requestJson(
      `customers/${normalizeCustomerId(customerId)}/googleAds:${methodName}`,
      body,
      signal
    );
  }

  async function requestJson(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ data: unknown; requestId: string | null }> {
    const accessToken = await options.auth.getAccessToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "developer-token": options.developerToken,
    };

    if (options.loginCustomerId) {
      headers["login-customer-id"] = normalizeCustomerId(
        options.loginCustomerId
      );
    }

    const requestInit: RequestInit = {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    };

    if (signal) {
      requestInit.signal = signal;
    }

    const response = await fetchImplementation(
      `https://googleads.googleapis.com/${apiVersion}/${path}`,
      requestInit
    );

    const requestId = response.headers.get("request-id");

    if (!response.ok) {
      throw new Error(
        `Google Ads request failed with status ${response.status}: ${await response.text()}`
      );
    }

    return { data: await response.json(), requestId };
  }

  return {
    async endExperiment(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "endExperiment requires validateOnly to be explicit."
        );
      }

      const { data, requestId } = await requestJson(
        `${input.experimentResourceName}:endExperiment`,
        { validateOnly: input.validateOnly }
      );
      const response = asRecord(data);

      return {
        experiment: response.experiment,
        requestId,
      };
    },
    async mutate(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError("mutate requires validateOnly to be explicit.");
      }

      const body: Record<string, unknown> = {
        mutateOperations: input.operations,
      };

      if (typeof input.partialFailure === "boolean") {
        body.partialFailure = input.partialFailure;
      }

      body.validateOnly = input.validateOnly;

      const { data, requestId } = await requestGoogleAdsServiceJson(
        input.customerId,
        "mutate",
        body
      );
      const response = asRecord(data);

      return {
        mutateOperationResponses: Array.isArray(
          response.mutateOperationResponses
        )
          ? response.mutateOperationResponses
          : [],
        partialFailureError: response.partialFailureError,
        requestId,
      };
    },
    async search(input) {
      const body: Record<string, unknown> = {
        query: input.query,
      };

      if (input.pageToken !== undefined) {
        body.pageToken = input.pageToken;
      }

      const { data, requestId } = await requestGoogleAdsServiceJson(
        input.customerId,
        "search",
        body,
        input.signal
      );
      const response = asRecord(data);

      return {
        nextPageToken:
          typeof response.nextPageToken === "string"
            ? response.nextPageToken
            : undefined,
        requestId,
        rows: toRows(response.results),
        summaryRow: asOptionalRow(response.summaryRow),
      };
    },
    async searchStream(input) {
      const body: Record<string, unknown> = { query: input.query };

      const { data, requestId } = await requestGoogleAdsServiceJson(
        input.customerId,
        "searchStream",
        body,
        input.signal
      );
      const batches = Array.isArray(data) ? data : [];
      const rows = batches.flatMap((batch) => toRows(asRecord(batch).results));

      return { requestId, rows };
    },
    async mutateExperimentArms(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "mutateExperimentArms requires validateOnly to be explicit."
        );
      }

      const body: Record<string, unknown> = {
        operations: input.operations,
        validateOnly: input.validateOnly,
      };

      if (typeof input.partialFailure === "boolean") {
        body.partialFailure = input.partialFailure;
      }

      if (input.responseContentType) {
        body.responseContentType = input.responseContentType;
      }

      const { data, requestId } = await requestJson(
        `customers/${normalizeCustomerId(input.customerId)}/experimentArms:mutate`,
        body
      );
      const response = asRecord(data);

      return {
        partialFailureError: response.partialFailureError,
        requestId,
        results: Array.isArray(response.results) ? response.results : [],
      };
    },
    async mutateExperiments(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "mutateExperiments requires validateOnly to be explicit."
        );
      }

      const body: Record<string, unknown> = {
        operations: input.operations,
        validateOnly: input.validateOnly,
      };

      if (typeof input.partialFailure === "boolean") {
        body.partialFailure = input.partialFailure;
      }

      const { data, requestId } = await requestJson(
        `customers/${normalizeCustomerId(input.customerId)}/experiments:mutate`,
        body
      );
      const response = asRecord(data);

      return {
        partialFailureError: response.partialFailureError,
        requestId,
        results: Array.isArray(response.results) ? response.results : [],
      };
    },
    async scheduleExperiment(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "scheduleExperiment requires validateOnly to be explicit."
        );
      }

      const { data, requestId } = await requestJson(
        `${input.resourceName}:scheduleExperiment`,
        { validateOnly: input.validateOnly }
      );
      const response = asRecord(data);

      return {
        done: typeof response.done === "boolean" ? response.done : undefined,
        error: response.error,
        metadata: response.metadata,
        name: typeof response.name === "string" ? response.name : null,
        requestId,
        response: response.response,
      };
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asOptionalRow(value: unknown): GoogleAdsRow | undefined {
  const row = asRecord(value);
  return Object.keys(row).length > 0 ? row : undefined;
}

function toRows(value: unknown): GoogleAdsRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => asRecord(row));
}
