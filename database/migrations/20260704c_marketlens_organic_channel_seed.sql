-- Migration: Seed missing organic distribution_channels rows (website, email)
-- SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
-- Date: 2026-07-04
-- Purpose: distribution_channels' CHECK constraints already allow platform IN
--   (..., 'email', 'website', ...) and channel_type IN ('social','email','web','other'),
--   but the original 20260105 migration only seeded 4 social rows (LinkedIn, X/Twitter,
--   Facebook, Instagram) — no row exists for 'website' or 'email'. This SD's organic-only
--   allowlist (blog_seo, twitter_x, email, facebook_instagram) needs BOTH of the missing
--   platforms to be provisionable, since blog_seo/email are legitimate MarketLens
--   distribution_channel_config candidates, not exotic ones.

-- distribution_channels has no UNIQUE constraint beyond its id PK (the original
-- 20260105 migration's "ON CONFLICT DO NOTHING" has no conflict target and would not
-- actually prevent duplicates on a re-run) — guard with WHERE NOT EXISTS instead so
-- this migration is genuinely idempotent.
INSERT INTO distribution_channels (name, channel_type, platform, utm_defaults)
SELECT 'Blog / SEO', 'web', 'website', '{"utm_source": "blog", "utm_medium": "organic"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM distribution_channels WHERE platform = 'website');

INSERT INTO distribution_channels (name, channel_type, platform, utm_defaults)
SELECT 'Email', 'email', 'email', '{"utm_source": "email", "utm_medium": "email"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM distribution_channels WHERE platform = 'email');
