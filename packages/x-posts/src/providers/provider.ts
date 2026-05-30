import type { ListRecentPostsResult } from "../types.js";

export interface XPostsProvider {
  listRecentPosts(): Promise<ListRecentPostsResult>;
}
