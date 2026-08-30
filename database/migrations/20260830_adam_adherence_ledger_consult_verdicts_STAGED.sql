-- @delegated-by: adam
-- QF-20260830-762 — Adam adherence ledger: separate consult STATE from duty VERDICTS.
-- STAGED — Adam applies on merge under §3b delegated CHECK-widen authority (CLAUDE_ADAM.md 3b:
-- "provably-additive DDL ... CHECK-widen" is explicitly in scope; both changes below only ADD
-- admissible values, never remove or narrow an existing one).
-- ============================================================================================
-- WHY. lib/adam/should-consult-solomon.js files a placeholder row for EVERY non-blocking
-- pre-send consult (queued or timed out) so the send decision stays auditable while Solomon's
-- verdict is still in flight. Measured live 2026-08-30 (30d, PostgREST 1000-row cap so this is a
-- floor): 904 of 1000 probe='decision_rubric' rows are verdict='unknown', ALL with
-- detail='solomon-consult-async::pending-reconcile' — while the REAL decision_rubric audit is
-- 47 pass / 0 fail. The self-adherence gauge reads the placeholders as duty-audit outcomes and
-- reports 85% blind; the underlying audit is healthy. A companion QF relabels the writer to
-- probe='pre_send_consult' + check_class='consult' so these rows stop counting as decision_rubric
-- verdicts at all. This migration is the schema half that relabeling needs.
--
-- TWO SEPARATE CHECK constraints widen here, and only one was in the original ask:
--
-- 1. verdict CHECK (adam_adherence_ledger_verdict_check, 20260614_adam_adherence_ledger.sql):
--    admits only pass/fail/unknown today (VERIFIED live — no other value exists in 500 sampled
--    decision_rubric rows). Widened to admit 'reconciled' (a late Solomon verdict arrived and
--    closed the anchored row) and 'oracle_unreachable' (the documented-proceed timeout closed it
--    with no verdict ever arriving) — the reconciler's close-out values (follow-up PR, after this
--    applies; the reconciler write path itself needs this constraint live first).
--
-- 2. check_class CHECK (adam_adherence_ledger_check_class_check, 20260728 STAGED): admits only
--    NULL/duty/conduct — DISCOVERED while staging this file, not anticipated by the QF that asked
--    for check_class='consult'. duty/conduct classify WHAT A GENUINE VERDICT IS A CLAIM ABOUT (a
--    presence check vs an observed-behaviour check); 'consult' is a third, different kind of
--    thing — a row that is not a verdict claim at all, it is Solomon-consult STATE wearing the
--    ledger's shape. Widened rather than reinterpreted: duty/conduct semantics are untouched,
--    'consult' is additive.
--
-- Both are CHECK-widens only (no DROP of an existing admissible value, no narrowing, no data
-- rewrite) — squarely in the §3b additive scope. Same-constraint coordination check per
-- CLAUDE_ADAM.md 3c precondition (4): live constraints re-read immediately before authoring this
-- file (2026-08-30) — the staged lists below carry every value each constraint currently admits,
-- so applying this does not silently revert a sibling.
-- ============================================================================================

-- 1. Widen verdict CHECK: pass/fail/unknown (unchanged) + reconciled + oracle_unreachable.
ALTER TABLE adam_adherence_ledger
  DROP CONSTRAINT IF EXISTS adam_adherence_ledger_verdict_check;
ALTER TABLE adam_adherence_ledger
  ADD CONSTRAINT adam_adherence_ledger_verdict_check
  CHECK (verdict IN ('pass', 'fail', 'unknown', 'reconciled', 'oracle_unreachable'));

-- 2. Widen check_class CHECK: NULL/duty/conduct (unchanged) + consult.
ALTER TABLE adam_adherence_ledger
  DROP CONSTRAINT IF EXISTS adam_adherence_ledger_check_class_check;
ALTER TABLE adam_adherence_ledger
  ADD CONSTRAINT adam_adherence_ledger_check_class_check
  CHECK (check_class IS NULL OR check_class IN ('duty', 'conduct', 'consult'));

COMMENT ON COLUMN adam_adherence_ledger.check_class IS
  'What this row is a claim ABOUT: duty = the duty is wired (a presence check); conduct = behaviour complied (read live behaviour); consult = NOT a verdict at all — Solomon pre-send-consult STATE (pending/reconciled/unreachable). NULL means the row predates classification and asserts NOTHING. SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-2 + QF-20260830-762.';

NOTIFY pgrst, 'reload schema';
