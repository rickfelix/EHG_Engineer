-- Create team_assignments stub table (fixes frontend 404s)
-- The EHG frontend (useChairmanDashboardData, evaInsightService) queries this
-- table for team workload metrics. The query has graceful error handling but
-- still produces 404 errors in the browser console. This creates the table
-- empty so the queries return [] instead of 404.
--
-- Full workload tracking will be populated by future SDs when team dispatch
-- features are activated. Schema matches frontend query shape.

CREATE TABLE IF NOT EXISTS public.team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  stage_number integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','in_progress','completed','failed','cancelled')),
  assignee text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'team_assignments' AND policyname = 'team_assignments_read') THEN
    CREATE POLICY team_assignments_read ON public.team_assignments FOR SELECT USING (true);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_team_assignments_status ON public.team_assignments(status);

COMMENT ON TABLE public.team_assignments IS 'Team workload stub table. Populated by future team dispatch SDs. Currently empty to prevent frontend 404s.';
