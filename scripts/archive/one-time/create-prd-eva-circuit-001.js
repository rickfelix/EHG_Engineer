#!/usr/bin/env node

/**
 * Create comprehensive PRD for SD-EVA-CIRCUIT-001 (Chairman Circuit Breaker System)
 *
 * This PRD leverages existing patterns:
 * - circuit_breaker_state table from Context7
 * - CircuitBreaker class from context7-circuit-breaker.js
 * - eva_actions table from SD-EVA-DECISION-001
 * - system_alerts table for Chairman notifications
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function createPRD() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('📋 Creating PRD for SD-EVA-CIRCUIT-001...\n');

  // Check if SD exists
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, title, status')
    .eq('id', 'SD-EVA-CIRCUIT-001')
    .single();

  if (sdError) {
    console.log('❌ SD not found:', sdError.message);
    console.log('   Please create SD-EVA-CIRCUIT-001 first');
    process.exit(1);
  }

  console.log('✅ Found SD:', sdData.title);
  console.log('   UUID:', sdData.uuid_id);
  console.log('   Status:', sdData.status);
  console.log('');

  // Create comprehensive PRD
  const prdData = {
    id: 'PRD-SD-EVA-CIRCUIT-001',
    directive_id: 'SD-EVA-CIRCUIT-001',
    sd_uuid: sdData.uuid_id,
    title: 'Chairman Circuit Breaker System PRD',
    status: 'draft',
    category: 'technical',
    priority: 'high',
    version: '1.0',
    phase: 'planning',
    created_by: 'DATABASE',

    executive_summary: 'EVA (Enterprise Value Analysis) system can cause cascading failures if it encounters repeated errors. Without a circuit breaker, EVA errors can propagate through the system, affecting multiple ventures and operations. The Chairman needs immediate notification when EVA failures reach critical thresholds.',

    business_context: `## Business Context

EVA is a critical system for analyzing venture performance and making strategic recommendations. When EVA encounters errors:
1. Multiple ventures may be affected simultaneously
2. Error cascades can propagate through dependent systems
3. The Chairman lacks visibility into system health
4. Recovery requires manual intervention without automated safeguards

**Business Impact of Circuit Breaker**:
- Prevent cascading failures from affecting venture analysis
- Provide immediate visibility when EVA degrades
- Enable automatic recovery after temporary failures
- Reduce MTTR (Mean Time To Recovery) through automated cooldown

**User Impact**:
- Chairman receives timely alerts for EVA service degradation
- Venture owners experience graceful degradation instead of cascading errors
- System administrators can proactively address issues before they escalate`,

    technical_context: `## Technical Context

**Existing Infrastructure**:
- EVA actions tracked in \`eva_actions\` table (SD-EVA-DECISION-001)
- System alerts infrastructure via \`system_alerts\` table
- Context7 circuit breaker pattern already implemented for API integrations

**Integration Points**:
- \`eva_actions\`: Monitor for error status to detect failures
- \`system_alerts\`: Notify Chairman when circuit opens
- Context7 \`CircuitBreaker\` class: Reusable state machine logic

**Constraints**:
- Must not introduce latency to EVA operations (< 10ms overhead)
- Circuit state must persist across application restarts
- Recovery testing must not trigger false alerts`,

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create eva_circuit_breaker table to track EVA service health state',
        priority: 'HIGH',
        acceptance_criteria: 'Table exists with proper schema, indexes, and RLS policies'
      },
      {
        id: 'FR-2',
        requirement: 'Implement failure detection that monitors eva_actions for errors',
        priority: 'HIGH',
        acceptance_criteria: 'Each eva_action error increments circuit breaker failure count'
      },
      {
        id: 'FR-3',
        requirement: 'Trip circuit after 2 consecutive failures (configurable threshold)',
        priority: 'HIGH',
        acceptance_criteria: 'Circuit transitions to OPEN state after threshold reached'
      },
      {
        id: 'FR-4',
        requirement: 'Support three states: CLOSED (healthy), OPEN (tripped), HALF_OPEN (recovery test)',
        priority: 'HIGH',
        acceptance_criteria: 'State machine correctly implements all state transitions'
      },
      {
        id: 'FR-5',
        requirement: 'Notify Chairman when circuit trips via system_alerts',
        priority: 'HIGH',
        acceptance_criteria: 'Alert delivered within 1 second of circuit opening'
      },
      {
        id: 'FR-6',
        requirement: 'Auto-reset capability after configurable cooldown period',
        priority: 'MEDIUM',
        acceptance_criteria: 'Circuit auto-transitions to HALF_OPEN after cooldown expires'
      },
      {
        id: 'FR-7',
        requirement: 'Manual reset via Chairman override',
        priority: 'MEDIUM',
        acceptance_criteria: 'API endpoint allows authorized user to reset circuit'
      }
    ],

    system_architecture: `## System Architecture

### Database Layer

\`\`\`sql
-- Circuit breaker state table
CREATE TABLE eva_circuit_breaker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count INTEGER DEFAULT 0,
  failure_threshold INTEGER DEFAULT 2,
  last_failure_time TIMESTAMPTZ,
  cooldown_period_ms INTEGER DEFAULT 60000,
  last_success_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

### Application Layer

**Circuit Breaker Service** (\`lib/eva-circuit-breaker.js\`):
- Reuses Context7 CircuitBreaker class pattern
- Monitors eva_actions table for errors
- Updates circuit state based on thresholds
- Triggers notifications on state changes

**State Machine**:
\`\`\`
CLOSED ──[2 failures]──> OPEN ──[cooldown expires]──> HALF_OPEN
   ↑                                                        |
   └────[success]─────────────[failure]────────────────────┘
\`\`\`

### Integration Points

1. **EVA Actions Monitor**: Hook into eva_actions INSERT trigger
2. **System Alerts**: Create HIGH priority alerts on circuit open
3. **API Endpoint**: POST /api/eva/circuit-breaker/reset (authenticated)`,

    implementation_approach: `## Implementation Approach

### Phase 1: Database Schema (30 minutes)
1. Create eva_circuit_breaker table migration
2. Add indexes for state and service_name lookups
3. Create RLS policies (service_role full access, authenticated read-only)
4. Test migration in development environment

### Phase 2: Circuit Breaker Logic (1 hour)
1. Extract CircuitBreaker class from context7-circuit-breaker.js
2. Adapt for EVA-specific failure tracking
3. Implement state transition methods:
   - \`recordFailure()\`: Increment count, check threshold
   - \`recordSuccess()\`: Reset count, transition to CLOSED
   - \`checkCooldown()\`: Auto-transition OPEN → HALF_OPEN
   - \`manualReset()\`: Override to HALF_OPEN
4. Add database persistence layer

### Phase 3: EVA Integration (45 minutes)
1. Modify eva_actions INSERT handler
2. Call circuit breaker on each action result
3. Block new EVA requests when circuit OPEN
4. Allow single test request in HALF_OPEN state

### Phase 4: Chairman Notification (30 minutes)
1. Create notification helper function
2. Insert system_alert on circuit open
3. Include failure context in alert metadata
4. Verify notification delivery < 1 second

### Phase 5: API Endpoint (30 minutes)
1. Create POST /api/eva/circuit-breaker/reset endpoint
2. Require authentication (Chairman role)
3. Validate service_name parameter
4. Log manual resets for audit trail

### Phase 6: Testing (45 minutes)
1. Unit tests for state transitions
2. Integration tests with eva_actions
3. Load test to verify < 10ms overhead
4. Manual test of notification delivery

### Phase 7: Documentation (30 minutes)
1. Update API documentation
2. Document circuit breaker configuration
3. Create runbook for Chairman`,

    technology_stack: [
      { category: 'backend', name: 'Node.js', purpose: 'Circuit breaker service' },
      { category: 'database', name: 'PostgreSQL', purpose: 'Circuit state persistence' },
      { category: 'framework', name: 'Next.js', purpose: 'API endpoint' },
      { category: 'testing', name: 'Jest', purpose: 'Unit tests' }
    ],

    dependencies: [
      {
        id: 'SD-EVA-DECISION-001',
        type: 'table',
        status: 'COMPLETED',
        name: 'eva_actions table',
        blocker: false,
        description: 'EVA Decision System with eva_actions table'
      },
      {
        type: 'table',
        status: 'COMPLETED',
        name: 'system_alerts table',
        blocker: false,
        description: 'System alerts infrastructure for notifications'
      },
      {
        type: 'code',
        status: 'COMPLETED',
        name: 'Context7 CircuitBreaker class',
        blocker: false,
        description: 'Reusable circuit breaker pattern from context7-circuit-breaker.js'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Circuit trips after 2 consecutive EVA failures',
        expected_result: 'Circuit state transitions from CLOSED to OPEN',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'Chairman receives notification when circuit opens',
        expected_result: 'system_alerts row created with HIGH severity within 1 second',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Circuit auto-recovers to HALF_OPEN after cooldown',
        expected_result: 'Circuit state automatically transitions after 60 seconds',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'Successful test request moves HALF_OPEN to CLOSED',
        expected_result: 'Circuit state transitions to CLOSED, failure count reset to 0',
        test_type: 'unit'
      },
      {
        id: 'TS-5',
        scenario: 'Failed test request moves HALF_OPEN back to OPEN',
        expected_result: 'Circuit state returns to OPEN, failure count incremented',
        test_type: 'unit'
      },
      {
        id: 'TS-6',
        scenario: 'Manual reset via API works correctly',
        expected_result: 'Circuit transitions to HALF_OPEN, audit log entry created',
        test_type: 'integration'
      },
      {
        id: 'TS-7',
        scenario: 'Circuit breaker adds < 10ms overhead to EVA operations',
        expected_result: 'Average overhead measured at < 10ms over 1000 operations',
        test_type: 'performance'
      }
    ],

    acceptance_criteria: [
      {
        id: 'AC-1',
        criterion: 'eva_circuit_breaker table deployed with proper schema',
        verification_method: 'Query information_schema to verify table structure'
      },
      {
        id: 'AC-2',
        criterion: 'Circuit trips after 2 consecutive EVA failures',
        verification_method: 'Unit test simulates 2 failures, verifies OPEN state'
      },
      {
        id: 'AC-3',
        criterion: 'Chairman receives notification via system_alerts when circuit opens',
        verification_method: 'Integration test verifies alert created within 1 second'
      },
      {
        id: 'AC-4',
        criterion: 'Circuit supports manual reset via API',
        verification_method: 'API test calls reset endpoint, verifies HALF_OPEN state'
      },
      {
        id: 'AC-5',
        criterion: 'Recovery (HALF_OPEN) state allows single test request',
        verification_method: 'Unit test verifies only one request allowed in HALF_OPEN'
      },
      {
        id: 'AC-6',
        criterion: 'Unit tests cover state transitions',
        verification_method: 'Code coverage report shows > 90% coverage of state machine'
      }
    ],

    performance_requirements: {
      overhead_ms: '< 10ms per EVA operation',
      notification_latency: '< 1 second',
      state_persistence: 'Survives application restarts',
      concurrent_operations: 'Thread-safe for 100+ concurrent EVA requests'
    },

    metadata: {
      success_metrics: [ // FIX: moved to metadata per schema compliance
        { metric: 'Cascade Prevention Rate', target: '100% of EVA failure cascades prevented' },
        { metric: 'Notification Latency', target: 'Chairman notification within 1 second of circuit trip' },
        { metric: 'False Positive Rate', target: 'Zero false positives in production' },
        { metric: 'Circuit Overhead', target: '< 10ms per EVA operation' }
      ]
    },

    planning_section: {
      implementation_steps: [
        { step: 1, description: 'Create eva_circuit_breaker table migration', duration: '30 minutes' },
        { step: 2, description: 'Implement circuit breaker state machine', duration: '1 hour' },
        { step: 3, description: 'Integrate with eva_actions monitoring', duration: '45 minutes' },
        { step: 4, description: 'Implement system_alerts notification', duration: '30 minutes' },
        { step: 5, description: 'Create API endpoint for manual reset', duration: '30 minutes' },
        { step: 6, description: 'Write unit tests for state transitions', duration: '45 minutes' },
        { step: 7, description: 'Update documentation', duration: '30 minutes' }
      ],
      risk_analysis: {
        risks: [
          {
            risk: 'Circuit breaker adds latency to EVA operations',
            impact: 'MEDIUM',
            probability: 'LOW',
            mitigation: 'Use async state updates, measure performance in load tests'
          },
          {
            risk: 'False positives trigger unnecessary alerts',
            impact: 'LOW',
            probability: 'MEDIUM',
            mitigation: 'Configurable thresholds, monitor false positive rate in production'
          },
          {
            risk: 'Circuit state not persisted correctly',
            impact: 'HIGH',
            probability: 'LOW',
            mitigation: 'Comprehensive unit tests, verify state after application restart'
          }
        ]
      },
      timeline_breakdown: {
        total_hours: '4 hours',
        breakdown: 'Schema (0.5h) + Logic (1h) + Integration (0.75h) + Notification (0.5h) + API (0.5h) + Testing (0.75h)'
      },
      quality_gates: [
        { gate: 'Schema validation', criteria: 'Table exists with correct structure' },
        { gate: 'Unit tests', criteria: '> 90% code coverage, all tests passing' },
        { gate: 'Integration tests', criteria: 'EVA actions trigger circuit correctly' },
        { gate: 'Performance validation', criteria: '< 10ms overhead verified' }
      ],
      resource_requirements: {
        developer_hours: '4 hours',
        dependencies: 'Access to Context7 CircuitBreaker class, eva_actions table schema',
        infrastructure: 'None (uses existing database)'
      },
      reasoning_depth_used: 'standard'
    },

    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'Review existing circuit_breaker_state table pattern', checked: false },
      { text: 'Review Context7 CircuitBreaker class implementation', checked: false },
      { text: 'Design eva_circuit_breaker table schema', checked: false },
      { text: 'Design state transition logic', checked: false },
      { text: 'Plan eva_actions monitoring integration', checked: false },
      { text: 'Plan system_alerts integration', checked: false },
      { text: 'Define API endpoints for manual reset', checked: false },
      { text: 'Create migration script', checked: false },
      { text: 'Define unit test scenarios', checked: false }
    ],

    exec_checklist: [
      { text: 'Create eva_circuit_breaker table migration', checked: false },
      { text: 'Implement circuit breaker state machine', checked: false },
      { text: 'Integrate with eva_actions monitoring', checked: false },
      { text: 'Implement system_alerts notification', checked: false },
      { text: 'Create API endpoint for manual reset', checked: false },
      { text: 'Write unit tests for state transitions', checked: false },
      { text: 'Test failure detection', checked: false },
      { text: 'Test auto-recovery', checked: false },
      { text: 'Update documentation', checked: false }
    ],

    validation_checklist: [
      { text: 'All functional requirements implemented', checked: false },
      { text: 'Unit tests passing', checked: false },
      { text: 'Integration tests with eva_actions passing', checked: false },
      { text: 'Chairman notification verified', checked: false },
      { text: 'Manual reset verified', checked: false },
      { text: 'No false positives observed', checked: false },
      { text: 'Performance validated (< 10ms overhead)', checked: false }
    ],

    content: `# Chairman Circuit Breaker System PRD

## Strategic Directive
SD-EVA-CIRCUIT-001

## Executive Summary

EVA (Enterprise Value Analysis) system can cause cascading failures if it encounters repeated errors. This PRD defines a circuit breaker pattern to prevent error propagation, notify the Chairman of service degradation, and enable automatic recovery.

**Key Benefits**:
- 100% prevention of EVA failure cascades
- < 1 second notification latency to Chairman
- Automatic recovery after temporary failures
- < 10ms overhead per EVA operation

## Problem Statement

EVA is a critical system for analyzing venture performance. When EVA encounters errors:
1. Multiple ventures may be affected simultaneously
2. Error cascades can propagate through dependent systems
3. The Chairman lacks visibility into system health
4. Recovery requires manual intervention without automated safeguards

## Functional Requirements

See structured \`functional_requirements\` field for detailed requirements.

## Technical Architecture

See structured \`system_architecture\` field for detailed architecture.

## Implementation Approach

See structured \`implementation_approach\` field for phased implementation plan.

## References

- Context7 CircuitBreaker: ./scripts/context7-circuit-breaker.js
- circuit_breaker_state table: database/schema/*
- eva_actions table: SD-EVA-DECISION-001
- system_alerts table: database/schema/*
`
  };

  console.log('💾 Inserting PRD into database...\n');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.log('⚠️  PRD already exists, updating instead...');
      const { data: updated, error: updateError } = await supabase
        .from('product_requirements_v2')
        .update(prdData)
        .eq('id', 'PRD-SD-EVA-CIRCUIT-001')
        .select()
        .single();

      if (updateError) {
        console.log('❌ Update failed:', updateError.message);
        console.log('   Details:', updateError);
        process.exit(1);
      }
      console.log('✅ PRD updated successfully!');
      console.log('   ID:', updated.id);
      console.log('   Title:', updated.title);
      console.log('   Status:', updated.status);
      console.log('');
      printSummary(updated);
      return;
    }
    console.log('❌ Insert failed:', error.message);
    console.log('   Details:', error);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!');
  console.log('');
  printSummary(data);
}

function printSummary(prd) {
  console.log('═══════════════════════════════════════════════════');
  console.log('📋 PRD SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log('ID:', prd.id);
  console.log('Title:', prd.title);
  console.log('Status:', prd.status);
  console.log('Priority:', prd.priority);
  console.log('Phase:', prd.phase);
  console.log('');
  console.log('Functional Requirements:', prd.functional_requirements?.length || 0);
  prd.functional_requirements?.forEach((fr, idx) => {
    console.log(`  ${idx + 1}. [${fr.priority}] ${fr.requirement}`);
  });
  console.log('');
  console.log('Acceptance Criteria:', prd.acceptance_criteria?.length || 0);
  prd.acceptance_criteria?.forEach((ac, idx) => {
    console.log(`  ${idx + 1}. ${ac.criterion || ac}`);
  });
  console.log('');
  console.log('Test Scenarios:', prd.test_scenarios?.length || 0);
  prd.test_scenarios?.forEach((ts, idx) => {
    console.log(`  ${idx + 1}. [${ts.test_type}] ${ts.scenario}`);
  });
  console.log('');
  console.log('Dependencies:', prd.dependencies?.length || 0);
  prd.dependencies?.forEach((dep, idx) => {
    console.log(`  ${idx + 1}. ${dep.id || dep.name} (${dep.status})`);
  });
  console.log('');
  console.log('Success Metrics:');
  prd.metadata?.success_metrics?.forEach((metric, idx) => {
    console.log(`  ${idx + 1}. ${metric.metric}: ${metric.target}`);
  });
  console.log('');
  console.log('Estimated Effort: 3-4 hours (leveraging existing patterns)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('1. Review existing circuit_breaker_state table pattern');
  console.log('2. Review Context7 CircuitBreaker class implementation');
  console.log('3. Design eva_circuit_breaker table schema');
  console.log('4. Begin PLAN phase validation');
  console.log('');
  console.log('🔗 Database Record: product_requirements_v2 table');
  console.log('   Use Supabase dashboard to view full PRD details');
}

createPRD().catch(error => {
  console.error('❌ Fatal error:', error.message);
  console.error(error);
  process.exit(1);
});
