import { listRecentPosts } from "../src/index.js";
import type { ListRecentPostsInput } from "../src/types.js";

export function runRecentPostIntake(input: ListRecentPostsInput) {
  return listRecentPosts(input);
}

/** Runs the intake contract without credentials or network access. */
export function runSyntheticRecentPostIntake() {
  return listRecentPosts(
    {
      handle: "ExampleCommunityFund",
      since: "2026-03-31",
      until: "2026-03-31",
      xApiBearerToken: "synthetic-token",
    },
    {
      createProvider(provider, input) {
        return {
          listRecentPosts() {
            return Promise.resolve({
              handle: input.handle,
              posts: [
                {
                  handle: input.handle,
                  hasVideo: false,
                  id: "post-001",
                  isQuote: false,
                  isReply: false,
                  isRetweet: false,
                  mediaTypes: ["photo"],
                  provider,
                  publishedAt: "2026-03-31T12:00:00.000Z",
                  sharedUrls: [],
                  text: "Community update",
                  url: "https://x.com/ExampleCommunityFund/status/post-001",
                  warnings: [],
                },
              ],
              provider,
              since: input.since,
              until: input.until,
              warnings: [],
            });
          },
        };
      },
    }
  );
}
