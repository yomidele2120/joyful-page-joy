// Plain-language status text for the vendor and admin ad screens.
export type Tone = 'good' | 'warn' | 'bad' | 'idle';
export interface StatusInfo { label: string; tone: Tone; hint: string }

const CAMPAIGN: Record<string, StatusInfo> = {
  pending_generation: { label: 'Queued', tone: 'warn', hint: 'Your banner is waiting to be created.' },
  generating: { label: 'Creating banner', tone: 'warn', hint: 'Your banner is being created. This usually takes a minute or two.' },
  pending_review: { label: 'Awaiting approval', tone: 'warn', hint: 'Your banner is ready and waiting for ITHUBAFRICA to approve it.' },
  active: { label: 'Live', tone: 'good', hint: 'Your promotion is showing on the marketplace.' },
  paused: { label: 'Paused', tone: 'idle', hint: 'Your promotion is paused and not showing.' },
  rejected: { label: 'Not approved', tone: 'bad', hint: 'This promotion was not approved. See the note below.' },
  expired: { label: 'Ended', tone: 'idle', hint: 'This promotion has ended. Renew your plan to promote again.' },
  failed: { label: 'Banner failed', tone: 'bad', hint: 'We could not create your banner. Contact support or try again.' },
  cancelled: { label: 'Cancelled', tone: 'idle', hint: 'This promotion was cancelled.' },
};
export const campaignStatus = (s: string): StatusInfo => CAMPAIGN[s] ?? { label: s, tone: 'idle', hint: '' };

const EXTERNAL: Record<string, StatusInfo> = {
  draft: { label: 'Draft', tone: 'idle', hint: 'Not submitted. Nothing is running and no money has been spent.' },
  pending_integration: { label: 'Waiting for platform connection', tone: 'warn', hint: 'ITHUBAFRICA has not connected this ad platform yet. Nothing is running and no money has been spent.' },
  pending_review: { label: 'In review', tone: 'warn', hint: 'Being reviewed by ITHUBAFRICA. Nothing is running yet.' },
  rejected: { label: 'Not approved', tone: 'bad', hint: 'This request was not approved.' },
  cancelled: { label: 'Cancelled', tone: 'idle', hint: 'This request was cancelled.' },
  paused: { label: 'Paused', tone: 'idle', hint: 'Paused.' },
  ended: { label: 'Ended', tone: 'idle', hint: 'Ended.' },
  failed: { label: 'Failed', tone: 'bad', hint: 'This request failed.' },
  active: { label: 'Running', tone: 'good', hint: 'Running on the ad platform.' },
};
export const externalStatus = (s: string): StatusInfo => EXTERNAL[s] ?? { label: s, tone: 'idle', hint: '' };
export const PLATFORM_LABEL: Record<string, string> = { google_ads: 'Google Ads', facebook_ads: 'Facebook Ads', instagram_ads: 'Instagram Ads', tiktok_ads: 'TikTok Ads' };

const BLOCKED_WORDS = /\b(free|guarantee|guaranteed|guarantees|warranty|certified|certification|authentic|genuine|official|cheapest|cheap|discount|discounts|sale|clearance|stock|bargain|giveaway)\b/i;
const BLOCKED_PHRASES = /(lowest price|best price|price drop|money back|limited time|while stocks)/i;

/** Mirrors the database rules (ad_copy_is_safe) for banner wording (3-60 / 10-160 chars, no digits, prices or claims) for instant feedback. */
export function checkMessage(headline: string, description: string): string | null {
  const h = headline.trim(), d = description.trim();
  if (h && (h.length < 3 || h.length > 60)) return 'Headline must be 3 to 60 characters.';
  if (d && (d.length < 10 || d.length > 160)) return 'Description must be 10 to 160 characters.';
  for (const t of [h, d]) {
    if (!t) continue;
    if (/[<>0-9%₦$€£#]/.test(t)) return 'Please leave out numbers, prices, percentages and symbols. The marketplace cannot verify them.';
    if (/(https?:|www\.|@)/i.test(t)) return 'Links and @ handles are not allowed in banner wording.';
    if (BLOCKED_WORDS.test(t) || BLOCKED_PHRASES.test(t)) return 'Please avoid claims such as free, guaranteed, certified, genuine, discount or best price.';
  }
  return null;
}

/** Time left, in words. */
export function daysLeft(endIso: string, now = Date.now()): string {
  const ms = new Date(endIso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'Ended';
  const d = Math.ceil(ms / 86_400_000);
  return d === 1 ? '1 day left' : `${d} days left`;
}
export const pct = (n: number | string | null | undefined) => `${Number(n ?? 0).toFixed(2)}%`;
