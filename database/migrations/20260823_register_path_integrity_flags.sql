-- 20260823_register_path_integrity_flags.sql
-- SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-1/FR-4, TR-9)
--
-- Registers the two new leo_feature_flags rows FR-1 and FR-4 need, following
-- the exact pattern of 20260821_register_synthetic_actor_fence_enforce_flag.sql.
--
-- PATH_INTEGRITY_EXIT_GATE_ENFORCE (FR-1): gates whether _advanceStage()
-- (stage-execution-worker.js) BLOCKS on a failing checkExitGates /
-- checkThesisKillGate / checkGateDebt result, vs. only logging a
-- would-have-REFUSED event (observe-only). Default OFF -- a hard,
-- unflagged flip was rejected at LEAD phase: 44 ventures currently have 325
-- gate rows at passed=false and advance freely under the pre-fix bypass, so
-- an unflagged flip risks an uncontrolled production stoppage. Enable only
-- after the would-have-REFUSED log has been reviewed for an acceptable
-- window and an explicit chairman decision to enforce is recorded.
--
-- PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH (FR-4): when enabled, restores
-- the PRE-FIX fail-open behavior on the Stage23->24 product-review
-- evaluator (stage-execution-worker.js:2901-2903), i.e. an evaluator error
-- approves the advance instead of blocking it. Default OFF, meaning
-- fail-CLOSED is the ACTIVE default once this SD merges. This is the
-- inverse polarity of PATH_INTEGRITY_EXIT_GATE_ENFORCE: OFF here is the
-- SAFER (stricter) state, an operator escape hatch for a confirmed
-- evaluator bug, not a promotion target.
--
-- Explicitly set lifecycle_state='disabled' on both rows rather than
-- relying on the column default ('enabled') -- leo_feature_flags has a live
-- CHECK constraint chk_flag_lifecycle_enabled_consistency
-- (CHECK (is_enabled = (lifecycle_state = 'enabled'))) that a naive
-- {is_enabled:false} INSERT without an explicit lifecycle_state would
-- violate.
--
-- Idempotent: ON CONFLICT (flag_key) DO NOTHING -- this migration only ever
-- establishes the initial safe-default rows; a later operator flip must
-- never be silently reverted by a re-run.

INSERT INTO leo_feature_flags (
  flag_key, display_name, description, is_enabled, lifecycle_state,
  risk_tier, is_temporary, gates_what, enablement_criteria
) VALUES
(
  'PATH_INTEGRITY_EXIT_GATE_ENFORCE',
  'Path Integrity: Exit-Gate/Thesis-Kill/Gate-Debt Enforcement (chairman-decision advance path)',
  'Gates whether _advanceStage() (SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001, FR-1) BLOCKS a venture-stage advance on a failing checkExitGates/checkThesisKillGate/checkGateDebt result, vs. only logging a would-have-REFUSED event (observe-only). Default OFF -- 44 ventures / 325 gate rows currently at passed=false advance freely under the pre-fix bypass; an unflagged flip risks an uncontrolled production stoppage.',
  false,
  'disabled',
  'high',
  false,
  'Venture-stage advancement via _advanceStage() for any venture with a currently-failing checkExitGates/checkThesisKillGate/checkGateDebt result.',
  'Enable only after the would-have-REFUSED log has been reviewed for an acceptable observation window and an explicit chairman decision to enforce is recorded.'
),
(
  'PATH_INTEGRITY_PRODUCT_REVIEW_KILL_SWITCH',
  'Path Integrity: Product-Review Evaluator Fail-Open Kill-Switch (Stage 23->24)',
  'When ENABLED, restores the PRE-FIX fail-open behavior on the Stage23->24 product-review/external-publication evaluator (SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001, FR-4) -- an evaluator error approves the advance instead of blocking it. Default OFF, meaning fail-CLOSED (block on evaluator error) is the ACTIVE default once this SD merges. Operator escape hatch for a confirmed evaluator bug, not a promotion target -- inverse polarity from PATH_INTEGRITY_EXIT_GATE_ENFORCE.',
  false,
  'disabled',
  'medium',
  false,
  'The Stage23->24 chairman product-review choke-point evaluator error path in stage-execution-worker.js.',
  'Enable only as a temporary operator override during a confirmed product-review evaluator outage/bug; disable again once the evaluator is fixed.'
)
ON CONFLICT (flag_key) DO NOTHING;
