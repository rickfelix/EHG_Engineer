#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-RETRO-ENHANCE-001
 * Enhanced Retrospective System with Multi-Application Support & Semantic Search
 *
 * Implements 4-layer quality enforcement (database constraints → triggers →
 * application validation → CI/CD gates) following LEO Protocol patterns.
 * Adds multi-application context, code traceability, advanced search/aggregation,
 * and semantic search with OpenAI embeddings.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createRetrospectiveEnhancementSD() {
  console.log('📚 Creating Strategic Directive: Enhanced Retrospective System');
  console.log('================================================================\n');

  const strategicDirective = {
    id: 'SD-RETRO-ENHANCE-001',
    uuid_id: randomUUID(),
    sd_key: 'SD-RETRO-ENHANCE-001',
    title: 'Enhanced Retrospective System with Multi-Application Support & Semantic Search',
    version: '1.0',
    status: 'draft',
    category: 'LEO Protocol Infrastructure',
    priority: 'high',
    target_application: 'EHG_engineer',
    current_phase: 'IDEATION',

    description: 'Enhance retrospective system with 4-layer quality enforcement (database constraints → triggers → application validation → CI/CD gates). Add multi-application context, code traceability, advanced search/aggregation, and semantic search with OpenAI embeddings. Integrates with SD-KNOWLEDGE-001 automated knowledge retrieval to enable intelligent cross-application learning.',

    strategic_intent: 'Transform retrospectives from static documents into an active, intelligent knowledge management system that scales across multiple applications (EHG, EHG_engineer, ventures). Enable semantic search for concept-based discovery and structured filtering for precision queries. Establish defense-in-depth quality enforcement following LEO Protocol patterns.',

    rationale: 'Current retrospective system lacks: (1) multi-application context - cannot distinguish EHG vs venture learnings, (2) semantic search - keyword-only limits discovery, (3) code traceability - no link to files/commits/components, (4) enforcement - fields can be skipped. With 97+ retrospectives and growing, these gaps prevent effective knowledge reuse and cross-application learning.',

    scope: 'Database schema enhancements, trigger creation, application-level validation, CI/CD enforcement, semantic search integration, documentation (10 files), backfill existing records, integration with SD-KNOWLEDGE-001 automated retrieval.',

    key_changes: [
      'Add application context fields: target_application, learning_category, applies_to_all_apps',
      'Add code traceability: related_files, related_commits, related_prs, affected_components, tags',
      'Add search/aggregation: severity_level, time_to_resolve, GIN indexes',
      'Add semantic search: content_embedding vector(1536), pgvector integration',
      'Create 4-layer enforcement: database constraints → triggers → app validation → CI/CD',
      'Create BEFORE INSERT trigger with auto-population and validation logic',
      'Update generate-comprehensive-retrospective.js with enhanced validation',
      'Create GitHub Actions workflow for retrospective quality gates',
      'Enable pgvector extension, create match_retrospectives RPC function',
      'Update automated-knowledge-retrieval.js for semantic + structured search',
      'Backfill 97 existing retrospectives with new field values',
      'Create 10 documentation files covering all aspects',
      'Create test suite for validation, embedding generation, search'
    ],

    strategic_objectives: [
      'Enable multi-application context: distinguish EHG vs EHG_engineer vs venture learnings',
      'Enable semantic search: find conceptually similar issues regardless of wording',
      'Enable code traceability: link retrospectives to files, commits, PRs, components',
      'Establish 4-layer quality enforcement: prevent invalid data at multiple levels',
      'Integrate with SD-KNOWLEDGE-001: enhance automated PRD enrichment with better retrieval',
      'Scale knowledge management: support unlimited future venture applications',
      'Improve search precision: combine semantic understanding with structured filters',
      'Ensure data quality: 100% compliance with new field requirements'
    ],

    success_criteria: [
      '100% of retrospectives have target_application (database constraint enforces)',
      '100% of retrospectives have learning_category (database constraint enforces)',
      '100% of CRITICAL/HIGH severity have tags (trigger enforces)',
      '100% of APPLICATION_ISSUE have affected_components (trigger enforces)',
      '100% of PUBLISHED retrospectives have embeddings (database constraint enforces)',
      '90%+ semantic search relevance (user feedback validation)',
      '3x more relevant retrospectives found per query (vs keyword-only)',
      'SD-KNOWLEDGE-001 research confidence: 85% → 95%',
      'EXEC clarification questions: 3 → 1 per SD (better PRD enrichment)',
      'Cross-application learning adoption: 60% of new ventures reference process improvements',
      'All 4 enforcement layers active and tested',
      'All 10 documentation files complete',
      'All 97 existing retrospectives backfilled successfully',
      'CI/CD gates prevent merging invalid code',
      'Zero retrospectives with invalid data post-deployment'
    ],

    key_principles: [
      'Defense in depth: 4 independent enforcement layers',
      'Database-first enforcement: constraints cannot be bypassed',
      'Auto-population where possible: reduce human error',
      'Clear error messages: guide developers to correct usage',
      'Backward compatible: existing retrospectives continue working',
      'Performance conscious: indexes for all searchable fields',
      'Cost effective: embedding generation ~$0.01/year',
      'LEO Protocol alignment: follows validation gate patterns',
      'Integration ready: enhances SD-KNOWLEDGE-001 immediately'
    ],

    implementation_guidelines: [
      'Use database agent for all schema changes and migrations',
      'Test each enforcement layer independently before integration',
      'Backfill existing records in batches (10 at a time) to avoid timeouts',
      'Generate embeddings asynchronously for existing records',
      'Create comprehensive tests for each validation rule',
      'Document all constraint error messages for troubleshooting',
      'Follow existing prevention infrastructure patterns (safeInsert, schema-validator)',
      'Integrate with unified-handoff-system for automatic retrospective categorization',
      'Create migration rollback plan before applying changes',
      'Update CLAUDE.md with new retrospective field requirements'
    ],

    dependencies: [
      'SD-KNOWLEDGE-001 (automated knowledge retrieval) - integration target',
      'Prevention infrastructure (schema-validator, safeInsert) - reuse patterns',
      'OpenAI API access - for embedding generation',
      'pgvector extension - for semantic search (Supabase built-in)',
      'Existing retrospectives table - 97 records to backfill'
    ],

    risks: [
      'Backfill of 97 records may timeout - Mitigation: Batch processing',
      'Embedding generation costs - Mitigation: ~$0.01/year, negligible',
      'Constraint violations on existing code - Mitigation: Comprehensive testing',
      'Performance impact of vector search - Mitigation: Proper indexing',
      'Breaking changes to retrospective generation - Mitigation: Backward compatibility'
    ],

    success_metrics: [
      'Enforcement effectiveness: 100% compliance across all layers',
      'Search quality: 90%+ relevance for semantic queries',
      'Integration success: SD-KNOWLEDGE-001 uses enhanced fields',
      'Developer adoption: 0 constraint violations in production',
      'Performance: Semantic search <100ms average query time'
    ],

    stakeholders: ['LEO Protocol', 'SD-KNOWLEDGE-001 integration', 'All future SDs'],

    metadata: {
      timeline: {
        estimated_duration: '3-4 weeks',
        milestones: [
          'Week 1: Database schema + triggers + constraints',
          'Week 2: Application validation + semantic search integration',
          'Week 3: CI/CD gates + documentation (10 files)',
          'Week 4: Backfill existing records + testing + integration'
        ]
      },
      business_impact: 'HIGH - Enables intelligent knowledge reuse and cross-application learning',
      technical_impact: 'Establishes scalable knowledge management pattern for all future applications',
      integration_points: {
        'SD-KNOWLEDGE-001': 'Enhanced automated retrieval with semantic + structured search',
        'Prevention Infrastructure': 'Reuses safeInsert, schema-validator patterns',
        'LEO Protocol': 'Follows 4-layer enforcement pattern from validation gates'
      },
      documentation_deliverables: [
        'retrospective-schema-reference.md (UPDATE)',
        'retrospective-generation-guide.md (CREATE)',
        'retrospective-search-guide.md (CREATE)',
        'retrospective-enhancement-migration-guide.md (CREATE)',
        'retrospective-api.md (UPDATE)',
        'leo-retrospective-integration.md (CREATE)',
        'retrospective-validation-gates.md (CREATE)',
        'retrospective-examples.md (CREATE)',
        'retrospective-testing-guide.md (CREATE)',
        'retrospective-issues.md (CREATE - troubleshooting)'
      ],
      performance_targets: {
        semantic_search_latency: '<100ms avg',
        embedding_generation: '<500ms per retrospective',
        backfill_duration: '<2 hours for 97 records',
        constraint_overhead: '<5ms per insert'
      }
    },

    created_by: 'Claude (Sonnet 4.5)',
    updated_by: 'Claude (Sonnet 4.5)',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sequence_rank: 1000,
    is_active: true,
    progress_percentage: 0
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-RETRO-ENHANCE-001')
      .single();

    if (existing) {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-RETRO-ENHANCE-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('\n📋 SD Details:');
    console.log('   ID: SD-RETRO-ENHANCE-001');
    console.log('   Title: Enhanced Retrospective System');
    console.log('   Priority: high');
    console.log('   Status: draft');
    console.log('   Category: LEO Protocol Infrastructure');
    console.log('   Timeline: 3-4 weeks');
    console.log('\n🎯 Key Features:');
    console.log('   - 4-layer quality enforcement');
    console.log('   - Multi-application context (EHG, EHG_engineer, ventures)');
    console.log('   - Semantic search with OpenAI embeddings');
    console.log('   - Code traceability (files, commits, PRs, components)');
    console.log('   - 10 documentation files');
    console.log('   - Integration with SD-KNOWLEDGE-001');
    console.log('\n📊 Expected Impact:');
    console.log('   - 3x more relevant retrospectives per query');
    console.log('   - 95% research confidence (up from 85%)');
    console.log('   - 60% of ventures reuse process improvements');
    console.log('   - 100% data quality enforcement');
    console.log('================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createRetrospectiveEnhancementSD };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createRetrospectiveEnhancementSD();
}
