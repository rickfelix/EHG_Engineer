-- Migration: widen sms_inbound_log_outcome_check to accept 'no_open_question'.
-- QF-20260913-173
--
-- Live-verified: the constraint currently accepts exactly 8 values (answered, expired,
-- no_match, invalid_signature, rate_limited, ambiguous, suspended, undone). A genuine chairman
-- reply to an already-decided (terminal-status) decision was previously indistinguishable from
-- a real no_match in sms_inbound_log -- both logged outcome='no_match'. This adds the 9th,
-- distinct outcome so a reader can tell "answered a closed question" apart from "matched
-- nothing real" (lib/chairman/sms-bridge.js's handleInboundSmsReply, this QF's own fix).
--
-- Additive-only: every existing accepted value stays accepted, so no existing row or caller is
-- affected.

BEGIN;

ALTER TABLE sms_inbound_log
  DROP CONSTRAINT IF EXISTS sms_inbound_log_outcome_check;

ALTER TABLE sms_inbound_log
  ADD CONSTRAINT sms_inbound_log_outcome_check
  CHECK (outcome IN (
    'answered', 'expired', 'no_match', 'invalid_signature', 'rate_limited',
    'ambiguous', 'suspended', 'undone', 'no_open_question'
  ));

COMMENT ON COLUMN sms_inbound_log.outcome IS
  'answered|expired|no_match|invalid_signature|rate_limited|ambiguous (2+ eligible pending candidates)|suspended (persistent auto-suspend active)|undone (inbound UNDO cancelled a spend approval)|no_open_question (the only candidate considered is TERMINAL -- already answered/decided -- distinct from no_match/expired, QF-20260913-173)';

COMMIT;
