import { Check, CheckCheck } from 'lucide-react';

/**
 * Delivery ticks for a message YOU sent (show it next to the time, only on your own messages):
 *   one tick, faded  = sent, not seen yet
 *   two ticks, blue  = the other person has opened the chat and seen it
 * The blue is light so it stays visible on the dark blue bubble.
 */
export default function MessageTicks({ isRead, readAt }: { isRead: boolean; readAt?: string | null }) {
  if (isRead) {
    const when = readAt ? new Date(readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <span className="inline-flex" title={when ? `Seen at ${when}` : 'Seen'} aria-label={when ? `Seen at ${when}` : 'Seen'}>
        <CheckCheck className="h-3.5 w-3.5 text-sky-300" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="inline-flex" title="Sent" aria-label="Sent">
      <Check className="h-3.5 w-3.5 text-primary-foreground/60" strokeWidth={2.5} />
    </span>
  );
}
