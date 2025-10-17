#!/usr/bin/env node

/**
 * Create PRD for SD-RETRO-ENHANCE-001
 * Enhanced Retrospective System with Multi-Application Support & Semantic Search
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('\n📋 Creating PRD for SD-RETRO-ENHANCE-001');
  console.log('='.repeat(60));

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', 'SD-RETRO-ENHANCE-001')
    .single();

  if (sdError || !sd) {
    throw new Error(`SD not found: ${sdError?.message}`);
  }

  console.log(`SD UUID: ${sd.uuid_id}`);

  const prd = {
    id: randomUUID(),
    prd_id: 'PRD-RETRO-ENHANCE-001',
    strategic_directive_id: sd.uuid_id,
    version: '1.0',
    status: 'APPROVED',
    created_by: 'PLAN',

    // Summary
    title: 'Enhanced Retrospective System with Multi-Application Support & Semantic Search',
    executive_summary: 'Enhance the retrospective system with multi-application context, code traceability, semantic search, and 4-layer quality enforcement. This transforms retrospectives from static documents into an active, intelligent knowledge management system that scales across multiple applications (EHG, EHG_engineer, ventures).',

    // Requirements
    functional_requirements: [
      {
        id: 'FR-1',
        title: 'Multi-Application Context',
        description: 'Every retrospective must identify its target application and learning category',
        acceptance_criteria: [
          'target_application is required (NOT NULL constraint)',
          'target_application validates as EHG_engineer, EHG, or venture_*',
          'learning_category is required (NOT NULL constraint)',
          'learning_category validates against 9 predefined categories',
          'applies_to_all_apps auto-populates based on category'
        ],
        priority: 'CRITICAL',
        user_story_id: 'US-001'
      },
      {
        id: 'FR-2',
        title: 'Code Traceability',
        description: 'Link retrospectives to source code for pattern analysis',
        acceptance_criteria: [
          'related_files accepts array of file paths',
          'related_commits accepts array of git SHAs',
          'related_prs accepts array of PR URLs/numbers',
          'affected_components accepts array of component names',
          'tags accepts array of categorization tags',
          'APPLICATION_ISSUE requires at least one affected_component',
          'CRITICAL/HIGH severity requires at least one tag'
        ],
        priority: 'HIGH',
        user_story_ids: ['US-002', 'US-003']
      },
      {
        id: 'FR-3',
        title: 'Semantic Search',
        description: 'Enable concept-based retrospective discovery using embeddings',
        acceptance_criteria: [
          'content_embedding stores vector(1536) from OpenAI',
          'match_retrospectives() RPC function searches by similarity',
          'IVFFlat index enables efficient vector search',
          'PUBLISHED retrospectives must have embeddings',
          'Semantic search combines with structured filters'
        ],
        priority: 'CRITICAL',
        user_story_ids: ['US-004', 'US-005']
      },
      {
        id: 'FR-4',
        title: '4-Layer Enforcement',
        description: 'Prevent invalid data at 4 independent levels',
        acceptance_criteria: [
          'Layer 1: Database constraints block invalid data',
          'Layer 2: Triggers enforce business rules and auto-populate fields',
          'Layer 3: Application validation provides clear error messages',
          'Layer 4: CI/CD gates prevent merging bad code',
          'Each layer tested independently',
          'All layers operational and verifiable'
        ],
        priority: 'CRITICAL',
        user_story_ids: ['US-006', 'US-007']
      },
      {
        id: 'FR-5',
        title: 'Backfill Existing Records',
        description: 'Update 97 existing retrospectives with new fields',
        acceptance_criteria: [
          'All retrospectives have valid target_application',
          'All retrospectives have valid learning_category',
          'Embeddings generated for all PUBLISHED retrospectives',
          'Backfill script runs in batches (10 at a time)',
          'Backfill completes in <2 hours',
          'No data loss during backfill'
        ],
        priority: 'CRITICAL',
        user_story_id: 'US-008'
      },
      {
        id: 'FR-6',
        title: 'Integration with SD-KNOWLEDGE-001',
        description: 'Enhance automated knowledge retrieval with new fields',
        acceptance_criteria: [
          'automated-knowledge-retrieval.js uses semantic search',
          'Filters by target_application when appropriate',
          'Filters by learning_category for specific types',
          'Returns 3x more relevant results (measured)',
          'Research confidence improves to 95%'
        ],
        priority: 'HIGH',
        user_story_id: 'US-009'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        title: 'Database Requirements',
        description: 'pgvector extension with PostgreSQL 14+',
        details: 'Supabase includes pgvector by default. Performance targets: constraint overhead <5ms, trigger execution <10ms, vector search <100ms average.',
        dependencies: ['pgvector 0.5.0+']
      },
      {
        id: 'TR-2',
        title: 'OpenAI API Requirements',
        description: 'text-embedding-3-small model for embedding generation',
        details: 'Cost: ~$0.01/year for 97 retrospectives. Rate limits: 3,000 requests per minute. Exponential backoff with retries.',
        dependencies: ['OPENAI_API_KEY environment variable']
      },
      {
        id: 'TR-3',
        title: 'Application Requirements',
        description: 'Node.js v18+ with required dependencies',
        details: '@supabase/supabase-js ^2.38.0, openai ^4.20.0, dotenv ^16.0.0',
        dependencies: ['Node.js 18+', 'npm packages']
      },
      {
        id: 'TR-4',
        title: 'CI/CD Requirements',
        description: 'GitHub Actions workflow for quality gates',
        details: '3 validation jobs: field validation, embedding verification, schema consistency. Block merge if any job fails.',
        dependencies: ['GitHub Actions']
      },
      {
        id: 'TR-5',
        title: 'Testing Requirements',
        description: '45 tests total across unit, integration, and E2E',
        details: '33 unit tests (constraints, triggers, validation), 8 integration tests (search, backfill, integration), 4 E2E tests (full flows).',
        dependencies: ['Test framework']
      }
    ],

    acceptance_criteria: [
      '100% of retrospectives have target_application (database constraint enforces)',
      '100% of retrospectives have learning_category (database constraint enforces)',
      '100% of CRITICAL/HIGH severity have tags (trigger enforces)',
      '100% of APPLICATION_ISSUE have affected_components (trigger enforces)',
      '100% of PUBLISHED retrospectives have embeddings (database constraint enforces)',
      '90%+ semantic search relevance (user feedback validation)',
      '3x more relevant retrospectives found per query (vs keyword-only)',
      'SD-KNOWLEDGE-001 research confidence: 85% → 95%',
      'Cross-application learning adoption: 60% of new ventures reference process improvements',
      'All 4 enforcement layers active and tested',
      'All 10 documentation files complete',
      'All 97 existing retrospectives backfilled successfully',
      'CI/CD gates prevent merging invalid code',
      'Zero retrospectives with invalid data post-deployment'
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        title: 'Database Constraints',
        description: 'Verify all constraints enforce data integrity',
        steps: [
          'Insert retrospective without target_application',
          'Insert retrospective with invalid target_application',
          'Insert retrospective without learning_category',
          'Insert retrospective with invalid learning_category',
          'Insert PUBLISHED retrospective without content_embedding'
        ],
        expected_result: 'All invalid inserts rejected with clear error messages'
      },
      {
        id: 'TS-2',
        title: 'Trigger Validation',
        description: 'Verify triggers enforce business rules',
        steps: [
          'Insert APPLICATION_ISSUE without affected_components',
          'Insert CRITICAL severity without tags',
          'Insert PROCESS_IMPROVEMENT and verify applies_to_all_apps = true'
        ],
        expected_result: 'All validation rules enforced, auto-population works'
      },
      {
        id: 'TS-3',
        title: 'Semantic Search',
        description: 'Verify semantic search finds relevant retrospectives',
        steps: [
          'Generate embedding for query "authentication problems"',
          'Call match_retrospectives() with embedding',
          'Verify results include OAuth, login, session issues',
          'Apply filters (application, category, severity)',
          'Verify filtered results are correct'
        ],
        expected_result: 'Semantic search returns conceptually similar retrospectives, filters work correctly'
      },
      {
        id: 'TS-4',
        title: 'Backfill Process',
        description: 'Verify backfill updates all 97 retrospectives',
        steps: [
          'Run backfill script on staging',
          'Verify all retrospectives have target_application',
          'Verify all retrospectives have learning_category',
          'Verify PUBLISHED retrospectives have embeddings',
          'Verify no data loss'
        ],
        expected_result: 'All 97 retrospectives updated successfully in <2 hours'
      },
      {
        id: 'TS-5',
        title: 'SD-KNOWLEDGE-001 Integration',
        description: 'Verify enhanced knowledge retrieval',
        steps: [
          'Query automated-knowledge-retrieval.js for "React hooks"',
          'Count results from semantic search',
          'Compare with baseline keyword search',
          'Measure confidence score improvement'
        ],
        expected_result: '3x more relevant results, 95% confidence score'
      },
      {
        id: 'TS-6',
        title: 'CI/CD Gates',
        description: 'Verify CI/CD workflow blocks invalid code',
        steps: [
          'Create PR with generate-comprehensive-retrospective.js missing target_application',
          'Verify field validation job fails',
          'Fix code and verify job passes',
          'Verify PR can merge only after passing'
        ],
        expected_result: 'CI/CD gates prevent merging invalid code'
      }
    ],

    // Metadata
    complexity_score: 8,
    estimated_effort_hours: 120,
    target_completion_date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(), // 4 weeks

    risks_and_mitigations: [
      {
        risk: 'Backfill of 97 records may timeout',
        likelihood: 'HIGH',
        impact: 'MEDIUM',
        mitigation: 'Batch processing (10 at a time), retry logic with exponential backoff, progress tracking with resume capability'
      },
      {
        risk: 'Embedding generation costs exceed budget',
        likelihood: 'LOW',
        impact: 'LOW',
        mitigation: 'Use cheapest model (text-embedding-3-small), generate only for PUBLISHED, cache embeddings, monitor costs'
      },
      {
        risk: 'Constraint violations in existing code',
        likelihood: 'MEDIUM',
        impact: 'MEDIUM',
        mitigation: 'Add constraints as deferred initially, test all scripts on staging, Layer 3 validation catches issues pre-insert'
      },
      {
        risk: 'Vector search performance issues',
        likelihood: 'MEDIUM',
        impact: 'MEDIUM',
        mitigation: 'IVFFlat index with appropriate lists parameter, test with 97+ records, fallback to keyword search if timeout'
      },
      {
        risk: 'Breaking changes to retrospective generation',
        likelihood: 'LOW',
        impact: 'HIGH',
        mitigation: 'Backward compatibility (new fields have defaults), extensive testing (45 tests), staged rollout, rollback plan ready'
      }
    ],

    dependencies: [
      'SD-KNOWLEDGE-001 (completed) - automated-knowledge-retrieval.js exists',
      'Prevention Infrastructure (completed) - schema-validator.js and safe-insert.js exist',
      'Retrospectives Table (exists) - current schema with 47 columns',
      'OpenAI API Access (required) - for embedding generation',
      'pgvector Extension (available) - built into Supabase',
      'GitHub Actions (available) - for CI/CD gates'
    ],

    success_metrics: [
      {
        metric: 'Field Compliance',
        target: '100%',
        measurement: 'Database query counting retrospectives with required fields'
      },
      {
        metric: 'Invalid Data Rate',
        target: '0%',
        measurement: 'Zero retrospectives with constraint violations post-deployment'
      },
      {
        metric: 'Semantic Search Relevance',
        target: '90%+',
        measurement: 'User feedback validation via feedback form'
      },
      {
        metric: 'Search Result Improvement',
        target: '3x',
        measurement: 'Compare semantic vs keyword search across 20 test queries'
      },
      {
        metric: 'Research Confidence',
        target: '95%',
        measurement: 'SD-KNOWLEDGE-001 integration confidence score'
      },
      {
        metric: 'Cross-App Learning Adoption',
        target: '60%',
        measurement: 'New ventures referencing process improvements (applies_to_all_apps usage)'
      },
      {
        metric: 'Constraint Overhead',
        target: '<5ms',
        measurement: 'Database query timing for inserts'
      },
      {
        metric: 'Vector Search Latency',
        target: '<100ms',
        measurement: 'match_retrospectives() average query time'
      },
      {
        metric: 'Test Pass Rate',
        target: '100%',
        measurement: '45/45 tests passing'
      }
    ],

    documentation_requirements: [
      {
        file: 'retrospective-schema-reference.md',
        type: 'UPDATE',
        description: 'Complete column reference with new fields, constraints, indexes'
      },
      {
        file: 'retrospective-generation-guide.md',
        type: 'CREATE',
        description: 'How to generate retrospectives with new fields, validation requirements'
      },
      {
        file: 'retrospective-search-guide.md',
        type: 'CREATE',
        description: 'Semantic search usage, filter combinations, query optimization'
      },
      {
        file: 'retrospective-enhancement-migration-guide.md',
        type: 'CREATE',
        description: 'Migration steps, backfill process, rollback procedures'
      },
      {
        file: 'retrospective-api.md',
        type: 'UPDATE',
        description: 'match_retrospectives() RPC reference, parameters, examples'
      },
      {
        file: 'leo-retrospective-integration.md',
        type: 'CREATE',
        description: 'SD-KNOWLEDGE-001 integration, usage in automated retrieval'
      },
      {
        file: 'retrospective-validation-gates.md',
        type: 'CREATE',
        description: '4-layer enforcement explanation, each layer detailed'
      },
      {
        file: 'retrospective-examples.md',
        type: 'CREATE',
        description: 'Complete retrospective examples, each learning_category represented'
      },
      {
        file: 'retrospective-testing-guide.md',
        type: 'CREATE',
        description: 'How to run tests, test structure, adding new tests'
      },
      {
        file: 'retrospective-issues.md',
        type: 'CREATE',
        description: 'Common errors and fixes, constraint violations, troubleshooting'
      }
    ],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Insert PRD
  const { data: inserted, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select();

  if (insertError) {
    throw new Error(`Failed to insert PRD: ${insertError.message}`);
  }

  console.log('\n✅ PRD created successfully!');
  console.log(`   PRD ID: ${inserted[0].prd_id}`);
  console.log(`   UUID: ${inserted[0].id}`);
  console.log(`   Status: ${inserted[0].status}`);
  console.log(`   Functional Requirements: ${prd.functional_requirements.length}`);
  console.log(`   Technical Requirements: ${prd.technical_requirements.length}`);
  console.log(`   Test Scenarios: ${prd.test_scenarios.length}`);
  console.log(`   Acceptance Criteria: ${prd.acceptance_criteria.length}`);
  console.log(`   Success Metrics: ${prd.success_metrics.length}`);
  console.log(`   Documentation Files: ${prd.documentation_requirements.length}`);
  console.log(`   Complexity Score: ${prd.complexity_score}/10`);
  console.log(`   Estimated Effort: ${prd.estimated_effort_hours} hours`);

  return inserted[0];
}

// Execute
createPRD().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
