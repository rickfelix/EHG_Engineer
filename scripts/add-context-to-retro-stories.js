#!/usr/bin/env node
/**
 * Add Implementation Context to SD-RETRO-ENHANCE-001 User Stories
 *
 * BMAD Requirement: ≥80% of user stories must have implementation_context
 * This script adds detailed implementation guidance to all 9 user stories.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const storyContexts = {
  'SD-RETRO-ENHANCE-001:US-001': `
Implementation Steps:
1. Create migration adding target_application column to retrospectives table
2. Add NOT NULL constraint with CHECK for valid values (EHG_engineer, EHG, venture_*)
3. Update generate-comprehensive-retrospective.js to set target_application from SD context
4. Test constraint enforcement with invalid values

Technical Approach:
- Column: target_application TEXT NOT NULL CHECK (target_application IN ('EHG_engineer', 'EHG') OR target_application LIKE 'venture_%')
- Default: EHG_engineer (for EHG_Engineer codebase retrospectives)
- Index: B-tree on target_application for filtering performance

Dependencies: None
Estimated LOC: ~50 (migration + script update)
Risk Level: LOW - simple column addition with constraint
`,

  'SD-RETRO-ENHANCE-001:US-002': `
Implementation Steps:
1. Create migration adding learning_category and applies_to_all_apps columns
2. Add NOT NULL constraint on learning_category with CHECK for 9 valid categories
3. Create trigger auto_populate_applies_to_all_apps() that sets true for PROCESS_IMPROVEMENT category
4. Update generate-comprehensive-retrospective.js to categorize retrospectives
5. Test trigger logic and category validation

Technical Approach:
- Column: learning_category TEXT NOT NULL CHECK (9 categories enum)
- Column: applies_to_all_apps BOOLEAN DEFAULT FALSE
- Trigger: BEFORE INSERT OR UPDATE on retrospectives, auto-populate based on category
- Categorization logic: Analyze retrospective content for keywords, map to appropriate category

Dependencies: US-001 (same migration file)
Estimated LOC: ~150 (migration + trigger + script logic)
Risk Level: MEDIUM - requires smart categorization logic
`,

  'SD-RETRO-ENHANCE-001:US-003': `
Implementation Steps:
1. Create migration adding 5 array columns: related_files, related_commits, related_prs, affected_components, tags
2. Create GIN indexes on all array columns for array operations
3. Create trigger validate_code_traceability() for business rules
4. Update generate-comprehensive-retrospective.js to extract file paths, commits, components from handoff data
5. Test array operations and trigger enforcement

Technical Approach:
- Columns: TEXT[] arrays for all 5 fields
- Indexes: CREATE INDEX USING GIN for efficient array search
- Trigger: BEFORE INSERT OR UPDATE, validate APPLICATION_ISSUE has affected_components, CRITICAL/HIGH has tags
- Extraction: Parse handoff markdown for file paths (*.js, *.tsx), commit SHAs (git patterns), PR numbers

Dependencies: US-002 (learning_category used in trigger)
Estimated LOC: ~200 (migration + trigger + extraction logic)
Risk Level: MEDIUM - array operations + trigger complexity
`,

  'SD-RETRO-ENHANCE-001:US-004': `
Implementation Steps:
1. Create migration adding content_embedding vector(1536) column (pgvector extension)
2. Create generate-retrospective-embeddings.js script using OpenAI API
3. Implement embedding generation: concatenate title + key_learnings + action_items
4. Add retry logic with exponential backoff for API calls
5. Test embedding generation with PUBLISHED retrospectives only

Technical Approach:
- Column: content_embedding vector(1536) (OpenAI text-embedding-3-small model)
- API: OpenAI embeddings endpoint with rate limit handling (3000 req/min)
- Content: Combine meaningful text fields, send to OpenAI, store vector
- Cost: ~$0.02 per 1000 tokens, estimated $0.01/year for 97 retrospectives
- Constraint: PUBLISHED retrospectives must have embeddings (added in US-006)

Dependencies: None (standalone)
Estimated LOC: ~100 (migration + embedding script)
Risk Level: LOW - straightforward API integration
`,

  'SD-RETRO-ENHANCE-001:US-005': `
Implementation Steps:
1. Create IVFFlat index on content_embedding column (after US-004 column exists)
2. Create match_retrospectives() RPC function using cosine distance similarity
3. Implement combined semantic + structured filters (application, category, severity)
4. Test search quality with sample queries
5. Benchmark performance (<100ms average)

Technical Approach:
- Index: CREATE INDEX USING ivfflat (content_embedding vector_cosine_ops) WITH (lists = 100)
- RPC Function: match_retrospectives(query_embedding vector(1536), match_threshold float, match_count int, filters jsonb)
- Distance: 1 - (content_embedding <=> query_embedding) AS similarity
- Filters: AND conditions for target_application, learning_category, severity_level
- Return: ORDER BY similarity DESC LIMIT match_count

Dependencies: US-004 (content_embedding column must exist)
Estimated LOC: ~150 (migration + RPC function)
Risk Level: MEDIUM - vector search performance tuning required
`,

  'SD-RETRO-ENHANCE-001:US-006': `
Implementation Steps:
1. Layer 1: Create 5 database constraints (target_application, learning_category, severity_level, published_embedding, time_to_resolve)
2. Layer 2: Enhance auto_validate_retrospective_quality() trigger with field-specific validation
3. Layer 3: Enhance validateRetrospective() function in generate-comprehensive-retrospective.js
4. Layer 4: Create .github/workflows/retrospective-quality-gates.yml with 3 validation jobs
5. Test each layer independently

Technical Approach:
- Layer 1: ALTER TABLE ADD CONSTRAINT (constraints block invalid data at database level)
- Layer 2: CREATE OR REPLACE FUNCTION + TRIGGER (business rule enforcement)
- Layer 3: validateRetrospective() returns {valid, errors[]} before insert (application-level)
- Layer 4: GitHub Actions runs validation on retrospective generation scripts (CI/CD-level)
- Testing: Unit tests for each layer, integration test proving all 4 layers work together

Dependencies: US-001, US-002, US-003, US-004, US-005 (all fields must exist)
Estimated LOC: ~300 (constraints + trigger enhancement + validation + workflow)
Risk Level: HIGH - complex multi-layer system, extensive testing required
`,

  'SD-RETRO-ENHANCE-001:US-007': `
Implementation Steps:
1. Create backfill-retrospective-enhancements.js script
2. Implement batch processing (10 at a time) using Promise.all with chunk logic
3. Add retry logic with exponential backoff for failures
4. Implement progress tracking (store progress in JSON file for resume capability)
5. Test backfill on staging with 97 retrospectives

Technical Approach:
- Batch: SELECT * FROM retrospectives WHERE target_application IS NULL LIMIT 10, process, repeat
- Retry: try/catch with 3 retries, exponential backoff (1s, 2s, 4s)
- Progress: Write {lastProcessedId, successCount, errorCount} to backfill-progress.json
- Resume: Read progress file, skip already-processed records
- Target fields: target_application (infer from SD), learning_category (analyze content), affected_components (empty array OK for non-APPLICATION_ISSUE)

Dependencies: US-001, US-002 (fields must exist)
Estimated LOC: ~250 (script + batch logic + retry + progress tracking)
Risk Level: HIGH - 97 records at risk, must have rollback plan
`,

  'SD-RETRO-ENHANCE-001:US-008': `
Implementation Steps:
1. Update automated-knowledge-retrieval.js to call match_retrospectives() RPC
2. Generate embeddings for search queries using OpenAI API
3. Combine semantic search results with structured filters (application, category)
4. Measure relevance improvement (3x target) on 20 test queries
5. Update confidence score calculation to 95% threshold

Technical Approach:
- Query Flow: User query → OpenAI embedding → match_retrospectives(embedding, filters) → ranked results
- Filters: Extract application context from query, apply category filters if mentioned
- Relevance: Baseline (keyword search) vs Enhanced (semantic + filters), measure precision@5
- Confidence: If ≥3 high-similarity results (score >0.8), confidence = 95%, else 85%
- Fallback: If semantic search times out (>100ms), fall back to keyword search

Dependencies: US-004, US-005 (semantic search infrastructure must exist)
Estimated LOC: ~200 (script updates + measurement logic)
Risk Level: MEDIUM - requires measurement validation
`,

  'SD-RETRO-ENHANCE-001:US-009': `
Implementation Steps:
1. Update applies_to_all_apps auto-population logic for PROCESS_IMPROVEMENT category
2. Create cross-application query filters in dashboard
3. Implement venture-specific filtering with venture_* pattern matching
4. Add learning metrics dashboard widget (60% adoption target)
5. Test cross-application queries return relevant results

Technical Approach:
- Auto-population: Trigger sets applies_to_all_apps = TRUE for PROCESS_IMPROVEMENT automatically
- Query: SELECT * FROM retrospectives WHERE applies_to_all_apps = TRUE OR target_application = 'venture_xyz'
- Dashboard: Widget showing "Process Improvements" with adoption metrics (# ventures referencing, % adoption)
- Measurement: Track ventures created after enhancement deployment, measure reference rate

Dependencies: US-002 (learning_category and applies_to_all_apps must exist)
Estimated LOC: ~150 (trigger logic + dashboard widget)
Risk Level: LOW - straightforward UI addition
`
};

async function addImplementationContext() {
  console.log('📋 Adding Implementation Context to 9 User Stories...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [storyKey, implementationContext] of Object.entries(storyContexts)) {
    const { data, error } = await supabase
      .from('user_stories')
      .update({ implementation_context: implementationContext.trim() })
      .eq('story_key', storyKey)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error updating ${storyKey}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ ${storyKey}: Implementation context added`);
      successCount++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 Context Addition Complete: ${successCount}/${Object.keys(storyContexts).length} updated`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  if (errorCount > 0) {
    console.error(`⚠️  ${errorCount} error(s) encountered`);
    process.exit(1);
  }

  console.log('✅ All user stories have implementation context!');
  console.log('📊 Coverage: 100% (9/9 stories)');
  console.log('✅ BMAD requirement met (≥80% coverage)');
}

addImplementationContext().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
