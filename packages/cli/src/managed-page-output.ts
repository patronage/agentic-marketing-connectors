interface ManagedPageWithOptionalAccessToken {
  access_token?: string;
  category?: string;
  fan_count?: number;
  followers_count?: number;
  id: string;
  link?: string;
  name: string;
}

export function toSecretSafeManagedPage(
  page: ManagedPageWithOptionalAccessToken
): Omit<ManagedPageWithOptionalAccessToken, "access_token"> {
  return {
    category: page.category,
    fan_count: page.fan_count,
    followers_count: page.followers_count,
    id: page.id,
    link: page.link,
    name: page.name,
  };
}
