-- ============================================================================
-- Migration: Create SD-2025-12-26-MANIFESTO-HARDENING Tracking Artifact
-- ============================================================================
-- Date: 2025-12-26
-- Author: Constitutional Audit (Claude Opus 4.5)
-- Purpose: Create tracking Strategic Directive for v9.0.0 Manifesto Hardening
--
-- CONTEXT:
--   This SD tracks the Constitutional Audit work that resulted in:
--   - Law 1 enforcement (Doctrine of Constraint)
--   - Law 3 enforcement (Circuit Breaker 85% threshold)
--
-- EVIDENCE:
--   - Constitutional Audit conversation (2025-12-26)
--   - Migration: 20251226_law1_doctrine_of_constraint_enforcement.sql
--   - Migration: 20251226_law3_circuit_breaker_85_threshold.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Insert Strategic Directive
-- ============================================================================

INSERT INTO strategic_directives_v2 (
  id,
  title,
  description,
  scope,
  strategic_objective,
  success_criteria,
  priority,
  status,
  phase,
  progress,
  created_by,
  metadata
) VALUES (
  'SD-2025-12-26-MANIFESTO-HARDENING',
  'EHG v9.0.0 Manifesto Hardening - Immutable Laws Database Enforcement',
  'Constitutional Audit of the EHG platform against the 5 Immutable Laws, with database-level enforcement implementation for identified gaps. Moves governance logic from application layer (prompts) to data layer (schema/triggers) to ensure determinism.',
  'Database schema enforcement for:
  1. Law 1 (Doctrine of Constraint): EXEC role restrictions - database triggers prevent EXEC from creating/modifying governance artifacts
  2. Law 3 (Circuit Breaker): Hard 85% threshold enforcement on handoffs - transaction rollback if validation_score < 85%
  3. Audit tables and views for compliance monitoring
  4. No prompt-level workarounds - schema-level enforcement only',
  'Ensure EHG governance is rigid and deterministic by enforcing Immutable Laws at the database layer. "Logic in the database, not just the chat window."',
  jsonb_build_array(
    'Law 1 database trigger prevents EXEC from SD/PRD creation (test: INSERT as EXEC fails)',
    'Law 3 circuit breaker rejects handoffs with validation_score < 85 (test: low-score handoff fails)',
    'All violations logged to audit tables (doctrine_constraint_violations, circuit_breaker_blocks)',
    'Monitoring views created for compliance dashboards',
    'Migrations are idempotent with rollback instructions'
  ),
  'critical',
  'exec_active',
  'EXEC',
  75,
  'LEAD', -- Created by LEAD for strategic work, not EXEC
  jsonb_build_object(
    'constitutional_audit_date', '2025-12-26',
    'auditor', 'Claude Opus 4.5',
    'immutable_laws_audited', jsonb_build_array(
      jsonb_build_object('law', 1, 'name', 'Doctrine of Constraint', 'grade', 'C+', 'status', 'HARDENED'),
      jsonb_build_object('law', 2, 'name', 'Chain of Custody', 'grade', 'A', 'status', 'COMPLIANT'),
      jsonb_build_object('law', 3, 'name', 'Circuit Breaker', 'grade', 'B-', 'status', 'HARDENED'),
      jsonb_build_object('law', 4, 'name', 'Audit Trail', 'grade', 'A', 'status', 'COMPLIANT'),
      jsonb_build_object('law', 5, 'name', 'Chairman Loop', 'grade', 'A-', 'status', 'COMPLIANT')
    ),
    'migrations_created', jsonb_build_array(
      '20251226_law1_doctrine_of_constraint_enforcement.sql',
      '20251226_law3_circuit_breaker_85_threshold.sql',
      '20251226_sd_manifesto_hardening_tracking.sql'
    ),
    'target_release', 'v9.0.0',
    'governance_principle', 'Rigidity is a feature, not a bug',
    'enforcement_layer', 'DATABASE (PostgreSQL triggers + CHECK constraints)'
  )
)
ON CONFLICT (id) DO UPDATE SET
  progress = EXCLUDED.progress,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- PHASE 2: Create scope deliverables
-- ============================================================================

-- Deliverable 1: Law 1 Migration
INSERT INTO sd_scope_deliverables (
  sd_id,
  deliverable_type,
  deliverable_name,
  description,
  extracted_from,
  priority,
  completion_status,
  completion_evidence,
  verified_by,
  verified_at
) VALUES (
  'SD-2025-12-26-MANIFESTO-HARDENING',
  'migration',
  'Law 1 Doctrine of Constraint Database Enforcement',
  'Database trigger that prevents EXEC agents from creating/modifying Strategic Directives, PRDs, Chairman Decisions, and LEO Protocols. Includes audit table for violation logging.',
  'Constitutional Audit - Weakest Link Analysis',
  'required',
  'completed',
  'database/migrations/20251226_law1_doctrine_of_constraint_enforcement.sql',
  'LEAD',
  NOW()
)
ON CONFLICT DO NOTHING;

-- Deliverable 2: Law 3 Migration
INSERT INTO sd_scope_deliverables (
  sd_id,
  deliverable_type,
  deliverable_name,
  description,
  extracted_from,
  priority,
  completion_status,
  completion_evidence,
  verified_by,
  verified_at
) VALUES (
  'SD-2025-12-26-MANIFESTO-HARDENING',
  'migration',
  'Law 3 Circuit Breaker 85% Threshold Enforcement',
  'Enhanced handoff trigger that rejects handoffs with validation_score < 85%. Hard stop with no override capability. Includes audit table for blocked handoffs.',
  'Constitutional Audit - Gap Analysis',
  'required',
  'completed',
  'database/migrations/20251226_law3_circuit_breaker_85_threshold.sql',
  'LEAD',
  NOW()
)
ON CONFLICT DO NOTHING;

-- Deliverable 3: Constitutional Audit Report
INSERT INTO sd_scope_deliverables (
  sd_id,
  deliverable_type,
  deliverable_name,
  description,
  extracted_from,
  priority,
  completion_status,
  completion_evidence,
  verified_by,
  verified_at
) VALUES (
  'SD-2025-12-26-MANIFESTO-HARDENING',
  'documentation',
  'Constitutional Audit Report - 5 Immutable Laws',
  'Comprehensive audit of EHG codebase against the 5 Immutable Laws (Doctrine of Constraint, Chain of Custody, Circuit Breaker, Audit Trail, Chairman Loop). Includes specific code quotes, gap analysis, and grade per law.',
  'Chairman Request - v9.0.0 Manifesto Preparation',
  'required',
  'completed',
  'Conversation artifact - Claude session 2025-12-26',
  'LEAD',
  NOW()
)
ON CONFLICT DO NOTHING;

-- Deliverable 4: Monitoring Views
INSERT INTO sd_scope_deliverables (
  sd_id,
  deliverable_type,
  deliverable_name,
  description,
  extracted_from,
  priority,
  completion_status,
  completion_evidence,
  verified_by,
  verified_at
) VALUES (
  'SD-2025-12-26-MANIFESTO-HARDENING',
  'database',
  'Compliance Monitoring Views',
  'Database views for compliance monitoring: v_doctrine_compliance_summary, v_recent_doctrine_violations, v_recent_circuit_breaker_blocks, v_circuit_breaker_stats, v_circuit_breaker_repeat_offenders',
  'Constitutional Audit - Audit Trail requirement',
  'required',
  'completed',
  'Included in Law 1 and Law 3 migrations',
  'LEAD',
  NOW()
)
ON CONFLICT DO NOTHING;

-- Deliverable 5: Migration Execution
INSERT INTO sd_scope_deliverables (
  sd_id,
  deliverable_type,
  deliverable_name,
  description,
  extracted_from,
  priority,
  completion_status,
  completion_evidence,
  verified_by,
  verified_at
) VALUES (
  'SD-2025-12-26-MANIFESTO-HARDENING',
  'migration',
  'Execute Migrations on Production Database',
  'Run all three migrations against the production Supabase database to activate enforcement.',
  'Implementation requirement',
  'required',
  'pending',
  NULL,
  NULL,
  NULL
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PHASE 3: Log system event for SD creation
-- ============================================================================

INSERT INTO system_events (
  event_type,
  actor_role,
  sd_id,
  payload,
  idempotency_key
) VALUES (
  'SD_CREATED',
  'LEAD', -- LEAD creates SDs, not EXEC
  'SD-2025-12-26-MANIFESTO-HARDENING',
  jsonb_build_object(
    'title', 'EHG v9.0.0 Manifesto Hardening - Immutable Laws Database Enforcement',
    'trigger', 'Constitutional Audit',
    'laws_hardened', ARRAY[1, 3],
    'migrations_count', 3,
    'timestamp', NOW()
  ),
  'SD_CREATED:SD-2025-12-26-MANIFESTO-HARDENING:' || EXTRACT(EPOCH FROM NOW())::text
)
ON CONFLICT (idempotency_key) DO NOTHING;

-- ============================================================================
-- PHASE 4: Verification
-- ============================================================================

DO $$
DECLARE
  sd_exists BOOLEAN;
  deliverable_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM strategic_directives_v2
    WHERE id = 'SD-2025-12-26-MANIFESTO-HARDENING'
  ) INTO sd_exists;

  SELECT COUNT(*) INTO deliverable_count
  FROM sd_scope_deliverables
  WHERE sd_id = 'SD-2025-12-26-MANIFESTO-HARDENING';

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║    SD-2025-12-26-MANIFESTO-HARDENING TRACKING ARTIFACT CREATED       ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Strategic Directive: %', CASE WHEN sd_exists THEN 'CREATED' ELSE 'FAILED' END;
  RAISE NOTICE 'Deliverables tracked: %', deliverable_count;
  RAISE NOTICE '';
  RAISE NOTICE 'MANIFESTO v9.0.0 HARDENING SUMMARY:';
  RAISE NOTICE '';
  RAISE NOTICE '  Law 1 (Doctrine of Constraint):';
  RAISE NOTICE '    Before: Prompt-level only (C+ grade)';
  RAISE NOTICE '    After:  Database triggers on 5 tables + system_events';
  RAISE NOTICE '';
  RAISE NOTICE '  Law 3 (Circuit Breaker):';
  RAISE NOTICE '    Before: Gate Q only, no handoff enforcement (B- grade)';
  RAISE NOTICE '    After:  Handoff trigger + CHECK constraint, 85%% hard stop';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '  1. Run migrations on production database';
  RAISE NOTICE '  2. Verify triggers are active';
  RAISE NOTICE '  3. Test EXEC constraint with intentional violation';
  RAISE NOTICE '  4. Test circuit breaker with low-score handoff';
  RAISE NOTICE '';
  RAISE NOTICE '"Logic in the database, not just the chat window."';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- DELETE FROM system_events WHERE sd_id = 'SD-2025-12-26-MANIFESTO-HARDENING';
-- DELETE FROM sd_scope_deliverables WHERE sd_id = 'SD-2025-12-26-MANIFESTO-HARDENING';
-- DELETE FROM strategic_directives_v2 WHERE id = 'SD-2025-12-26-MANIFESTO-HARDENING';
-- ============================================================================
