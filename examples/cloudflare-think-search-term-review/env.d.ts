import type { SearchTermReviewAgent } from "./agents/search-term-review.js";

declare global {
  namespace Cloudflare {
    interface Env {
      AI: Ai;
      GOOGLE_ADS_ACCESS_TOKEN?: string;
      GOOGLE_ADS_CUSTOMER_ID?: string;
      GOOGLE_ADS_DEVELOPER_TOKEN?: string;
      GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
      SearchTermReviewAgent: DurableObjectNamespace<SearchTermReviewAgent>;
    }
  }
}
