import { normalizeCustomerId } from "../core/index.js";
import type { GoogleAdsRow } from "../core/index.js";
import { GoogleAdsContractError } from "./google-ads-contract-error.js";

export { GoogleAdsContractError } from "./google-ads-contract-error.js";

export const DEFAULT_GOOGLE_ADS_API_VERSION = "v24";

export interface GoogleAdsAuthProvider {
  getAccessToken: () => Promise<string>;
}

export interface GoogleAdsClientOptions {
  apiVersion?: string;
  auth: GoogleAdsAuthProvider;
  developerToken: string;
  fetch?: typeof fetch;
  loginCustomerId?: string;
}

export class GoogleAdsRequestError extends Error {
  readonly requestId: string | null;
  readonly status: number;

  constructor(input: {
    message: string;
    requestId: string | null;
    status: number;
  }) {
    super(input.message);
    this.name = "GoogleAdsRequestError";
    this.requestId = input.requestId;
    this.status = input.status;
  }
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

export interface PromoteExperimentInput {
  resourceName: string;
  validateOnly: boolean;
}

export type PromoteExperimentResult = ScheduleExperimentResult;

export interface CampaignBudgetMapping {
  campaignBudget: string;
  experimentCampaign: string;
}

export interface GraduateExperimentInput {
  campaignBudgetMappings: CampaignBudgetMapping[];
  experiment: string;
  validateOnly: boolean;
}

export interface GraduateExperimentResult {
  requestId: string | null;
}

export interface EndExperimentInput {
  experimentResourceName: string;
  validateOnly: boolean;
}

export interface EndExperimentResult {
  experiment?: unknown;
  requestId: string | null;
}

export interface RecommendationActionInput {
  customerId: string;
  operations: unknown[];
  partialFailure?: boolean;
}

export interface RecommendationActionResult {
  partialFailureError?: unknown;
  requestId: string | null;
  results: unknown[];
}

export interface ServiceRequestInput {
  body: Record<string, unknown>;
  path: string;
  signal?: AbortSignal;
}

export interface ServiceRequestResult {
  data: unknown;
  requestId: string | null;
}

export interface GoogleAdsClient {
  mutate: (input: MutateInput) => Promise<MutateResult>;
  search: (input: SearchInput) => Promise<SearchResult>;
  searchStream: (input: SearchInput) => Promise<SearchResult>;
}

export interface GoogleAdsServiceClient extends GoogleAdsClient {
  request: (input: ServiceRequestInput) => Promise<ServiceRequestResult>;
}

export interface GoogleAdsExperimentClient {
  endExperiment: (input: EndExperimentInput) => Promise<EndExperimentResult>;
  graduateExperiment: (
    input: GraduateExperimentInput
  ) => Promise<GraduateExperimentResult>;
  mutateExperimentArms: (
    input: MutateExperimentArmInput
  ) => Promise<MutateExperimentArmResult>;
  mutateExperiments: (
    input: MutateExperimentInput
  ) => Promise<MutateExperimentResult>;
  promoteExperiment: (
    input: PromoteExperimentInput
  ) => Promise<PromoteExperimentResult>;
  scheduleExperiment: (
    input: ScheduleExperimentInput
  ) => Promise<ScheduleExperimentResult>;
}

export interface GoogleAdsRecommendationClient {
  applyRecommendations: (
    input: RecommendationActionInput
  ) => Promise<RecommendationActionResult>;
  dismissRecommendations: (
    input: RecommendationActionInput
  ) => Promise<RecommendationActionResult>;
}

export function createGoogleAdsClient(
  options: GoogleAdsClientOptions
): GoogleAdsServiceClient &
  GoogleAdsExperimentClient &
  GoogleAdsRecommendationClient {
  const apiVersion = options.apiVersion ?? DEFAULT_GOOGLE_ADS_API_VERSION;
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
      throw new GoogleAdsRequestError({
        message: `Google Ads request failed with status ${response.status}: ${await response.text()}`,
        requestId,
        status: response.status,
      });
    }

    return { data: await response.json(), requestId };
  }

  return {
    async applyRecommendations(input) {
      return recommendationAction("apply", input);
    },
    async dismissRecommendations(input) {
      return recommendationAction("dismiss", input);
    },
    async endExperiment(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "endExperiment requires validateOnly to be explicit."
        );
      }
      assertExperimentResourceName(input.experimentResourceName);

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
    async graduateExperiment(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "graduateExperiment requires validateOnly to be explicit."
        );
      }
      assertExperimentResourceName(input.experiment);
      if (input.campaignBudgetMappings.length !== 1) {
        throw new TypeError(
          "graduateExperiment requires exactly one campaign budget mapping."
        );
      }

      // Google Ads API v24 ExperimentService.GraduateExperiment REST binding:
      // https://developers.google.com/google-ads/api/reference/rpc/v24/ExperimentService/GraduateExperiment?transport=rest
      const { requestId } = await requestJson(
        `${input.experiment}:graduateExperiment`,
        {
          campaignBudgetMappings: input.campaignBudgetMappings,
          validateOnly: input.validateOnly,
        }
      );

      return { requestId };
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
    async request(input) {
      return requestJson(input.path, input.body, input.signal);
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
      const contractContext = {
        apiVersion,
        operation: "search",
        requestId,
      };
      const response = assertRecord(data, contractContext);
      assertOptionalArrayField(response, "results", contractContext);

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
      if (!Array.isArray(data)) {
        throw new GoogleAdsContractError({
          apiVersion,
          operation: "searchStream",
          requestId,
        });
      }
      const contractContext = {
        apiVersion,
        operation: "searchStream",
        requestId,
      };
      const rows = data.flatMap((batch) => {
        const response = assertRecord(batch, contractContext);
        assertOptionalArrayField(response, "results", contractContext);
        return toRows(response.results);
      });

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
    async promoteExperiment(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "promoteExperiment requires validateOnly to be explicit."
        );
      }
      assertExperimentResourceName(input.resourceName);

      // Google Ads API v24 ExperimentService.PromoteExperiment REST binding:
      // https://developers.google.com/google-ads/api/reference/rpc/v24/ExperimentService/PromoteExperiment?transport=rest
      const { data, requestId } = await requestJson(
        `${input.resourceName}:promoteExperiment`,
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
    async scheduleExperiment(input) {
      if (typeof input.validateOnly !== "boolean") {
        throw new TypeError(
          "scheduleExperiment requires validateOnly to be explicit."
        );
      }
      assertExperimentResourceName(input.resourceName);

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

  async function recommendationAction(
    action: "apply" | "dismiss",
    input: RecommendationActionInput
  ): Promise<RecommendationActionResult> {
    const body: Record<string, unknown> = {
      operations: input.operations,
    };

    if (typeof input.partialFailure === "boolean") {
      body.partialFailure = input.partialFailure;
    }

    const { data, requestId } = await requestJson(
      `customers/${normalizeCustomerId(input.customerId)}/recommendations:${action}`,
      body
    );
    const response = asRecord(data);

    return {
      partialFailureError: response.partialFailureError,
      requestId,
      results: Array.isArray(response.results) ? response.results : [],
    };
  }
}

function assertArrayField(
  value: Record<string, unknown>,
  field: string,
  context: { apiVersion: string; operation: string; requestId: string | null }
): void {
  if (!Array.isArray(value[field])) {
    throw new GoogleAdsContractError(context);
  }
}

/**
 * Only an envelope object may omit a field. Without this the body-level
 * `asRecord` would turn a null, scalar, or array response into `{}`, and an
 * optional-field check would then read it as an empty page.
 */
function assertRecord(
  value: unknown,
  context: { apiVersion: string; operation: string; requestId: string | null }
): Record<string, unknown> {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    throw new GoogleAdsContractError(context);
  }

  return value as Record<string, unknown>;
}

/**
 * A zero-row search page omits `results` altogether, because proto3 JSON drops
 * empty repeated fields, so an absent array is a valid empty page. A present
 * value that is not an array is still contract drift.
 */
function assertOptionalArrayField(
  value: Record<string, unknown>,
  field: string,
  context: { apiVersion: string; operation: string; requestId: string | null }
): void {
  if (value[field] !== undefined) {
    assertArrayField(value, field, context);
  }
}

function assertExperimentResourceName(resourceName: string): void {
  // The v24 Experiment resource documents this canonical resource-name form.
  // https://developers.google.com/google-ads/api/reference/rpc/v24/Experiment
  if (!/^customers\/\d+\/experiments\/\d+$/u.test(resourceName)) {
    throw new TypeError(
      "Experiment resource names must use customers/{customer_id}/experiments/{experiment_id}."
    );
  }
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
