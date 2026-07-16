-- @approved-by: PENDING — chairman-gated apply ceremony required (do NOT apply outside it)
-- STAGED migration — SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 (FR-1)
-- model_capability_reference: measured capability-per-cost, keyed
-- (problem_shape R1-R5 + mechanical, model_id, effort, task_id).
-- Spec: Part 4 of docs/design/solomon-fable-capability-grounding.md @ 75d8cf8e333.
--
-- SCHEMA-ONLY by design: zero INSERTs. Sealed golden-task text and answer keys
-- live DB-side (feedback.category='model_capability_baseline') and are moved by
-- a runtime loader (scripts/eval/migrate-sealed-baselines.mjs) — never by SQL
-- committed to a repo the evaluated models can read (contamination guard).
--
-- trusted_for_routing is the fail-closed trust gate: DEFAULT false, and only
-- scripts/eval/ground-truth-gate.mjs may set it true, after the eval reproduces
-- >= 1 already-adjudicated result. Routing consumers MUST filter on it.

CREATE TABLE IF NOT EXISTS model_capability_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_shape text NOT NULL CHECK (problem_shape IN (
    'R1-compounding','R2-negative-space','R3-taste','R4-coupling','R5-reversal','mechanical-baseline'
  )),
  model_id text NOT NULL,
  effort text NOT NULL CHECK (effort IN ('low','medium','high','xhigh')),
  task_id text NOT NULL,
  clears_bar boolean,
  quality_score numeric,
  tokens integer,
  wall_clock_ms integer,
  cost_norm numeric,
  graded_at timestamptz,
  grader text,
  run_at timestamptz,
  content_hash text NOT NULL,
  source_ref text NOT NULL,
  trusted_for_routing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, model_id, effort, content_hash)
);

-- RLS in the SAME migration as CREATE TABLE (SPINE-001-B recurrence guard).
ALTER TABLE model_capability_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY model_capability_reference_service_write ON model_capability_reference
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY model_capability_reference_authenticated_read ON model_capability_reference
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE model_capability_reference IS
  'Measured model/effort capability per problem shape (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001). Results-only: never stores golden-task text or answer keys. Consumers must filter trusted_for_routing=true.';
COMMENT ON COLUMN model_capability_reference.trusted_for_routing IS
  'Fail-closed trust gate. DEFAULT false. Flipped true only by scripts/eval/ground-truth-gate.mjs after reproducing >=1 adjudicated result (incl. an adversarial negative).';
