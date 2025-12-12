-- Add explicit UI update responsibility to all 6 grandchildren of 001D
-- Clarifies that assessment must include UI and updates are their responsibility

-- Update all 6 grandchildren at once
UPDATE strategic_directives_v2
SET
  scope = REPLACE(
    scope,
    'IMPLEMENTATION PHASE:',
    'IMPLEMENTATION PHASE (includes UI updates if needed):'
  ),

  success_criteria = jsonb_set(
    COALESCE(success_criteria, '[]'::jsonb),
    '{999}',
    '"UI verified: No broken stage references, navigation works with new stage count"'::jsonb,
    true
  )
WHERE id IN (
  'SD-VISION-TRANSITION-001D1',
  'SD-VISION-TRANSITION-001D2',
  'SD-VISION-TRANSITION-001D3',
  'SD-VISION-TRANSITION-001D4',
  'SD-VISION-TRANSITION-001D5',
  'SD-VISION-TRANSITION-001D6'
);

-- Add UI update notes to metadata for each grandchild
UPDATE strategic_directives_v2
SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'),
    '{ui_responsibility}',
    '{
      "ui_updates_required": "Assessment phase will determine",
      "potential_ui_changes": [
        "Stage navigation/selection components",
        "Progress bars or stage trackers",
        "Stage-specific forms or workflows",
        "Dashboards displaying stage metrics",
        "Any hardcoded stage number references"
      ],
      "ui_verification": "After implementation, verify no broken stage references exist",
      "note": "If assessment reveals UI changes needed, grandchild is responsible for implementing them"
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

-- Verification query
SELECT
  id,
  title,
  (metadata->'ui_responsibility'->>'ui_updates_required') as ui_updates
FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001D_'
ORDER BY id;
