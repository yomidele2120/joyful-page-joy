export const DEFAULT_TIKTOK_SCOPES = ["user.info.basic", "video.list"];

const SUPPORTED_TIKTOK_SCOPES = new Set(DEFAULT_TIKTOK_SCOPES);

export function parseTikTokScopes(raw: string | undefined, requireVideoList: boolean): string[] {
  const parsed = (raw ?? "").split(",").map((scope) => scope.trim()).filter(Boolean);
  const scopes = [...new Set(parsed.length ? parsed : DEFAULT_TIKTOK_SCOPES)];
  const unsupported = scopes.filter((scope) => !SUPPORTED_TIKTOK_SCOPES.has(scope));

  if (unsupported.length) {
    throw new Error(`Unsupported TikTok scope(s): ${unsupported.join(", ")}`);
  }
  if (!scopes.includes("user.info.basic")) {
    throw new Error("TIKTOK_SCOPES must include user.info.basic.");
  }
  if (requireVideoList && !scopes.includes("video.list")) {
    throw new Error("TIKTOK_SCOPES must include video.list while TIKTOK_REQUIRE_VIDEO_LIST is enabled.");
  }

  return scopes;
}

export function requiresTikTokVideoList(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() !== "false";
}

export function buildTikTokAuthorizeUrl(
  clientKey: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({
    client_key: clientKey,
    scope: scopes.join(","),
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  }).toString();
  return url.toString();
}

export function hasTikTokVideoListScope(scope: string | null | undefined): boolean {
  return (scope ?? "").split(/[,\s]+/).includes("video.list");
}
