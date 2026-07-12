import { providerDefinitions, supportedProviders } from "@patronage/ads-sync";

export { supportedImageVersions as referenceDeploymentSupportedImageVersions } from "@patronage/ads-sync";
export const referenceDeploymentProviders = supportedProviders.map(
  (provider) => ({
    displayName: providerDefinitions[provider].displayName,
    provider,
  })
);
