#!/usr/bin/env node

/**
 * Create User Stories for SD-KNOWLEDGE-001
 * Extracts user stories from PRD and stores in user_stories table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createUserStories() {
  console.log('📝 Creating User Stories for SD-KNOWLEDGE-001');
  console.log('================================================================\n');

  // USER_STORIES TABLE SCHEMA (for future reference):
  // Required: story_key, sd_id, user_role, title, user_want, user_benefit, acceptance_criteria (array)
  // Optional: priority, story_points, e2e_test_path, e2e_test_status, status, implementation_context
  // IMPORTANT: story_key format MUST be "{SD_ID}:US-{DIGITS}" where DIGITS are numeric only
  //            Example: "SD-KNOWLEDGE-001:US-001" (NOT "US-KR-001")

  const userStories = [
    {
      story_key: 'SD-KNOWLEDGE-001:US-001',
      sd_id: 'SD-KNOWLEDGE-001',
      user_role: 'PLAN agent',
      title: 'Retrospective Semantic Search',
      user_want: 'to query retrospectives for similar past implementations',
      user_benefit: 'PRDs are informed by lessons learned from past projects',
      acceptance_criteria: ['Query returns top 5 matches in <2s', 'Consumes ≤500 tokens', 'Filters by tech stack keywords automatically'],
      priority: 'high',
      story_points: 5,
      e2e_test_path: 'tests/e2e/knowledge-retrieval/US-KR-001-retrospective-search.spec.ts',
      e2e_test_status: 'not_created',
      status: 'ready',
      implementation_context: {
        files: ['scripts/automated-knowledge-retrieval.js'],
        dependencies: ['@supabase/supabase-js', 'pg'],
        apis: ['retrospectives table SELECT'],
        patterns: ['Semantic search with keyword matching', 'Query optimization with LIMIT 5']
      }
    },
    {
      story_key: 'SD-KNOWLEDGE-001:US-002',
      sd_id: 'SD-KNOWLEDGE-001',
      user_role: 'PLAN agent',
      title: 'Context7 Live Documentation',
      user_want: 'Context7 integration for live library docs when local results insufficient',
      user_benefit: 'PRDs are enriched with up-to-date library documentation beyond local knowledge',
      acceptance_criteria: ['Falls back to Context7 if local <3', 'Implements circuit breaker', 'Caches results for 24 hours'],
      priority: 'high',
      story_points: 8,
      status: 'ready',
      implementation_context: {
        files: ['scripts/automated-knowledge-retrieval.js', 'scripts/context7-circuit-breaker.js'],
        dependencies: ['context7-mcp (external)'],
        apis: ['Context7 MCP query endpoint'],
        patterns: ['Circuit breaker pattern (3-failure threshold)', 'Graceful degradation to local-only']
      }
    },
    {
      story_key: 'SD-KNOWLEDGE-001:US-003',
      sd_id: 'SD-KNOWLEDGE-001',
      user_role: 'PLAN agent',
      title: 'PRD Auto-Enrichment',
      user_want: 'research results automatically populating user_stories.implementation_context',
      user_benefit: 'PRDs are more complete and actionable for EXEC phase',
      acceptance_criteria: ['Enrichment includes files/dependencies/APIs/patterns', 'Confidence-scored', 'Audit-logged'],
      priority: 'high',
      story_points: 5,
      status: 'ready',
      implementation_context: {
        files: ['scripts/enrich-prd-with-research.js'],
        dependencies: ['date-fns'],
        apis: ['user_stories UPDATE', 'prd_research_audit_log INSERT'],
        patterns: ['Confidence-based gating', 'Batch updates with transactions']
      }
    },
    {
      story_key: 'SD-KNOWLEDGE-001:US-004',
      sd_id: 'SD-KNOWLEDGE-001',
      user_role: 'system',
      title: 'Circuit Breaker Resilience',
      user_want: 'circuit breaker to prevent Context7 overload and ensure graceful degradation',
      user_benefit: 'system remains operational even when external services fail',
      acceptance_criteria: ['Opens after 3 failures', 'Recovers after 1 hour', 'Logs state changes'],
      priority: 'high',
      story_points: 3,
      status: 'ready',
      implementation_context: {
        files: ['scripts/context7-circuit-breaker.js'],
        dependencies: [],
        apis: ['system_health SELECT/UPDATE'],
        patterns: ['State machine (open/half-open/closed)', 'Time-based recovery']
      }
    },
    {
      story_key: 'SD-KNOWLEDGE-001:US-005',
      sd_id: 'SD-KNOWLEDGE-001',
      user_role: 'operator',
      title: 'Research Telemetry',
      user_want: 'all research operations logged for monitoring and optimization',
      user_benefit: 'system performance and reliability can be monitored and improved over time',
      acceptance_criteria: ['Logs query type/tokens/execution time', 'Captures confidence score', 'Records circuit state'],
      priority: 'medium',
      story_points: 2,
      status: 'ready',
      implementation_context: {
        files: ['scripts/automated-knowledge-retrieval.js', 'scripts/enrich-prd-with-research.js'],
        dependencies: [],
        apis: ['prd_research_audit_log INSERT'],
        patterns: ['Fire-and-forget logging (non-blocking)', 'Structured logging with timestamps']
      }
    }
  ];

  console.log(`📊 Inserting ${userStories.length} user stories...\n`);

  for (const story of userStories) {
    const { data: _data, error } = await supabase
      .from('user_stories')
      .upsert(story, { onConflict: 'story_key' })
      .select('story_key, title');

    if (error) {
      console.error(`   ❌ Failed to insert ${story.story_key}:`, error.message);
    } else {
      console.log(`   ✅ ${story.story_key}: ${story.title}`);
    }
  }

  console.log('\n✅ User stories created successfully!');
  console.log(`📈 Total: ${userStories.length} user stories`);
  console.log(`📊 Story points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('\n🎯 Ready for PLAN→EXEC handoff');
}

createUserStories();
