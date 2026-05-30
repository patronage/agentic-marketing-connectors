import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createGoogleAdsClient,
  type GoogleAdsClient,
} from "@patronage/google-ads";

import { loadLocalDotenv, optionalEnv, requireEnv } from "./local-env.js";

const cliSourceDirectory = dirname(fileURLToPath(import.meta.url));

export function createLocalGoogleAdsClient(): GoogleAdsClient {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);

  const env = readGoogleAdsEnv();

  return createGoogleAdsClient({
    auth: {
      async getAccessToken() {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          body: new URLSearchParams({
            client_id: env.clientId,
            client_secret: env.clientSecret,
            grant_type: "refresh_token",
            refresh_token: env.refreshToken,
          }),
          headers: { "content-type": "application/x-www-form-urlencoded" },
          method: "POST",
        });

        const body = (await response.json()) as {
          access_token?: string;
          error?: string;
        };

        if (!response.ok || !body.access_token) {
          throw new Error(
            `OAuth refresh failed: ${response.status} ${JSON.stringify(body)}`
          );
        }

        return body.access_token;
      },
    },
    developerToken: env.developerToken,
    loginCustomerId: env.loginCustomerId,
  });
}

function readGoogleAdsEnv(): {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  loginCustomerId?: string;
  refreshToken: string;
} {
  return {
    clientId: requireEnv("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_ADS_CLIENT_SECRET"),
    developerToken: requireEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    loginCustomerId: optionalEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID"),
    refreshToken: requireEnv("GOOGLE_ADS_REFRESH_TOKEN"),
  };
}
