export interface GraphApiError {
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  fbtrace_id?: string;
  message: string;
  type?: string;
}

export interface GraphApiResponse<T> {
  data?: T;
  error?: GraphApiError;
  paging?: {
    cursors?: {
      after?: string;
      before?: string;
    };
    next?: string;
  };
}

export interface PageInfo {
  access_token?: string;
  category?: string;
  fan_count?: number;
  followers_count?: number;
  id: string;
  link?: string;
  name: string;
}

export interface PageInsightMetric {
  description?: string;
  name: string;
  period: string;
  title?: string;
  values: {
    end_time?: string;
    value: number | Record<string, number>;
  }[];
}

export interface PagePostAttachment {
  description?: string;
  media_type?: string;
  target?: {
    id?: string;
    url?: string;
  };
  title?: string;
  type?: string;
  url?: string;
}

export interface PagePost {
  attachments?: {
    data?: PagePostAttachment[];
  };
  created_time: string;
  id: string;
  is_published?: boolean;
  message?: string;
  permalink_url?: string;
  status_type?: string;
}

export type InstagramMediaType =
  | "CAROUSEL_ALBUM"
  | "IMAGE"
  | "REELS"
  | "VIDEO"
  | string;

export interface InstagramMedia {
  caption?: string;
  id: string;
  media_type?: InstagramMediaType;
  media_url?: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp?: string;
}
