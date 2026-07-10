-- SD-LEO-INFRA-STAGE0-GOVERNED-POSTURE-001 (FR-1)
-- Governed selection-posture phases for Stage-0 (stage-zero-greenfield-spec.md R2).
-- ONE posture SSOT: the S20-26 operations spec governs from this same store.
-- Governance is structural: at most one ACTIVE posture (partial unique index) and
-- activation requires a chairman ratification stamp (CHECK) — silently applying a
-- stale phase's weights must be impossible (gauge-vs-action divergence class).

CREATE TABLE IF NOT EXISTS selection_postures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_key             text NOT NULL,
  version               int  NOT NULL DEFAULT 1,
  display_name          text,
  criteria              jsonb NOT NULL,
  status                text NOT NULL CHECK (status IN ('pre_declared','ratified','active','expired')),
  ratified_by           text,
  ratified_at           timestamptz,
  ratification_ref      text,
  transition_condition  text,
  expiry_condition      text,
  activated_at          timestamptz,
  expired_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_key, version),
  CONSTRAINT selection_postures_active_requires_ratification
    CHECK (status <> 'active' OR ratified_at IS NOT NULL)
);

-- At most ONE active posture, ever.
CREATE UNIQUE INDEX IF NOT EXISTS selection_postures_one_active
  ON selection_postures ((true)) WHERE status = 'active';

COMMENT ON TABLE selection_postures IS
  'Governed, chairman-ratified selection postures for Stage-0 ranking (spec R2). Transitions are ratification points; runs stamp the posture_version they applied; resolution fails closed.';

-- Seed: Phase-1 "process-proving" — ACTIVE, chairman-ratified.
-- Criteria carried VERBATIM from stage-zero-greenfield-spec.md R2 (chairman injections
-- 2a9977e3 / b1615ef2; in-session ratification 2026-07-10). Revenue weight is 0.0 —
-- "revenue potential = tiebreaker only" is literal: revenue still breaks ties via the
-- existing parsed_revenue_high tie-break in rankCandidates, but never moves the composite.
INSERT INTO selection_postures
  (phase_key, version, display_name, criteria, status, ratified_by, ratified_at, ratification_ref, transition_condition, expiry_condition, activated_at)
VALUES (
  'phase_1_process_proving', 1, 'Phase 1 — process-proving',
  '{
    "weights": {
      "automation_feasibility": 0.45,
      "target_market_specificity": 0.25,
      "strategic_fit": 0.20,
      "competition_level": 0.10,
      "monthly_revenue_potential": 0.0
    },
    "hard_criteria": [
      "full-26-stage traversability: the candidate must plausibly traverse launch, distribution, operations, and real revenue collection (trivially small real revenue still proves the S20-26 + attribution path)"
    ],
    "anti_goals": [
      "long sales cycles",
      "content moats",
      "app-store distribution surface",
      "regulatory surface"
    ],
    "tiebreakers": ["parsed_revenue_high DESC", "automation_feasibility DESC", "name ASC"],
    "posture_note": "SIMPLICITY dominates (small scope, fast time-to-launch, minimal integrations); revenue potential = tiebreaker only"
  }'::jsonb,
  'active', 'chairman', now(),
  'stage-zero-greenfield-spec.md R2; chairman injections 2a9977e3/b1615ef2; in-session ratification 2026-07-10',
  NULL,
  'one venture completes all 26 stages through real launch/ops/revenue',
  now()
)
ON CONFLICT (phase_key, version) DO NOTHING;

-- Seed: Phase-2 "success-weighted" — PRE-DECLARED, not ratified, not active.
INSERT INTO selection_postures
  (phase_key, version, display_name, criteria, status, transition_condition)
VALUES (
  'phase_2_success_weighted', 1, 'Phase 2 — success-weighted',
  '{
    "weights": {
      "monthly_revenue_potential": 0.40,
      "automation_feasibility": 0.20,
      "target_market_specificity": 0.15,
      "strategic_fit": 0.15,
      "competition_level": 0.10
    },
    "hard_criteria": [],
    "anti_goals": [],
    "tiebreakers": ["parsed_revenue_high DESC", "automation_feasibility DESC", "name ASC"],
    "posture_note": "revenue/market-weighted ranking; pre-declared per spec R2"
  }'::jsonb,
  'pre_declared',
  'activated only by chairman ratification (spec R2)'
)
ON CONFLICT (phase_key, version) DO NOTHING;
