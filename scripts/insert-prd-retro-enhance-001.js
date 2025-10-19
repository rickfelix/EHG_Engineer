#!/usr/bin/env node

/**
 * Insert PRD for SD-RETRO-ENHANCE-001
 * Following the exact schema pattern from create-prd-knowledge-001-v2.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function insertPRD() {
  console.log('\n📋 Inserting PRD for SD-RETRO-ENHANCE-001');
  console.log('='.repeat(60));

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, uuid_id')
    .eq('id', 'SD-RETRO-ENHANCE-001')
    .single();

  if (sdError || !sd) {
    throw new Error(`SD not found: ${sdError?.message}`);
  }

  console.log(`🎯 Target SD: ${sd.title}\n`);

  const prd = {
    id: 'PRD-RETRO-ENHANCE-001',
    sd_id: sd.id,
    sd_uuid: sd.uuid_id,  // REQUIRED for handoffs
    title: 'Enhanced Retrospective System with Multi-Application Support & Semantic Search',
    version: '1.0.0',
    status: 'approved',

    executive_summary: 'Enhance the retrospective system with multi-application context, code traceability, semantic search, and 4-layer quality enforcement. This transforms retrospectives from static documents into an active, intelligent knowledge management system that scales across multiple applications (EHG, EHG_engineer, ventures). Expected impact: 3x more relevant retrospectives per query, 95% research confidence, 60% venture adoption of process improvements.',

    functional_requirements: [
      'Multi-Application Context: target_application, learning_category, applies_to_all_apps fields with NOT NULL constraints',
      'Code Traceability: related_files, related_commits, related_prs, affected_components, tags arrays with GIN indexes',
      'Semantic Search: content_embedding vector(1536) with OpenAI text-embedding-3-small model',
      '4-Layer Enforcement: Database constraints → Triggers → Application validation → CI/CD gates',
      'Backfill 97 existing retrospectives with new field values in batches of 10',
      'Integration with SD-KNOWLEDGE-001 automated knowledge retrieval for enhanced search'
    ],

    technical_requirements: [
      'Add 9 new columns to retrospectives table (application context, code traceability, search, embeddings)',
      'Create 5 new constraints (target_application, learning_category, severity_level, published_embedding, time_to_resolve)',
      'Enhance auto_validate_retrospective_quality() trigger with field-specific validation',
      'Create 4 new indexes (GIN for arrays, IVFFlat for vectors, B-tree for application)',
      'Create match_retrospectives() RPC function for semantic search with cosine distance',
      'Update generate-comprehensive-retrospective.js with enhanced validateRetrospective() function',
      'Create generate-retrospective-embeddings.js for OpenAI integration',
      'Create backfill-retrospective-enhancements.js with batch processing',
      'Update automated-knowledge-retrieval.js to use semantic search + structured filters',
      'Create GitHub Actions workflow: retrospective-quality-gates.yml with 3 validation jobs'
    ],

    acceptance_criteria: [
      '100% of retrospectives have target_application (database constraint enforces)',
      '100% of retrospectives have learning_category (database constraint enforces)',
      '100% of CRITICAL/HIGH severity have tags (trigger enforces)',
      '100% of APPLICATION_ISSUE have affected_components (trigger enforces)',
      '100% of PUBLISHED retrospectives have embeddings (database constraint enforces)',
      '90%+ semantic search relevance (user feedback validation)',
      '3x more relevant retrospectives found per query (vs keyword-only baseline)',
      'SD-KNOWLEDGE-001 research confidence: 85% → 95%',
      'Cross-application learning adoption: 60% of new ventures reference process improvements',
      'All 4 enforcement layers active and tested independently',
      'All 10 documentation files complete',
      'All 97 existing retrospectives backfilled successfully',
      'CI/CD gates prevent merging invalid code',
      'Zero retrospectives with invalid data post-deployment'
    ],

    test_scenarios: JSON.stringify([
      {
        id: 'TS-1',
        scenario: 'Insert retrospective without target_application',
        expected: 'Rejected with NOT NULL constraint error and clear message'
      },
      {
        id: 'TS-2',
        scenario: 'Insert APPLICATION_ISSUE without affected_components',
        expected: 'Rejected by trigger with validation error'
      },
      {
        id: 'TS-3',
        scenario: 'Semantic search for "authentication problems"',
        expected: 'Returns conceptually similar retrospectives (OAuth, login, session) ranked by similarity'
      },
      {
        id: 'TS-4',
        scenario: 'Backfill 97 existing retrospectives',
        expected: 'All records updated with target_application and learning_category in <2 hours'
      },
      {
        id: 'TS-5',
        scenario: 'automated-knowledge-retrieval.js uses enhanced search',
        expected: '3x more relevant results, 95% confidence score'
      },
      {
        id: 'TS-6',
        scenario: 'CI/CD gate validates retrospective field requirements',
        expected: 'PR blocked if generate-comprehensive-retrospective.js missing required fields'
      }
    ], null, 2),

    non_functional_requirements: {
      performance: 'Constraint overhead <5ms, trigger execution <10ms, vector search <100ms average, backfill <2 hours for 97 records',
      scalability: 'Support unlimited venture applications via venture_* pattern, IVFFlat index for efficient vector search',
      reliability: '4-layer defense-in-depth enforcement, comprehensive test coverage (45 tests total)',
      cost: 'OpenAI embedding generation: ~$0.01/year for 97 retrospectives',
      maintainability: '10 comprehensive documentation files covering all aspects'
    },

    risks: [
      {
        risk: 'Backfill of 97 records may timeout',
        severity: 'HIGH',
        mitigation: 'Batch processing (10 at a time), retry logic with exponential backoff, progress tracking with resume capability, test on staging first'
      },
      {
        risk: 'Embedding generation costs exceed budget',
        severity: 'LOW',
        mitigation: 'Use cheapest model (text-embedding-3-small), generate only for PUBLISHED, cache embeddings (never regenerate), monitor costs in OpenAI dashboard. Estimated: ~$0.01/year'
      },
      {
        risk: 'Constraint violations in existing code',
        severity: 'MEDIUM',
        mitigation: 'Add constraints as deferred initially, test all scripts on staging, Layer 3 validation catches issues pre-insert, clear error messages with fix suggestions'
      },
      {
        risk: 'Vector search performance issues',
        severity: 'MEDIUM',
        mitigation: 'IVFFlat index with appropriate lists parameter (100), test with 97+ records, fallback to keyword search if timeout, monitor query performance'
      },
      {
        risk: 'Breaking changes to retrospective generation',
        severity: 'LOW',
        mitigation: 'Backward compatibility (new fields have defaults), extensive testing (45 tests total), staged rollout (staging → production), rollback plan ready'
      }
    ],

    dependencies: [
      'SD-KNOWLEDGE-001 (completed) - automated-knowledge-retrieval.js exists for integration',
      'Prevention Infrastructure (completed) - schema-validator.js and safe-insert.js for Layer 3 enforcement',
      'Retrospectives Table (exists) - current schema with 47 columns ready for enhancements',
      'OpenAI API Access (required) - for embedding generation (~$0.01/year cost)',
      'pgvector Extension (available) - built into Supabase for vector similarity search',
      'GitHub Actions (available) - for CI/CD quality gates'
    ],

    metadata: {
      priority: 'HIGH',
      estimated_hours: 120,
      // FIX: complexity_score moved to metadata
      // complexity_score: 8,
      story_points: 34,
      security_impact: 'LOW',
      // FIX: database_changes moved to metadata
      // database_changes: 9,
      new_constraints: 5,
      new_indexes: 4,
      code_files_modified: 4,
      documentation_files: 10,
      test_count: 45,
      backfill_record_count: 97
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, title, status');

  if (error) {
    console.error('❌ Error:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    throw error;
  }

  console.log('\n✅ PRD inserted successfully!');
  console.log(`   ID: ${data[0].id}`);
  console.log(`   Title: ${data[0].title}`);
  console.log(`   Status: ${data[0].status}`);
  console.log('\n📊 Requirements Summary:');
  console.log(`   - Functional Requirements: ${prd.functional_requirements.length}`);
  console.log(`   - Technical Requirements: ${prd.technical_requirements.length}`);
  console.log(`   - Acceptance Criteria: ${prd.acceptance_criteria.length}`);
  console.log(`   - Test Scenarios: ${JSON.parse(prd.test_scenarios).length}`);
  console.log(`   - Risks: ${prd.risks.length}`);
  console.log(`   - Dependencies: ${prd.dependencies.length}`);
  console.log(`   - Complexity Score: ${prd.metadata.complexity_score}/10`);
  console.log(`   - Estimated Effort: ${prd.metadata.estimated_hours} hours`);
  console.log('\n📄 Detailed PRD: prds/PRD-RETRO-ENHANCE-001.md');
  console.log('\n🎯 PLAN phase complete - Ready for PLAN→EXEC handoff');

  return data[0];
}

insertPRD().catch(error => {
  console.error('\n❌ Failed to insert PRD:', error.message);
  process.exit(1);
});
