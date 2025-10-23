#!/usr/bin/env node

/**
 * Create User Stories for SD-VWC-PRESETS-001
 * Venture Creation: Preset Selector Component
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VWC-PRESETS-001';
const PRD_ID = 'PRD-SD-VWC-PRESETS-001';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'PresetService Implementation',
    user_role: 'Developer',
    user_want: 'Create preset management service with CRUD operations and local storage persistence',
    user_benefit: 'Consistent preset handling across the application with reliable persistence',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Service exports CRUD functions: create, read, update, delete',
      'TypeScript interface for VenturePreset exported',
      'Local storage persistence with error handling',
      'Fallback for browsers without local storage'
    ],
    implementation_context: 'Create src/services/presetService.ts with local storage operations. Define VenturePreset interface with id, name, description, tier, ideation_method, ideation_config, created_at, last_used_at fields.',
    test_scenarios: [
      {
        scenario: 'Create Preset',
        test_type: 'unit',
        description: 'Service creates preset in local storage',
        input: 'Preset data with name and configuration',
        expected_output: 'Preset stored with generated ID',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'PresetSelector Component',
    user_role: 'User',
    user_want: 'Select presets from dropdown to auto-fill venture creation form',
    user_benefit: 'Quick venture creation using saved configurations',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Dropdown displays all saved presets with names',
      'Selecting preset auto-fills form with tier and ideation settings',
      'Empty state message when no presets exist',
      'Preset description visible in dropdown'
    ],
    implementation_context: 'Create PresetSelector component using Shadcn Select. Integrate with VentureWizard form state using React Hook Form setValue(). Place at top of wizard Step 1.',
    test_scenarios: [
      {
        scenario: 'Load Preset',
        test_type: 'e2e',
        description: 'User loads preset and form auto-fills',
        input: 'User selects preset from dropdown',
        expected_output: 'Form fields populated with preset configuration',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Preset Dialog',
    user_role: 'User',
    user_want: 'Save current wizard configuration as a preset',
    user_benefit: 'Reuse successful venture configurations for future ventures',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      '"Save as Preset" button visible in wizard',
      'Modal dialog with name input (required) and description textarea',
      'Validation: name required, max 50 characters',
      'Success toast after preset saved'
    ],
    implementation_context: 'Create CreatePresetDialog component using Shadcn Dialog. Add form validation with React Hook Form. Trigger from "Save as Preset" button in VentureWizard.',
    test_scenarios: [
      {
        scenario: 'Save Preset',
        test_type: 'e2e',
        description: 'User saves current config as preset',
        input: 'User enters preset name and clicks save',
        expected_output: 'Preset saved, success toast displayed, appears in dropdown',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Manage Presets Dialog',
    user_role: 'User',
    user_want: 'Edit and delete existing presets',
    user_benefit: 'Keep preset list organized and up-to-date',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Dialog displays all presets in table format',
      'Edit action updates preset name and description',
      'Delete action removes preset with confirmation dialog',
      'Last used timestamp displayed for each preset'
    ],
    implementation_context: 'Create ManagePresetsDialog component with Shadcn Dialog and Table. Add edit/delete actions. Use confirmation dialog for destructive actions.',
    test_scenarios: [
      {
        scenario: 'Delete Preset',
        test_type: 'e2e',
        description: 'User deletes preset with confirmation',
        input: 'User clicks delete and confirms',
        expected_output: 'Preset removed from list and storage',
        priority: 'MEDIUM'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Unit Tests for PresetService',
    user_role: 'Developer',
    user_want: 'Comprehensive unit tests for preset service',
    user_benefit: 'Ensure preset operations are reliable and bug-free',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Test CRUD operations (create, read, update, delete)',
      'Test local storage persistence across page reloads',
      'Test validation (name required, max length)',
      '100% coverage for presetService'
    ],
    implementation_context: 'Create tests/unit/services/presetService.test.ts using Vitest. Mock local storage for testing. Test edge cases like quota exceeded.',
    test_scenarios: [
      {
        scenario: 'Persistence Test',
        test_type: 'unit',
        description: 'Presets persist across sessions',
        input: 'Create preset, simulate page reload',
        expected_output: 'Preset still available after reload',
        priority: 'HIGH'
      }
    ]
  },
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'E2E Tests for Preset Workflows',
    user_role: 'Developer',
    user_want: 'End-to-end tests covering all preset user flows',
    user_benefit: 'Confidence that preset features work in production',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Test create preset workflow',
      'Test load preset and form auto-fill',
      'Test edit preset workflow',
      'Test delete preset workflow',
      'Test empty state when no presets exist'
    ],
    implementation_context: 'Create tests/e2e/venture-presets.spec.ts using Playwright. Test full user workflows including form interactions and local storage persistence.',
    test_scenarios: [
      {
        scenario: 'Full Preset Lifecycle',
        test_type: 'e2e',
        description: 'Create, load, edit, and delete preset',
        input: 'User performs all preset operations',
        expected_output: 'All operations succeed with correct UI feedback',
        priority: 'HIGH'
      }
    ]
  }
];

async function createUserStories() {
  console.log(`\n📋 Creating User Stories for ${SD_ID}`);
  console.log('='.repeat(70));

  let created = 0;
  let failed = 0;

  for (const story of userStories) {
    console.log(`\n📝 Creating ${story.story_key}...`);

    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log(`   ⏭️  Already exists`);
      } else {
        console.error(`   ❌ Error: ${error.message}`);
        failed++;
      }
    } else {
      console.log(`   ✅ Created: ${story.title}`);
      created++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ User Story Creation Complete`);
  console.log(`   Created: ${created}/${userStories.length}`);
  console.log(`   Failed: ${failed}`);
  console.log('\n📋 Next Steps:');
  console.log('   1. Verify user stories in database');
  console.log('   2. Update PRD plan_checklist (user stories generated)');
  console.log('   3. Create PLAN→EXEC handoff');
  console.log('   4. Begin EXEC phase implementation');
}

createUserStories().catch(console.error);
