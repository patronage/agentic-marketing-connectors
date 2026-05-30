export type XProviderName = "x-api" | "xai-grok";

export interface XPostMetrics {
  likeCount?: number;
  quoteCount?: number;
  replyCount?: number;
  repostCount?: number;
  viewCount?: number;
}

export interface XPostRecord {
  handle: string;
  hasVideo: boolean;
  id: string;
  isQuote: boolean;
  isReply: boolean;
  isRetweet: boolean;
  mediaTypes: string[];
  metrics?: XPostMetrics;
  provider: XProviderName;
  publishedAt: string;
  sharedUrls: string[];
  text: string;
  url: string;
  warnings: string[];
}

export interface ListRecentPostsInput {
  handle: string;
  limit?: number;
  provider?: XProviderName;
  since: string;
  until: string;
  xAiApiKey?: string;
  xAiModel?: string;
  xApiBearerToken?: string;
}

export interface ListRecentPostsResult {
  handle: string;
  posts: XPostRecord[];
  provider: XProviderName;
  since: string;
  until: string;
  warnings: string[];
}

export interface CompareProvidersInput {
  handle: string;
  limit?: number;
  since: string;
  until: string;
  xAiApiKey?: string;
  xAiModel?: string;
  xApiBearerToken?: string;
}

export interface ProviderComparison {
  metricsAvailability: Record<XProviderName, number>;
  overlapUrls: string[];
  videoAgreement: {
    matched: number;
    mismatched: number;
  };
  xAiOnlyUrls: string[];
  xApiOnlyUrls: string[];
}

export interface CompareProvidersResult {
  comparison: ProviderComparison;
  handle: string;
  results: Partial<Record<XProviderName, ListRecentPostsResult>>;
  since: string;
  until: string;
  warnings: string[];
}
