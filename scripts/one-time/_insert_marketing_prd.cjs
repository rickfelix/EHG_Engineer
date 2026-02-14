/**
 * One-time script: Insert PRD for SD-EVA-FEAT-MARKETING-FOUNDATION-001
 * Generated inline by Claude Code (Opus 4.6) — no external API call needed
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sdKey = 'SD-EVA-FEAT-MARKETING-FOUNDATION-001';
  const sdUuid = '8802887d-f9ec-47f9-8845-fec531c0d201';
  const prdId = `PRD-${sdKey}`;

  // Check for existing PRD
  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sdUuid)
    .maybeSingle();

  if (existing) {
    console.log(`PRD already exists: ${existing.id}`);
    process.exit(0);
  }

  const llmContent = {
    executive_summary: `This PRD defines the Marketing Engine Data Foundation and Publisher system for the EVA platform. It covers: (1) Database schema for 8 marketing tables (marketing_events, marketing_content, marketing_content_variants, marketing_experiments, marketing_daily_rollups, bandit_state, bandit_arms, marketing_channel_budgets), (2) Content generator service using LLM + venture context to produce headline/body/CTA/visual variants, (3) Publisher abstraction layer supporting direct API (X, YouTube, Bluesky, Mastodon, Threads) and Late aggregator (LinkedIn, TikTok), (4) BullMQ-based rate limiting with 6 queues, and (5) UTM attribution tracking via PostHog Cloud analytics.`,

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create marketing_events table as append-only raw event stream with columns: id (BIGSERIAL), venture_id (UUID FK), source (TEXT), platform (TEXT), event_type (TEXT), occurred_at (TIMESTAMPTZ), content_id (UUID), variant_id (UUID), properties (JSONB)',
        priority: 'HIGH',
        acceptance_criteria: ['Table created with correct schema', 'RLS policy restricts access by venture_id', 'Indexes on venture_id, occurred_at, event_type']
      },
      {
        id: 'FR-2',
        requirement: 'Create marketing_content table as content master record with columns: id (UUID), venture_id (UUID FK), content_type (TEXT: social_post/email/ad), channel_family (TEXT: social/email/paid), concept_tags (TEXT[]), metadata (JSONB)',
        priority: 'HIGH',
        acceptance_criteria: ['Table created with correct schema', 'RLS policy restricts access by venture_id', 'Content lifecycle state tracked in metadata.lifecycle_state']
      },
      {
        id: 'FR-3',
        requirement: 'Create marketing_content_variants table for A/B variant tracking with columns: id (UUID), content_id (UUID FK), variant_key (TEXT), asset_text (TEXT), asset_image_key (TEXT), asset_video_key (TEXT), metadata (JSONB)',
        priority: 'HIGH',
        acceptance_criteria: ['Table created with FK to marketing_content', 'Variant keys support headline_a/b, image_warm/cool patterns', 'Storage bucket paths for image and video assets']
      },
      {
        id: 'FR-4',
        requirement: 'Create bandit_state and bandit_arms tables for Thompson Sampling optimization with Beta distributions (alpha/beta_param columns), supporting channel/variant/send_time scopes',
        priority: 'HIGH',
        acceptance_criteria: ['bandit_state tracks scope and objective_metric', 'bandit_arms tracks alpha/beta_param/observations per arm', 'FK relationship between bandit_arms and bandit_state']
      },
      {
        id: 'FR-5',
        requirement: 'Create marketing_daily_rollups table with generated columns for engagement_rate, ctr, and conversion_rate. Composite PK on (rollup_date, venture_id, platform, content_id, variant_id)',
        priority: 'HIGH',
        acceptance_criteria: ['Generated STORED columns calculate rates correctly', 'Composite PK prevents duplicate rollups', 'Supports daily materialization from marketing_events']
      },
      {
        id: 'FR-6',
        requirement: 'Create marketing_channel_budgets table with monthly_budget_cents hard cap, daily_stop_loss_multiplier (default 2.0), and current_month_spend_cents tracking per venture per platform',
        priority: 'HIGH',
        acceptance_criteria: ['UNIQUE constraint on (venture_id, platform)', 'Budget governor can halt posting when exceeded', 'Default monthly budget of $50/venture for X platform']
      },
      {
        id: 'FR-7',
        requirement: 'Implement content generator service that accepts venture context and produces text variants (headline, body, CTA) via LLM, linked to marketing_content and marketing_content_variants tables',
        priority: 'HIGH',
        acceptance_criteria: ['Generator creates marketing_content record with lifecycle_state=GENERATE', 'At least 2 variants created per content piece', 'Venture context (name, description, target audience) included in LLM prompt']
      },
      {
        id: 'FR-8',
        requirement: 'Implement publisher abstraction layer with direct API routing for X (Basic tier), YouTube Data API v3, Bluesky (AT Protocol), Mastodon (ActivityPub), and Threads (Meta API)',
        priority: 'HIGH',
        acceptance_criteria: ['Each platform has a dedicated adapter implementing publish() interface', 'Rate limiting enforced per platform', 'Idempotency key prevents duplicate dispatch: {venture_id}:{content_id}:{platform}:{timestamp}']
      },
      {
        id: 'FR-9',
        requirement: 'Implement Late aggregator integration for LinkedIn and TikTok distribution via Late API ($33-49/mo Accelerate plan)',
        priority: 'MEDIUM',
        acceptance_criteria: ['Late API credentials configurable per environment', 'Posts scheduled through Late for LinkedIn and TikTok', 'Fallback behavior documented if Late is unavailable']
      },
      {
        id: 'FR-10',
        requirement: 'Implement BullMQ queue architecture with 6 queues: content:generate (concurrency 3), content:review (concurrency 5), content:schedule (concurrency 1), post:dispatch (per-platform), metrics:collect (concurrency 2), maintenance (concurrency 1)',
        priority: 'HIGH',
        acceptance_criteria: ['All 6 queues operational with correct concurrency settings', 'Dead letter queue captures jobs after 3 retries', 'Idempotency keys on all dispatch jobs']
      },
      {
        id: 'FR-11',
        requirement: 'Implement UTM parameter generation on all published content and PostHog Cloud integration for last-touch attribution tracking',
        priority: 'HIGH',
        acceptance_criteria: ['UTM parameters (source, medium, campaign, content) appended to all links', 'PostHog tracks attribution from UTM to conversion', 'Composite reward calculation: 0.3 × engagement + 0.7 × conversion']
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'All 8 marketing tables must have Row Level Security (RLS) policies restricting access by venture_id',
        priority: 'HIGH'
      },
      {
        id: 'TR-2',
        requirement: 'BullMQ requires Redis instance running locally (cost: $0). Queue configuration stored in environment variables',
        priority: 'HIGH'
      },
      {
        id: 'TR-3',
        requirement: 'X API Basic tier rate limits: 50 posts per 15 minutes, 15K reads per month. Publisher must enforce these limits',
        priority: 'HIGH'
      },
      {
        id: 'TR-4',
        requirement: 'YouTube Data API v3 quota: 10K units/day. Video uploads cost 1600 units each. Publisher must track quota usage',
        priority: 'MEDIUM'
      },
      {
        id: 'TR-5',
        requirement: 'Daily rollup materialization must aggregate marketing_events into marketing_daily_rollups at 6:30 UTC',
        priority: 'MEDIUM'
      },
      {
        id: 'TR-6',
        requirement: 'Content lifecycle state machine: IDEATE → GENERATE → REVIEW → SCHEDULE → DISPATCH → MEASURE → OPTIMIZE. Each transition writes to marketing_content.metadata.lifecycle_state',
        priority: 'HIGH'
      },
      {
        id: 'TR-7',
        requirement: 'Cloudflare Tunnel (free) for webhook delivery from PostHog and platform callbacks. Polling fallback if tunneling unavailable (5-min intervals)',
        priority: 'LOW'
      }
    ],

    system_architecture: {
      components: [
        {
          name: 'Marketing Database Layer',
          description: '8 PostgreSQL tables in Supabase with RLS policies, indexes, and generated columns for analytics',
          technology: 'PostgreSQL / Supabase'
        },
        {
          name: 'Content Generator Service',
          description: 'LLM-driven content creation that loads venture context and produces text/visual variants. Outputs to marketing_content + marketing_content_variants tables',
          technology: 'Node.js, LLM Client Factory'
        },
        {
          name: 'Publisher Abstraction Layer',
          description: 'Platform-agnostic publishing interface with adapters for X API, YouTube, Bluesky, Mastodon, Threads (direct) and Late (LinkedIn, TikTok)',
          technology: 'Node.js, Platform REST APIs, Late API'
        },
        {
          name: 'BullMQ Queue System',
          description: '6 queues orchestrating the content lifecycle: generate, review, schedule, dispatch, metrics, maintenance',
          technology: 'BullMQ, Redis'
        },
        {
          name: 'Metrics Ingestor',
          description: 'Hourly platform API polling for engagement data, PostHog webhook receiver, daily rollup materialization',
          technology: 'Node.js, PostHog Cloud, Cron'
        },
        {
          name: 'Budget Governor',
          description: 'Per-venture per-platform monthly budget enforcement with stop-loss rules (2x daily average triggers halt)',
          technology: 'PostgreSQL (marketing_channel_budgets table)'
        }
      ],
      data_flow: 'Venture Context → Content Generator (LLM) → Variants → Review Queue → Schedule Queue → Dispatch Queue (platform APIs) → Metrics Collect → Daily Rollups → Thompson Sampling Optimization → Next Content Cycle'
    },

    implementation_approach: {
      phases: [
        {
          phase: 'Phase 1: Data Foundation',
          description: 'Create all 8 database tables with RLS policies, indexes, and seed data. This is the foundation everything else depends on.',
          deliverables: ['SQL migration for all 8 tables', 'RLS policies per table', 'Indexes for query performance']
        },
        {
          phase: 'Phase 2: Content Generator + Publisher',
          description: 'Implement content generator service and publisher abstraction with X API as first platform integration.',
          deliverables: ['Content generator service', 'Publisher abstraction interface', 'X API adapter', 'UTM parameter generation']
        },
        {
          phase: 'Phase 3: Multi-Platform + Queues',
          description: 'Add remaining platform adapters and BullMQ queue system.',
          deliverables: ['YouTube, Bluesky, Mastodon, Threads adapters', 'Late aggregator integration', 'BullMQ 6-queue setup', 'Idempotency enforcement']
        },
        {
          phase: 'Phase 4: Metrics + Attribution',
          description: 'Implement metrics collection, daily rollups, PostHog integration, and budget governor.',
          deliverables: ['Metrics ingestor service', 'Daily rollup materialization', 'PostHog UTM attribution', 'Budget governor logic']
        }
      ],
      estimated_effort: 'Large — spans database, services, and external API integrations'
    },

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Create all 8 marketing tables and verify schema matches specification',
        test_type: 'integration',
        expected_result: 'All tables created with correct columns, types, constraints, and RLS policies'
      },
      {
        id: 'TS-2',
        scenario: 'Generate content variants from venture context via content generator service',
        test_type: 'integration',
        expected_result: 'marketing_content record created with at least 2 marketing_content_variants linked'
      },
      {
        id: 'TS-3',
        scenario: 'Publish content to X API via publisher abstraction layer',
        test_type: 'integration',
        expected_result: 'Post published successfully with UTM parameters, idempotency key prevents duplicate'
      },
      {
        id: 'TS-4',
        scenario: 'Rate limit enforcement: attempt to exceed X API 50 posts/15min limit',
        test_type: 'unit',
        expected_result: 'Publisher queues excess posts instead of sending, no API rate limit errors'
      },
      {
        id: 'TS-5',
        scenario: 'Budget governor halts posting when monthly budget exceeded',
        test_type: 'unit',
        expected_result: 'Posts blocked when current_month_spend_cents >= monthly_budget_cents'
      },
      {
        id: 'TS-6',
        scenario: 'Daily rollup materialization aggregates events correctly',
        test_type: 'integration',
        expected_result: 'marketing_daily_rollups populated with correct impressions, engagements, clicks, conversions counts and calculated rates'
      },
      {
        id: 'TS-7',
        scenario: 'BullMQ dead letter queue captures failed jobs after 3 retries',
        test_type: 'integration',
        expected_result: 'Failed job moved to DLQ after 3 attempts, original queue continues processing'
      },
      {
        id: 'TS-8',
        scenario: 'RLS policies prevent cross-venture data access on all marketing tables',
        test_type: 'security',
        expected_result: 'User with venture_id=A cannot read/write records belonging to venture_id=B'
      },
      {
        id: 'TS-9',
        scenario: 'Content lifecycle state machine transitions correctly: IDEATE → GENERATE → REVIEW → SCHEDULE → DISPATCH → MEASURE',
        test_type: 'unit',
        expected_result: 'Each state transition writes to metadata.lifecycle_state, invalid transitions rejected'
      },
      {
        id: 'TS-10',
        scenario: 'Late aggregator publishes to LinkedIn successfully',
        test_type: 'integration',
        expected_result: 'Post submitted to Late API, confirmation received, post appears on LinkedIn'
      }
    ],

    risks: [
      {
        id: 'RISK-1',
        risk: 'X API Basic tier ($200/mo) may be deprecated in favor of pay-per-use model',
        impact: 'HIGH',
        probability: 'MEDIUM',
        mitigation: 'Budget governor already caps per-venture spend. If X switches pricing, adjust governor thresholds. Architecture supports any pricing model via marketing_channel_budgets table.'
      },
      {
        id: 'RISK-2',
        risk: 'Late aggregator dependency for LinkedIn/TikTok creates single point of failure',
        impact: 'MEDIUM',
        probability: 'LOW',
        mitigation: 'Publisher abstraction layer allows swapping Late for direct API if/when LinkedIn grants direct access (3-6 month review process). TikTok direct API as fallback.'
      },
      {
        id: 'RISK-3',
        risk: 'BullMQ Redis dependency adds infrastructure complexity',
        impact: 'MEDIUM',
        probability: 'LOW',
        mitigation: 'Redis runs locally at $0 cost. BullMQ is well-maintained (2M+ weekly npm downloads). Dead letter queue and idempotency prevent data loss on failures.'
      },
      {
        id: 'RISK-4',
        risk: 'Content generator LLM costs may scale unexpectedly with many ventures',
        impact: 'MEDIUM',
        probability: 'MEDIUM',
        mitigation: 'Content generation uses LLM Client Factory with local LLM fallback (qwen3-coder:30b). Per-venture generation limits configurable. Budget governor tracks total spend.'
      },
      {
        id: 'RISK-5',
        risk: 'PostHog free tier (1M events/mo) may be insufficient at scale',
        impact: 'LOW',
        probability: 'LOW',
        mitigation: 'Marketing events stored in own table (marketing_events), PostHog used only for attribution analytics. Can migrate to paid tier ($0.00031/event) if needed.'
      }
    ],

    acceptance_criteria: [
      'All 8 marketing database tables created with RLS policies',
      'Content generator service produces variants from venture context',
      'Publisher abstraction publishes to X API with UTM parameters',
      'BullMQ queues operational with idempotency enforcement',
      'Budget governor enforces per-venture per-platform monthly caps',
      'Daily rollup materialization produces correct aggregates',
      'Dead letter queue captures failed jobs after 3 retries',
      'At least 3 platform adapters functional (X + 2 others)'
    ],

    integration_operationalization: {
      deployment_strategy: 'Database migration first, then services deployed incrementally per phase',
      monitoring: 'BullMQ dashboard for queue health, PostHog for attribution metrics, budget governor alerts at 80% threshold',
      rollback_plan: 'Database migrations reversible via down migrations. Services can be disabled per-platform via feature flags in marketing_channel_budgets.status column',
      documentation_updates: 'Schema docs auto-generated. Platform adapter API keys documented in .env.example. BullMQ queue configuration in environment variables.',
      operational_runbook: 'Daily: check DLQ depth. Weekly: review budget utilization. Monthly: review platform API costs vs budget.'
    },

    exploration_summary: {
      files_read: [
        'docs/plans/eva-platform-architecture.md (Section 16-17)',
        'docs/plans/eva-venture-lifecycle-vision.md (Section 9)'
      ],
      patterns_identified: [
        'Publisher abstraction pattern (adapter per platform)',
        'BullMQ queue-per-concern pattern',
        'Thompson Sampling for content optimization',
        'Budget governor with stop-loss rules'
      ],
      existing_conventions: [
        'RLS policies on all venture-scoped tables',
        'JSONB metadata columns for extensibility',
        'LLM Client Factory for model routing'
      ]
    }
  };

  // Build content field
  const contentText = `# Product Requirements Document

## Strategic Directive
${sdKey}

## Status
Approved

## Executive Summary
${llmContent.executive_summary}

## Functional Requirements
${llmContent.functional_requirements.map(fr => `### ${fr.id}: ${fr.requirement}\n**Priority**: ${fr.priority}\n**Acceptance Criteria**:\n${fr.acceptance_criteria.map(ac => `- ${ac}`).join('\n')}`).join('\n\n')}

## Technical Requirements
${llmContent.technical_requirements.map(tr => `### ${tr.id}: ${tr.requirement}\n**Priority**: ${tr.priority}`).join('\n\n')}

## System Architecture
${llmContent.system_architecture.components.map(c => `### ${c.name}\n${c.description}\n**Technology**: ${c.technology}`).join('\n\n')}

**Data Flow**: ${llmContent.system_architecture.data_flow}

## Implementation Approach
${llmContent.implementation_approach.phases.map(p => `### ${p.phase}\n${p.description}\n**Deliverables**:\n${p.deliverables.map(d => `- ${d}`).join('\n')}`).join('\n\n')}

## Test Scenarios
${llmContent.test_scenarios.map(ts => `### ${ts.id}: ${ts.scenario}\n**Type**: ${ts.test_type}\n**Expected**: ${ts.expected_result}`).join('\n\n')}

## Risks
${llmContent.risks.map(r => `### ${r.id}: ${r.risk}\n**Impact**: ${r.impact} | **Probability**: ${r.probability}\n**Mitigation**: ${r.mitigation}`).join('\n\n')}

## Acceptance Criteria
${llmContent.acceptance_criteria.map(ac => `- ${ac}`).join('\n')}
`;

  // Calculate plan checklist progress
  const planChecklist = [
    { text: 'PRD created and saved', checked: true },
    { text: 'SD requirements mapped to technical specs', checked: true },
    { text: 'Technical architecture defined', checked: true },
    { text: 'Implementation approach documented', checked: true },
    { text: 'Test scenarios defined', checked: true },
    { text: 'Acceptance criteria established', checked: true },
    { text: 'Integration & operationalization documented', checked: true },
    { text: 'Exploration summary documented', checked: true },
    { text: 'Resource requirements estimated', checked: false },
    { text: 'Timeline and milestones set', checked: false },
    { text: 'Risk assessment completed', checked: true }
  ];

  const checkedCount = planChecklist.filter(i => i.checked).length;
  const progress = Math.round((checkedCount / planChecklist.length) * 100);

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: prdId,
      directive_id: sdKey,
      sd_id: sdUuid,
      title: `Product Requirements: Marketing Engine Data Foundation + Publisher`,
      status: 'approved',
      category: 'technical',
      priority: 'high',
      executive_summary: llmContent.executive_summary,
      phase: 'planning',
      created_by: 'PLAN',
      plan_checklist: planChecklist,
      exec_checklist: [
        { text: 'Development environment setup', checked: false },
        { text: 'Core functionality implemented', checked: false },
        { text: 'Unit tests written', checked: false },
        { text: 'Integration tests completed', checked: false },
        { text: 'Code review completed', checked: false },
        { text: 'Documentation updated', checked: false }
      ],
      validation_checklist: [
        { text: 'All acceptance criteria met', checked: false },
        { text: 'Performance requirements validated', checked: false },
        { text: 'Security review completed', checked: false },
        { text: 'User acceptance testing passed', checked: false },
        { text: 'Deployment readiness confirmed', checked: false }
      ],
      acceptance_criteria: llmContent.acceptance_criteria,
      functional_requirements: llmContent.functional_requirements,
      technical_requirements: llmContent.technical_requirements,
      system_architecture: llmContent.system_architecture,
      implementation_approach: llmContent.implementation_approach,
      test_scenarios: llmContent.test_scenarios,
      risks: llmContent.risks,
      integration_operationalization: llmContent.integration_operationalization,
      exploration_summary: llmContent.exploration_summary,
      progress: progress,
      stakeholders: [],
      content: contentText,
      metadata: {
        generated_by: 'claude-code-inline',
        generated_at: new Date().toISOString(),
        model: 'claude-opus-4-6',
        note: 'PRD generated inline by Claude Code — no external API call'
      }
    })
    .select('id, title, status, progress')
    .single();

  if (error) {
    console.error('Insert error:', error.message);
    process.exit(1);
  }

  console.log('PRD inserted successfully:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Title: ${data.title}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Progress: ${data.progress}%`);
}

main().catch(err => { console.error(err); process.exit(1); });
