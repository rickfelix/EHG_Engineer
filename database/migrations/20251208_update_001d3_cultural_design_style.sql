-- ============================================================================
-- MIGRATION: Update SD-VISION-TRANSITION-001D3 for Cultural Design Style
-- Created: 2025-12-08
-- Author: Claude Code (Design Sub-Agent Enhancement)
--
-- Purpose: Extends 001D3 (THE IDENTITY phase) scope to include cultural
--          design style selection as part of Stage 10 brand identity work.
-- Reference:
--   - docs/workflow/stages_v2.yaml (Stage 10 enhancement)
--   - docs/02_api/design_system_handcrafted.md (Stage 55 PRD)
--   - database/migrations/20251208_add_cultural_design_style.sql
-- ============================================================================

-- Update SD-VISION-TRANSITION-001D3 with expanded scope
UPDATE strategic_directives_v2
SET
  -- Expand description to include cultural design style
  description = 'Define stages 10-12: Strategic Narrative & Positioning, Strategic Naming with Cultural Design Style Selection, Go-to-Market Strategy. Stage 10 now includes venture-based cultural design style (wabi_sabi, swiss_minimal, bauhaus, california_modern) that persists to all UI components.',

  -- Expand scope to include cultural design deliverables
  scope = 'Stages 10-12 with strategic_narrative and cultural_design_config artifacts. Stage 10 must produce narrative AND cultural design style selection BEFORE Stage 11 naming. Cultural style stored in ventures.cultural_design_style column.',

  -- Add cultural design objectives
  strategic_objectives = '[
    "Define Stage 10: Strategic Narrative & Positioning with Cultural Design Style",
    "Define Stage 11: Strategic Naming (brand name, guidelines)",
    "Define Stage 12: Go-to-Market Strategy",
    "Implement cultural_design_style selection in Stage 10 UI",
    "Create cultural_design_config artifact output"
  ]'::jsonb,

  -- Expand success criteria
  success_criteria = '[
    "3 stages in lifecycle_stage_config with correct artifacts",
    "Stage 10 requires strategic_narrative artifact",
    "Stage 10 requires cultural_design_config artifact",
    "Stage 11 depends on Stage 10 completion",
    "ventures.cultural_design_style column populated during Stage 10",
    "cultural_design_styles reference table accessible",
    "get_recommended_cultural_style() function working"
  ]'::jsonb,

  -- Update metadata with cultural design references
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{cultural_design_system}',
      '{
        "enabled": true,
        "styles": ["wabi_sabi", "swiss_minimal", "bauhaus", "california_modern"],
        "selection_stage": 10,
        "reference_prd": "docs/02_api/design_system_handcrafted.md",
        "reference_config": "docs/workflow/stages_v2.yaml",
        "database_migration": "20251208_add_cultural_design_style.sql"
      }'::jsonb
    ),
    '{chairman_override}',
    '"Story before name - ADR-002-012. Cultural design style selected at Stage 10 based on industry vertical."'::jsonb
  ),

  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D3';

-- Also update the lifecycle_stage_config for Stage 10 to include cultural design artifact
UPDATE lifecycle_stage_config
SET
  required_artifacts = ARRAY['strategic_narrative', 'marketing_manifest', 'cultural_design_config'],
  updated_at = NOW()
WHERE stage_number = 10;

-- Add Stage 10 specific notes about cultural design
COMMENT ON TABLE lifecycle_stage_config IS
'25-stage venture lifecycle configuration. Stage 10 (Strategic Narrative & Positioning)
includes cultural_design_config artifact for venture-based design style selection.
Reference: docs/workflow/stages_v2.yaml';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'SD-VISION-TRANSITION-001D3 updated with cultural design style scope';
  RAISE NOTICE 'Stage 10 now produces cultural_design_config artifact';
  RAISE NOTICE 'ventures.cultural_design_style populated during Stage 10 completion';
END $$;
