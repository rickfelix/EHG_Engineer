-- SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-B (FR-1/FR-2/FR-3)
-- Foresight Board Phase-1 data schemas: forecast_records (spec section 8.5, extended
-- with a pair-level chaining-option delta), specialist_assessments (8.8),
-- council_adjudications (8.9), venture_decision_dossiers (8.10).
-- docs/design/ehg-venture-foresight-board-spec.md
--
-- ADDITIVE ONLY: 4x CREATE TABLE IF NOT EXISTS, each immediately followed by
-- ENABLE ROW LEVEL SECURITY + a service_role FOR ALL policy in this same file
-- (chairman-approval-gate requirement per PRD FR-1/FR-2/FR-3 acceptance criteria).
-- No DROP/ALTER of existing objects. No hard foreign keys to venture_candidates,
-- perspectives, or councils -- those artifacts are Phase-2 scope / file-based
-- (sibling child A) and do not yet have DB rows to reference (PRD technical_requirements:
-- keep cross-child references logical/UUID, never a hard FK to a non-existent table).
-- venture_a/venture_b (chaining-option delta) are likewise left as plain uuid columns
-- rather than FKs to `ventures` -- a chaining recommendation must survive a venture
-- being archived/renamed without the row silently failing to insert or cascading a
-- delete into forecast history.
--
-- BUILT-NOT-WIRED SEAM (PRD technical_requirements: "must document the built-not-wired
-- seam honestly rather than fabricating a writer"): these 4 tables are UNPOPULATED by
-- this SD. The intended writer is sibling child SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-C
-- (the Phase-1 workflow engine, out of scope here). No fabricated/mock producer exists
-- in this SD -- do not mistake an empty table for a missing feature; see that child's
-- own SD for the actual write path. Documented here (source-level, permanent in git
-- history) rather than via `COMMENT ON TABLE` DDL: COMMENT ON TABLE is not on the
-- migration-tier-classifier's provably-additive allow-list (scripts/lib/migration-tier-
-- classifier.mjs Rule F only covers COMMENT ON COLUMN), so using it here would force
-- this otherwise fully-additive migration into the chairman-gated tier-2 path with no
-- real chairman approval available to attach -- a PRD-vs-classifier conflict flagged via
-- /signal spec-conflict rather than silently resolved either direction.
--
-- Confidence/probability scale: 0-1 throughout (never 0-100), matching the pinned
-- scoring-module convention in lib/foresight/scoring/venture-score.js (spec section 13.2).

CREATE TABLE IF NOT EXISTS forecast_records (
  forecast_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perspective_id uuid,
  forecast_text text NOT NULL,
  forecast_date date NOT NULL DEFAULT CURRENT_DATE,
  forecast_target_date date,
  probability numeric(4,3) CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  measurable_condition text,
  source_id uuid,
  current_status text NOT NULL DEFAULT 'open'
    CHECK (current_status IN ('open', 'confirmed', 'partially_confirmed', 'premature', 'contradicted', 'unresolved')),
  outcome_score numeric,
  adjudication_notes text,
  venture_a uuid,
  venture_b uuid,
  capability_edge text,
  trigger text,
  review_at timestamptz,
  decay_at timestamptz
);

ALTER TABLE forecast_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_forecast_records
  ON forecast_records FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS specialist_assessments (
  assessment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_candidate_id uuid,
  council_id uuid,
  perspective_id uuid,
  evidence_reviewed jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  recommended_action text
    CHECK (recommended_action IS NULL OR recommended_action IN
      ('reject', 'monitor', 'research', 'prototype', 'validate', 'incubate', 'launch', 'scale')),
  dissent_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  prompt_version text,
  model_version text
);

ALTER TABLE specialist_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_specialist_assessments
  ON specialist_assessments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS council_adjudications (
  adjudication_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_candidate_id uuid,
  council_id uuid,
  adjudicator_perspective_id uuid,
  consensus_summary text,
  disagreement_summary text,
  minority_view text NOT NULL DEFAULT '',
  evidence_quality text
    CHECK (evidence_quality IS NULL OR evidence_quality IN ('low', 'moderate', 'strong', 'very_strong')),
  council_confidence numeric(4,3) CHECK (council_confidence IS NULL OR (council_confidence >= 0 AND council_confidence <= 1)),
  recommendation text,
  recommended_experiments jsonb NOT NULL DEFAULT '[]'::jsonb,
  monitoring_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  kill_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE council_adjudications ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_council_adjudications
  ON council_adjudications FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS venture_decision_dossiers (
  dossier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_candidate_id uuid,
  council_adjudication_ids uuid[] NOT NULL DEFAULT '{}',
  overall_score numeric,
  overall_confidence numeric(4,3) CHECK (overall_confidence IS NULL OR (overall_confidence >= 0 AND overall_confidence <= 1)),
  key_assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  major_disagreements jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_posture text,
  next_experiment text,
  experiment_budget numeric,
  expected_information_gain text,
  cost_of_waiting text,
  reversibility text,
  rick_decision_required boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE venture_decision_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_venture_decision_dossiers
  ON venture_decision_dossiers FOR ALL TO service_role USING (true) WITH CHECK (true);
