import { providerDefinitions, supportedProviders } from "@patronage/ads-sync";

const providerSummaries = supportedProviders.map((provider) => ({
  displayName: providerDefinitions[provider].displayName,
  provider,
}));

export default {
  fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "ads-sync-reference-deployment",
      });
    }

    return Response.json({
      providers: providerSummaries,
      routes: ["GET /health", "GET /"],
      service: "ads-sync-reference-deployment",
    });
  },
} satisfies ExportedHandler;
