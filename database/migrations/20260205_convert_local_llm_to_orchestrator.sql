-- Migration: Convert SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001 to orchestrator type
-- Date: 2026-02-05
-- Purpose: Fix sd_type governance trigger validation by setting type_change_reason before type change

-- Step 1: Set governance_metadata with type_change_reason
UPDATE strategic_directives_v2
SET governance_metadata = jsonb_build_object(
  'type_change_reason', 'Converting to orchestrator to coordinate three phased implementation children plus documentation child - multi-phase architecture requires parent coordination'
)
WHERE sd_key = 'SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001';

-- Step 2: Update sd_type to orchestrator with full metadata
UPDATE strategic_directives_v2
SET sd_type = 'orchestrator',
    relationship_type = 'parent',
    title = 'Intelligent Local LLM Routing Architecture',
    description = 'Implement phased local LLM integration in EHG_Engineer. Coordinates Phase I (OpenAI wrapper), Phase II (model registry), Phase III (intelligent routing), and documentation.',
    rationale = 'Reduce cloud API costs by ~159K tokens/week, improve response times for haiku-tier tasks.',
    scope = 'EHG_Engineer only. Haiku-tier operations: classification, fast, screening, triage.',
    target_application = 'EHG_Engineer'
WHERE sd_key = 'SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001';

-- Verify the update
SELECT
  sd_key,
  sd_type,
  relationship_type,
  title,
  governance_metadata->>'type_change_reason' as type_change_reason
FROM strategic_directives_v2
WHERE sd_key = 'SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001';
