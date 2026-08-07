import { describe, expect, it } from "vitest";

import {
  referenceDeploymentProviders,
  referenceDeploymentSupportedImageVersions,
} from "./index.js";

describe("reference deployment provider contract", () => {
  it("asserts the package-pinned image versions", () => {
    expect(referenceDeploymentSupportedImageVersions).toMatchObject({
      destination:
        "airbyte/destination-postgres:3.0.13@sha256:0b310bd46ba0e006757ea3dc1d3b8ef8e3bcf51c3a96f5460a836653b5ac4f4c",
      google_ads:
        "airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed",
      meta_ads:
        "airbyte/source-facebook-marketing:5.2.11@sha256:4d6c916b29862ded4b5b94feea0b8ef75899f34c364e4884312e50414b6d447c",
    });
  });

  it("exposes launch provider summaries", () => {
    expect(
      referenceDeploymentProviders.map(({ provider }) => provider)
    ).toStrictEqual(["google_ads", "meta_ads"]);
  });
});
