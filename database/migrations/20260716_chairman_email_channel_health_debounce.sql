-- =============================================================================
-- Migration: chairman_email_channel_health — add send-choke debounce columns
-- SD: SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 (FR-4)
-- Date: 2026-07-16
-- @chairman-gated: additive ALTER on the ALREADY-LIVE chairman_email_channel_health singleton
--   (created by 20260704_chairman_email_channel_health.sql). Adds two nullable columns for the
--   FR-3 content-hash send-choke debounce. NO new table, NO RLS/policy change — purely additive.
--   The FR-3 debounce code (lib/notifications/channel-health-recorder.js) is FAIL-OPEN, so it
--   tolerates these columns' absence until this migration applies (staged behaviour). Apply via the
--   canonical apply-migration prod-deploy path.
--
-- Rollback:
--   ALTER TABLE public.chairman_email_channel_health
--     DROP COLUMN IF EXISTS last_chairman_digest_hash,
--     DROP COLUMN IF EXISTS last_chairman_digest_sent_at;
-- =============================================================================

ALTER TABLE public.chairman_email_channel_health
  ADD COLUMN IF NOT EXISTS last_chairman_digest_hash    text,
  ADD COLUMN IF NOT EXISTS last_chairman_digest_sent_at timestamptz;

COMMENT ON COLUMN public.chairman_email_channel_health.last_chairman_digest_hash IS
'SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 FR-3: sha256(to|subject|html) of the most recent chairman
email sent through the resend-adapter send choke. Compared against the current send''s hash to
suppress a byte-identical email within the debounce window (last_chairman_digest_sent_at).';

COMMENT ON COLUMN public.chairman_email_channel_health.last_chairman_digest_sent_at IS
'SD-LEO-INFRA-CHAIRMAN-DECISION-EMAIL-001 FR-3: timestamp of the most recent chairman email send;
paired with last_chairman_digest_hash for the send-choke debounce window (~3 min).';

-- ---------------------------------------------------------------------------
-- Self-verification (advisory; safe to re-run).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chairman_email_channel_health'
      AND column_name = 'last_chairman_digest_hash'
  ) THEN
    RAISE EXCEPTION 'last_chairman_digest_hash column was not added';
  END IF;
END $$;
