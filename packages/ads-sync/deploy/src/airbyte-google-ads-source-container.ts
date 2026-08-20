import { Container } from "@cloudflare/containers";

export class AirbyteGoogleAdsSourceContainer extends Container {
  override defaultPort = 8080;
  override sleepAfter = "2m";
}
