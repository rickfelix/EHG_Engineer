-- @approved-by: PENDING — chairman-gated apply ceremony required (do NOT apply outside it)
-- STAGED migration — SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 (FR-2)
-- governance_probe_registry: probes-as-ROWS for the governance-situation loop.
-- Generalizes the hardcoded per-role adherence probe sets (lib/adam/adherence-probes.js,
-- scripts/adam-self-adherence-review.mjs + solomon twin) into ONE registry consumed by
-- ONE generic runner (lib/governance/probe-runner.mjs). Hardening = INSERT a probe row,
-- never author a script (config-not-code, same lesson as the collector-registration seam).
--
-- gt_case_ref / added_from_situation give hardening-to-situation traceability: a probe
-- counts only after the shadow-trial sealed replay (scripts/governance/shadow-run-proposal.mjs)
-- catches the originating situation (SD FR-3). Authority-EXPANDING hardenings are never-auto
-- (chairman-ratified only) — see docs/reference/governance-situation-loop.md.
--
-- RLS in the same migration (SPINE-001-B recurrence lesson): service-role only.

CREATE TABLE IF NOT EXISTS governance_probe_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_key text NOT NULL UNIQUE,
  target_role text NOT NULL,               -- adam | solomon | coordinator | worker | system
  predicate_type text NOT NULL CHECK (predicate_type IN ('adherence_fact', 'closure_predicate')),
  predicate_config jsonb NOT NULL,         -- machine-checkable; shape per predicate_type
  gt_case_ref text,                        -- sealed eval case / originating evidence the probe must catch
  added_from_situation text,               -- issue_patterns id (GOV-*) this hardening came from
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE governance_probe_registry ENABLE ROW LEVEL SECURITY;
-- Service-role only: no anon/authenticated policies. The generic runner and the
-- adjudication lane (Solomon consult) are the only writers/readers.

-- Seed probes (run at chairman apply): two duties lifted from the existing per-role
-- adherence sets, proving adding-a-probe-is-an-INSERT from day one.
INSERT INTO governance_probe_registry (probe_key, target_role, predicate_type, predicate_config, gt_case_ref, added_from_situation)
VALUES
  (
    'governance_situation_capture_liveness', 'system', 'closure_predicate',
    '{"predicate_type":"edge_freshness","closure_predicate":{"window_seconds":1209600,"authorized_writer":"governance-situation-loop"}}'::jsonb,
    'issue_patterns:category=governance_situation', NULL
  ),
  (
    'adam_self_adherence_ledger_fresh', 'adam', 'closure_predicate',
    '{"predicate_type":"witness_recent","closure_predicate":{"window_seconds":604800,"authorized_writer":"adam-self-adherence-review"}}'::jsonb,
    'adam_adherence_ledger:latest-run', NULL
  )
ON CONFLICT (probe_key) DO NOTHING;

COMMENT ON TABLE governance_probe_registry IS 'Probes-as-rows for the governance-situation continuous-learning loop; run by lib/governance/probe-runner.mjs. SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001.';
COMMENT ON COLUMN governance_probe_registry.added_from_situation IS 'issue_patterns id (GOV-*) of the originating situation — hardening-to-situation traceability; replay must catch it before the probe counts.';
