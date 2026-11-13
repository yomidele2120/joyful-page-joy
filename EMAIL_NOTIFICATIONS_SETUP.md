# Email notifications

Transactional marketplace emails are queued by Postgres event triggers, sent by the `email-notifications` Supabase Edge Function, and tracked in Admin > Email notifications. Authentication emails remain managed by Supabase Auth and are not sent by this worker.

## Configure Resend

1. Verify `ithubafrica.com` in Resend and publish the DNS records Resend provides (SPF/DKIM; configure DMARC as appropriate). Use a sender on that verified domain, such as `IT Hub Africa <notifications@ithubafrica.com>`.
2. In Supabase Edge Function secrets, set:
   - `RESEND_API_KEY`: a Resend API key with permission to send from the verified domain.
   - `RESEND_FROM_EMAIL`: the verified sender address, including its display name if desired.
   - `RESEND_WEBHOOK_SECRET`: the signing secret from the Resend webhook endpoint.
   - `EMAIL_WORKER_SECRET`: a long random secret used only by the scheduled worker caller.
   - `SITE_URL`: the canonical public website origin, for example `https://www.ithubafrica.com`.
3. Apply migrations in order:
   - `supabase/migrations/20261112110000_email_notification_outbox.sql`
   - `supabase/migrations/20261112120000_resend_webhook_events.sql`
4. Deploy the Edge Functions:
   ```sh
   supabase functions deploy email-notifications resend-webhook
   ```
5. In Resend, create a webhook pointing to `https://<project-ref>.supabase.co/functions/v1/resend-webhook`. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`, `email.opened`, and `email.clicked`. Copy its signing secret to `RESEND_WEBHOOK_SECRET`.

## Schedule the worker

Enable `pg_cron`, `pg_net`, and Vault in Supabase Database > Extensions. Store the worker secret in Vault; do not put a real secret in this file or commit it:

```sql
select vault.create_secret('REPLACE_WITH_EMAIL_WORKER_SECRET', 'email_worker_secret');
```

Schedule a one-minute drain. Replace the project ref with the value from `supabase/config.toml`:

```sql
select cron.schedule('email-notification-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/email-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-email-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_worker_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

The outbox uses a unique source-event key and Resend idempotency key. Temporary errors retry with backoff; permanent 4xx responses and jobs that exhaust attempts are marked failed. Admins can inspect recipient, event, attempts, timestamps, Resend ID, and latest error under Admin > Email notifications.

## Supabase Auth SMTP

Keep registration verification, password reset, email OTP, and email-change confirmation in Supabase Auth. In Supabase Dashboard > Authentication > SMTP Settings, configure the custom SMTP provider with the Resend SMTP values:

- Host: `smtp.resend.com`
- Port: `465` with SSL (or `587` with STARTTLS)
- Username: `resend`
- Password: the Resend API key
- Sender email/name: the verified `RESEND_FROM_EMAIL` identity

Then review Authentication > Email Templates and URL Configuration. Test signup verification, reset, OTP, and email change using a staging account. Do not separately enqueue those auth messages from the marketplace worker.

## Staging verification

Use a staging Supabase project and Resend test/verified recipient addresses. Confirm each source event creates one outbox row, the worker sends it, retries and logs a deliberately induced failure, and duplicate source events do not create duplicate jobs. Create real staging test events for paid order, status update, cancellation/refund, inquiry/reply, RFQ/quote, vendor signup, report, support reply, membership payment/expiry, payout, and payment failure. Verify delivery through the Resend event log and Admin > Email notifications; `sent` means Resend accepted the request, while `delivered` means the recipient's mail server accepted it. Test all four auth flows separately in Supabase Auth.

Actual delivery is not verified by code tests alone. It requires the secrets, verified sender/domain, webhook, and scheduled worker to be configured in the target Supabase/Resend projects.
