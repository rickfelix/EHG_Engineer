-- Update SD-VISION-TRANSITION-001D to document Stage 1 UI preservation requirement
-- Ensures future implementation knows to preserve existing 3-path venture creation experience

UPDATE strategic_directives_v2
SET
  description = 'Sub-parent orchestrator for defining all 25 venture lifecycle stages. Coordinates 6 grandchildren (D1-D6), one per phase. Creates lifecycle_stage_config table and stages_v2.yaml.

CRITICAL PRESERVATION REQUIREMENT: The existing Stage 1 venture creation UI MUST remain intact and functional. This includes:
- PathSelectorScreen.tsx with 3 creation paths
- Manual Idea Entry form
- Competitor Clone form
- Blueprint Browse (AI-generated ideas)

The lifecycle_stage_config table defines WHAT stages are (metadata, requirements). It does NOT replace the existing venture creation UI. When ventures are created via any path, they start at current_lifecycle_stage=1 and the system looks up stage metadata from lifecycle_stage_config.',

  metadata = jsonb_set(
    COALESCE(metadata, '{}'),
    '{ui_preservation}',
    '{
      "existing_stage1_ui": {
        "location": "src/client/src/components/ventures/",
        "components": [
          "PathSelectorScreen.tsx",
          "ManualEntryForm.tsx",
          "CompetitorCloneForm.tsx",
          "BlueprintBrowser.tsx",
          "BlueprintDetailPanel.tsx"
        ],
        "creation_paths": [
          "manual-entry",
          "competitor-clone",
          "blueprint-browse"
        ],
        "preservation_note": "These UI components are independent of lifecycle_stage_config and must remain functional",
        "verified_date": "2025-12-07",
        "verified_by": "Chairman via Claude Sonnet 4.5"
      }
    }'::jsonb
  )
WHERE id = 'SD-VISION-TRANSITION-001D';
