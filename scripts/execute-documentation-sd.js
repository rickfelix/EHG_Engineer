#!/usr/bin/env node

/**
 * Master Execution Script: Dynamic Documentation Platform
 * 1. Create SD-DOCUMENTATION-001
 * 2. Add 7 DOCMON-driven user stories (US-001 through US-007)
 * 3. Verify final counts across all 4 SDs
 */

import { createDocumentationSD } from './create-sd-documentation-001.js';
import { addDocumentationStories } from './add-documentation-stories.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function verifyUserStories() {
  console.log('🔍 Verifying final user story counts...');
  console.log('='.repeat(80));

  const { data: allStories, error } = await supabase
    .from('user_stories')
    .select('*')
    .order('sd_id', { ascending: true });

  if (error) throw error;

  const storiesBySd = allStories.reduce((acc, story) => {
    if (!acc[story.sd_id]) acc[story.sd_id] = [];
    acc[story.sd_id].push(story);
    return acc;
  }, {});

  const totalStories = allStories.length;
  const totalPoints = allStories.reduce((sum, s) => sum + s.story_points, 0);

  console.log('📈 Strategic Directives Breakdown:');
  console.log('');

  Object.entries(storiesBySd).forEach(([sdId, stories]) => {
    const sdPoints = stories.reduce((sum, s) => sum + s.story_points, 0);
    console.log(`  ${sdId}: ${stories.length} stories, ${sdPoints} points`);
  });

  console.log('');
  console.log(`🎯 TOTAL USER STORIES: ${totalStories}`);
  console.log(`📊 TOTAL STORY POINTS: ${totalPoints}`);
  console.log('='.repeat(80));

  return { totalStories, totalPoints, storiesBySd };
}

async function executeDocumentationSD() {
  console.log('🚀 EXECUTING DYNAMIC DOCUMENTATION PLATFORM CREATION');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Step 1: Create SD-DOCUMENTATION-001
    console.log('📝 STEP 1: Creating SD-DOCUMENTATION-001...');
    await createDocumentationSD();
    console.log('');

    // Step 2: Add 7 DOCMON-driven user stories
    console.log('📝 STEP 2: Adding 7 DOCMON-driven documentation stories...');
    const _newStories = await addDocumentationStories();
    console.log('');

    // Step 3: Verify final counts
    console.log('📝 STEP 3: Verifying final user story counts...');
    const verification = await verifyUserStories();
    console.log('');

    // Final Summary
    console.log('');
    console.log('='.repeat(80));
    console.log('✅ DYNAMIC DOCUMENTATION PLATFORM CREATION COMPLETE!');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 Final Configuration:');
    console.log('');
    console.log('📈 Strategic Directives (4 Total):');
    console.log(`  1. SD-VENTURE-IDEATION-MVP-001: ${verification.storiesBySd['SD-VENTURE-IDEATION-MVP-001']?.length || 0} stories`);
    console.log(`  2. SD-AGENT-PLATFORM-001: ${verification.storiesBySd['SD-AGENT-PLATFORM-001']?.length || 0} stories`);
    console.log(`  3. SD-AGENT-ADMIN-001 (Agent Engineering): ${verification.storiesBySd['SD-AGENT-ADMIN-001']?.length || 0} stories`);
    console.log(`  4. SD-DOCUMENTATION-001 (NEW): ${verification.storiesBySd['SD-DOCUMENTATION-001']?.length || 0} stories (added 7 new) ✅`);
    console.log('');
    console.log(`🎯 Total User Stories: ${verification.totalStories} (was 62, +7)`);
    console.log(`📊 Total Story Points: ${verification.totalPoints} (was 377, +47)`);
    console.log('');
    console.log('📋 New User Stories Added:');
    console.log('  US-001: DOCMON-Driven Documentation Gap Analysis (5 pts, critical)');
    console.log('  US-002: CrewAI Platform Documentation (Dynamic Discovery) (8 pts, high)');
    console.log('  US-003: API Reference Auto-Documentation (8 pts, critical)');
    console.log('  US-004: Framework-Specific Developer Guides (5 pts, high)');
    console.log('  US-005: UI Workflow User Guides (As-Built) (8 pts, high)');
    console.log('  US-006: Architecture Documentation (Living Diagrams) (8 pts, medium)');
    console.log('  US-007: Documentation Quality Standards & Automation (5 pts, high)');
    console.log('');
    console.log('🎯 Key Features:');
    console.log('  ✅ DOCMON-driven gap analysis and auto-discovery');
    console.log('  ✅ Dynamic documentation reflecting actual implementation');
    console.log('  ✅ Quality thresholds: 80% code sync, 90% link validity, 70% API coverage');
    console.log('  ✅ CI/CD integration for automated validation');
    console.log('  ✅ Living architecture diagrams auto-generated from DB');
    console.log('  ✅ Implementation order: 4th (LAST - after SDs 1-3 complete)');
    console.log('');
    console.log('📂 Documentation Structure:');
    console.log('  - crewai-platform/ (org hierarchy, agent roles, workflows)');
    console.log('  - api/ (auto-generated API reference with validated examples)');
    console.log('  - guides/ (developer onboarding, user guides, troubleshooting)');
    console.log('  - architecture/ (system diagrams, DB schema, component relationships)');
    console.log('  - operations/ (deployment, monitoring, maintenance)');
    console.log('');
    console.log('✅ SD-DOCUMENTATION-001 created with comprehensive vision!');
    console.log('⚠️  Status: BLOCKED until SD-VENTURE-IDEATION-MVP-001, SD-AGENT-PLATFORM-001, and SD-AGENT-ADMIN-001 complete');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ ERROR DURING EXECUTION');
    console.error('='.repeat(80));
    console.error(error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeDocumentationSD();
}

export { executeDocumentationSD };
