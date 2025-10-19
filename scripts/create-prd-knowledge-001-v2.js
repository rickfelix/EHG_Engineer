#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  // Get SD record to get its ID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .eq('sd_key', 'SD-KNOWLEDGE-001')
    .single();

  if (sdError || !sd) {
    console.error('❌ SD-KNOWLEDGE-001 not found');
    process.exit(1);
  }

  console.log(`🎯 Target SD: ${sd.title}\n`);
  const prdContent = {
    functional_requirements: [
      'Automated retrospective search with <2 second response time',
      'Context7 MCP fallback when local results <3',
      'PRD auto-enrichment with implementation_context',
      'Circuit breaker with 3-failure threshold and 1-hour recovery',
      'Research audit logging for all operations',
      'Token budget enforcement (5k/query, 15k/PRD hard caps)',
      'Feature flags for gradual rollout control'
    ],

    technical_requirements: [
      'Create automated-knowledge-retrieval.js orchestrator',
      'Implement Context7 MCP client integration',
      'Create circuit breaker state machine',
      'Build PRD enrichment pipeline',
      'Add 3 new database tables (tech_stack_references, prd_research_audit_log, system_health)',
      'Enhance user_stories with implementation_context JSONB field',
      'Integrate with unified-handoff-system.js at LEAD→PLAN transition',
      'Implement 24-hour TTL cache with package.json versioning'
    ],

    acceptance_criteria: [
      'Local retrospective query completes in <2 seconds',
      'Context7 queries timeout at 10 seconds',
      'Circuit breaker opens after 3 consecutive failures',
      'System degrades gracefully to local-only (60-70% effectiveness)',
      'All research operations logged to audit table',
      'Token usage never exceeds 15k per PRD',
      'PRD completeness increases from 70% to ≥85%',
      'EXEC clarifications reduce from 7 to ≤3 per SD',
      'PLAN→EXEC handoff time reduces from 45min to ≤30min',
      '100% unit test coverage for core logic',
      'E2E tests complete in <30 seconds'
    ],

    test_scenarios: [
      {scenario: 'Query retrospectives for "OAuth" tech stack', expected: 'Returns top 5 matches in <2s'},
      {scenario: 'Local results <3, trigger Context7 fallback', expected: 'Context7 query executes, results merged'},
      {scenario: 'Context7 fails 3 times consecutively', expected: 'Circuit breaker opens, subsequent queries skip Context7'},
      {scenario: 'Circuit breaker open for 1 hour', expected: 'Auto-recovers to half-open state'},
      {scenario: 'Enrich PRD with research results (confidence >0.85)', expected: 'implementation_context populated automatically'},
      {scenario: 'Research confidence 0.7-0.85', expected: 'Flagged for human review'},
      {scenario: 'Token usage exceeds 15k limit', expected: 'Query truncated, hard cap enforced'},
      {scenario: 'Cache hit within 24 hours', expected: 'Cached results returned, no new query'},
      {scenario: 'package.json hash changes', expected: 'Cache invalidated, fresh query executed'}
    ],

    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        title: 'Retrospective Semantic Search',
        description: 'As PLAN agent, I need to query retrospectives for similar past implementations to inform PRD creation',
        acceptance_criteria: 'Query returns top 5 matches in <2s, consumes ≤500 tokens'
      },
      {
        title: 'Context7 Live Documentation',
        description: 'As PLAN agent, I need Context7 integration for live library docs when local results insufficient',
        acceptance_criteria: 'Falls back to Context7 if local <3, implements circuit breaker, caches results for 24 hours'
      },
      {
        title: 'PRD Auto-Enrichment',
        description: 'As PLAN agent, I need research results automatically populating user_stories.implementation_context',
        acceptance_criteria: 'Enrichment includes files/dependencies/APIs/patterns, confidence-scored, audit-logged'
      },
      {
        title: 'Circuit Breaker Resilience',
        description: 'As system, I need circuit breaker to prevent Context7 overload and ensure graceful degradation',
        acceptance_criteria: 'Opens after 3 failures, recovers after 1 hour, logs state changes'
      },
      {
        title: 'Research Telemetry',
        description: 'As operator, I need all research operations logged for monitoring and optimization',
        acceptance_criteria: 'Logs query type, tokens, execution time, confidence score, circuit state'
      }
    ],

    // FIX: database_changes moved to metadata

    // database_changes: [
      'CREATE TABLE tech_stack_references (cache for Context7 + retrospectives)',
      'CREATE TABLE prd_research_audit_log (telemetry for all operations)',
      'CREATE TABLE system_health (circuit breaker state tracking)',
      'ALTER TABLE user_stories ADD COLUMN implementation_context JSONB',
      'ALTER TABLE product_requirements_v2 ADD COLUMN research_confidence_score DECIMAL'
    ]
  };

  // Get SD UUID for proper linkage (REQUIRED for handoffs)
  const { data: sdRecord, error: sdUuidError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id')
    .eq('sd_key', 'SD-KNOWLEDGE-001')
    .single();

  if (sdUuidError || !sdRecord || !sdRecord.uuid_id) {
    console.error('❌ Failed to get SD UUID - cannot create PRD');
    console.error('   Error:', sdUuidError);
    process.exit(1);
  }

  const prd = {
    id: 'PRD-KNOWLEDGE-001',
    sd_id: sd.id,
    sd_uuid: sdRecord.uuid_id,  // REQUIRED: For handoff system queries
    title: 'Automated Knowledge Retrieval & PRD Enrichment - Technical Implementation',
    version: '1.0.0',
    status: 'approved',

    executive_summary: `Implement automated knowledge retrieval pipeline to reduce PLAN→EXEC handoff time by 40-50% and increase PRD completeness from 70% to 85%. System combines local retrospective search with Context7 MCP integration for live documentation, creating institutional knowledge flywheel with 578% ROI in 90 days.`,

    functional_requirements: prdContent.functional_requirements,  // Array format (NOT string)
    technical_requirements: prdContent.technical_requirements,   // Array format (NOT string)
    acceptance_criteria: prdContent.acceptance_criteria,
    test_scenarios: JSON.stringify(prdContent.test_scenarios, null, 2),

    non_functional_requirements: {
      performance: 'Local queries <2s, Context7 queries <10s, total PRD enrichment <30s',
      scalability: 'Support 50+ concurrent PRD enrichments',
      reliability: '95%+ uptime with graceful degradation to local-only mode',
      security: 'Token budget hard caps, circuit breaker for external API protection'
    },

    risks: [
      {
        risk: 'Context7 MCP API timeout or rate limiting',
        severity: 'MEDIUM',
        mitigation: 'Circuit breaker pattern with 3-failure threshold, 1-hour recovery, graceful degradation to local retrospectives'
      },
      {
        risk: 'Token budget overrun (>15k per PRD)',
        severity: 'LOW',
        mitigation: 'Hard caps at 5k tokens/query, automatic truncation, early-exit if >10 Context7 results'
      },
      {
        risk: 'Cached results becoming stale',
        severity: 'LOW',
        mitigation: '24-hour TTL, versioning by package.json hash, invalidation on dependency changes'
      }
    ],

    dependencies: [
      'Context7 MCP server integration',
      'retrospectives table with semantic search',
      'unified-handoff-system.js for LEAD→PLAN trigger',
      'Database tables: tech_stack_references, prd_research_audit_log, system_health'
    ],

    metadata: {
      priority: 'HIGH',
      estimated_hours: 24,
      // FIX: complexity_score moved to metadata
      // complexity_score: 7,
      story_points: 23,
      security_impact: 'LOW',
      roi_90_days: '578%',
      payback_period_days: 18,
      time_savings_per_day: '1.4 hours'
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, title');

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD Created Successfully');
  console.log(`   ID: ${data[0].id}`);
  console.log(`   Title: ${data[0].title}`);
  console.log('');
  console.log('📊 Requirements Summary:');
  console.log('   - Functional Requirements:', prdContent.functional_requirements.length);
  console.log('   - Technical Requirements:', prdContent.technical_requirements.length);
  console.log('   - Acceptance Criteria:', prdContent.acceptance_criteria.length);
  console.log('   - Test Scenarios:', prdContent.test_scenarios.length);
  console.log('   - User Stories:', prdContent.user_stories.length);
  console.log('   - Database Changes:', prdContent.database_changes.length);
  console.log('   - Risks:', prd.risks.length);
  console.log('   - Dependencies:', prd.dependencies.length);
  console.log('');
  console.log('🎯 PLAN phase complete - Ready for PLAN→EXEC handoff');
  console.log('');

  return data[0];
}

createPRD().catch(console.error);
