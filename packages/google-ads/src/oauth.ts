const DEFAULT_GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_EXPIRY_SKEW_MS = 60_000;

export type GoogleOAuthRefreshErrorKind =
  | "invalid-response"
  | "provider"
  | "transport";

export class GoogleOAuthRefreshError extends Error {
  readonly code: string | undefined;
  readonly kind: GoogleOAuthRefreshErrorKind;
  readonly providerRequestId: string | undefined;
  readonly status: number | undefined;

  constructor(input: {
    code?: string;
    kind: GoogleOAuthRefreshErrorKind;
    message: string;
    providerRequestId?: string;
    status?: number;
  }) {
    super(input.message);
    this.name = "GoogleOAuthRefreshError";
    this.code = input.code;
    this.kind = input.kind;
    this.providerRequestId = input.providerRequestId;
    this.status = input.status;
  }
}

export interface GoogleOAuthRefreshCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface CreateGoogleOAuthRefreshAdapterOptions {
  credentials: GoogleOAuthRefreshCredentials;
  expirySkewMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
  tokenUrl?: string;
}

export interface GoogleOAuthRefreshAdapter {
  getAccessToken: () => Promise<string>;
}

export function createGoogleOAuthRefreshAdapter(
  options: CreateGoogleOAuthRefreshAdapterOptions
): GoogleOAuthRefreshAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required.");
  }
  const now = options.now ?? Date.now;
  const expirySkewMs = options.expirySkewMs ?? DEFAULT_EXPIRY_SKEW_MS;
  const tokenUrl = options.tokenUrl ?? DEFAULT_GOOGLE_OAUTH_TOKEN_URL;
  let cached: { expiresAtMs: number; token: string } | undefined;
  let refreshPromise:
    | Promise<{ expiresAtMs: number; token: string }>
    | undefined;

  return {
    async getAccessToken() {
      if (cached && cached.expiresAtMs - expirySkewMs > now()) {
        return cached.token;
      }
      refreshPromise ??= refreshGoogleAccessToken();
      try {
        cached = await refreshPromise;
        return cached.token;
      } finally {
        refreshPromise = undefined;
      }
    },
  };

  async function refreshGoogleAccessToken(): Promise<{
    expiresAtMs: number;
    token: string;
  }> {
    let response: Response;
    try {
      response = await fetchImpl(tokenUrl, {
        body: new URLSearchParams({
          client_id: options.credentials.clientId,
          client_secret: options.credentials.clientSecret,
          grant_type: "refresh_token",
          refresh_token: options.credentials.refreshToken,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
    } catch {
      throw new GoogleOAuthRefreshError({
        kind: "transport",
        message: "Google OAuth token refresh failed during transport.",
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GoogleOAuthRefreshError({
        kind: "invalid-response",
        message: "Google OAuth token refresh returned invalid JSON.",
        providerRequestId: googleRequestId(response),
        status: response.status,
      });
    }
    if (!response.ok) {
      if (!isGoogleOAuthErrorBody(body)) {
        throw invalidGoogleOAuthResponse(response);
      }
      throw new GoogleOAuthRefreshError({
        code: safeGoogleOAuthErrorCode(body.error, options.credentials),
        kind: "provider",
        message: "Google OAuth token refresh was rejected.",
        providerRequestId: googleRequestId(response),
        status: response.status,
      });
    }
    if (!isGoogleOAuthSuccessBody(body)) {
      throw invalidGoogleOAuthResponse(response);
    }
    return {
      expiresAtMs: now() + Math.max(body.expires_in ?? 0, 0) * 1000,
      token: body.access_token,
    };
  }
}

function safeGoogleOAuthErrorCode(
  code: string,
  credentials: GoogleOAuthRefreshCredentials
): string | undefined {
  const containsCredential = Object.values(credentials).some(
    (credential) => credential.length > 0 && code.includes(credential)
  );
  return /^[a-z][a-z0-9_]{0,63}$/u.test(code) && !containsCredential
    ? code
    : undefined;
}

function invalidGoogleOAuthResponse(
  response: Response
): GoogleOAuthRefreshError {
  return new GoogleOAuthRefreshError({
    kind: "invalid-response",
    message: "Google OAuth token refresh returned an invalid response.",
    providerRequestId: googleRequestId(response),
    status: response.status,
  });
}

function isGoogleOAuthErrorBody(body: unknown): body is { error: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "error" in body &&
    typeof body.error === "string"
  );
}

function isGoogleOAuthSuccessBody(
  body: unknown
): body is { access_token: string; expires_in: number } {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "access_token" in body &&
    typeof body.access_token === "string" &&
    body.access_token.length > 0 &&
    "expires_in" in body &&
    typeof body.expires_in === "number" &&
    Number.isFinite(body.expires_in)
  );
}

function googleRequestId(response: Response): string | undefined {
  return response.headers.get("x-request-id") ?? undefined;
}
