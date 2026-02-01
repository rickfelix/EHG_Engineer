-- Migration: Fix Self-Improving LEO Protocol Child SDs
-- Adds complete dependency_chain and success_criteria for all 13 child SDs
-- Addresses critical gaps identified in orchestrator review

-- Phase 0: Infrastructure Foundation (001A)
-- No dependencies
UPDATE strategic_directives
SET
  dependency_chain = '[]'::jsonb,
  success_criteria = jsonb_build_object(
    'database_schema', 'All tables created and validated',
    'indexes', 'Performance indexes in place',
    'rls_policies', 'Row-level security configured',
    'test_data', 'Sample data loaded for testing'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001A';

-- Phase 0.5: Schema Lock & Migration Prep (001B)
-- Depends on: 001A
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001A"]'::jsonb,
  success_criteria = jsonb_build_object(
    'schema_review', 'All schemas reviewed and locked',
    'migration_files', 'Migration files ready',
    'documentation', 'Schema changes documented',
    'validation', 'Pre-migration validation passes'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001B';

-- Phase 1: Input Sanitization & Quality Scoring (001C)
-- Depends on: 001B
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001B"]'::jsonb,
  success_criteria = jsonb_build_object(
    'sanitization_rate', '≥90% dangerous inputs sanitized',
    'false_quarantine_rate', '<5% false quarantine rate',
    'quality_improvement', 'Quality score improves for low-quality items',
    'logging', 'All sanitization actions logged',
    'metrics', 'Quality metrics tracked and reportable'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001C';

-- Phase 1.5: Human Feedback Interface (001D)
-- Depends on: 001B (parallel with 001C)
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001B"]'::jsonb,
  success_criteria = jsonb_build_object(
    'ui_functional', 'Feedback UI operational',
    'workflow', 'Submission to storage workflow complete',
    'validation', 'Input validation working',
    'testing', 'Manual testing passed'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001D';

-- Phase 2a: Feedback Vetting Automation (001E)
-- Depends on: 001C
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001C"]'::jsonb,
  success_criteria = jsonb_build_object(
    'automation', 'Vetting automation implemented',
    'accuracy', 'Vetting accuracy meets threshold',
    'throughput', 'Can process feedback queue efficiently',
    'audit_trail', 'Vetting decisions logged'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001E';

-- Phase 2b: Proposal Generation with Rubric (001F)
-- Depends on: 001E
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001E"]'::jsonb,
  success_criteria = jsonb_build_object(
    'vetting_coverage', '≥80% feedback receives vetting outcome',
    'rubric_consistency', 'Proposals have consistent rubric fields',
    'rubric_enforcement', '100% proposals created via rubric',
    'quality', 'Proposals meet quality standards',
    'traceability', 'Proposals traceable to source feedback'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001F';

-- Phase 3a: Ranking System Implementation (001G)
-- Depends on: 001F
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001F"]'::jsonb,
  success_criteria = jsonb_build_object(
    'ranking_algorithm', 'Ranking system operational',
    'criteria', 'Multi-factor ranking criteria applied',
    'performance', 'Ranking completes in acceptable time',
    'testing', 'Ranking tested with sample proposals'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001G';

-- Phase 3b: Planner Integration (001H)
-- Depends on: 001G
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001G"]'::jsonb,
  success_criteria = jsonb_build_object(
    'ranking_stability', 'Ranking stable across reruns (top-N consistency ≥85%)',
    'planner_alignment', 'Planner decisions align with human review ≥70%',
    'integration', 'Planner successfully consumes ranked proposals',
    'automation', 'Planner can auto-approve qualifying proposals',
    'documentation', 'Decision rationale captured'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001H';

-- Phase 4: Audit Trails (001I) - Parallel, read-only
-- Depends on: 001C (runs parallel to phases 2-3)
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001C"]'::jsonb,
  success_criteria = jsonb_build_object(
    'audit_runs', 'Audit runs generate structured findings',
    'false_positives', '<10% false positives',
    'logging', 'All findings logged and traceable',
    'reporting', 'Audit reports generated automatically',
    'coverage', 'All critical operations audited'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001I';

-- Phase 5: Conflict Resolution (001J)
-- Depends on: 001H (after planner integration)
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001H"]'::jsonb,
  success_criteria = jsonb_build_object(
    'conflict_detection', 'Conflicts detected automatically',
    'resolution_documentation', 'Conflicts resolved with documented rationale',
    'escalation_rate', 'Escalation rate within expected thresholds',
    'resolution_time', 'Average resolution time tracked',
    'patterns', 'Common conflict patterns identified'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001J';

-- Phase 6: Documentation Automation (001K)
-- Depends on: 001D (human feedback interface)
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001D"]'::jsonb,
  success_criteria = jsonb_build_object(
    'automation', 'Documentation auto-generated from changes',
    'accuracy', 'Generated docs match implemented changes',
    'coverage', 'All major changes documented',
    'format', 'Documentation follows standards'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001K';

-- Phase 7a: End-to-End Integration (001L)
-- Depends on: 001J, 001K, 001I (convergence point)
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001J", "SD-LEO-SELF-IMPROVE-001K", "SD-LEO-SELF-IMPROVE-001I"]'::jsonb,
  success_criteria = jsonb_build_object(
    'integration', 'All components integrated successfully',
    'data_flow', 'Data flows correctly through pipeline',
    'error_handling', 'Error handling works end-to-end',
    'testing', 'Integration tests pass'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001L';

-- Phase 7b: Monitoring & Alerting (001M)
-- Depends on: 001L
UPDATE strategic_directives
SET
  dependency_chain = '["SD-LEO-SELF-IMPROVE-001L"]'::jsonb,
  success_criteria = jsonb_build_object(
    'pipeline_operational', 'End-to-end pipeline runs successfully',
    'metrics_collection', 'Metrics collected and stored',
    'mtti_tracking', 'MTTI tracked (target: <24 hours)',
    'intervention_tracking', 'Human intervention % tracked',
    'alerting', 'Alerts configured for critical failures',
    'dashboards', 'Monitoring dashboards operational'
  )
WHERE sd_key = 'SD-LEO-SELF-IMPROVE-001M';

-- Verification query
SELECT
  sd_key,
  title,
  dependency_chain,
  success_criteria,
  phase_status
FROM strategic_directives
WHERE sd_key LIKE 'SD-LEO-SELF-IMPROVE-001%'
  AND sd_key != 'SD-LEO-SELF-IMPROVE-001'
ORDER BY sd_key;
