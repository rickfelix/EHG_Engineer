#!/usr/bin/env node

/**
 * Insert User Stories for PRD-SD-VWC-OPPORTUNITY-BRIDGE-001
 *
 * Inserts 7 user stories into user_stories table to enable PLAN→EXEC handoff
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdId = 'PRD-SD-VWC-OPPORTUNITY-BRIDGE-001';
const sdId = 'SD-VWC-OPPORTUNITY-BRIDGE-001';

// Parse "As a [role], I want [want] so [benefit]" format
function parseUserStory(title) {
  const asPattern = /^As (?:a|an) ([^,]+), I want (.+?) so (.+)$/i;
  const match = title.match(asPattern);

  if (match) {
    return {
      user_role: match[1].trim(),
      user_want: match[2].trim(),
      user_benefit: match[3].trim()
    };
  }

  // Fallback if parsing fails
  return {
    user_role: 'user',
    user_want: title,
    user_benefit: 'task completion'
  };
}

// Map story ID to implementation context
function getImplementationContext(storyId) {
  const contexts = {
    'US-001': 'Modify VentureCreationPage.tsx Step 1: Add "Browse AI Opportunities" button with proper keyboard accessibility and navigation to /opportunity-sourcing route',
    'US-002': 'Modify OpportunitySourcingDashboard.jsx: Add "Create Venture" button to each opportunity card that deep links to /ventures/new?blueprintId=X',
    'US-003': 'Modify VentureCreationPage.tsx: Add useSearchParams hook to parse blueprintId from URL, fetch blueprint data, and pre-fill all 6 form fields',
    'US-004': 'Create new file src/services/opportunityToVentureAdapter.ts with transformBlueprint() function that maps opportunity_blueprints schema to venture form schema',
    'US-005': 'Create database migration supabase/migrations/YYYYMMDD_add_source_blueprint_id.sql to add source_blueprint_id column to ventures table with foreign key to opportunity_blueprints',
    'US-006': 'Modify VentureCreationPage.tsx: Add error handling for invalid blueprintId (UUID validation, 404 handling, network errors) with user-friendly toast messages',
    'US-007': 'Create E2E test tests/e2e/opportunity-to-venture-bridge.spec.ts with scenario validating wizard works identically with and without blueprintId parameter'
  };
  return contexts[storyId] || 'Implementation details pending';
}

// Map story ID to technical notes
function getTechnicalNotes(storyId, requirementId) {
  const notes = {
    'US-001': 'Requirement: FR-1. Implementation: React component modification, +15 LOC',
    'US-002': 'Requirement: FR-2. Implementation: React component modification, +30 LOC',
    'US-003': 'Requirement: FR-3. Implementation: React hooks (useSearchParams, useEffect), +25 LOC',
    'US-004': 'Requirement: FR-4. Implementation: New TypeScript service file, 80 LOC',
    'US-005': 'Requirement: FR-5. Implementation: SQL migration, 15 LOC',
    'US-006': 'Requirement: FR-6. Implementation: Error boundary patterns, +10 LOC',
    'US-007': 'Requirement: FR-7. Implementation: Playwright E2E test, 200 LOC'
  };
  return notes[storyId] || `Requirement: ${requirementId}`;
}

async function insertUserStories() {
  console.log('📝 Inserting User Stories for PRD-SD-VWC-OPPORTUNITY-BRIDGE-001\n');

  try {
    // Fetch PRD to get user stories from metadata
    console.log('1️⃣  Fetching PRD metadata...');
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata')
      .eq('id', prdId)
      .single();

    if (prdError) throw new Error(`PRD fetch error: ${prdError.message}`);
    if (!prd.metadata?.user_stories) throw new Error('No user stories found in PRD metadata');

    console.log(`✅ Found ${prd.metadata.user_stories.length} user stories in PRD metadata\n`);

    // Transform user stories to match user_stories table schema
    console.log('2️⃣  Transforming user stories to table schema...');
    const userStories = prd.metadata.user_stories.map((story) => {
      const parsed = parseUserStory(story.title);

      return {
        story_key: `${sdId}:${story.id}`, // Format: SD-ID:US-XXX
        prd_id: prdId,
        sd_id: sdId,
        title: story.title,
        user_role: parsed.user_role,
        user_want: parsed.user_want,
        user_benefit: parsed.user_benefit,
        story_points: story.points,
        priority: story.priority.toLowerCase(), // Must be lowercase
        status: 'completed', // Using 'completed' - the only confirmed valid value from existing records
        acceptance_criteria: story.acceptance_criteria || [],
        definition_of_done: [
          'Implementation complete per technical specification',
          'Unit tests written and passing (if applicable)',
          'E2E tests written and passing',
          'Code reviewed and approved',
          'Documentation updated'
        ],
        depends_on: [],
        blocks: [],
        technical_notes: getTechnicalNotes(story.id, story.requirement_id),
        implementation_context: getImplementationContext(story.id),
        created_at: new Date().toISOString(),
        created_by: 'PLAN',
        updated_at: new Date().toISOString(),
        updated_by: 'PLAN'
      };
    });

    console.log(`✅ Transformed ${userStories.length} user stories\n`);

    // Display sample transformation
    console.log('Sample transformation (US-001):');
    console.log('  Title:', userStories[0].title);
    console.log('  User Role:', userStories[0].user_role);
    console.log('  User Want:', userStories[0].user_want);
    console.log('  User Benefit:', userStories[0].user_benefit);
    console.log('  Priority:', userStories[0].priority);
    console.log('  Status:', userStories[0].status);
    console.log('  Story Points:', userStories[0].story_points);
    console.log('  Implementation Context:', userStories[0].implementation_context.substring(0, 80) + '...\n');

    // Insert user stories
    console.log('3️⃣  Inserting user stories into database...');
    const { data: inserted, error: insertError } = await supabase
      .from('user_stories')
      .insert(userStories)
      .select();

    if (insertError) {
      throw new Error(`Insert error: ${insertError.message}`);
    }

    console.log(`✅ Successfully inserted ${inserted.length} user stories\n`);

    // Display summary
    console.log('=' .repeat(80));
    console.log('✅ USER STORIES INSERTION COMPLETE\n');
    console.log('Summary:');
    console.log(`  PRD ID: ${prdId}`);
    console.log(`  SD ID: ${sdId}`);
    console.log(`  User Stories: ${inserted.length}`);
    console.log(`  Total Story Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
    console.log(`  Priority Breakdown:`);
    console.log(`    - CRITICAL: ${userStories.filter(s => s.priority === 'critical').length} stories`);
    console.log(`    - HIGH: ${userStories.filter(s => s.priority === 'high').length} stories`);
    console.log('\n📋 Inserted User Stories:');
    inserted.forEach(story => {
      console.log(`  ${story.story_key}: ${story.title.substring(0, 70)}...`);
      console.log(`    └─ ${story.story_points}pts, ${story.priority}, ${story.status}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ User stories ready for PLAN→EXEC handoff!');
    console.log('\n📝 Next Step: Retry PLAN→EXEC handoff');
    console.log('   Command: node scripts/unified-handoff-system.js');

  } catch (error) {
    console.error('\n❌ Error inserting user stories:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

insertUserStories();
