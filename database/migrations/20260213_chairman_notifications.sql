-- Migration: Chairman Notification Service
-- SD: SD-EVA-FEAT-NOTIFICATION-001
-- Creates chairman_notifications table for tracking all notification delivery attempts

-- ============================================================
-- Table: chairman_notifications
-- Stores every notification attempt (immediate, digest, weekly)
-- with full delivery lifecycle tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS chairman_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient info
  chairman_user_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,

  -- Notification classification
  notification_type TEXT NOT NULL CHECK (notification_type IN ('immediate', 'daily_digest', 'weekly_summary')),

  -- Source reference (for immediate notifications)
  decision_id UUID REFERENCES chairman_decisions(id),

  -- Delivery status lifecycle: queued -> sent/failed/rate_limited/deferred
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'rate_limited', 'deferred')),

  -- Resend provider metadata
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,

  -- Idempotency keys for digest/weekly (prevents duplicate sends)
  digest_key TEXT,     -- Format: YYYY-MM-DD:{timezone} for daily digest
  summary_key TEXT,    -- Format: YYYY-Www:{timezone} for weekly summary

  -- Email content snapshot (for audit/debugging)
  subject TEXT,
  email_metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Rate limiting: count sent immediate notifications per recipient in last hour
CREATE INDEX idx_chairman_notifications_rate_limit
  ON chairman_notifications (recipient_email, notification_type, status, created_at)
  WHERE notification_type = 'immediate' AND status = 'sent';

-- Idempotency: prevent duplicate digests/summaries
CREATE UNIQUE INDEX idx_chairman_notifications_digest_key
  ON chairman_notifications (digest_key)
  WHERE digest_key IS NOT NULL AND status IN ('queued', 'sent');

CREATE UNIQUE INDEX idx_chairman_notifications_summary_key
  ON chairman_notifications (summary_key)
  WHERE summary_key IS NOT NULL AND status IN ('queued', 'sent');

-- Lookup by decision (for immediate notifications)
CREATE INDEX idx_chairman_notifications_decision
  ON chairman_notifications (decision_id)
  WHERE decision_id IS NOT NULL;

-- History query: chairman + type + time
CREATE INDEX idx_chairman_notifications_history
  ON chairman_notifications (chairman_user_id, notification_type, created_at DESC);

-- Queue processing: find queued notifications
CREATE INDEX idx_chairman_notifications_queue
  ON chairman_notifications (status, created_at)
  WHERE status = 'queued';

-- ============================================================
-- Updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_chairman_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chairman_notifications_updated_at
  BEFORE UPDATE ON chairman_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_chairman_notifications_updated_at();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE chairman_notifications ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY chairman_notifications_service_all
  ON chairman_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own notifications
CREATE POLICY chairman_notifications_read_own
  ON chairman_notifications
  FOR SELECT
  TO authenticated
  USING (chairman_user_id = auth.uid()::text);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE chairman_notifications IS 'Tracks all notification delivery attempts for the Chairman notification service (SD-EVA-FEAT-NOTIFICATION-001)';
COMMENT ON COLUMN chairman_notifications.notification_type IS 'Type of notification: immediate (critical decisions), daily_digest, weekly_summary';
COMMENT ON COLUMN chairman_notifications.status IS 'Delivery lifecycle: queued -> sent/failed/rate_limited/deferred';
COMMENT ON COLUMN chairman_notifications.digest_key IS 'Deterministic key (date:timezone) preventing duplicate daily digests';
COMMENT ON COLUMN chairman_notifications.summary_key IS 'Deterministic key (week:timezone) preventing duplicate weekly summaries';
