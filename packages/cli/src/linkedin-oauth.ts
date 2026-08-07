import { spawn } from "node:child_process";
import { createServer } from "node:http";

export const DEFAULT_LINKEDIN_SCOPES: readonly string[] = [
  "r_ads",
  "rw_ads",
  "r_ads_reporting",
  "r_lead_gen_forms",
  "w_lead_gen_forms",
  "r_organization_social",
  "w_organization_social",
  "rw_organization_admin",
];

export interface LinkedInOAuthTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export function buildLinkedInAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  scopes?: readonly string[];
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: (input.scopes ?? DEFAULT_LINKEDIN_SCOPES).join(" "),
    state: input.state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export async function exchangeLinkedInAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetch?: typeof fetch;
  redirectUri: string;
}): Promise<LinkedInOAuthTokens> {
  const response = await (input.fetch ?? globalThis.fetch)(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    }
  );
  const body = (await response.json()) as LinkedInOAuthTokens & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || body.error) {
    throw new Error(
      `LinkedIn token exchange failed: ${body.error ?? response.status}${body.error_description ? ` — ${body.error_description}` : ""}`
    );
  }
  return body;
}

export async function mintLinkedInAccessToken(input: {
  clientId: string;
  clientSecret: string;
  openBrowser?: boolean;
  port?: number;
  scopes?: readonly string[];
  timeoutMs?: number;
}): Promise<LinkedInOAuthTokens> {
  const port = input.port ?? 3001;
  const redirectUri = `http://localhost:${port}/oauth/callback`;
  const state = crypto.randomUUID();
  const authorizationUrl = buildLinkedInAuthorizationUrl({
    clientId: input.clientId,
    redirectUri,
    ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
    state,
  });
  process.stdout.write(`Authorize LinkedIn access at:\n${authorizationUrl}\n`);
  if (input.openBrowser !== false) {
    spawn("open", [authorizationUrl], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
  const code = await waitForAuthorizationCode({
    port,
    state,
    timeoutMs: input.timeoutMs ?? 300_000,
  });
  return exchangeLinkedInAuthorizationCode({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    code,
    redirectUri,
  });
}

function waitForAuthorizationCode(input: {
  port: number;
  state: string;
  timeoutMs: number;
}): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- node:http exposes callback events rather than a promise API.
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${input.port}`);
      if (url.pathname !== "/oauth/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (error || !code || state !== input.state) {
        response
          .writeHead(400)
          .end("LinkedIn authorization failed. Return to your terminal.");
        server.close();
        reject(new Error(error ?? "LinkedIn OAuth callback was invalid."));
        return;
      }
      response
        .writeHead(200)
        .end("LinkedIn authorization succeeded. Return to your terminal.");
      server.close();
      resolve(code);
    });
    server.on("error", reject);
    server.listen(input.port);
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for LinkedIn OAuth callback."));
    }, input.timeoutMs);
    server.on("close", () => clearTimeout(timeout));
  });
}
