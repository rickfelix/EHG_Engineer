#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P6 (EVA Service Timeout & Resilience)
 * Timeout/circuit breaker patterns for EVA AI service
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P6';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P6';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement EVA Service Timeout Configuration',
    user_role: 'Developer',
    user_want: 'Configurable timeout settings for EVA AI service calls',
    user_benefit: 'Can prevent UI from hanging when EVA service is slow',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'EVA call times out',
        given: 'EVA service takes longer than timeout threshold',
        when: 'User requests EVA assistance',
        then: 'Request times out and fallback message is shown'
      },
      {
        id: 'AC-001-2',
        scenario: 'Timeout is configurable',
        given: 'Environment variable EVA_TIMEOUT_MS exists',
        when: 'EVA service is called',
        then: 'Service uses configured timeout value'
      }
    ],
    definition_of_done: [
      'EVA service has configurable timeout (default 30s)',
      'Timeout triggers graceful error handling',
      'User sees friendly fallback message on timeout',
      'Timeout value logged for debugging'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use AbortController with setTimeout for fetch timeout. Default 30s.',
    implementation_approach: 'Add timeout wrapper to EVA service calls with configurable threshold.',
    implementation_context: 'Prevent UI hangs when EVA is slow. Use AbortController pattern.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement EVA Circuit Breaker Pattern',
    user_role: 'Developer',
    user_want: 'A circuit breaker that stops calling EVA when it repeatedly fails',
    user_benefit: 'Can prevent cascading failures and improve system stability',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Circuit opens after failures',
        given: 'EVA service fails N consecutive times',
        when: 'Another EVA request is made',
        then: 'Request is rejected immediately (circuit open)'
      },
      {
        id: 'AC-002-2',
        scenario: 'Circuit half-opens after cooldown',
        given: 'Circuit is open and cooldown period passes',
        when: 'Another EVA request is made',
        then: 'Single test request is allowed through'
      },
      {
        id: 'AC-002-3',
        scenario: 'Circuit closes on success',
        given: 'Circuit is half-open and test request succeeds',
        when: 'Request completes successfully',
        then: 'Circuit closes and normal operation resumes'
      }
    ],
    definition_of_done: [
      'Circuit breaker implemented with configurable thresholds',
      'States: closed, open, half-open',
      'Failure threshold: 5 failures (configurable)',
      'Cooldown period: 60s (configurable)',
      'Circuit state logged for monitoring'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Implement simple circuit breaker. Consider using existing library if available.',
    implementation_approach: 'Create circuit breaker utility with state management and configurable thresholds.',
    implementation_context: 'Prevent cascading failures. Standard circuit breaker pattern.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement EVA Fallback Responses',
    user_role: 'User',
    user_want: 'Helpful fallback messages when EVA is unavailable',
    user_benefit: 'Can continue working even when AI assistance is down',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Fallback shown on timeout',
        given: 'EVA request times out',
        when: 'User is waiting for response',
        then: 'Friendly fallback message is displayed'
      },
      {
        id: 'AC-003-2',
        scenario: 'Fallback shown on circuit open',
        given: 'EVA circuit breaker is open',
        when: 'User requests EVA assistance',
        then: 'Fallback message explains service is temporarily unavailable'
      }
    ],
    definition_of_done: [
      'Fallback messages are contextual and helpful',
      'Messages suggest manual alternatives when appropriate',
      'Messages indicate when service might be available again',
      'No technical jargon in user-facing messages'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Store fallback messages in constants. Make them actionable.',
    implementation_approach: 'Create fallback message system with contextual responses.',
    implementation_context: 'UX requirement to not leave users stranded when EVA is down.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add EVA Health Check Endpoint',
    user_role: 'Operations',
    user_want: 'An endpoint to check EVA service health status',
    user_benefit: 'Can monitor EVA availability and circuit state',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Health check returns status',
        given: 'Health endpoint is called',
        when: 'Checking EVA status',
        then: 'Response includes circuit state, last success time, failure count'
      },
      {
        id: 'AC-004-2',
        scenario: 'Health check available in UI',
        given: 'Admin user views EVA status',
        when: 'Checking EVA health',
        then: 'UI shows circuit state and health metrics'
      }
    ],
    definition_of_done: [
      'Health check endpoint returns circuit state',
      'Endpoint returns recent success/failure metrics',
      'Admin UI displays EVA health status',
      'Health check does not call actual EVA service'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Create internal health endpoint. Do not expose to public.',
    implementation_approach: 'Add health check endpoint that reports circuit breaker state.',
    implementation_context: 'Monitoring requirement for production operations.'
  }
];

const deliverables = [
  {
    sd_id: SD_ID,
    deliverable_name: 'EVA Service Timeout Configuration',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'EVA calls have configurable timeout with graceful handling'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'EVA Circuit Breaker Implementation',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Circuit breaker with open/closed/half-open states'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'EVA Fallback Response System',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Contextual fallback messages when EVA unavailable'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'EVA Health Check Endpoint',
    deliverable_type: 'API',
    completion_status: 'pending',
    acceptance_criteria: 'Health endpoint reports circuit state and metrics'
  }
];

async function addUserStoriesAndDeliverables() {
  console.log(`📋 Adding ${userStories.length} User Stories to ${SD_ID}...`);
  console.log('='.repeat(70));

  for (const story of userStories) {
    console.log(`\n  Adding: ${story.story_key} - ${story.title}`);

    const { data: existing } = await supabase
      .from('user_stories')
      .select('id')
      .eq('story_key', story.story_key)
      .single();

    if (existing) {
      const { error } = await supabase.from('user_stories').update(story).eq('story_key', story.story_key);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Updated');
    } else {
      const { error } = await supabase.from('user_stories').insert(story);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Created');
    }
  }

  console.log('\n📦 Adding Deliverables...');

  for (const deliverable of deliverables) {
    console.log(`  Adding: ${deliverable.deliverable_name}`);

    const { data: existing } = await supabase
      .from('sd_scope_deliverables')
      .select('id')
      .eq('sd_id', deliverable.sd_id)
      .eq('deliverable_name', deliverable.deliverable_name)
      .single();

    if (existing) {
      const { error } = await supabase.from('sd_scope_deliverables').update(deliverable).eq('id', existing.id);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Updated');
    } else {
      const { error } = await supabase.from('sd_scope_deliverables').insert(deliverable);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Created');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ P6 User stories and deliverables complete!');
  console.log(`   Stories: ${userStories.length}, Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

addUserStoriesAndDeliverables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
