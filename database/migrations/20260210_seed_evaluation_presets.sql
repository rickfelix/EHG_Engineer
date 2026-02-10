-- Seed 6 Evaluation Presets
-- Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-L
-- Inserts 6 new evaluation_profiles presets with validated weight vectors.
-- Idempotent: uses ON CONFLICT DO UPDATE to ensure correct values on reruns.
-- Existing profiles (balanced, aggressive_growth, capital_efficient) are NOT modified.
--
-- Note: enforce_single_active_profile trigger allows only ONE active profile.
-- ehg_balanced is set as the active default (inserted last to be the active one).
-- Other 5 presets are inserted with is_active=false (selectable but not default).

BEGIN;

-- Ensure unique constraint exists for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evaluation_profiles_name_version_key'
  ) THEN
    ALTER TABLE evaluation_profiles
      ADD CONSTRAINT evaluation_profiles_name_version_key UNIQUE (name, version);
  END IF;
END $$;

-- 1. viral_first: Growth-at-all-costs, emphasizes viral mechanics
INSERT INTO evaluation_profiles (name, version, description, weights, gate_thresholds, is_active, created_by)
VALUES (
  'viral_first', 1,
  'Emphasizes viral mechanics and network effects. Best for ventures targeting rapid user acquisition through organic growth loops.',
  '{"virality":0.30,"archetypes":0.15,"build_cost":0.05,"time_horizon":0.05,"cross_reference":0.10,"moat_architecture":0.10,"problem_reframing":0.05,"chairman_constraints":0.15,"portfolio_evaluation":0.05}'::jsonb,
  '{"overall_min":0.50,"component_min":0.30,"red_flag_max":0.12}'::jsonb,
  false, 'seed_migration'
) ON CONFLICT (name, version) DO UPDATE SET
  description = EXCLUDED.description,
  weights = EXCLUDED.weights,
  gate_thresholds = EXCLUDED.gate_thresholds,
  created_by = EXCLUDED.created_by;

-- 2. moat_first: Defensibility focus, emphasizes competitive moat
INSERT INTO evaluation_profiles (name, version, description, weights, gate_thresholds, is_active, created_by)
VALUES (
  'moat_first', 1,
  'Prioritizes defensibility and competitive moat architecture. Best for ventures in crowded markets where long-term differentiation is critical.',
  '{"virality":0.10,"archetypes":0.05,"build_cost":0.10,"time_horizon":0.10,"cross_reference":0.05,"moat_architecture":0.30,"problem_reframing":0.10,"chairman_constraints":0.15,"portfolio_evaluation":0.05}'::jsonb,
  '{"overall_min":0.55,"component_min":0.35,"red_flag_max":0.08}'::jsonb,
  false, 'seed_migration'
) ON CONFLICT (name, version) DO UPDATE SET
  description = EXCLUDED.description,
  weights = EXCLUDED.weights,
  gate_thresholds = EXCLUDED.gate_thresholds,
  created_by = EXCLUDED.created_by;

-- 3. revenue_first: Revenue viability and cost efficiency focus
INSERT INTO evaluation_profiles (name, version, description, weights, gate_thresholds, is_active, created_by)
VALUES (
  'revenue_first', 1,
  'Prioritizes revenue viability and capital efficiency. Best for ventures where monetization clarity and unit economics are paramount.',
  '{"virality":0.10,"archetypes":0.05,"build_cost":0.20,"time_horizon":0.10,"cross_reference":0.05,"moat_architecture":0.15,"problem_reframing":0.05,"chairman_constraints":0.25,"portfolio_evaluation":0.05}'::jsonb,
  '{"overall_min":0.55,"component_min":0.35,"red_flag_max":0.08}'::jsonb,
  false, 'seed_migration'
) ON CONFLICT (name, version) DO UPDATE SET
  description = EXCLUDED.description,
  weights = EXCLUDED.weights,
  gate_thresholds = EXCLUDED.gate_thresholds,
  created_by = EXCLUDED.created_by;

-- 4. portfolio_synergy: Portfolio fit and cross-reference emphasis
INSERT INTO evaluation_profiles (name, version, description, weights, gate_thresholds, is_active, created_by)
VALUES (
  'portfolio_synergy', 1,
  'Emphasizes portfolio fit and cross-reference alignment. Best for evaluating how a venture complements the existing EHG portfolio.',
  '{"virality":0.05,"archetypes":0.10,"build_cost":0.05,"time_horizon":0.05,"cross_reference":0.20,"moat_architecture":0.10,"problem_reframing":0.05,"chairman_constraints":0.15,"portfolio_evaluation":0.25}'::jsonb,
  '{"overall_min":0.50,"component_min":0.30,"red_flag_max":0.12}'::jsonb,
  false, 'seed_migration'
) ON CONFLICT (name, version) DO UPDATE SET
  description = EXCLUDED.description,
  weights = EXCLUDED.weights,
  gate_thresholds = EXCLUDED.gate_thresholds,
  created_by = EXCLUDED.created_by;

-- 5. speed_to_market: Fast execution, low cost emphasis
INSERT INTO evaluation_profiles (name, version, description, weights, gate_thresholds, is_active, created_by)
VALUES (
  'speed_to_market', 1,
  'Prioritizes rapid execution and low build cost. Best for time-sensitive opportunities where first-mover advantage outweighs perfection.',
  '{"virality":0.15,"archetypes":0.05,"build_cost":0.25,"time_horizon":0.20,"cross_reference":0.05,"moat_architecture":0.10,"problem_reframing":0.05,"chairman_constraints":0.10,"portfolio_evaluation":0.05}'::jsonb,
  '{"overall_min":0.45,"component_min":0.25,"red_flag_max":0.15}'::jsonb,
  false, 'seed_migration'
) ON CONFLICT (name, version) DO UPDATE SET
  description = EXCLUDED.description,
  weights = EXCLUDED.weights,
  gate_thresholds = EXCLUDED.gate_thresholds,
  created_by = EXCLUDED.created_by;

-- 6. ehg_balanced: Chairman-tuned balanced approach (ACTIVE DEFAULT)
-- Inserted last so the enforce_single_active_profile trigger makes it the active one.
INSERT INTO evaluation_profiles (name, version, description, weights, gate_thresholds, is_active, created_by)
VALUES (
  'ehg_balanced', 1,
  'Chairman-tuned balanced evaluation with slightly elevated governance weight. The recommended default for EHG venture evaluation.',
  '{"virality":0.15,"archetypes":0.08,"build_cost":0.10,"time_horizon":0.07,"cross_reference":0.10,"moat_architecture":0.15,"problem_reframing":0.05,"chairman_constraints":0.20,"portfolio_evaluation":0.10}'::jsonb,
  '{"overall_min":0.55,"component_min":0.35,"red_flag_max":0.08}'::jsonb,
  true, 'seed_migration'
) ON CONFLICT (name, version) DO UPDATE SET
  description = EXCLUDED.description,
  weights = EXCLUDED.weights,
  gate_thresholds = EXCLUDED.gate_thresholds,
  is_active = EXCLUDED.is_active,
  created_by = EXCLUDED.created_by;

COMMIT;
