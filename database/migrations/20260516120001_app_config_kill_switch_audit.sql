-- SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-9
-- INSERT-only sidecar audit table for app_config kill-switch toggles.
-- RISK C0-R-04 mitigation: app_config has 0 historical audit_log entries.
-- Chose sidecar (over DB trigger) per security agent recommendation —
-- least-privilege, no DB role escalation required.

BEGIN;

CREATE TABLE IF NOT EXISTS app_config_kill_switch_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  old_value JSONB NULL,
  new_value JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT NULL,
  source TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_config_kill_switch_changes_key_changed_at
  ON app_config_kill_switch_changes (key, changed_at DESC);

-- INSERT-only: revoke UPDATE/DELETE for non-service roles. Service role
-- (used by the writer helper) retains full access.
REVOKE UPDATE, DELETE ON app_config_kill_switch_changes FROM PUBLIC;

COMMIT;
