#!/usr/bin/env node

/**
 * Update User Stories US-005 and US-006 with Corrected Component Scope
 * Actual components: VentureCreationPage and VentureForm (not adapter/dashboard)
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function updateUserStories() {
  console.log('\n📋 Updating User Stories with Corrected Scope');
  console.log('='.repeat(60));

  let client;

  try {
    client = await createDatabaseClient('engineer', { verify: true });

    const sdId = 'SD-VWC-INTUITIVE-FLOW-001';

    // Update US-005: VentureCreationPage Unit Tests
    console.log('\n1️⃣  Updating US-005: VentureCreationPage Unit Tests...');

    const us005Update = `
      UPDATE user_stories
      SET
        title = 'VentureCreationPage Unit Tests',
        user_want = 'comprehensive unit tests for VentureCreationPage component',
        user_benefit = 'tooltip logic, state management, and UI behavior are verified',
        acceptance_criteria = $1::jsonb,
        test_scenarios = $2::jsonb,
        technical_notes = 'Target component: VentureCreationPage. Test file: tests/unit/VentureCreationPage.test.tsx. Coverage target: 80%+. Estimated effort: 3 hours. Checkpoint 2, FR-7. Tests tooltip rendering, disabled states, save draft functionality, step navigation.',
        implementation_context = 'Unit testing for venture wizard main component. Framework: Vitest + @testing-library/react. Create test suite for VentureCreationPage covering tooltip behavior, state management, step progression, and form submission. Target 80%+ code coverage.'
      WHERE story_key = $3
      RETURNING story_key, title;
    `;

    const us005Criteria = [
      'Component renders correctly for each wizard step (1-5)',
      'Tooltips display on disabled buttons with correct messages',
      'Save Draft button enables/disables based on form state',
      'Step navigation works correctly (Next, Back, View Results)',
      'Form validation prevents progression without required fields',
      'Coverage: 80%+ for VentureCreationPage component',
      'Tests pass in CI/CD pipeline'
    ];

    const us005Scenarios = [
      'Component renders in Step 1 (Idea) with correct initial state',
      'Save Draft tooltip shows when venture name is empty',
      'Next button tooltip shows when required fields missing',
      'View Results button tooltip shows when research incomplete',
      'Step navigation advances when criteria met',
      'Tooltip keyboard accessibility (hover and focus)',
      'Dark mode theme classes applied correctly',
      'Form state persists across step changes'
    ];

    const result005 = await client.query(us005Update, [
      JSON.stringify(us005Criteria),
      JSON.stringify(us005Scenarios),
      `${sdId}:US-005`
    ]);

    console.log(`   ✅ ${result005.rows[0].story_key}: ${result005.rows[0].title}`);

    // Update US-006: VentureForm Unit Tests
    console.log('\n2️⃣  Updating US-006: VentureForm Unit Tests...');

    const us006Update = `
      UPDATE user_stories
      SET
        title = 'VentureForm Unit Tests',
        user_want = 'unit tests for VentureForm component',
        user_benefit = 'form inputs, validation logic, and tier selection are verified',
        acceptance_criteria = $1::jsonb,
        test_scenarios = $2::jsonb,
        technical_notes = 'Target component: VentureForm. Test file: tests/unit/VentureForm.test.tsx. Coverage target: 80%+. Estimated effort: 2 hours. Checkpoint 2, FR-7. Tests form inputs, tier selection, validation, complexity assessment.',
        implementation_context = 'Unit testing for venture form component. Framework: Vitest + @testing-library/react. Create test suite for VentureForm covering input validation, tier selection, complexity assessment, and form submission. Target 80%+ code coverage.'
      WHERE story_key = $3
      RETURNING story_key, title;
    `;

    const us006Criteria = [
      'All form inputs render and accept user input',
      'Tier selection buttons toggle correctly (1-5)',
      'Form validation triggers on required fields',
      'Complexity override warning displays correctly',
      'Form data updates parent state via onChange',
      'Coverage: 80%+ for VentureForm component',
      'Tests pass in CI/CD pipeline'
    ];

    const us006Scenarios = [
      'Component renders with empty form state',
      'Component renders with pre-filled data',
      'Name and description inputs update form state',
      'Tier buttons toggle active state correctly',
      'Complexity assessment displays AI recommendation',
      'Override warning shows when tier differs from AI',
      'Form validation prevents empty required fields',
        'Dark mode theme classes applied to form inputs'
    ];

    const result006 = await client.query(us006Update, [
      JSON.stringify(us006Criteria),
      JSON.stringify(us006Scenarios),
      `${sdId}:US-006`
    ]);

    console.log(`   ✅ ${result006.rows[0].story_key}: ${result006.rows[0].title}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ USER STORIES UPDATED');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   - US-005: VentureCreationPage Unit Tests (8 scenarios, 80%+ coverage)');
    console.log('   - US-006: VentureForm Unit Tests (8 scenarios, 80%+ coverage)');
    console.log('   - US-007: Keyboard Navigation (unchanged)');
    console.log('   - US-008: ARIA Labels (unchanged)');
    console.log('\n📋 Corrected Scope:');
    console.log('   - Testing actual components from Checkpoint 1');
    console.log('   - Aligned with SD-VWC-INTUITIVE-FLOW-001 goal');
    console.log('   - Ready for EXEC phase implementation\n');

  } catch (_error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateUserStories()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default updateUserStories;
