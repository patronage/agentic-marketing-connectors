import { createGoogleAdsClient } from "@patronage/google-ads";
import type { GoogleAdsServiceClient } from "@patronage/google-ads";
import { createGoogleOAuthRefreshAdapter } from "@patronage/google-ads/oauth";

import { loadLocalDotenv, optionalEnv, requireEnv } from "./local-env.js";

const cliSourceDirectory = import.meta.dirname;

export function createLocalGoogleAdsClient(): GoogleAdsServiceClient {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);

  const env = readGoogleAdsEnv();
  const auth = createGoogleOAuthRefreshAdapter({
    credentials: {
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      refreshToken: env.refreshToken,
    },
  });

  return createGoogleAdsClient({
    auth,
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

export function readLocalGoogleAdsEnvironment(): {
  clientId: string;
  clientSecret: string;
} {
  loadLocalDotenv([process.cwd(), cliSourceDirectory]);
  return {
    clientId: requireEnv("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_ADS_CLIENT_SECRET"),
  };
}
