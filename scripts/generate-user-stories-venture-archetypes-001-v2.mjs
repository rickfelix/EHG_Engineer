#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function generateUserStories() {
  console.log('📋 Generating User Stories for SD-VENTURE-ARCHETYPES-001');
  console.log('='.repeat(60));

  const stories = [
    // Archetype CRUD Tests (US-001 to US-006)
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-001',
      title: 'Admin can navigate to Settings → Archetypes tab',
      user_role: 'company admin',
      user_want: 'to navigate to the Archetypes tab in Settings',
      user_benefit: 'I can manage venture archetypes',
      story_points: 2,
      acceptance_criteria: [
        'Settings page displays "Archetypes" as 7th tab',
        'Clicking "Archetypes" tab loads ArchetypesSettingsTab component',
        'Tab is only visible to admin users',
        'Navigation is responsive on mobile and desktop'
      ],
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-002',
      title: 'Admin can view list of existing archetypes',
      user_role: 'company admin',
      user_want: 'to see all existing archetypes in a grid layout',
      user_benefit: 'I can review available archetype options',
      story_points: 3,
      acceptance_criteria: [
        'Archetypes displayed in Card grid layout',
        'Each card shows: name, description, visual theme preview',
        'Default archetypes have "Default" badge',
        'Empty state message if no archetypes exist'
      ],
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-003',
      title: 'Admin can create new archetype with valid data',
      user_role: 'company admin',
      user_want: 'to create a new custom archetype',
      user_benefit: 'I can add company-specific themes',
      story_points: 5,
      acceptance_criteria: [
        'Create button opens dialog with form fields',
        'Form includes: name (max 100), description (max 2000), visual_theme (color picker)',
        'Submit button creates new archetype in database',
        'Success toast displayed after creation',
        'New archetype appears in grid'
      ],
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-004',
      title: 'Admin can edit existing archetype',
      user_role: 'company admin',
      user_want: 'to edit archetype details',
      user_benefit: 'I can refine themes over time',
      story_points: 3,
      acceptance_criteria: [
        'Edit button (pencil icon) on archetype card',
        'Edit dialog pre-fills with existing data',
        'Changes persist to database on submit',
        'Grid updates immediately after edit'
      ],
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-005',
      title: 'Admin cannot delete default archetypes',
      user_role: 'system',
      user_want: 'to prevent deletion of default archetypes',
      user_benefit: 'users always have base archetype options',
      story_points: 2,
      acceptance_criteria: [
        'Delete button disabled on archetypes with is_default = true',
        'Tooltip explains "Default archetypes cannot be deleted"',
        'Attempting API delete returns error',
        'Error toast displayed if delete attempted'
      ],
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-006',
      title: 'Admin can delete custom archetypes',
      user_role: 'company admin',
      user_want: 'to delete custom archetypes that are no longer needed',
      user_benefit: 'I can maintain a clean archetype library',
      story_points: 3,
      acceptance_criteria: [
        'Delete button enabled on archetypes with is_default = false',
        'Confirmation dialog appears before deletion',
        'Archetype removed from database on confirm',
        'Grid updates immediately after deletion'
      ],
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts'
    },

    // Archetype Selection Tests (US-007 to US-010)
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-007',
      title: 'User can open venture creation dialog',
      user_role: 'venture creator',
      user_want: 'to open the venture creation dialog',
      user_benefit: 'I can create a new venture',
      story_points: 1,
      acceptance_criteria: [
        'Ventures page has "New Venture" button',
        'Button click opens VentureCreationDialog',
        'Dialog displays all form fields including archetype selector'
      ],
      e2e_test_path: 'tests/e2e/archetypes/selection.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-008',
      title: 'User sees archetype selector dropdown',
      user_role: 'venture creator',
      user_want: 'to see an archetype selector in the creation dialog',
      user_benefit: 'I can choose an archetype for my venture',
      story_points: 2,
      acceptance_criteria: [
        'Archetype selector appears after category field',
        'Label: "Venture Archetype (optional)"',
        'Dropdown populated with company archetypes',
        'Default option: "None (use base theme)"'
      ],
      e2e_test_path: 'tests/e2e/archetypes/selection.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-009',
      title: 'User can select archetype from dropdown',
      user_role: 'venture creator',
      user_want: 'to select an archetype',
      user_benefit: 'my venture adopts that archetype theme',
      story_points: 3,
      acceptance_criteria: [
        'Clicking dropdown shows all available archetypes',
        'Each option displays: archetype name + description',
        'Selecting option highlights choice',
        'Selection persists during form completion'
      ],
      e2e_test_path: 'tests/e2e/archetypes/selection.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-010',
      title: 'Selected archetype is stored in venture metadata',
      user_role: 'system',
      user_want: 'to snapshot archetype data',
      user_benefit: 'ventures preserve theme even if archetype is deleted',
      story_points: 5,
      acceptance_criteria: [
        'ventures.metadata.archetype contains: { id, name, visual_theme }',
        'Data is snapshot (not reference to archetype table)',
        'Archetype stored on venture creation',
        'Database query confirms metadata structure'
      ],
      e2e_test_path: 'tests/e2e/archetypes/selection.spec.ts'
    },

    // Theme Application Tests (US-011 to US-013)
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-011',
      title: 'Venture with archetype displays correct theme colors',
      user_role: 'venture viewer',
      user_want: 'ventures to display archetype colors',
      user_benefit: 'each venture has a distinct visual identity',
      story_points: 5,
      acceptance_criteria: [
        'CSS variables applied: --archetype-primary, --archetype-secondary, --archetype-accent',
        'Venture page elements use archetype colors',
        'Colors match archetype visual_theme JSONB',
        'Screenshot shows distinct visual theme'
      ],
      e2e_test_path: 'tests/e2e/archetypes/theming.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-012',
      title: 'Theme works in both dark and light modes',
      user_role: 'user',
      user_want: 'archetype themes to adapt to dark/light mode',
      user_benefit: 'readability is preserved in both modes',
      story_points: 3,
      acceptance_criteria: [
        'Toggle dark mode - archetype colors remain visible',
        'Toggle light mode - archetype colors remain visible',
        'Contrast ratios meet WCAG AA standards in both modes',
        'No color conflicts with base theme'
      ],
      e2e_test_path: 'tests/e2e/archetypes/theming.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-013',
      title: 'Venture without archetype falls back to base theme',
      user_role: 'system',
      user_want: 'ventures without archetypes to use the base theme as fallback',
      user_benefit: 'ventures display correctly regardless of archetype selection',
      story_points: 2,
      acceptance_criteria: [
        'Ventures with metadata.archetype = null use base theme',
        'No CSS variable errors in console',
        'Visual appearance matches default venture styling',
        'No broken colors or missing styles'
      ],
      e2e_test_path: 'tests/e2e/archetypes/theming.spec.ts'
    },

    // Preview Tests (US-014 to US-015)
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-014',
      title: 'Archetype preview shows visual mockup in settings',
      user_role: 'company admin',
      user_want: 'to see a visual preview of each archetype',
      user_benefit: 'I can validate themes before use',
      story_points: 3,
      acceptance_criteria: [
        'Each archetype card has ThemePreview component',
        'Preview displays: color swatches, sample typography, spacing example',
        'Preview updates when archetype is edited',
        'Preview is visually distinct for each archetype'
      ],
      e2e_test_path: 'tests/e2e/archetypes/preview.spec.ts'
    },
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-015',
      title: 'Preview accurately represents archetype theme',
      user_role: 'company admin',
      user_want: 'preview to match actual venture theme',
      user_benefit: 'I can trust the visual representation',
      story_points: 3,
      acceptance_criteria: [
        'Preview colors match visual_theme.colors exactly',
        'Preview typography matches visual_theme.typography',
        'Preview spacing matches visual_theme.spacing',
        'Side-by-side comparison: preview vs actual venture shows consistency'
      ],
      e2e_test_path: 'tests/e2e/archetypes/preview.spec.ts'
    }
  ];

  // Add common fields to all stories
  const userStories = stories.map(story => ({
    ...story,
    sd_id: 'SD-VENTURE-ARCHETYPES-001',
    prd_id: 'PRD-VENTURE-ARCHETYPES-001',
    priority: 'high',
    status: 'ready',
    e2e_test_status: 'not_created',
    validation_status: 'pending',
    created_by: 'Product Requirements Expert'
  }));

  console.log(`\n📝 Inserting ${userStories.length} user stories...`);

  const { data, error } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (error) {
    console.error('❌ User story generation failed:', error.message);
    process.exit(1);
  }

  console.log('\n✅ USER STORIES GENERATED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`Total Stories: ${data.length}`);
  console.log(`Total Story Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('\nStory Breakdown:');
  console.log('- US-001 to US-006: Archetype CRUD (18 points)');
  console.log('- US-007 to US-010: Archetype Selection (11 points)');
  console.log('- US-011 to US-013: Theme Application (10 points)');
  console.log('- US-014 to US-015: Preview Tests (6 points)');
  console.log(`\nTotal Implementation Effort: 45 story points`);
  console.log('\n📋 Next: Create database migration file');
}

generateUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
