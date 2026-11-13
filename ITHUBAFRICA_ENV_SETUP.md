# ITHUBAFRICA Environment Setup

## Phase 1 status
This document is a staged configuration checklist for the live integrations that are already identified in the repo.

## Required runtime environment variables
- `VITE_PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_SECRET_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`
- `TIKTOK_CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_WORKER_SECRET`
- `SITE_URL`
- `ZEGOCLOUD_APP_ID`
- `ZEGOCLOUD_SERVER_SECRET`

## Notes
- Never expose secret keys in frontend code.
- Use Supabase Edge Function environment configuration or deployment secrets for provider credentials.
- The repo already includes examples in `.env` and `.env.example`; production secrets should be added only in the real deployment environment.
