export type BriefBiddingStrategy =
  | "manual-cpc"
  | "maximize-clicks"
  | "maximize-conversions";

export interface BriefFrontmatter {
  bidding: BriefBiddingStrategy;
  budget_daily: number;
  campaign_name: string;
  campaign_type: "SEARCH";
  client: string;
  end_date: string;
  geographic_targets: string[];
  language: string;
  /**
   * CPC ceiling in whole-cent dollars (0.01–1000), emitted as
   * targetSpend.cpcBidCeilingMicros. Requires bidding: maximize-clicks —
   * validate-brief rejects it under any other strategy. Ad Grants briefs
   * on Maximize Clicks set 2.
   */
  max_cpc?: number;
  start_date: string;
}

export type BriefMatchType = "BROAD" | "EXACT" | "PHRASE";

export interface BriefKeyword {
  match_type: BriefMatchType;
  text: string;
}

export type BriefNegativeKeyword = BriefKeyword;

export interface BriefAd {
  descriptions: string[];
  final_url: string;
  headlines: string[];
  path_1?: string;
  path_2?: string;
}

export interface BriefSitelink {
  description_1?: string;
  description_2?: string;
  final_url?: string;
  link_text: string;
  path?: string;
}

export interface BriefAdGroup {
  ads: BriefAd[];
  keywords: BriefKeyword[];
  name: string;
  negative_keywords: BriefNegativeKeyword[];
  theme: string;
}

export interface BriefExtensions {
  callouts: string[];
  sitelinks: BriefSitelink[];
  structured_snippets: { header: string; values: string[] }[];
}

export interface CampaignBrief {
  ad_groups: BriefAdGroup[];
  campaign_negative_keywords: BriefNegativeKeyword[];
  extensions: BriefExtensions;
  frontmatter: BriefFrontmatter;
  objective: string;
}

export interface DeployCampaignInput {
  brief: CampaignBrief;
  customerId: string;
  mode?: "execute" | "validate";
  status: "ENABLED" | "PAUSED";
}
