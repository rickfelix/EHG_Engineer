-- Setup dependency chains for SD-LEO-ORCH-SELF-IMPROVING-LEO-001 orchestrator children
-- Phase A: No dependencies (can start immediately)
-- Phase B: Depends on A
-- Phase C: No dependencies (parallel to A)
-- Phase D: No dependencies (parallel to A)
-- Phase E: Depends on C and D
-- Phase F: Depends on all (A, B, C, D, E)

-- Set dependencies for Child B (depends on A)
UPDATE strategic_directives_v2 SET
  dependency_chain = '{"depends_on": ["SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A"]}'::jsonb
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B';

-- Set dependencies for Child E (depends on C and D)
UPDATE strategic_directives_v2 SET
  dependency_chain = '{"depends_on": ["SD-LEO-ORCH-SELF-IMPROVING-LEO-001-C", "SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D"]}'::jsonb
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E';

-- Set dependencies for Child F (depends on all A through E)
UPDATE strategic_directives_v2 SET
  dependency_chain = '{"depends_on": ["SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A", "SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B", "SD-LEO-ORCH-SELF-IMPROVING-LEO-001-C", "SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D", "SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E"]}'::jsonb
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-F';

-- Verify the complete setup
SELECT sd_key, title, sd_type, priority, dependency_chain
FROM strategic_directives_v2
WHERE sd_key LIKE 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001%'
ORDER BY sd_key;
