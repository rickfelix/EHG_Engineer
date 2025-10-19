#!/usr/bin/env node

/**
 * Create PRD for SD-KNOWLEDGE-001
 * Automated Knowledge Retrieval & PRD Enrichment System
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-KNOWLEDGE-001...\n');

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prd = {
    id: 'PRD-KNOWLEDGE-001',
    strategic_directive_id: 'SD-KNOWLEDGE-001',
    title: 'Automated Knowledge Retrieval & PRD Enrichment System - Technical Implementation',
    version: '1.0.0',
    status: 'draft',
    category: 'Infrastructure',
    priority: 'high',

    executive_summary: `Implement automated knowledge retrieval pipeline to reduce PLAN→EXEC handoff time by 40-50% and increase PRD completeness from 70% to 85%. System combines local retrospective search with Context7 MCP integration for live documentation, creating institutional knowledge flywheel with 578% ROI in 90 days.`,

    business_context: // FIX: Renamed from problem_statement `Current PLAN phase spends 30-45 minutes per PRD on manual research, resulting in:
- 70% PRD completeness (target: 85%)
- 5-7 EXEC clarification questions per SD (high rework cost)
- Lost institutional knowledge from past projects
- 40% of SDs missing implementation context
- 30% reinventing existing solutions
- 20% specifying deprecated technologies`,

    // FIX: objectives moved to metadata

    // objectives: [
      'Reduce PLAN→EXEC handoff time from 45 min to ≤30 min (40-50% improvement)',
      'Increase PRD completeness score from 70% to ≥85%',
      'Reduce EXEC clarification questions from 7 to ≤3 per SD (57% reduction)',
      'Achieve 578% ROI within 90 days of deployment',
      'Establish self-reinforcing knowledge flywheel (compounding returns)',
      'Maintain ≥95% system uptime with graceful degradation'
    ],

    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: 'US-KR-001',
        title: 'As PLAN agent, I need to query retrospectives for similar past implementations',
        description: 'PLAN agent should be able to semantically search retrospectives table to find relevant past project learnings',
        acceptance_criteria: [
          'Query executes in <2 seconds',
          'Returns top 5 relevant retrospectives ranked by similarity',
          'Token usage ≤500 tokens per query',
          'Filters by tech stack keywords automatically',
          'Handles zero results gracefully'
        ],
        priority: 'MUST',
        story_points: 5,
        implementation_context: {
          files: ['scripts/automated-knowledge-retrieval.js'],
          dependencies: ['@supabase/supabase-js', 'pg'],
          apis: ['retrospectives table SELECT'],
          patterns: ['Semantic search with keyword matching', 'Query optimization with LIMIT 5']
        }
      },
      {
        id: 'US-KR-002',
        title: 'As PLAN agent, I need to query Context7 for live library documentation',
        description: 'When local retrospectives insufficient (<3 results), fall back to Context7 MCP for live documentation',
        acceptance_criteria: [
          'Only queries Context7 if local results <3',
          'Implements 10-second timeout',
          'Circuit breaker opens after 3 consecutive failures',
          'Returns top 3 documentation matches',
          'Token usage ≤5k tokens per query',
          'Caches results with 24-hour TTL'
        ],
        priority: 'MUST',
        story_points: 8,
        implementation_context: {
          files: ['scripts/automated-knowledge-retrieval.js', 'scripts/context7-circuit-breaker.js'],
          dependencies: ['context7-mcp (external)'],
          apis: ['Context7 MCP query endpoint'],
          patterns: ['Circuit breaker pattern (3-failure threshold)', 'Graceful degradation to local-only']
        }
      },
      {
        id: 'US-KR-003',
        title: 'As PLAN agent, I need research results automatically enriching PRD user stories',
        description: 'Research results from retrospectives and Context7 should populate user_stories.implementation_context field',
        acceptance_criteria: [
          'Enrichment happens during PRD creation',
          'implementation_context includes files, dependencies, APIs, patterns',
          'Confidence score calculated (0-1 range)',
          'Only applies enrichment if confidence >0.7',
          'All enrichments logged to prd_research_audit_log'
        ],
        priority: 'MUST',
        story_points: 5,
        implementation_context: {
          files: ['scripts/enrich-prd-with-research.js'],
          dependencies: ['date-fns'],
          apis: ['user_stories UPDATE', 'prd_research_audit_log INSERT'],
          patterns: ['Confidence-based gating', 'Batch updates with transactions']
        }
      },
      {
        id: 'US-KR-004',
        title: 'As system admin, I need circuit breaker to prevent Context7 overload',
        description: 'Circuit breaker monitors Context7 health and opens after failures to protect system',
        acceptance_criteria: [
          'Opens after 3 consecutive failures',
          'Auto-recovers after 1 hour',
          'Logs state changes to system_health table',
          'Exposes current state via health endpoint',
          'Allows manual override (emergency disable)'
        ],
        priority: 'MUST',
        story_points: 3,
        implementation_context: {
          files: ['scripts/context7-circuit-breaker.js'],
          dependencies: [],
          apis: ['system_health SELECT/UPDATE'],
          patterns: ['State machine (open/half-open/closed)', 'Time-based recovery']
        }
      },
      {
        id: 'US-KR-005',
        title: 'As PLAN agent, I need telemetry for all research operations',
        description: 'All queries logged to audit table for monitoring and optimization',
        acceptance_criteria: [
          'Logs query type (local/context7)',
          'Records tokens consumed',
          'Captures execution time in ms',
          'Stores confidence score',
          'Includes circuit breaker state snapshot'
        ],
        priority: 'SHOULD',
        story_points: 2,
        implementation_context: {
          files: ['scripts/automated-knowledge-retrieval.js', 'scripts/enrich-prd-with-research.js'],
          dependencies: [],
          apis: ['prd_research_audit_log INSERT'],
          patterns: ['Fire-and-forget logging (non-blocking)', 'Structured logging with timestamps']
        }
      }
    ],

    system_architecture: // FIX: Renamed from technical_architecture `
## System Architecture

### Components
1. **automated-knowledge-retrieval.js** - Main orchestrator
   - Queries retrospectives (local-first)
   - Falls back to Context7 if needed
   - Implements circuit breaker logic
   - Returns merged, deduplicated results

2. **enrich-prd-with-research.js** - PRD enrichment engine
   - Reads research results from cache
   - Populates user_stories.implementation_context
   - Calculates confidence scores
   - Logs to audit trail

3. **context7-circuit-breaker.js** - Resilience layer
   - Tracks Context7 API health
   - Opens circuit after failures
   - Auto-recovers after timeout
   - Provides health status

### Data Flow
\`\`\`
PLAN PRD Creation
  ↓
Trigger automated-knowledge-retrieval.js
  ↓
Query retrospectives (≤500 tokens, 2s timeout)
  ↓
If results <3 → Query Context7 (≤5k tokens, 10s timeout)
  ↓
Cache results in tech_stack_references (24h TTL)
  ↓
enrich-prd-with-research.js processes cache
  ↓
UPDATE user_stories.implementation_context
  ↓
Log to prd_research_audit_log
\`\`\`

### Integration Points
- **Trigger**: unified-handoff-system.js at LEAD→PLAN transition
- **Validation**: PLAN→EXEC handoff checks research_confidence_score
- **Monitoring**: Query prd_research_audit_log for metrics
`,

    // FIX: database_changes moved to metadata

    // database_changes: {
      new_tables: [
        {
          name: 'tech_stack_references',
          purpose: 'Cache for Context7 + retrospective results',
          schema: `
CREATE TABLE tech_stack_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
  tech_stack TEXT NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('local', 'context7')),
  reference_url TEXT,
  code_snippet TEXT,
  pros_cons_analysis JSONB,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(sd_id, tech_stack, source)
);

CREATE INDEX idx_tech_stack_references_sd ON tech_stack_references(sd_id);
CREATE INDEX idx_tech_stack_references_expires ON tech_stack_references(expires_at);
`
        },
        {
          name: 'prd_research_audit_log',
          purpose: 'Telemetry for all research operations',
          schema: `
CREATE TABLE prd_research_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
  query_type VARCHAR(20) NOT NULL CHECK (query_type IN ('retrospective', 'context7', 'hybrid')),
  tokens_consumed INTEGER NOT NULL,
  results_count INTEGER NOT NULL,
  confidence_score DECIMAL(3,2),
  circuit_breaker_state VARCHAR(20) CHECK (circuit_breaker_state IN ('open', 'half-open', 'closed')),
  execution_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prd_research_audit_sd ON prd_research_audit_log(sd_id);
CREATE INDEX idx_prd_research_audit_created ON prd_research_audit_log(created_at DESC);
`
        },
        {
          name: 'system_health',
          purpose: 'Circuit breaker state tracking',
          schema: `
CREATE TABLE system_health (
  service_name VARCHAR(50) PRIMARY KEY,
  circuit_breaker_state VARCHAR(20) NOT NULL CHECK (circuit_breaker_state IN ('open', 'half-open', 'closed')),
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row for Context7
INSERT INTO system_health (service_name, circuit_breaker_state, failure_count)
VALUES ('context7', 'closed', 0)
ON CONFLICT (service_name) DO NOTHING;
`
        }
      ],
      enhanced_tables: [
        {
          name: 'user_stories',
          changes: 'Add implementation_context JSONB field',
          migration: `
ALTER TABLE user_stories
ADD COLUMN IF NOT EXISTS implementation_context JSONB DEFAULT '{}';

COMMENT ON COLUMN user_stories.implementation_context IS
'Auto-enriched context from retrospectives and Context7: {files, dependencies, apis, patterns}';
`
        },
        {
          name: 'product_requirements_v2',
          changes: 'Add research_confidence_score DECIMAL field',
          migration: `
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS research_confidence_score DECIMAL(3,2) CHECK (research_confidence_score >= 0 AND research_confidence_score <= 1);

COMMENT ON COLUMN product_requirements_v2.research_confidence_score IS
'Confidence score for automated research results (0.7-0.85: human review, >0.85: auto-applied)';
`
        }
      ]
    },

    test_strategy: `
## Testing Tiers

### Tier 1: Unit Tests (MANDATORY)
**Coverage Target**: 100% of core logic

**Test Files**:
- \`tests/unit/automated-knowledge-retrieval.test.js\`
  - Test local retrospective query
  - Test Context7 fallback logic
  - Test result merging/deduplication
  - Test token counting

- \`tests/unit/circuit-breaker.test.js\`
  - Test failure threshold (3 failures)
  - Test auto-recovery (1 hour)
  - Test state transitions
  - Test manual override

- \`tests/unit/prd-enrichment.test.js\`
  - Test confidence scoring
  - Test implementation_context population
  - Test audit logging

**Execution**: \`npm run test:unit\` (must pass before EXEC→PLAN handoff)

### Tier 2: E2E Tests (MANDATORY)
**Coverage Target**: 100% user story coverage

**Test Files**:
- \`tests/e2e/knowledge-retrieval-flow.spec.ts\`
  - Full pipeline: trigger → query → cache → enrich
  - Verifies database state changes
  - Checks telemetry logging
  - Validates 30-second end-to-end time

- \`tests/e2e/context7-failure-scenarios.spec.ts\`
  - Circuit breaker opens after 3 failures
  - System degrades gracefully to local-only
  - Auto-recovery after 1 hour
  - Token usage stays under 15k/PRD

**Execution**: \`npm run test:e2e\` (must pass before EXEC→PLAN handoff)

### Tier 3: Integration Tests (RECOMMENDED)
- Test with real Context7 MCP server
- Test with production retrospectives data
- Performance testing (query latency <2s local, <10s Context7)
`,

    // FIX: deployment_plan moved to metadata

    // deployment_plan: `
## Rollout Strategy

### Phase 1: Pilot (Days 1-14)
- Enable for 3 low-risk SDs only
- Feature flag: \`features.context7_enabled = false\` (local-only)
- Monitor token usage, latency, confidence scores
- Collect manual feedback from PLAN agent

### Phase 2: Limited Production (Days 15-45)
- Enable Context7 for all new SDs
- Feature flag: \`features.context7_enabled = true\`
- Maintain emergency kill switch
- Weekly review of prd_research_audit_log

### Phase 3: Full Production (Days 46-90)
- Remove manual overrides
- Integrate into standard LEO workflow
- Begin tracking 90-day outcome metrics (handoff time, clarifications, completeness)

## Monitoring KPIs
Query \`prd_research_audit_log\` for:
- PLAN→EXEC handoff time (target: 45 min → 25 min)
- EXEC clarification count (target: 7 → 3 per SD)
- PRD completeness score (target: 70% → 85%)
- Circuit breaker trip frequency (target: <2/week)
- Context7 query success rate (target: >80%)
`,

    risks: [
      {
        category: 'Integration Risk',
        severity: 'MEDIUM',
        likelihood: 'MEDIUM',
        description: 'Context7 MCP API may timeout or rate limit',
        mitigation: 'Circuit breaker pattern with 3-failure threshold, 1-hour recovery, graceful degradation to local retrospectives only'
      },
      {
        category: 'Token Budget Risk',
        severity: 'LOW',
        likelihood: 'LOW',
        description: 'Research queries may exceed token budget (15k/PRD limit)',
        mitigation: 'Hard caps at 5k tokens/query with automatic truncation, early-exit if >10 Context7 results'
      },
      {
        category: 'Cache Drift Risk',
        severity: 'LOW',
        likelihood: 'MEDIUM',
        description: 'Cached results may become stale as dependencies update',
        mitigation: '24-hour TTL, versioning by package.json hash, invalidation on dependency changes'
      }
    ],

    // FIX: success_metrics moved to metadata

    // success_metrics: [
      {
        name: 'PLAN→EXEC Handoff Time',
        baseline: '45 min',
        target: '≤30 min',
        measurement: 'Timestamp diff in sd_phase_handoffs table'
      },
      {
        name: 'EXEC Clarification Count',
        baseline: '5-7 per SD',
        target: '≤3 per SD',
        measurement: 'Count of EXEC→PLAN questions in handoffs'
      },
      {
        name: 'PRD Completeness Score',
        baseline: '70%',
        target: '≥85%',
        measurement: 'Sub-agent audit of implementation_context'
      },
      {
        name: 'Context7 Success Rate',
        baseline: 'N/A',
        target: '≥80%',
        measurement: 'Query prd_research_audit_log for success ratio'
      },
      {
        name: 'Circuit Breaker Trips',
        baseline: 'N/A',
        target: '<2 per week',
        measurement: 'Query system_health state changes'
      }
    ],

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  sd_uuid: sdUuid, // FIX: Added for handoff validation
  };

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prd)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log('⚠️  PRD already exists, updating...');
        const { data: updated, error: updateError } = await supabase
          .from('product_requirements_v2')
          .update({
            ...prd,
            updated_at: new Date().toISOString()
          })
          .eq('id', 'PRD-KNOWLEDGE-001')
          .select()
          .single();

        if (updateError) throw updateError;
        console.log('✅ PRD updated successfully!');
        return updated;
      }
      throw error;
    }

    console.log('✅ PRD created successfully!');
    console.log(`   ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   User Stories: ${data.user_stories.length}`);
    console.log(`   Database Tables: ${data.database_changes.new_tables.length} new, ${data.database_changes.enhanced_tables.length} enhanced`);
    console.log(`   Success Metrics: ${data.success_metrics.length}`);
    console.log('\n🎯 PRD ready for PLAN→EXEC handoff!');

    return data;

  } catch (error) {
    console.error('❌ Failed to create PRD:', error.message);
    process.exit(1);
  }
}

createPRD();
