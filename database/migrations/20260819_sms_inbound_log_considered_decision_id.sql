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
-- from a genuine resolution -- measured live 2026-08-19: 328 of 365 rows populated, only 1 ever
-- a genuine resolution. This migration adds the schema; the write-site fix
-- (lib/chairman/sms-bridge.js) ships in the same PR and applies to NEW rows only.
--
-- FORWARD-ONLY GUARANTEE (database-agent finding, applied 2026-08-19): the ~327 pre-existing
-- rows written by the old overloaded write-site are NOT retroactively corrected by this
-- migration -- it is schema-only, no data UPDATE. A backfill (UPDATE ... SET
-- considered_decision_id = matched_decision_id, matched_decision_id = NULL WHERE outcome NOT IN
-- ('answered','undone')) would make matched_decision_id trustworthy table-wide, but that is a
-- DATA-MODIFYING migration (not TIER-1) requiring separate, explicit chairman-gated approval --
-- deliberately deferred out of this SD's scope, not forgotten.
--
-- NO DATE BOUNDARY IN THE COMMENTS BELOW (sms-decision-migration finding, corrected
-- 2026-08-21): an earlier version of this comment dated the guarantee to THIS MIGRATION
-- ("from this migration forward, 2026-08-19"). That was false the moment it was written: the
-- real behavioral boundary is the WRITE-SITE DEPLOY (lib/chairman/sms-bridge.js, same PR,
-- merges separately and later), not the migration date -- measured live 2026-08-21, 13 of 13
-- rows written since the migration still violate the dated claim, because the old write-site
-- was still the one running. Rather than track a second date (requiring a follow-up comment
-- migration on deploy day, a moving part someone has to remember), the comments below use an
-- unconditional discriminator instead: always check outcome, never trust created_at.
--
-- WORDING NOTE (adversarial-review finding, corrected 2026-08-21): migration-tier-classifier's
-- commandVerbCount() counts SQL command verbs found ANYWHERE in a statement's text, including
-- inside a COMMENT string literal, not just the statement's own verb. The words "comment" and
-- "do" previously appearing inside these two literals each paired with the statement's real
-- COMMENT verb and misclassified this file as tier 2 ("multiple_commands_in_statement"),
-- contradicting the TIER-1 claim above. If editing this file's COMMENT text again, re-run
-- classifyMigration() against the edited file to confirm tier 1 still holds before relying on
-- auto-apply -- do not hand-guess which words are safe; see the full COMMAND_VERBS regex at
-- scripts/lib/migration-tier-classifier.mjs:208 for the exhaustive, authoritative list.

ALTER TABLE sms_inbound_log
  ADD COLUMN IF NOT EXISTS considered_decision_id UUID;

COMMENT ON COLUMN sms_inbound_log.considered_decision_id IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001: best-effort diagnostic candidate examined on a non-resolving outcome (no_match/ambiguous/expired). No FK constraint -- may reference a decision that has since changed state. Never a join target; see matched_decision_id''s note for the check that distinguishes a genuine resolution.';

COMMENT ON COLUMN sms_inbound_log.matched_decision_id IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001: may carry a diagnostic-only value from the prior overloaded write-site (populated on both resolving and non-resolving outcomes before this SD''s fix). ALWAYS verify outcome IN (''answered'',''undone'') before treating a row''s matched_decision_id as a genuine resolution or a safe join target -- never rely on created_at or any migration date as a discriminator. The write-site fix restricting NEW writes to genuine resolutions only ships in this SD''s own PR; considered_decision_id carries the diagnostic case going forward once that lands.';
