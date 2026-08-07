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

export type InstagramPublishMediaType =
  | "IMAGE"
  | "REELS"
  | "STORIES"
  | (string & Record<never, never>);

export type InstagramVideoPublishMediaType = "REELS" | "STORIES";

export type InstagramMediaContainerStatusCode =
  | "ERROR"
  | "EXPIRED"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED"
  | (string & Record<never, never>);

export interface InstagramMediaPublishResult {
  creationId: string;
  id: string;
}

export interface InstagramMediaContainerStatus {
  error_message?: string;
  id: string;
  status?: string;
  status_code?: InstagramMediaContainerStatusCode;
}

export interface MetaComment {
  can_hide?: boolean;
  can_like?: boolean;
  can_remove?: boolean;
  created_time?: string;
  from?: {
    id?: string;
    name?: string;
    username?: string;
  };
  id: string;
  is_hidden?: boolean;
  like_count?: number;
  message?: string;
  parent?: {
    id?: string;
  };
  permalink_url?: string;
  user_likes?: boolean;
}
