#!/usr/bin/env node
/**
 * Create Checkpoint Plan for SD-RETRO-ENHANCE-001
 *
 * BMAD Requirement: SDs with ≥8 stories need checkpoint plan
 * This divides 9 user stories into 3 logical checkpoints for progress tracking
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const checkpointPlan = {
  total_checkpoints: 3,
  total_user_stories: 9,
  total_story_points: 44,
  checkpoints: [
    {
      checkpoint_number: 1,
      title: 'Database Schema & Multi-Application Context',
      description: 'Foundation: Add core fields (target_application, learning_category, code traceability arrays) to retrospectives table',
      user_stories: ['SD-RETRO-ENHANCE-001:US-001', 'SD-RETRO-ENHANCE-001:US-002', 'SD-RETRO-ENHANCE-001:US-003'],
      story_points: 13,
      estimated_hours: 26,
      deliverables: [
        'Migration adding target_application column with constraint',
        'Migration adding learning_category and applies_to_all_apps columns',
        'Migration adding 5 code traceability arrays (related_files, related_commits, related_prs, affected_components, tags)',
        'GIN indexes on all array columns',
        'Triggers for auto-population and validation',
        'Updated generate-comprehensive-retrospective.js with field population logic'
      ],
      acceptance_criteria: [
        'All 9 new columns exist in retrospectives table',
        'Constraints enforce valid values for target_application and learning_category',
        'Triggers auto-populate applies_to_all_apps and validate code traceability',
        'GIN indexes enable efficient array operations',
        'generate-comprehensive-retrospective.js populates all new fields'
      ],
      risks: [
        'Constraint violations in existing generation code (MEDIUM) - mitigate with Layer 3 validation'
      ],
      dependencies: []
    },
    {
      checkpoint_number: 2,
      title: 'Semantic Search Infrastructure',
      description: 'Search: Implement OpenAI embeddings, vector similarity search, and match_retrospectives() RPC function',
      user_stories: ['SD-RETRO-ENHANCE-001:US-004', 'SD-RETRO-ENHANCE-001:US-005'],
      story_points: 10,
      estimated_hours: 20,
      deliverables: [
        'Migration adding content_embedding vector(1536) column',
        'IVFFlat index on content_embedding for vector search',
        'generate-retrospective-embeddings.js script with OpenAI integration',
        'match_retrospectives() RPC function with cosine distance similarity',
        'Combined semantic + structured filter queries'
      ],
      acceptance_criteria: [
        'content_embedding column stores OpenAI text-embedding-3-small vectors',
        'IVFFlat index enables <100ms average query time',
        'match_retrospectives() RPC function returns ranked results by similarity',
        'Semantic search finds conceptually similar retrospectives',
        'Filters combine with semantic search (application, category, severity)'
      ],
      risks: [
        'Vector search performance issues (MEDIUM) - mitigate with IVFFlat tuning',
        'Embedding generation costs exceed budget (LOW) - mitigate with PUBLISHED-only generation'
      ],
      dependencies: ['Checkpoint 1 (target_application, learning_category needed for filters)']
    },
    {
      checkpoint_number: 3,
      title: 'Quality Enforcement, Backfill & Integration',
      description: 'Complete: 4-layer enforcement, backfill 97 retrospectives, integrate with SD-KNOWLEDGE-001, enable cross-app learning',
      user_stories: ['SD-RETRO-ENHANCE-001:US-006', 'SD-RETRO-ENHANCE-001:US-007', 'SD-RETRO-ENHANCE-001:US-008', 'SD-RETRO-ENHANCE-001:US-009'],
      story_points: 21,
      estimated_hours: 42,
      deliverables: [
        '5 database constraints for data integrity',
        'Enhanced auto_validate_retrospective_quality() trigger',
        'Enhanced validateRetrospective() function with comprehensive checks',
        '.github/workflows/retrospective-quality-gates.yml CI/CD workflow',
        'backfill-retrospective-enhancements.js script with batch processing',
        'Updated automated-knowledge-retrieval.js with semantic search',
        'Cross-application learning dashboard widget',
        '10 comprehensive documentation files'
      ],
      acceptance_criteria: [
        'All 4 enforcement layers tested independently and working',
        'All 97 existing retrospectives backfilled successfully',
        'Zero retrospectives with invalid data post-deployment',
        'automated-knowledge-retrieval.js achieves 3x result improvement',
        'Research confidence increases from 85% to 95%',
        'CI/CD gates prevent merging invalid retrospective generation code',
        'Cross-application queries return relevant process improvements',
        'All documentation complete and accessible'
      ],
      risks: [
        'Backfill timeout for 97 records (HIGH) - mitigate with batch processing + resume capability',
        'Breaking changes to retrospective generation (LOW) - mitigate with backward compatibility'
      ],
      dependencies: ['Checkpoint 1 (all fields must exist)', 'Checkpoint 2 (semantic search infrastructure)']
    }
  ],
  estimated_total_time: '88 hours (11 working days at 8 hours/day)',
  target_completion: 'Within 4 weeks from EXEC phase start',
  verification_plan: {
    checkpoint_1: [
      'Test constraint enforcement with invalid values',
      'Verify trigger auto-population logic',
      'Test GIN indexes with array operations',
      'Verify generate-comprehensive-retrospective.js populates all fields'
    ],
    checkpoint_2: [
      'Test embedding generation for PUBLISHED retrospectives',
      'Benchmark vector search performance (<100ms)',
      'Test match_retrospectives() RPC with sample queries',
      'Verify semantic similarity results (e.g., "auth problems" finds "login issues")'
    ],
    checkpoint_3: [
      'Test all 4 enforcement layers independently',
      'Run backfill on staging environment first',
      'Measure search improvement (baseline vs enhanced)',
      'Verify CI/CD gates block invalid code',
      'Test cross-application queries'
    ]
  },
  rollback_plan: {
    checkpoint_1: 'DROP added columns if issues found during testing',
    checkpoint_2: 'Remove vector column and RPC function if performance unacceptable',
    checkpoint_3: 'Restore original retrospectives from backup if backfill fails'
  }
};

async function createCheckpointPlan() {
  console.log('📋 Creating Checkpoint Plan for SD-RETRO-ENHANCE-001...\n');

  // Update SD with checkpoint plan in JSONB field
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ checkpoint_plan: checkpointPlan })
    .eq('id', 'SD-RETRO-ENHANCE-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating checkpoint plan:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }

  console.log('✅ Checkpoint Plan created successfully!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 Checkpoint Plan Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log('SD: SD-RETRO-ENHANCE-001');
  console.log(`Total Checkpoints: ${checkpointPlan.total_checkpoints}`);
  console.log(`Total User Stories: ${checkpointPlan.total_user_stories}`);
  console.log(`Total Story Points: ${checkpointPlan.total_story_points}`);
  console.log(`Estimated Time: ${checkpointPlan.estimated_total_time}`);
  console.log('');
  console.log('Checkpoints:');
  checkpointPlan.checkpoints.forEach(cp => {
    console.log(`  ${cp.checkpoint_number}. ${cp.title}`);
    console.log(`     Stories: ${cp.user_stories.length} (${cp.story_points} points, ~${cp.estimated_hours}h)`);
    console.log(`     Deliverables: ${cp.deliverables.length}`);
  });
  console.log('');
  console.log('✅ BMAD requirement met (checkpoint plan exists for 9-story SD)');
}

createCheckpointPlan().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
