-- Migration: Add JSONB Array Size Constraints
-- Purpose: Prevent unbounded array growth in JSONB columns
-- Created: 2025-12-23
-- Issue: Arrays in JSONB columns can grow unbounded, causing storage bloat
--
-- This migration adds CHECK constraints to limit array sizes at the database level,
-- providing a safety net even if application-level limits are bypassed.

-- =============================================================================
-- SUB_AGENT_EXECUTION_RESULTS TABLE
-- =============================================================================

-- Limit critical_issues array to 100 items
ALTER TABLE public.sub_agent_execution_results
DROP CONSTRAINT IF EXISTS critical_issues_max_100;

ALTER TABLE public.sub_agent_execution_results
ADD CONSTRAINT critical_issues_max_100
CHECK (
  critical_issues IS NULL OR
  jsonb_typeof(critical_issues) != 'array' OR
  jsonb_array_length(critical_issues) <= 100
);

-- Limit warnings array to 100 items
ALTER TABLE public.sub_agent_execution_results
DROP CONSTRAINT IF EXISTS warnings_max_100;

ALTER TABLE public.sub_agent_execution_results
ADD CONSTRAINT warnings_max_100
CHECK (
  warnings IS NULL OR
  jsonb_typeof(warnings) != 'array' OR
  jsonb_array_length(warnings) <= 100
);

-- Limit recommendations array to 50 items
ALTER TABLE public.sub_agent_execution_results
DROP CONSTRAINT IF EXISTS recommendations_max_50;

ALTER TABLE public.sub_agent_execution_results
ADD CONSTRAINT recommendations_max_50
CHECK (
  recommendations IS NULL OR
  jsonb_typeof(recommendations) != 'array' OR
  jsonb_array_length(recommendations) <= 50
);

-- Limit metadata size to 1 MB (prevents bloated nested objects)
ALTER TABLE public.sub_agent_execution_results
DROP CONSTRAINT IF EXISTS metadata_max_size;

ALTER TABLE public.sub_agent_execution_results
ADD CONSTRAINT metadata_max_size
CHECK (
  metadata IS NULL OR
  length(metadata::text) <= 1048576  -- 1 MB
);

-- =============================================================================
-- RETROSPECTIVES TABLE
-- =============================================================================

-- Limit key_learnings array to 30 items
ALTER TABLE public.retrospectives
DROP CONSTRAINT IF EXISTS key_learnings_max_30;

ALTER TABLE public.retrospectives
ADD CONSTRAINT key_learnings_max_30
CHECK (
  key_learnings IS NULL OR
  jsonb_typeof(key_learnings) != 'array' OR
  jsonb_array_length(key_learnings) <= 30
);

-- Limit what_went_well array to 25 items
ALTER TABLE public.retrospectives
DROP CONSTRAINT IF EXISTS what_went_well_max_25;

ALTER TABLE public.retrospectives
ADD CONSTRAINT what_went_well_max_25
CHECK (
  what_went_well IS NULL OR
  jsonb_typeof(what_went_well) != 'array' OR
  jsonb_array_length(what_went_well) <= 25
);

-- Limit what_needs_improvement array to 20 items
ALTER TABLE public.retrospectives
DROP CONSTRAINT IF EXISTS what_needs_improvement_max_20;

ALTER TABLE public.retrospectives
ADD CONSTRAINT what_needs_improvement_max_20
CHECK (
  what_needs_improvement IS NULL OR
  jsonb_typeof(what_needs_improvement) != 'array' OR
  jsonb_array_length(what_needs_improvement) <= 20
);

-- Limit action_items array to 25 items
ALTER TABLE public.retrospectives
DROP CONSTRAINT IF EXISTS action_items_max_25;

ALTER TABLE public.retrospectives
ADD CONSTRAINT action_items_max_25
CHECK (
  action_items IS NULL OR
  jsonb_typeof(action_items) != 'array' OR
  jsonb_array_length(action_items) <= 25
);

-- Limit protocol_improvements array to 25 items
ALTER TABLE public.retrospectives
DROP CONSTRAINT IF EXISTS protocol_improvements_max_25;

ALTER TABLE public.retrospectives
ADD CONSTRAINT protocol_improvements_max_25
CHECK (
  protocol_improvements IS NULL OR
  jsonb_typeof(protocol_improvements) != 'array' OR
  jsonb_array_length(protocol_improvements) <= 25
);

-- =============================================================================
-- RISK_ASSESSMENTS TABLE
-- =============================================================================

-- Limit critical_issues array to 50 items
ALTER TABLE public.risk_assessments
DROP CONSTRAINT IF EXISTS risk_critical_issues_max_50;

ALTER TABLE public.risk_assessments
ADD CONSTRAINT risk_critical_issues_max_50
CHECK (
  critical_issues IS NULL OR
  jsonb_typeof(critical_issues) != 'array' OR
  jsonb_array_length(critical_issues) <= 50
);

-- Limit warnings array to 50 items
ALTER TABLE public.risk_assessments
DROP CONSTRAINT IF EXISTS risk_warnings_max_50;

ALTER TABLE public.risk_assessments
ADD CONSTRAINT risk_warnings_max_50
CHECK (
  warnings IS NULL OR
  jsonb_typeof(warnings) != 'array' OR
  jsonb_array_length(warnings) <= 50
);

-- Limit recommendations array to 30 items
ALTER TABLE public.risk_assessments
DROP CONSTRAINT IF EXISTS risk_recommendations_max_30;

ALTER TABLE public.risk_assessments
ADD CONSTRAINT risk_recommendations_max_30
CHECK (
  recommendations IS NULL OR
  jsonb_typeof(recommendations) != 'array' OR
  jsonb_array_length(recommendations) <= 30
);

-- =============================================================================
-- SD_PHASE_HANDOFFS TABLE
-- =============================================================================

-- Limit validation_details size to 100 KB
ALTER TABLE public.sd_phase_handoffs
DROP CONSTRAINT IF EXISTS validation_details_max_size;

ALTER TABLE public.sd_phase_handoffs
ADD CONSTRAINT validation_details_max_size
CHECK (
  validation_details IS NULL OR
  length(validation_details::text) <= 102400  -- 100 KB
);

-- =============================================================================
-- LEO_HANDOFF_EXECUTIONS TABLE
-- =============================================================================

-- Limit validation_details size to 100 KB
ALTER TABLE public.leo_handoff_executions
DROP CONSTRAINT IF EXISTS leo_validation_details_max_size;

ALTER TABLE public.leo_handoff_executions
ADD CONSTRAINT leo_validation_details_max_size
CHECK (
  validation_details IS NULL OR
  length(validation_details::text) <= 102400  -- 100 KB
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Query to verify all constraints are in place
-- SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname LIKE '%max%' AND conrelid::regclass::text IN (
--   'sub_agent_execution_results', 'retrospectives', 'risk_assessments',
--   'sd_phase_handoffs', 'leo_handoff_executions'
-- );

COMMENT ON CONSTRAINT critical_issues_max_100 ON public.sub_agent_execution_results IS
  'Prevents critical_issues array from exceeding 100 items to avoid storage bloat';

COMMENT ON CONSTRAINT metadata_max_size ON public.sub_agent_execution_results IS
  'Prevents metadata JSONB from exceeding 1 MB to avoid storage bloat from nested findings';
