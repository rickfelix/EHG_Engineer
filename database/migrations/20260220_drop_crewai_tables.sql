-- SD-EHG-ORCH-FOUNDATION-CLEANUP-001-A: Drop CrewAI tables
-- CrewAI has been eliminated from the codebase. These tables are no longer referenced.
-- Drop order respects FK dependencies.

DROP TABLE IF EXISTS crew_semantic_diffs CASCADE;
DROP TABLE IF EXISTS crewai_flow_executions CASCADE;
DROP TABLE IF EXISTS crewai_flows CASCADE;
DROP TABLE IF EXISTS crewai_flow_templates CASCADE;
DROP TABLE IF EXISTS crewai_agents CASCADE;
DROP TABLE IF EXISTS crewai_crews CASCADE;
DROP TABLE IF EXISTS crew_members CASCADE;
