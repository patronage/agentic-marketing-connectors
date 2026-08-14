import {
  buildSearchTermReview,
  createDemoGoogleAdsClient,
  validateNegativeKeywordDraft,
} from "./search-term-review.js";

const client = createDemoGoogleAdsClient();
const draft = await buildSearchTermReview(client);
const reviewed = await validateNegativeKeywordDraft(client, draft);

console.log(JSON.stringify(reviewed, null, 2));
