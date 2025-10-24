#!/usr/bin/env node
/**
 * Add User Stories to PRD-SD-2025-1020-E2E-SELECTORS
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const userStories = [
  {
    id: 'US-001',
    title: 'Add venture-description-input test-id to description textarea',
    description: 'As a QA engineer, I can run tiered-ideation.spec.ts tests for description field validation so that I can verify venture input works correctly',
    priority: 'HIGH',
    points: 1,
    acceptance_criteria: [
      'Test line 89 passes: getByTestId("venture-description-input") locates textarea',
      'Description field remains functionally identical'
    ],
    status: 'pending'
  },
  {
    id: 'US-002',
    title: 'Add override-warning test-id to tier override alert',
    description: 'As a QA engineer, I can run tiered-ideation.spec.ts tests for tier override warnings so that I can verify Chairman override UX works correctly',
    priority: 'HIGH',
    points: 2,
    acceptance_criteria: [
      'Tests lines 210, 226, 617 pass: getByTestId("override-warning") locates alert',
      'Override warning displays when tier selection differs from AI recommendation',
      'Warning text contains "overrode" or "override"'
    ],
    status: 'pending'
  },
  {
    id: 'US-003',
    title: 'Add create-venture-button test-id to submit button',
    description: 'As a QA engineer, I can run tiered-ideation.spec.ts tests for venture submission so that I can verify wizard completion flow works correctly',
    priority: 'HIGH',
    points: 1,
    acceptance_criteria: [
      'Tests lines 263, 287, 319, 345+ pass: getByTestId("create-venture-button") locates button',
      'Button remains functionally identical (same onClick, disabled logic)'
    ],
    status: 'pending'
  }
];

async function addUserStories() {
  console.log('📋 Adding 3 User Stories to PRD-SD-2025-1020-E2E-SELECTORS metadata...\n');

  const { data: updated, error } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: {
        user_stories: userStories,
        user_story_count: 3,
        total_story_points: 4,
        story_breakdown: {
          high: 3
        }
      }
    })
    .eq('id', 'PRD-SD-2025-1020-E2E-SELECTORS')
    .select();

  if (error) {
    console.log('❌ Error updating PRD metadata:', error.message);
    process.exit(1);
  }

  console.log('✅ User stories added successfully');
  console.log('   PRD: PRD-SD-2025-1020-E2E-SELECTORS');
  console.log('   Stories: 3');
  console.log('   Total Points: 4');
  console.log('\nUser Stories:');
  userStories.forEach(story => {
    console.log(`   ${story.id}: ${story.title} (${story.points} pts)`);
  });
}

addUserStories();
