import { describe, expect, it } from "vitest";

import {
  referenceDeploymentProviders,
  referenceDeploymentSupportedImageVersions,
} from "./index.js";

describe("reference deployment provider contract", () => {
  it("asserts the package-pinned image versions", () => {
    expect(referenceDeploymentSupportedImageVersions).toMatchObject({
      destination: "airbyte/destination-postgres:3.0.13",
      google_ads: "airbyte/source-google-ads:4.2.5",
      meta_ads: "airbyte/source-facebook-marketing:5.2.11",
    });
  });

  it("exposes launch provider summaries", () => {
    expect(
      referenceDeploymentProviders.map(({ provider }) => provider)
    ).toStrictEqual(["google_ads", "meta_ads"]);
  });
});
