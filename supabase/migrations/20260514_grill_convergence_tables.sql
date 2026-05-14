-- SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-C (Child C of Pocock orchestrator)
-- /grill skill — adversarial sub-agent grilling tables + RLS + 20 seed fixtures.
-- @approved-by: rickfelix@example.com

-- 1. grill_convergence_artifacts: append-only audit log of every /grill invocation
CREATE TABLE IF NOT EXISTS public.grill_convergence_artifacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id           text,
  sd_id                text,  -- weak ref to strategic_directives_v2.id (varchar); no FK to avoid type-mismatch (id is varchar, uuid_id is uuid)
  question_hash        text,
  converged            boolean NOT NULL DEFAULT false,
  converged_answer     text,
  rounds_used          int NOT NULL DEFAULT 0,
  rounds_executed      int NOT NULL DEFAULT 0,
  total_llm_calls      int NOT NULL DEFAULT 0,
  cost_capped          boolean NOT NULL DEFAULT false,
  dissent              jsonb NOT NULL DEFAULT '[]'::jsonb,
  dissent_count        int NOT NULL DEFAULT 0,
  sampling_t           numeric(4,3) NOT NULL DEFAULT 0.000,
  samples_per_agent    int NOT NULL DEFAULT 3,
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grill_artifacts_sd ON public.grill_convergence_artifacts(sd_id);
CREATE INDEX IF NOT EXISTS idx_grill_artifacts_fixture ON public.grill_convergence_artifacts(fixture_id);
CREATE INDEX IF NOT EXISTS idx_grill_artifacts_qhash ON public.grill_convergence_artifacts(question_hash);

ALTER TABLE public.grill_convergence_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY grill_artifacts_authenticated_read ON public.grill_convergence_artifacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY grill_artifacts_service_write ON public.grill_convergence_artifacts
  FOR INSERT TO service_role WITH CHECK (true);

-- 2. grill_fixtures: 20-row test corpus with verified convergence answers
CREATE TABLE IF NOT EXISTS public.grill_fixtures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id            text UNIQUE NOT NULL,
  question_text         text NOT NULL,
  verified_answer       text NOT NULL,
  category              text,
  expected_to_converge  boolean NOT NULL DEFAULT true,
  notes                 text,
  deprecated_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grill_fixtures_active ON public.grill_fixtures(fixture_id)
  WHERE deprecated_at IS NULL;

ALTER TABLE public.grill_fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY grill_fixtures_authenticated_read ON public.grill_fixtures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY grill_fixtures_service_write ON public.grill_fixtures
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Seed corpus: 20 fixtures (19 expected_to_converge + 1 adversarial for TS-7)
INSERT INTO public.grill_fixtures (fixture_id, question_text, verified_answer, category, expected_to_converge, notes) VALUES
  ('test-1', 'Smoke fixture: minimal convergence check', 'minimal-pass', 'smoke', true, 'TS-1 anchor; used by single-round smoke'),
  ('corpus-01', 'Should LEAD-TO-PLAN block when open_questions_for_plan_phase is non-empty?', 'block-with-warn-default', 'gate-policy', true, NULL),
  ('corpus-02', 'What is the maximum LOC body for a Pocock skill?', '30', 'progressive-disclosure', true, NULL),
  ('corpus-03', 'Should /grill emit dissent when converged=false?', 'always', 'dissent-policy', true, NULL),
  ('corpus-04', 'Does T=0 sampling guarantee a single answer per call?', 'no-may-tie', 'sampling', true, NULL),
  ('corpus-05', 'Minimum samples per agent per round?', '3', 'voting', true, NULL),
  ('corpus-06', 'Convergence requires majority across what fraction of agents?', 'two-thirds', 'voting', true, NULL),
  ('corpus-07', 'Maximum LLM calls per /grill invocation?', '45', 'cost', true, NULL),
  ('corpus-08', 'Does early-exit on convergence reduce call count?', 'yes', 'cost', true, NULL),
  ('corpus-09', 'Are intermediate-round payloads shown to chairman?', 'no', 'channel', true, NULL),
  ('corpus-10', 'Is grill-runner forked from board-deliberation engine?', 'no-config-delta-only', 'architecture', true, NULL),
  ('corpus-11', 'Bypass quota per SD?', '3', 'bypass', true, NULL),
  ('corpus-12', 'Bypass quota per day globally?', '10', 'bypass', true, NULL),
  ('corpus-13', 'Default LEAD-TO-PLAN gate phase?', 'phase-1-warn', 'gate-policy', true, NULL),
  ('corpus-14', 'Env var to enable hard-fail phase-2?', 'LEO_GRILL_HARD_FAIL', 'gate-policy', true, NULL),
  ('corpus-15', 'Where does the convergence artifact land?', 'grill_convergence_artifacts', 'storage', true, NULL),
  ('corpus-16', 'Are artifacts append-only?', 'yes', 'storage', true, NULL),
  ('corpus-17', 'How many adversarial agents per question?', '3', 'voting', true, NULL),
  ('corpus-18', 'Maximum rounds before non-convergence?', '5', 'voting', true, NULL),
  ('corpus-19', 'Adversarial fixture: does this fixture converge?', 'no-by-design', 'adversarial', false, 'TS-7 anchor; designed to never converge')
ON CONFLICT (fixture_id) DO NOTHING;
