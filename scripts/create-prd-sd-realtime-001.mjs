#!/usr/bin/env node

/**
 * Create PRD for SD-REALTIME-001: Real-time Infrastructure Standardization
 * PLAN phase - Comprehensive Product Requirements Document
 *
 * SCOPE: Audit existing, standardize patterns, create template (NOT expand to all tables)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdContent = {
  overview: `Standardize existing real-time infrastructure by auditing 14 implementations, documenting patterns from 6 working channels, and creating a reusable useRealtimeSubscription<T> hook template. This enables 50% faster real-time feature development without expanding to new tables.

**Target Users**: Developers implementing real-time features
**Primary Use Case**: Add real-time sync to a table in <10 minutes using template
**Success Metric**: 50% reduction in implementation time (60min → 30min)
**Scope Reduction**: Original "ALL tables" rejected (over-engineering score 9/30). Focus on standardization, NOT expansion.`,

  functional_requirements: [
    {
      id: 'FR-001',
      title: 'Infrastructure Audit Report',
      description: 'Analyze all 14 files with .channel() subscriptions to document patterns, anti-patterns, and standardization opportunities',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'All 14 files analyzed: useCollaboration.ts, useNotifications.ts, useBusinessAgents.ts, useAgents.ts, + 10 components',
        'Document channel configuration patterns (name, events, filters)',
        'Identify commonalities across 6 active channels',
        'List anti-patterns and technical debt items',
        'Performance metrics baseline (subscription latency, memory usage)',
        'Report stored in database (not markdown file)'
      ]
    },
    {
      id: 'FR-002',
      title: 'Pattern Documentation',
      description: 'Extract and document standard patterns from 6 working channel implementations',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Document collaboration pattern (useCollaboration.ts:254)',
        'Document notifications pattern (useNotifications.ts:227)',
        'Document business_agents pattern (useBusinessAgents.ts:216)',
        'Document 3 agent patterns (useAgents.ts:263,270,279)',
        'Each pattern includes: channel setup, event handlers, cleanup, error handling',
        'Identify which pattern fits which use case',
        'Documentation in TypeScript JSDoc format (not separate docs)'
      ]
    },
    {
      id: 'FR-003',
      title: 'useRealtimeSubscription Hook Template',
      description: 'Create reusable generic hook that supports all 6 current channel patterns',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Generic TypeScript: useRealtimeSubscription<T>(config)',
        'Supports all 6 channel types (collaboration, notifications, business_agents, ai_ceo_agents, performance_logs, actor_messages)',
        'Built-in error handling with retry logic',
        'Connection state management (connecting, connected, error, disconnected)',
        'Cleanup on unmount (prevent memory leaks)',
        'Passes TypeScript strict mode',
        'Zero breaking changes to existing 6 channels',
        '<5ms overhead vs custom implementations'
      ]
    },
    {
      id: 'FR-004',
      title: 'Migration Guide for Existing Hooks',
      description: 'Step-by-step guide to convert existing custom implementations to use template',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Migration guide with before/after code examples',
        'Checklist for each of 4 core hooks (useCollaboration, useNotifications, useBusinessAgents, useAgents)',
        'Test verification steps (ensure no regressions)',
        'Rollback instructions if migration fails',
        'Estimated time: 15-30 min per hook migration'
      ]
    },
    {
      id: 'FR-005',
      title: 'High-Value Table Identification',
      description: 'Identify 2-3 tables that would benefit most from real-time sync (with user validation)',
      priority: 'NICE_TO_HAVE',
      acceptance_criteria: [
        'Query database to find tables with high update frequency',
        'Identify tables lacking real-time where users expect it',
        'User validation required before implementation',
        'Prioritize by business impact, not technical interest',
        'Maximum 3 tables recommended (prevent scope creep)'
      ]
    }
  ],

  non_functional_requirements: [
    {
      id: 'NFR-001',
      title: 'Zero Breaking Changes',
      description: 'All 6 existing real-time channels must work identically post-refactor',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Integration tests pass for all 6 channels',
        'No changes to channel subscription logic',
        'No changes to event handler signatures',
        'Template is opt-in (existing implementations keep working)',
        'Regression test suite covers all 6 channels'
      ]
    },
    {
      id: 'NFR-002',
      title: 'Template Supports All Use Cases',
      description: 'Generic hook must handle every pattern found in existing 6 implementations',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Supports single table subscriptions',
        'Supports filtered subscriptions (WHERE clauses)',
        'Supports multiple event types (INSERT, UPDATE, DELETE)',
        'Supports custom event handlers',
        'Provides escape hatch for edge cases'
      ]
    },
    {
      id: 'NFR-003',
      title: 'Performance',
      description: 'Template adds minimal overhead compared to custom implementations',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Subscription latency <5ms vs custom (measured)',
        'Memory usage within 10% of custom implementation',
        'No performance degradation for existing channels',
        'Benchmark test suite included'
      ]
    },
    {
      id: 'NFR-004',
      title: 'Developer Experience',
      description: 'Template must be easier and faster than writing custom subscriptions',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Time to implement: <10 minutes (vs current 60 min)',
        'IntelliSense/autocomplete works with generics',
        'Error messages are clear and actionable',
        'Examples cover 80% of use cases',
        'No TypeScript "any" types in public API'
      ]
    }
  ],

  technical_architecture: {
    components: [
      {
        name: 'useRealtimeSubscription<T>',
        location: '/mnt/c/_EHG/EHG/src/hooks/realtime/useRealtimeSubscription.ts',
        type: 'React Hook',
        responsibilities: [
          'Generic real-time subscription management',
          'Connection state tracking',
          'Error handling and retry logic',
          'Cleanup on unmount'
        ],
        dependencies: ['@supabase/supabase-js', 'react']
      },
      {
        name: 'InfrastructureAuditReport',
        location: 'Database (infrastructure_audit table)',
        type: 'Analysis Report',
        responsibilities: [
          'Document all 14 file patterns',
          'Identify commonalities',
          'List anti-patterns and tech debt'
        ]
      },
      {
        name: 'PatternDocumentation',
        location: 'JSDoc comments in useRealtimeSubscription.ts',
        type: 'Documentation',
        responsibilities: [
          'Document 6 working patterns',
          'Provide use case guidance',
          'Include code examples'
        ]
      }
    ],

    data_flow: `## Real-time Subscription Flow

1. **Setup Phase**:
   - Component calls useRealtimeSubscription<T>({ table, events, filter })
   - Hook validates config and creates Supabase channel
   - Registers event handlers for INSERT/UPDATE/DELETE
   - Returns { data, loading, error, connectionState }

2. **Active Subscription**:
   - Supabase sends real-time events to hook
   - Hook processes events and updates local state
   - Component re-renders with new data
   - Error handling catches and reports failures

3. **Cleanup Phase**:
   - Component unmounts → useEffect cleanup runs
   - Hook unsubscribes from channel
   - Connection closed, resources freed`
  },

  test_plan: {
    unit_tests: [
      {
        component: 'useRealtimeSubscription',
        scenarios: [
          'Hook subscribes to channel on mount',
          'Hook handles INSERT events correctly',
          'Hook handles UPDATE events correctly',
          'Hook handles DELETE events correctly',
          'Hook cleans up subscription on unmount',
          'Hook retries on connection failure (max 3 attempts)',
          'Hook reports errors via error state',
          'Hook supports generic types correctly'
        ],
        coverage_target: '90%'
      }
    ],

    integration_tests: [
      {
        name: 'Existing Channels Regression',
        description: 'Verify all 6 existing channels work post-refactor',
        test_cases: [
          'useCollaboration real-time events still fire',
          'useNotifications updates on new notification',
          'useBusinessAgents syncs on agent changes',
          'useAgents tracks ai_ceo_agents changes',
          'useAgents tracks performance_logs changes',
          'useAgents tracks actor_messages changes'
        ]
      },
      {
        name: 'Template Hook Validation',
        description: 'Verify template works for new implementations',
        test_cases: [
          'Template can replace useCollaboration logic',
          'Template can replace useNotifications logic',
          'Template handles filtered subscriptions',
          'Template handles multiple event types'
        ]
      }
    ],

    manual_testing: [
      {
        scenario: 'Developer Experience',
        steps: [
          'New developer reads migration guide',
          'Converts one existing hook to use template',
          'Verifies real-time events still work',
          'Measures time taken (target: <30 min)'
        ],
        success_criteria: 'Implementation complete in <30 minutes with no regressions'
      }
    ]
  },

  implementation_approach: {
    phase_1: {
      title: 'Infrastructure Audit',
      duration: '2 hours',
      deliverables: [
        'Analyze all 14 files with .channel() calls',
        'Document patterns in database (infrastructure_audit table)',
        'Identify commonalities across 6 channels',
        'List anti-patterns and tech debt'
      ]
    },
    phase_2: {
      title: 'Pattern Documentation',
      duration: '2 hours',
      deliverables: [
        'Extract patterns from 6 working implementations',
        'Document in JSDoc format',
        'Create decision tree: which pattern for which use case'
      ]
    },
    phase_3: {
      title: 'Template Hook Development',
      duration: '3 hours',
      deliverables: [
        'useRealtimeSubscription<T> generic hook',
        'Unit tests (90% coverage)',
        'Integration tests for 6 existing channels',
        'Performance benchmarks'
      ]
    },
    phase_4: {
      title: 'Migration Guide & Rollout',
      duration: '1 hour',
      deliverables: [
        'Step-by-step migration guide',
        'Before/after code examples',
        'Rollback instructions'
      ]
    }
  },

  risks_and_mitigation: [
    {
      risk: 'Breaking existing 6 real-time channels',
      severity: 'HIGH',
      mitigation: 'Zero breaking changes requirement + comprehensive regression tests before any refactor',
      contingency: 'Immediate rollback if any channel breaks'
    },
    {
      risk: 'Template too rigid for edge cases',
      severity: 'MEDIUM',
      mitigation: 'Provide escape hatch - allow custom implementations alongside template',
      contingency: 'Document when to use custom vs template'
    },
    {
      risk: 'Low developer adoption of template',
      severity: 'MEDIUM',
      mitigation: 'Clear documentation, migration guide, PR review enforcement',
      contingency: 'Mandate template usage via linting rules if adoption <50% after 1 month'
    }
  ],

  out_of_scope: [
    '❌ Implementing real-time for "ALL tables" (undefined, over-engineered)',
    '❌ Collaborative editing features (complex, needs separate architecture SD)',
    '❌ Conflict resolution (depends on collaborative editing)',
    '❌ Optimistic updates (too broad, needs specific user stories)',
    '❌ Presence indicators (UI work, separate from infrastructure)',
    '❌ Expanding to new tables without user validation'
  ]
};

// Insert PRD into database
const { data: prd, error: prdError } = await supabase
  .from('product_requirements_v2')
  .insert({
    id: `PRD-${randomUUID()}`,
    sd_id: 'SD-REALTIME-001',
    title: 'Real-time Infrastructure Standardization',
    version: '1.0',
    status: 'approved',
    executive_summary: prdContent.overview,
    functional_requirements: prdContent.functional_requirements,
    non_functional_requirements: prdContent.non_functional_requirements,
    system_architecture: prdContent.technical_architecture,
    test_scenarios: prdContent.test_plan,
    implementation_approach: prdContent.implementation_approach,
    risks: prdContent.risks_and_mitigation,
    acceptance_criteria: [
      'useRealtimeSubscription<T> hook created and passes TypeScript strict mode',
      'All 6 existing channels work identically (zero breaking changes)',
      'Infrastructure audit report in database',
      'Pattern documentation in JSDoc format',
      'Migration guide with before/after examples',
      'Unit tests achieve 90% coverage',
      'Integration tests pass for all 6 channels',
      'Developer can implement real-time in <10 minutes using template',
      'Performance: <5ms overhead vs custom implementations'
    ],
    metadata: {
      scope_reduction_applied: true,
      original_scope: 'Implement real-time for ALL tables',
      reduced_scope: 'Audit + standardize + template creation',
      over_engineering_score: 9,
      estimated_hours: 8,
      phases: 4
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single();

if (prdError) {
  console.error('❌ Error creating PRD:', prdError);
  process.exit(1);
}

console.log('✅ PRD Created Successfully!');
console.log(`   ID: ${prd.id}`);
console.log(`   SD: ${prd.sd_id}`);
console.log(`   Title: ${prd.title}`);
console.log(`   Status: ${prd.status}`);
console.log(`   Functional Requirements: ${prdContent.functional_requirements.length}`);
console.log(`   Non-Functional Requirements: ${prdContent.non_functional_requirements.length}`);
console.log(`   Acceptance Criteria: ${prd.acceptance_criteria.length}`);
console.log(`   Estimated Hours: ${prd.metadata.estimated_hours}`);
console.log('\n🎯 PRD ready for PLAN→EXEC handoff');
console.log('   Scope: Audit + Standardize + Template (NOT expand to all tables)');
console.log('   Focus: Developer velocity improvement, not feature expansion');
