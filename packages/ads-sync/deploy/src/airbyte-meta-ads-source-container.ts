import { Container } from "@cloudflare/containers";

export class AirbyteMetaAdsSourceContainer extends Container {
  override defaultPort = 8080;
  override sleepAfter = "2m";
}
