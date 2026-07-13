-- @chairman-gated
-- SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001 (L-META, runtime half of D8)
--
-- loop_registry: the plan-of-record spine. Each row is a self-improving LOOP whose
-- CLOSURE (not merely operator liveness) is verified at runtime. This is an ADDITIVE
-- table — it deliberately does NOT alter the shared periodic_process_registry (the D8
-- operator-contract gate and many systems depend on that table); instead each loop
-- references periodic_process_registry.process_key (by convention, not a hard FK, so
-- the loop row survives registry churn) for its verifier/digest cadence + witness.
--
-- CHAIRMAN-GATED: this DDL is not auto-applied. Apply via the chairman-gated apply
-- ceremony. RLS is enabled and a service_role policy is created in the SAME migration
-- so the table is never anon-writable (SPINE-001-B recurrence guard).

CREATE TABLE IF NOT EXISTS public.loop_registry (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_key              text NOT NULL UNIQUE,               -- e.g. 'L7' or a stable slug
  display_name          text,
  -- loop anatomy
  trigger               text,                               -- what starts the loop
  closure_edge          text,                               -- the edge whose presence means CLOSED
  constituent_operators jsonb NOT NULL DEFAULT '[]'::jsonb, -- operators that make up the loop
  predicate_type        text NOT NULL,                      -- taxonomy key for the closure probe
  closure_predicate     jsonb NOT NULL,                     -- machine-checkable closure probe (required)
  dependency_edges      jsonb NOT NULL DEFAULT '[]'::jsonb, -- upstream loop dependencies
  -- plan-of-record spine keys (ladder + roadmap + closing SD -> one queryable structure)
  vision_ladder_rung_id uuid REFERENCES public.vision_ladder_rungs(id) ON DELETE SET NULL,
  roadmap_wave_id       uuid REFERENCES public.roadmap_waves(id) ON DELETE SET NULL,
  closing_sd_key        text,                               -- strategic_directives_v2.sd_key (soft ref)
  -- cadence/witness live in periodic_process_registry (referenced, not duplicated)
  verifier_process_key  text,                               -- periodic_process_registry.process_key
  -- runtime closure state (stamped by the closure-verifier cron)
  status                text NOT NULL DEFAULT 'unknown'
                          CHECK (status IN ('closed','open','starved','unknown')),
  status_reason         text,
  evaluated_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loop_registry IS
  'L-META loop-governance spine (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001): one row per self-improving loop; runtime CLOSED/OPEN/STARVED closure state + plan-of-record spine keys. Additive — references periodic_process_registry for cadence/witness.';

CREATE INDEX IF NOT EXISTS idx_loop_registry_rung   ON public.loop_registry (vision_ladder_rung_id);
CREATE INDEX IF NOT EXISTS idx_loop_registry_wave   ON public.loop_registry (roadmap_wave_id);
CREATE INDEX IF NOT EXISTS idx_loop_registry_status ON public.loop_registry (status);

-- RLS + service_role policy in the SAME migration (never anon-writable).
ALTER TABLE public.loop_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loop_registry_service_role ON public.loop_registry;
CREATE POLICY loop_registry_service_role ON public.loop_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read (dashboards / distance-to-V1 query); no anon access.
DROP POLICY IF EXISTS loop_registry_authenticated_read ON public.loop_registry;
CREATE POLICY loop_registry_authenticated_read ON public.loop_registry
  FOR SELECT TO authenticated USING (true);
