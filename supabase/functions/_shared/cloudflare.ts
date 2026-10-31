// Cloudflare credentials, set as Supabase secrets (see VIDEO_UPLOAD_SETUP.md).
export function cloudflareCredentials(): { accountId: string; token: string } | null {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
  return accountId && token ? { accountId, token } : null;
}
