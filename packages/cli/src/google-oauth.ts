import { spawn } from "node:child_process";
import { createServer } from "node:http";

export interface GoogleOAuthTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface BrowserOpenerProcess {
  once: (event: "error", listener: (error: Error) => void) => unknown;
  unref: () => unknown;
}

export type BrowserSpawner = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: "ignore" }
) => BrowserOpenerProcess;

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    access_type: "offline",
    client_id: input.clientId,
    prompt: "consent",
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetch?: typeof fetch;
  redirectUri: string;
}): Promise<GoogleOAuthTokens> {
  const response = await (input.fetch ?? globalThis.fetch)(
    "https://oauth2.googleapis.com/token",
    {
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    }
  );
  const body = (await response.json()) as GoogleOAuthTokens & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || body.error) {
    throw new Error(
      `Google token exchange failed: ${body.error ?? response.status}${body.error_description ? ` — ${body.error_description}` : ""}`
    );
  }
  return body;
}

export async function mintGoogleRefreshToken(input: {
  clientId: string;
  clientSecret: string;
  openBrowser?: boolean;
  port?: number;
  timeoutMs?: number;
}): Promise<GoogleOAuthTokens> {
  const port = input.port ?? 3000;
  const redirectUri = `http://localhost:${port}/oauth/callback`;
  const state = crypto.randomUUID();
  const authorizationUrl = buildGoogleAuthorizationUrl({
    clientId: input.clientId,
    redirectUri,
    state,
  });
  process.stdout.write(
    `Authorize Google Ads access at:\n${authorizationUrl}\n`
  );
  if (input.openBrowser !== false) {
    openGoogleAuthorizationUrl(authorizationUrl);
  }
  const code = await waitForGoogleAuthorizationCode({
    port,
    state,
    timeoutMs: input.timeoutMs ?? 300_000,
  });
  return exchangeGoogleAuthorizationCode({ ...input, code, redirectUri });
}

export function openGoogleAuthorizationUrl(
  authorizationUrl: string,
  spawnProcess: BrowserSpawner = spawn,
  log: (message: string) => void = console.error
): void {
  const child = spawnProcess("open", [authorizationUrl], {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", () => {
    log("Could not open a browser. Open the printed URL manually.");
  });
  child.unref();
}

function waitForGoogleAuthorizationCode(input: {
  port: number;
  state: string;
  timeoutMs: number;
}): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- node:http exposes callback events.
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${input.port}`);
      if (url.pathname !== "/oauth/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error || !code || url.searchParams.get("state") !== input.state) {
        response
          .writeHead(400)
          .end("Google authorization failed. Return to your terminal.");
        server.close();
        reject(new Error(error ?? "Google OAuth callback was invalid."));
        return;
      }
      response
        .writeHead(200)
        .end("Google authorization succeeded. Return to your terminal.");
      server.close();
      resolve(code);
    });
    server.on("error", reject);
    server.listen(input.port, "localhost");
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for Google OAuth callback."));
    }, input.timeoutMs);
    server.on("close", () => clearTimeout(timeout));
  });
}
