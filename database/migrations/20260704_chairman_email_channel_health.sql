-- SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001: chairman-email channel-health + alarm state.
-- requires-chairman-apply: this migration ships STAGED; chairman applies separately (see
-- strategic_directives_v2.metadata.requires_chairman_apply=true).
--
-- Solomon's referent-audit found the chairman-escalation email channel died silently for
-- ~5.5h on 2026-07-03 (quota exhaustion) with zero detection. This table is the durable
-- health + alarm-state substrate that closes that gap. Singleton row (one chairman-email
-- channel, not a multi-channel registry, per the SD's explicit scope) -- columns mirror
-- llm_cloud_health's shape (SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001), a sibling health table.
--
-- ADDITIVE ONLY: CREATE TABLE + seed one singleton row. No ALTER/DROP of any existing object.

CREATE TABLE IF NOT EXISTS chairman_email_channel_health (
  -- Enforced singleton: exactly one row, addressed by id='singleton'.
  id TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),

  -- Last REAL verified success (accepted send or verified canary). A quiet-window-suppressed
  -- send never advances this -- see lib/notifications/channel-health-recorder.js.
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error_class TEXT,

  -- Last time the daily canary confirmed delivery (provider-accepted id). Freshness check
  -- against this column detects a MISSED cron run (absence), not just a failed one.
  last_canary_verified_at TIMESTAMPTZ,

  -- Alarm state machine: clear -> raised -> cooldown -> clear. 'cooldown' distinguishes a
  -- recovery-then-immediate-refail (same outage, no re-notify) from a genuinely new outage
  -- after the cooldown window elapses (re-notify). See evaluateAlarmTransition().
  alarm_state TEXT NOT NULL DEFAULT 'clear' CHECK (alarm_state IN ('clear', 'raised', 'cooldown')),
  alarm_raised_at TIMESTAMPTZ,
  alarm_cleared_at TIMESTAMPTZ,
  last_alarm_notify_error TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the singleton (idempotent). Fail-open posture: no row yet reads as "unknown", the
-- recorder's IO wrapper treats a missing row the same as a degraded/unrecordable state.
INSERT INTO chairman_email_channel_health (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE chairman_email_channel_health IS
  'Singleton delivery-health + alarm state for the chairman-escalation email channel (SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001). Sole writer: lib/notifications/channel-health-recorder.js, invoked from lib/notifications/resend-adapter.js sendEmail() and scripts/chairman-email-canary.mjs. Read by scripts/fleet-dashboard.cjs printChairmanEmailChannelHealth().';

-- RLS: parity with sibling health tables (llm_cloud_health) and the repo standard
-- (SD-SEC-DB-LINTER-001 — every public table must have RLS enabled).
ALTER TABLE chairman_email_channel_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chairman_email_channel_health FROM anon, authenticated;
GRANT ALL ON chairman_email_channel_health TO service_role;
CREATE POLICY service_role_full_access ON chairman_email_channel_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);
