-- SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-4 / FR-6)
-- Make agentic_fit a weighted COMPONENT of the Stage-0 venture_score and store the
-- machine-improvement multiplier params in the evaluation_profiles config SSOT so the
-- (deferred) calibration loop can re-tune them without a code edit.
--
-- IMPORTANT: calculateWeightedScore() does NOT normalize by the weight sum, so the weights
-- must keep totalling ~1.0 (venture_score stays 0-100). agentic_fit takes a 0.10 budget and
-- the pre-existing component weights are rescaled to total 0.90 (relative ordering preserved).
-- This migration applies that rebalance per profile (idempotent — skips profiles already
-- carrying agentic_fit).

-- Multiplier params (config SSOT; jsonb column added if absent).
ALTER TABLE public.evaluation_profiles
  ADD COLUMN IF NOT EXISTS agentic_fit_params jsonb
  DEFAULT '{"multiplier_max_bonus": 0.5, "agent_leverage_floor": 30}'::jsonb;

UPDATE public.evaluation_profiles
SET agentic_fit_params = '{"multiplier_max_bonus": 0.5, "agent_leverage_floor": 30}'::jsonb,
    updated_at = now()
WHERE agentic_fit_params IS NULL;

-- Rebalance: rescale every existing weight to total 0.90, then add agentic_fit = 0.10.
-- Done in PL/pgSQL so the rescale handles each profile's own current weight map.
DO $$
DECLARE
  p RECORD;
  k TEXT;
  v NUMERIC;
  others_sum NUMERIC;
  scale NUMERIC;
  new_w JSONB;
BEGIN
  FOR p IN SELECT id, weights FROM public.evaluation_profiles WHERE NOT (weights ? 'agentic_fit') LOOP
    others_sum := 0;
    FOR k, v IN SELECT key, value::numeric FROM jsonb_each_text(p.weights) LOOP
      others_sum := others_sum + v;
    END LOOP;
    IF others_sum <= 0 THEN CONTINUE; END IF;
    scale := 0.90 / others_sum;
    new_w := '{}'::jsonb;
    FOR k, v IN SELECT key, value::numeric FROM jsonb_each_text(p.weights) LOOP
      new_w := new_w || jsonb_build_object(k, round(v * scale, 3));
    END LOOP;
    new_w := new_w || '{"agentic_fit": 0.10}'::jsonb;
    UPDATE public.evaluation_profiles SET weights = new_w, updated_at = now() WHERE id = p.id;
  END LOOP;
END $$;
