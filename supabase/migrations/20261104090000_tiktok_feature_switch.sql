-- The admin on/off switch for the seller TikTok feature. Lives in the existing marketplace_settings row, which everyone can read
-- and only admins can change (policies already exist). Off by default: sellers see nothing and the server refuses TikTok actions
-- until an admin switches it on (Admin > Marketplace > Sections and rules).
ALTER TABLE public.marketplace_settings
  ADD COLUMN IF NOT EXISTS tiktok_enabled BOOLEAN NOT NULL DEFAULT false;
