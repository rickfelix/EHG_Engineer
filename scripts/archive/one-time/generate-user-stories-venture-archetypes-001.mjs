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

  const userStories = [
    // Archetype CRUD Tests
    {
      story_key: 'SD-VENTURE-ARCHETYPES-001:US-001',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Admin can navigate to Settings → Archetypes tab',
      user_role: 'company admin',
      user_want: 'to navigate to the Archetypes tab in Settings',
      user_benefit: 'I can manage venture archetypes',
      acceptance_criteria: [
        'Settings page displays "Archetypes" as 7th tab',
        'Clicking "Archetypes" tab loads ArchetypesSettingsTab component',
        'Tab is only visible to admin users',
        'Navigation is responsive on mobile and desktop'
      ],
      priority: 'high',
      status: 'ready',
      story_points: 2,
      e2e_test_path: 'tests/e2e/archetypes/crud.spec.ts',
      e2e_test_status: 'not_created',
      validation_status: 'pending',
      created_by: 'Product Requirements Expert'
    },
    {
      story_id: 'US-ARCHETYPES-002',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Admin can view list of existing archetypes',
      description: 'As a company admin, I want to see all existing archetypes in a grid layout so that I can review available options',
      acceptance_criteria: [
        'Archetypes displayed in Card grid layout',
        'Each card shows: name, description, visual theme preview',
        'Default archetypes have "Default" badge',
        'Empty state message if no archetypes exist'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-003',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Admin can create new archetype with valid data',
      description: 'As a company admin, I want to create a new custom archetype so that I can add company-specific themes',
      acceptance_criteria: [
        'Create button opens dialog with form fields',
        'Form includes: name (max 100), description (max 2000), visual_theme (color picker)',
        'Submit button creates new archetype in database',
        'Success toast displayed after creation',
        'New archetype appears in grid'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-004',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Admin can edit existing archetype',
      description: 'As a company admin, I want to edit archetype details so that I can refine themes over time',
      acceptance_criteria: [
        'Edit button (pencil icon) on archetype card',
        'Edit dialog pre-fills with existing data',
        'Changes persist to database on submit',
        'Grid updates immediately after edit'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-005',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Admin cannot delete default archetypes',
      description: 'As a system, I want to prevent deletion of default archetypes so that users always have base options',
      acceptance_criteria: [
        'Delete button disabled on archetypes with is_default = true',
        'Tooltip explains "Default archetypes cannot be deleted"',
        'Attempting API delete returns error',
        'Error toast displayed if delete attempted'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/crud.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-006',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Admin can delete custom archetypes',
      description: 'As a company admin, I want to delete custom archetypes that are no longer needed',
      acceptance_criteria: [
        'Delete button enabled on archetypes with is_default = false',
        'Confirmation dialog appears before deletion',
        'Archetype removed from database on confirm',
        'Grid updates immediately after deletion'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/crud.spec.ts'
    },

    // Archetype Selection Tests
    {
      story_id: 'US-ARCHETYPES-007',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'User can open venture creation dialog',
      description: 'As a venture creator, I want to open the venture creation dialog so that I can create a new venture',
      acceptance_criteria: [
        'Ventures page has "New Venture" button',
        'Button click opens VentureCreationDialog',
        'Dialog displays all form fields including archetype selector'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/selection.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-008',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'User sees archetype selector dropdown',
      description: 'As a venture creator, I want to see an archetype selector in the creation dialog',
      acceptance_criteria: [
        'Archetype selector appears after category field',
        'Label: "Venture Archetype (optional)"',
        'Dropdown populated with company archetypes',
        'Default option: "None (use base theme)"'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/selection.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-009',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'User can select archetype from dropdown',
      description: 'As a venture creator, I want to select an archetype so that my venture adopts that theme',
      acceptance_criteria: [
        'Clicking dropdown shows all available archetypes',
        'Each option displays: archetype name + description',
        'Selecting option highlights choice',
        'Selection persists during form completion'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/selection.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-010',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Selected archetype is stored in venture metadata',
      description: 'As a system, I want to snapshot archetype data so that ventures preserve theme even if archetype is deleted',
      acceptance_criteria: [
        'ventures.metadata.archetype contains: { id, name, visual_theme }',
        'Data is snapshot (not reference to archetype table)',
        'Archetype stored on venture creation',
        'Database query confirms metadata structure'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/selection.spec.ts'
    },

    // Theme Application Tests
    {
      story_id: 'US-ARCHETYPES-011',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Venture with archetype displays correct theme colors',
      description: 'As a venture viewer, I want ventures to display archetype colors so that each has a distinct visual identity',
      acceptance_criteria: [
        'CSS variables applied: --archetype-primary, --archetype-secondary, --archetype-accent',
        'Venture page elements use archetype colors',
        'Colors match archetype visual_theme JSONB',
        'Screenshot shows distinct visual theme'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/theming.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-012',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Theme works in both dark and light modes',
      description: 'As a user, I want archetype themes to adapt to dark/light mode so that readability is preserved',
      acceptance_criteria: [
        'Toggle dark mode - archetype colors remain visible',
        'Toggle light mode - archetype colors remain visible',
        'Contrast ratios meet WCAG AA standards in both modes',
        'No color conflicts with base theme'
      ],
      priority: 'HIGH',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/theming.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-013',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Venture without archetype falls back to base theme',
      description: 'As a system, I want ventures without archetypes to use the base theme as fallback',
      acceptance_criteria: [
        'Ventures with metadata.archetype = null use base theme',
        'No CSS variable errors in console',
        'Visual appearance matches default venture styling',
        'No broken colors or missing styles'
      ],
      priority: 'MEDIUM',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/theming.spec.ts'
    },

    // Preview Tests
    {
      story_id: 'US-ARCHETYPES-014',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Archetype preview shows visual mockup in settings',
      description: 'As a company admin, I want to see a visual preview of each archetype so that I can validate themes before use',
      acceptance_criteria: [
        'Each archetype card has ThemePreview component',
        'Preview displays: color swatches, sample typography, spacing example',
        'Preview updates when archetype is edited',
        'Preview is visually distinct for each archetype'
      ],
      priority: 'MEDIUM',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/preview.spec.ts'
    },
    {
      story_id: 'US-ARCHETYPES-015',
      sd_id: 'SD-VENTURE-ARCHETYPES-001',
      prd_id: 'PRD-VENTURE-ARCHETYPES-001',
      title: 'Preview accurately represents archetype theme',
      description: 'As a company admin, I want preview to match actual venture theme so that I can trust the visual representation',
      acceptance_criteria: [
        'Preview colors match visual_theme.colors exactly',
        'Preview typography matches visual_theme.typography',
        'Preview spacing matches visual_theme.spacing',
        'Side-by-side comparison: preview vs actual venture shows consistency'
      ],
      priority: 'MEDIUM',
      status: 'pending',
      test_type: 'e2e',
      test_file: 'tests/e2e/archetypes/preview.spec.ts'
    }
  ];

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
  console.log('\nStory Breakdown:');
  console.log('- US-001 to US-006: Archetype CRUD (6 stories)');
  console.log('- US-007 to US-010: Archetype Selection (4 stories)');
  console.log('- US-011 to US-013: Theme Application (3 stories)');
  console.log('- US-014 to US-015: Preview Tests (2 stories)');
  console.log('\nPriority Distribution:');
  console.log(`- HIGH: ${data.filter(s => s.priority === 'HIGH').length} stories`);
  console.log(`- MEDIUM: ${data.filter(s => s.priority === 'MEDIUM').length} stories`);
  console.log('\n📋 Next: Create database migration file');
}

generateUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
