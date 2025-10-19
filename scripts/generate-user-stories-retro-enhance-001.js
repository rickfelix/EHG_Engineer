#!/usr/bin/env node
/**
 * Generate User Stories for SD-RETRO-ENHANCE-001
 *
 * Creates 9 user stories mapped to PRD functional requirements:
 * - FR-1: Multi-Application Context (US-001, US-002)
 * - FR-2: Code Traceability (US-003)
 * - FR-3: Semantic Search (US-004, US-005)
 * - FR-4: 4-Layer Enforcement (US-006)
 * - FR-5: Backfill Existing Records (US-007)
 * - FR-6: Integration with SD-KNOWLEDGE-001 (US-008, US-009)
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
    story_key: 'SD-RETRO-ENHANCE-001:US-001',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Multi-Application Context - Target Application Field',
    user_role: 'retrospective generator',
    user_want: 'every retrospective to identify its target application (EHG_engineer, EHG, venture_*)',
    user_benefit: 'I can filter retrospectives by application context',
    acceptance_criteria: [
      'target_application field added with NOT NULL constraint',
      'Valid values: EHG_engineer, EHG, venture_* pattern',
      'Database constraint enforces valid values',
      'All retrospectives have target_application set'
    ],
    priority: 'critical',
    story_points: 3,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-002',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Multi-Application Context - Learning Category Field',
    user_role: 'knowledge retrieval system',
    user_want: 'every retrospective categorized by learning type (APPLICATION_ISSUE, PROCESS_IMPROVEMENT, etc.)',
    user_benefit: 'I can find relevant lessons efficiently',
    acceptance_criteria: [
      'learning_category field added with NOT NULL constraint',
      'Valid categories: APPLICATION_ISSUE, PROCESS_IMPROVEMENT, TESTING_STRATEGY, DATABASE_SCHEMA, DEPLOYMENT_ISSUE, PERFORMANCE_OPTIMIZATION, USER_EXPERIENCE, SECURITY_VULNERABILITY, DOCUMENTATION',
      'applies_to_all_apps auto-populates based on category',
      'Database trigger enforces category-based business rules'
    ],
    priority: 'critical',
    story_points: 3,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-003',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Code Traceability - Link Retrospectives to Source Code',
    user_role: 'developer investigating an issue',
    user_want: 'retrospectives linked to specific files, commits, PRs, and components',
    user_benefit: 'I can quickly find related code and understand context',
    acceptance_criteria: [
      'related_files array field with GIN index',
      'related_commits array field for git SHAs',
      'related_prs array field for PR URLs/numbers',
      'affected_components array field for component names',
      'tags array field for categorization',
      'APPLICATION_ISSUE retrospectives require at least one affected_component',
      'CRITICAL/HIGH severity require at least one tag'
    ],
    priority: 'high',
    story_points: 5,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-004',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Semantic Search - Generate Embeddings for Retrospectives',
    user_role: 'knowledge retrieval system',
    user_want: 'retrospectives to have embeddings generated from their content',
    user_benefit: 'I can find conceptually similar retrospectives beyond keyword matching',
    acceptance_criteria: [
      'content_embedding vector(1536) field added',
      'OpenAI text-embedding-3-small model used',
      'generate-retrospective-embeddings.js script created',
      'Only PUBLISHED retrospectives have embeddings',
      'Embedding generation costs <$0.01/year for 97 retrospectives'
    ],
    priority: 'critical',
    story_points: 5,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-005',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Semantic Search - Implement Vector Similarity Search',
    user_role: 'knowledge retrieval system',
    user_want: 'to search retrospectives by semantic similarity using vector embeddings',
    user_benefit: 'I can find "authentication problems" when searching for "login issues"',
    acceptance_criteria: [
      'match_retrospectives() RPC function created',
      'IVFFlat index on content_embedding for efficient search',
      'Cosine distance similarity measure',
      'Combined semantic search with structured filters (application, category, severity)',
      'Search returns results ranked by similarity score'
    ],
    priority: 'critical',
    story_points: 5,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-006',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: '4-Layer Enforcement - Prevent Invalid Retrospectives',
    user_role: 'retrospective quality enforcer',
    user_want: '4 independent validation layers (database, triggers, application, CI/CD)',
    user_benefit: 'invalid retrospectives are impossible to create',
    acceptance_criteria: [
      'Layer 1: Database constraints (target_application, learning_category, severity_level, published_embedding, time_to_resolve)',
      'Layer 2: Triggers (field-specific validation, auto-population)',
      'Layer 3: Application validation in generate-comprehensive-retrospective.js',
      'Layer 4: CI/CD gates in retrospective-quality-gates.yml',
      'Each layer tested independently',
      'Zero retrospectives with invalid data post-deployment'
    ],
    priority: 'critical',
    story_points: 8,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-007',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Backfill Existing Records - Update 97 Retrospectives',
    user_role: 'retrospective system administrator',
    user_want: 'all 97 existing retrospectives enhanced with new fields',
    user_benefit: 'the entire retrospective history benefits from improvements',
    acceptance_criteria: [
      'backfill-retrospective-enhancements.js script created',
      'Batch processing (10 at a time) to prevent timeouts',
      'Retry logic with exponential backoff',
      'Progress tracking with resume capability',
      'All 97 retrospectives updated successfully',
      'Backfill completes in <2 hours',
      'No data loss during backfill'
    ],
    priority: 'high',
    story_points: 5,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-008',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Knowledge Integration - Enhance automated-knowledge-retrieval.js',
    user_role: 'automated knowledge retrieval system',
    user_want: 'to use semantic search and structured filters',
    user_benefit: 'I find 3x more relevant retrospectives per query',
    acceptance_criteria: [
      'automated-knowledge-retrieval.js updated to use match_retrospectives()',
      'Semantic search combines with application filters',
      'Learning category filters applied when appropriate',
      '3x more relevant results vs keyword-only baseline (measured on 20 test queries)',
      'Research confidence improves from 85% to 95%'
    ],
    priority: 'high',
    story_points: 5,
    status: 'ready',
    created_by: 'PLAN Agent'
  },
  {
    story_key: 'SD-RETRO-ENHANCE-001:US-009',
    sd_id: 'SD-RETRO-ENHANCE-001',
    prd_id: 'PRD-RETRO-ENHANCE-001',
    title: 'Cross-Application Learning - Enable Process Improvement Adoption',
    user_role: 'venture creator',
    user_want: 'to discover process improvements from other applications',
    user_benefit: 'I can avoid repeating mistakes and adopt best practices',
    acceptance_criteria: [
      'applies_to_all_apps field auto-populated for PROCESS_IMPROVEMENT category',
      'Cross-application queries return relevant retrospectives',
      '60% of new ventures reference process improvements (measured over 3 months)',
      'Venture-specific filtering via venture_* pattern',
      'Dashboard shows cross-application learning metrics'
    ],
    priority: 'medium',
    story_points: 5,
    status: 'ready',
    created_by: 'PLAN Agent'
  }
];

async function generateUserStories() {
  console.log('📋 Generating 9 User Stories for SD-RETRO-ENHANCE-001...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating ${story.story_key}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ ${story.story_key}: ${story.title}`);
      successCount++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 User Story Generation Complete: ${successCount}/${userStories.length} created`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  if (errorCount > 0) {
    console.error(`⚠️  ${errorCount} error(s) encountered`);
    process.exit(1);
  }

  console.log('✅ All user stories created successfully!');
  console.log('');
  console.log('📊 Story Breakdown:');
  console.log('   Critical Priority: 5 stories (US-001, US-002, US-004, US-005, US-006)');
  console.log('   High Priority: 3 stories (US-003, US-007, US-008)');
  console.log('   Medium Priority: 1 story (US-009)');
  console.log('');
  console.log('   Total Story Points: 44 points');
  console.log('   Estimated Effort: 88-132 hours (matches PRD estimate of 120 hours)');
  console.log('');
  console.log('🚀 Ready for PLAN→EXEC handoff!');
}

generateUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
