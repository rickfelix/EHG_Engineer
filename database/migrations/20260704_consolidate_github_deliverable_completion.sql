-- @approved-by: codestreetlabs@gmail.com
-- SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-001 (F-4): consolidate the GITHUB
-- deliverable-auto-completion special-case into sd_subagent_deliverable_mapping.
--
-- A GITHUB PASS INSERT on sub_agent_execution_results fired BOTH
-- trg_complete_deliverables_on_github_pass (hardcoded 5 deliverable types,
-- completion_status='pending' filter) AND trigger_complete_deliverables_on_subagent
-- (mapping-table-driven, completion_status!='completed' filter) -- two completion
-- engines with two vocabularies for the same event. GITHUB never had a row in
-- sd_subagent_deliverable_mapping, so the mapping-driven trigger was a silent
-- no-op for GITHUB; the hardcoded trigger's own list included two dead entries
-- ('api_endpoint', 'database_change') that never match any real deliverable_type
-- (production values are 'api' / 'database' -- confirmed 2026-07-04 by querying
-- distinct sd_scope_deliverables.deliverable_type).
--
-- Fix: seed GITHUB into the mapping table with its existing (as-configured)
-- vocabulary, then retire the hardcoded trigger + function entirely. GITHUB PASS
-- completions now flow through the SAME single engine (complete_deliverables_on_subagent_pass)
-- as every other sub-agent -- one completion engine, one vocabulary, per the
-- audit's consolidation candidate #2 (docs/audits/SD-LEO-INFRA-TRIGGER-ESTATE-AUDIT-001.md).
-- Date: 2026-07-04

-- ============================================================================
-- Seed GITHUB into the mapping table (idempotent; unique on sub_agent_code+deliverable_type)
-- ============================================================================

INSERT INTO sd_subagent_deliverable_mapping (sub_agent_code, deliverable_type, priority)
VALUES
  ('GITHUB', 'configuration', 50),
  ('GITHUB', 'ui_feature', 50),
  ('GITHUB', 'documentation', 50),
  ('GITHUB', 'api_endpoint', 50),
  ('GITHUB', 'database_change', 50)
ON CONFLICT (sub_agent_code, deliverable_type) DO NOTHING;

-- ============================================================================
-- Retire the hardcoded GITHUB special-case trigger + function
-- ============================================================================

DROP TRIGGER IF EXISTS trg_complete_deliverables_on_github_pass ON sub_agent_execution_results;
DROP FUNCTION IF EXISTS complete_deliverables_on_github_pass();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_complete_deliverables_on_github_pass') THEN
    RAISE EXCEPTION 'FAILED: trg_complete_deliverables_on_github_pass still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_deliverables_on_github_pass') THEN
    RAISE EXCEPTION 'FAILED: complete_deliverables_on_github_pass() still exists';
  END IF;
  IF (SELECT COUNT(*) FROM sd_subagent_deliverable_mapping WHERE sub_agent_code = 'GITHUB') < 5 THEN
    RAISE EXCEPTION 'FAILED: GITHUB mapping rows not seeded';
  END IF;
  RAISE NOTICE 'SUCCESS: GITHUB deliverable completion consolidated into sd_subagent_deliverable_mapping';
END $$;
