-- @approved-by: codestreetlabs@gmail.com
--
-- 20260607_s22_spend_approval_gate.sql
-- SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-B (FR-1)
--
-- Convert venture pipeline Stage 22 (Distribution Setup) from an AUTOMATED
-- auto-advance stage into a HUMAN-IN-THE-LOOP "spend_approval" chairman gate.
-- Today S22 drafts distribution channels, budget allocation, and ad copy, then
-- auto-advances to S23 (Launch Readiness) with no chairman review before launch
-- spend. Per chairman direction (post-build lifecycle parity with the S21
-- creative_handoff gate, SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001): S22 must PAUSE
-- after drafting so the chairman reviews/edits channels+budget+copy and clicks
-- Continue before any budget is committed downstream (advances 22 -> 23).
--
-- HOW IT PAUSES (verified against the live gate predicate): the RPC
-- stage_creates_decision uses `gate_type IN ('kill','promotion') OR review_mode='review'`.
-- Setting review_mode='review' makes S22 create a chairman decision and pause for it
-- WITHOUT touching the RPC or the kill/promotion classification. work_type stays
-- 'artifact_only' (S22 is not a kill/promotion decision gate), so it is NOT added to
-- the blocking set. The 'spend_approval' semantic type is carried in gate_label
-- (the gate_type CHECK constraint allows only none/kill/promotion, and the
-- venture_stages_canonical_rule_check binds gate_type<->work_type, so the new type
-- name MUST live in gate_label, not gate_type).
--
-- Pairs with: chairman-decision-watcher.js FALLBACK_DECISION_CREATING_STAGES += 22
-- (the TS-7 parity test tests/ci/decision-creating-set-parity.test.js asserts
-- FALLBACK === the DB-derived decision-creating set, so both must change together).
--
-- Rollback: UPDATE venture_stages SET review_mode='auto', gate_label=NULL WHERE
-- stage_number=22; and remove 22 from FALLBACK_DECISION_CREATING_STAGES.

BEGIN;

UPDATE venture_stages
SET review_mode = 'review',
    gate_label  = 'spend_approval',
    updated_at  = now()
WHERE stage_number = 22;

COMMIT;
