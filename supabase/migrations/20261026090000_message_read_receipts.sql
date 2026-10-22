-- =====================================================================
-- MESSAGE READ RECEIPTS ("sent" tick and "seen" double tick)
-- The messages table already has is_read. This adds:
--   1. read_at      when the recipient saw the message (shown as "Seen 3:42 PM")
--   2. a trigger    that sets read_at itself and stops a client faking receipts:
--                   - a new message always starts as unread (a sender cannot insert it as "already seen")
--                   - only the database decides read_at (a recipient cannot back-date it)
--   3. an index     so "mark this chat as read" and the unread badge stay fast with many messages
-- Safe to run twice. Realtime is already on for the messages table.
-- =====================================================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Done before the trigger below exists, so it keeps the value. Messages that were already marked read before this existed: show them as seen at the time they were sent.
UPDATE public.messages SET read_at = created_at WHERE is_read IS TRUE AND read_at IS NULL;

CREATE OR REPLACE FUNCTION public.messages_read_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Website users always send unread messages. The service role (auth.uid() is null) may import history as is.
    IF auth.uid() IS NOT NULL THEN
      NEW.is_read := false;
      NEW.read_at := NULL;
    END IF;
  ELSE
    IF NEW.is_read IS TRUE THEN
      NEW.read_at := COALESCE(OLD.read_at, now());   -- first time it was read, never changed afterwards
    ELSE
      NEW.read_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_messages_read_receipt ON public.messages;
CREATE TRIGGER trg_messages_read_receipt BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_read_receipt();

CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages (conversation_id) WHERE is_read = false;
