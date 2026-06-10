-- @approved-by: codestreetlabs@gmail.com
-- Migration: ventures.is_scaffolding flag + v_venture_gate_debt view (ADDITIVE ONLY)
-- SD-LEO-FIX-MAKE-VENTURE-STAGE-001
--
-- WHAT: (1) is_scaffolding — first-class marker for development/build-out vehicle
--       ventures (chairman context 2026-06-10: ventures were DELIBERATELY forced through
--       failing gates to build out downstream stages; their gate history must be excluded
--       from threshold calibration and portfolio analytics by default). The migration sets
--       the flag on NO ventures — which ventures qualify is a chairman data decision.
--       (2) v_venture_gate_debt — per-venture failed-unresolved BLOCKING gates (the data
--       contract for the EHG-app chairman cockpit; each eva_stage_gate_results row is the
--       latest evaluation for its (venture, stage, gate_type) because recordGateResult
--       upserts on that key). Debt = passed=false on a blocking gate_type ('kill','exit')
--       with NO approved chairman_decisions row for the venture+stage. Scaffolding/demo
--       ventures excluded by default.
--
-- SAFETY: additive only — ADD COLUMN IF NOT EXISTS with DEFAULT + CREATE OR REPLACE VIEW.
--   No data rows are inserted/updated/deleted. Reversible via the _DOWN (drops view +
--   column). No chairman GO required (reserved for irreversible data operations).

ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS is_scaffolding boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ventures.is_scaffolding IS
  'Development/build-out vehicle (SD-LEO-FIX-MAKE-VENTURE-STAGE-001): gate history excluded from threshold calibration and portfolio analytics by default. Sibling of is_demo. Set only by explicit chairman decision.';

CREATE OR REPLACE VIEW v_venture_gate_debt AS
SELECT
  v.id            AS venture_id,
  v.name          AS venture_name,
  g.stage_number,
  g.gate_type,
  g.overall_score,
  g.notes,
  g.evaluated_at,
  g.evaluated_by,
  cd.id           AS override_decision_id
FROM eva_stage_gate_results g
JOIN ventures v ON v.id = g.venture_id
LEFT JOIN LATERAL (
  SELECT id FROM chairman_decisions cd
  WHERE cd.venture_id = g.venture_id
    AND cd.lifecycle_stage = g.stage_number
    AND cd.status = 'approved'
  ORDER BY cd.created_at DESC
  LIMIT 1
) cd ON true
WHERE g.passed = false
  AND g.gate_type IN ('kill', 'exit')           -- blocking families (lib/eva/gate-enforcement.js)
  AND cd.id IS NULL                              -- unresolved: no approved chairman decision
  AND v.is_scaffolding IS DISTINCT FROM true     -- build-out vehicles excluded
  AND v.is_demo IS DISTINCT FROM true;           -- test fixtures excluded

COMMENT ON VIEW v_venture_gate_debt IS
  'Failed-unresolved BLOCKING stage gates per venture (SD-LEO-FIX-MAKE-VENTURE-STAGE-001). Data contract for the EHG-app chairman cockpit. A row disappears when the gate re-evaluates green (upsert overwrites) or an approved chairman_decisions row (incl. decision=override) records the chairman call.';
