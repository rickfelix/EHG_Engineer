-- Migration: Enable RLS on unprotected tables
-- SD-SEC-RLS-POLICIES-001
--
-- These tables were found without RLS enabled.
-- They are internal LEO Protocol tooling tables, so we enable RLS
-- with service_role access only (no user access needed).

-- 1. db_agent_config
ALTER TABLE public.db_agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_db_agent_config" ON public.db_agent_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. db_agent_invocations
ALTER TABLE public.db_agent_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_db_agent_invocations" ON public.db_agent_invocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. improvement_quality_assessments
ALTER TABLE public.improvement_quality_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_improvement_quality_assessments" ON public.improvement_quality_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. learning_decisions
ALTER TABLE public.learning_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_learning_decisions" ON public.learning_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. leo_autonomous_directives
ALTER TABLE public.leo_autonomous_directives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_leo_autonomous_directives" ON public.leo_autonomous_directives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. pattern_occurrences
ALTER TABLE public.pattern_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_pattern_occurrences" ON public.pattern_occurrences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. pattern_resolution_signals
ALTER TABLE public.pattern_resolution_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_pattern_resolution_signals" ON public.pattern_resolution_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. uat_audit_trail
ALTER TABLE public.uat_audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_audit_trail" ON public.uat_audit_trail
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. uat_coverage_metrics
ALTER TABLE public.uat_coverage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_coverage_metrics" ON public.uat_coverage_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. uat_issues
ALTER TABLE public.uat_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_issues" ON public.uat_issues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. uat_performance_metrics
ALTER TABLE public.uat_performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_performance_metrics" ON public.uat_performance_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 12. uat_screenshots
ALTER TABLE public.uat_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_screenshots" ON public.uat_screenshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 13. uat_test_cases
ALTER TABLE public.uat_test_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_test_cases" ON public.uat_test_cases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14. uat_test_results
ALTER TABLE public.uat_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_test_results" ON public.uat_test_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 15. uat_test_runs
ALTER TABLE public.uat_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_test_runs" ON public.uat_test_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 16. uat_test_schedules
ALTER TABLE public.uat_test_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_test_schedules" ON public.uat_test_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 17. uat_test_suites
ALTER TABLE public.uat_test_suites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_uat_test_suites" ON public.uat_test_suites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verification query (run after migration)
-- SELECT c.relname, c.relrowsecurity
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
