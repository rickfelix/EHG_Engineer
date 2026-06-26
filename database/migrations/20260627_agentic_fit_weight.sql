-- SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-4 / FR-6)
-- Add the agentic_fit weight + multiplier params to evaluation_profiles so the
-- agentic-fit lens is a weighted COMPONENT of the Stage-0 venture_score, and the
-- (deferred) calibration loop can re-tune the weight/params without a code edit.
--
-- v1 ratified starting hypothesis: weight 0.10 (additive to existing components;
-- the weighted score sums contributions, it does not require weights to total 1.0).
-- Multiplier params live alongside the weights as a config SSOT.
-- Idempotent: only sets agentic_fit when it is not already present.

UPDATE public.evaluation_profiles
SET weights = weights || '{"agentic_fit": 0.10}'::jsonb,
    updated_at = now()
WHERE NOT (weights ? 'agentic_fit');

-- Machine-improvement multiplier params (config SSOT; jsonb column added if absent).
ALTER TABLE public.evaluation_profiles
  ADD COLUMN IF NOT EXISTS agentic_fit_params jsonb
  DEFAULT '{"multiplier_max_bonus": 0.5, "agent_leverage_floor": 30}'::jsonb;

UPDATE public.evaluation_profiles
SET agentic_fit_params = '{"multiplier_max_bonus": 0.5, "agent_leverage_floor": 30}'::jsonb,
    updated_at = now()
WHERE agentic_fit_params IS NULL;
