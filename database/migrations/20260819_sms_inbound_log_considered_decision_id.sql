-- SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 FR-1
--
-- Additive-only: one nullable UUID column, no default, no FK constraint, no RLS/GRANT changes.
-- TIER-1 auto-apply eligible per the migration-tier-classifier (nullable ADD COLUMN with a
-- constant-only default -- here, the implicit NULL default).
--
-- Splits sms_inbound_log.matched_decision_id's overloaded semantics into two columns:
--   - matched_decision_id: a GENUINE resolution only (handleInboundSmsReply outcome
--     answered/undone). Now safe to trust as a join target to chairman_decisions.
--   - considered_decision_id (new): a best-effort diagnostic label for the most-recent
--     candidate examined on a NON-resolving outcome (no_match/ambiguous/expired). Deliberately
--     NO foreign key constraint -- it may reference a decision that has since changed state or
--     no longer exists as a live candidate; it is diagnostic-only, never a join guarantee.
--
-- Prior to this migration, matched_decision_id was populated on both resolving AND
-- non-resolving outcomes (lib/chairman/sms-bridge.js's logInbound), making it indistinguishable
-- from a genuine resolution -- measured live: 327 of 364 rows populated, only 1 ever a genuine
-- resolution. This migration adds the schema; the write-site fix (lib/chairman/sms-bridge.js)
-- ships in the same PR.

ALTER TABLE sms_inbound_log
  ADD COLUMN IF NOT EXISTS considered_decision_id UUID;

COMMENT ON COLUMN sms_inbound_log.considered_decision_id IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001: best-effort diagnostic candidate examined on a non-resolving outcome (no_match/ambiguous/expired). No FK constraint -- may reference a decision that has since changed state. Never a join target; matched_decision_id is reserved for genuine resolutions only.';

COMMENT ON COLUMN sms_inbound_log.matched_decision_id IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001: set ONLY on a genuine resolution (outcome=answered or outcome=undone). A non-resolving outcome''s best-effort candidate is recorded in considered_decision_id instead. Safe to join against chairman_decisions.id.';
