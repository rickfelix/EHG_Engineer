-- @approved-by: codestreetlabs@gmail.com
--
-- 20260607_s21_creative_handoff_gate.sql
-- SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001 (FR-1/FR-2)
--
-- Convert venture pipeline Stage 21 (Visual Assets) from an AUTOMATED stage into
-- a HUMAN-IN-THE-LOOP "creative_handoff" chairman gate. Per chairman direction
-- (DataDistill pilot, 2026-06-07): S21 generates visual-asset briefs/storyboards
-- (textual by design — the chairman feeds them into a 3rd-party image/video tool),
-- then PAUSES; the chairman reviews, OPTIONALLY uploads finished assets, and clicks
-- Continue to advance to S22.
--
-- HOW IT PAUSES (verified against the live gate predicate): the RPC
-- stage_creates_decision uses `gate_type IN ('kill','promotion') OR review_mode='review'`.
-- Setting review_mode='review' makes S21 create a chairman decision and pause for it
-- WITHOUT touching the RPC or the kill/promotion classification. work_type stays
-- 'artifact_only' (S21 is not a kill/promotion decision gate), so it is NOT added to
-- the blocking set. The 'creative_handoff' semantic type is carried in gate_label
-- (the gate_type CHECK constraint allows only none/kill/promotion, and the
-- venture_stages_canonical_rule_check binds gate_type<->work_type, so the new type
-- name MUST live in gate_label, not gate_type).
--
-- Pairs with: chairman-decision-watcher.js FALLBACK_DECISION_CREATING_STAGES += 21
-- (the TS-7 parity test tests/ci/decision-creating-set-parity.test.js asserts
-- FALLBACK === the DB-derived decision-creating set, so both must change together).

BEGIN;

UPDATE venture_stages
SET review_mode = 'review',
    gate_label  = 'creative_handoff',
    updated_at  = now()
WHERE stage_number = 21;

COMMIT;
