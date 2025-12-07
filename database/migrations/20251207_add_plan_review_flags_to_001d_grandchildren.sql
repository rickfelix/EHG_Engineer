-- Add PLAN phase review flags to all 6 grandchildren of 001D
-- These are light-touch awareness items for PRD creation, not implementation specs

-- Common review flags for ALL grandchildren
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'),
  '{plan_phase_review_flags}',
  '{
    "common": [
      "Verify lifecycle_stage_config data matches ADR-002 for assigned stages",
      "Assess API needs for stage progression (if any)",
      "Assess UX for stage advancement controls",
      "Note test coverage requirements",
      "Document integration touchpoints (venture_stage_work, UI components)"
    ],
    "note": "These flags guide PRD creation - detailed specs defined during PLAN phase"
  }'::jsonb
)
WHERE id IN (
  'SD-VISION-TRANSITION-001D1',
  'SD-VISION-TRANSITION-001D2',
  'SD-VISION-TRANSITION-001D3',
  'SD-VISION-TRANSITION-001D4',
  'SD-VISION-TRANSITION-001D5',
  'SD-VISION-TRANSITION-001D6'
);

-- Phase-specific review flags for 001D1 (Stages 1-5: THE TRUTH)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{plan_phase_review_flags,phase_specific}',
  '[
    "Decision gate UX at stages 3 and 5 (ADVANCE/REVISE/KILL choices)",
    "Advisory system integration (stages 3 and 5 have advisory_enabled=true)",
    "Stage 3: Reality Check advisory presentation",
    "Stage 5: Unit Economics advisory presentation"
  ]'::jsonb
)
WHERE id = 'SD-VISION-TRANSITION-001D1';

-- Phase-specific review flags for 001D2 (Stages 6-9: THE ENGINE)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{plan_phase_review_flags,phase_specific}',
  '[
    "No decision gates in this phase - artifact-only flow",
    "Verify required_artifacts arrays are complete for each stage",
    "Assess artifact upload/view UX needs"
  ]'::jsonb
)
WHERE id = 'SD-VISION-TRANSITION-001D2';

-- Phase-specific review flags for 001D3 (Stages 10-12: THE IDENTITY)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{plan_phase_review_flags,phase_specific}',
  '[
    "CRITICAL: Verify ADR-002 story-before-name ordering (Stage 10 narrative → Stage 11 naming)",
    "Current DB may have Stage 10 as Strategic Naming - verify against Chairman Override",
    "Stage 10 is FIRST sd_required stage - assess SD auto-generation flow",
    "strategic_narrative and marketing_manifest artifact dependencies"
  ]'::jsonb
)
WHERE id = 'SD-VISION-TRANSITION-001D3';

-- Phase-specific review flags for 001D4 (Stages 13-16: THE BLUEPRINT - Kochel Firewall)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{plan_phase_review_flags,phase_specific}',
  '[
    "Kochel Firewall validation at Stage 16 (schema completeness checklist)",
    "Stage 16 advisory_enabled=true - assess Firewall advisory UX",
    "Stage 13 decision_gate - Tech Stack Interrogation UX",
    "Schema Completeness Checklist presentation (Can Claude build without clarifying questions?)"
  ]'::jsonb
)
WHERE id = 'SD-VISION-TRANSITION-001D4';

-- Phase-specific review flags for 001D5 (Stages 17-20: THE BUILD LOOP)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{plan_phase_review_flags,phase_specific}',
  '[
    "All 4 stages are sd_required - assess SD auto-generation integration",
    "SD template usage (sd_suffix: ENVCONFIG, MVP, INTEGRATION, SECURITY)",
    "Leo Protocol integration for each stage SD",
    "Stage 17 determines venture deployment target - assess configuration UX"
  ]'::jsonb
)
WHERE id = 'SD-VISION-TRANSITION-001D5';

-- Phase-specific review flags for 001D6 (Stages 21-25: LAUNCH & LEARN)
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{plan_phase_review_flags,phase_specific}',
  '[
    "Stage 23 decision_gate - Production Launch go/no-go UX",
    "Kill Protocol integration at Stage 23 (last decision gate before launch)",
    "Stages 21-22 are sd_required - assess SD templates",
    "Stage 24 artifact_only - Analytics Dashboard integration",
    "Stage 25 is final sd_required stage - Optimization roadmap"
  ]'::jsonb
)
WHERE id = 'SD-VISION-TRANSITION-001D6';

-- Verification query
SELECT
  id,
  title,
  metadata->'plan_phase_review_flags'->'common' as common_flags,
  metadata->'plan_phase_review_flags'->'phase_specific' as phase_specific_flags
FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001D_'
ORDER BY id;
