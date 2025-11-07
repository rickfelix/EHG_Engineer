#!/usr/bin/env node

/**
 * Enrich PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Context: PLAN phase - v4.3.0 automated learning
 * Source: SD metadata + RLS lessons learned + Stage 4 review
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function enrichPRD() {
  console.log('\n🚀 PRD Enrichment: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');
  console.log('═'.repeat(70));

  // Step 1: Load SD metadata
  console.log('\n📋 Step 1: Loading SD metadata...');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .single();

  if (sdError) {
    console.error('❌ Error loading SD:', sdError.message);
    process.exit(1);
  }

  console.log('✅ SD loaded:', sd.title);

  // Step 2: Extract enrichment data from SD
  const acceptanceCriteria = sd.metadata?.acceptance_criteria_detailed || [];
  const testPlan = sd.metadata?.test_plan || {};
  const implementationGuidelines = sd.metadata?.implementation_guidelines || [];
  const rollbackStrategy = sd.metadata?.rollback_strategy || {};
  const nonGoals = sd.metadata?.non_goals || [];

  // Step 3: Build enriched functional requirements from SD
  const functionalRequirements = [
    {
      id: 'FR-001',
      requirement: 'Backend CrewAI Integration: Add session_type: "deep" routing to Marketing Department Crew in research_orchestrator.py',
      priority: 'HIGH',
      acceptance_criteria: [
        'POST /api/research/sessions with session_type: "deep" routes to Marketing Department Crew',
        'E2E test verifies crew execution with 4 agents (pain_point → competitive → positioning → segmentation)',
        'Session metrics logged (duration, agent execution times, token usage)'
      ],
      implementation_notes: implementationGuidelines.filter(g => g.includes('research_orchestrator') || g.includes('Marketing Department'))
    },
    {
      id: 'FR-002',
      requirement: 'Frontend Auto-Trigger: Stage 4 UI automatically triggers deep analysis on mount',
      priority: 'HIGH',
      acceptance_criteria: [
        'Stage 4 calls ventureResearch.createResearchSession({ session_type: "deep" }) on mount',
        'Feature flag stage4.crewaiDeep controls auto-trigger (default ON dev/stage, OFF prod)',
        'Progress indicator shows 4-agent execution status in real-time'
      ],
      implementation_notes: implementationGuidelines.filter(g => g.includes('Stage 4') || g.includes('auto-trigger'))
    },
    {
      id: 'FR-003',
      requirement: 'Data Storage: Versioned research results structure in venture_drafts.research_results',
      priority: 'HIGH',
      acceptance_criteria: [
        'Structure: { quick_validation: {...}, deep_competitive: {...} }',
        'Database-agent validated schema compatibility (no migration required)',
        'RLS policies allow authenticated users read/write access'
      ],
      implementation_notes: ['Leverage existing JSONB column', 'No schema changes required per database-agent validation']
    },
    {
      id: 'FR-004',
      requirement: 'UI Display: Side-by-side comparison of Stage 2 baseline vs Stage 4 deep analysis',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'Reuse existing ComparisonViewComponent.tsx (671 LOC)',
        'Display competitive_mapper baseline on left, deep analysis on right',
        'Add ARIA live regions for progress updates (a11y compliance)'
      ],
      implementation_notes: implementationGuidelines.filter(g => g.includes('side-by-side') || g.includes('ComparisonView'))
    },
    {
      id: 'FR-005',
      requirement: 'Resilience: Graceful fallback on crew failure',
      priority: 'HIGH',
      acceptance_criteria: [
        'Crew failure displays banner: "Deep analysis unavailable, showing baseline"',
        'Fallback to Stage 2 baseline (competitive_mapper) automatically',
        'E2E test simulates crew failure and verifies banner + baseline display'
      ],
      implementation_notes: implementationGuidelines.filter(g => g.includes('fallback'))
    },
    {
      id: 'FR-006',
      requirement: 'Performance SLA: ≤25 min P95 execution time with progress indicator',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'Performance test confirms P95 ≤25 min for 4-agent crew execution',
        'Progress indicator updates within 2 sec of agent transitions',
        'Feature flag allows disabling deep analysis if SLA breached'
      ],
      implementation_notes: ['Monitor in staging before prod rollout', 'Feature flag stage4.crewaiDeep=false provides escape hatch']
    }
  ];

  // Step 4: Build comprehensive test scenarios
  const testScenarios = [
    {
      id: 'TS-UNIT-001',
      scenario: 'Unit test: research_orchestrator.py _execute_deep_competitive() routing',
      test_type: 'unit',
      expected_result: 'session_type: "deep" routes to Marketing Department Crew',
      implementation_notes: testPlan.unit_tests || []
    },
    {
      id: 'TS-UNIT-002',
      scenario: 'Unit test: ventureResearch.ts createResearchSession with session_type: "deep"',
      test_type: 'unit',
      expected_result: 'POST request includes session_type: "deep" parameter',
      implementation_notes: testPlan.unit_tests || []
    },
    {
      id: 'TS-UNIT-003',
      scenario: 'Unit test: Feature flag stage4.crewaiDeep=false skips deep trigger',
      test_type: 'unit',
      expected_result: 'Deep analysis not triggered when flag OFF',
      implementation_notes: testPlan.unit_tests || []
    },
    {
      id: 'TS-E2E-001',
      scenario: 'E2E test: stage4-crewai-integration.spec.ts - Navigate Stage 4, verify deep auto-trigger',
      test_type: 'e2e',
      expected_result: 'Stage 4 mount triggers deep session, 4 agents execute sequentially, results displayed side-by-side',
      implementation_notes: testPlan.e2e_tests || []
    },
    {
      id: 'TS-E2E-002',
      scenario: 'E2E test: stage4-crewai-fallback.spec.ts - Simulate crew failure, verify baseline fallback',
      test_type: 'e2e',
      expected_result: 'Crew failure shows banner + baseline display, no error thrown',
      implementation_notes: testPlan.e2e_tests || []
    },
    {
      id: 'TS-E2E-003',
      scenario: 'E2E test: stage4-feature-flag.spec.ts - Toggle flag OFF, verify deep skipped',
      test_type: 'e2e',
      expected_result: 'Flag OFF prevents deep trigger, only baseline shown',
      implementation_notes: testPlan.e2e_tests || []
    },
    {
      id: 'TS-PERF-001',
      scenario: 'Performance test: Crew execution time ≤25 min P95',
      test_type: 'performance',
      expected_result: 'P95 latency ≤25 min across 20 test runs',
      implementation_notes: testPlan.performance_tests || []
    },
    {
      id: 'TS-PERF-002',
      scenario: 'Performance test: UI progress updates within 2 sec of agent transitions',
      test_type: 'performance',
      expected_result: 'Progress indicator reflects agent status changes with <2 sec delay',
      implementation_notes: testPlan.performance_tests || []
    }
  ];

  // Step 5: Build enhanced acceptance criteria from SD
  const enhancedAcceptanceCriteria = acceptanceCriteria.map((ac, i) => {
    return `${ac.criteria} - Verified by: ${ac.verification}. Test: ${ac.acceptance_test}`;
  });

  // Step 6: Build executive summary
  const executiveSummary = `Integrate CrewAI Marketing Department Crew (4 agents: pain_point_analysis, competitive_analysis, market_positioning, customer_segmentation) into Stage 4 Competitive Intelligence to achieve mandatory CrewAI baseline infrastructure compliance per Chairman directive 2025-11-07. Implements hybrid approach: Stage 2 baseline (competitive_mapper) + Stage 4 deep analysis with feature flag control, graceful fallback, and ≤25 min P95 SLA. Estimated implementation: 487 LOC (COMPLIANT with 300-600 LOC sweet spot per design-agent validation).`;

  // Step 7: Build enhanced content with implementation context
  const enhancedContent = `# Product Requirements Document

## Strategic Directive
**SD**: ${sd.id}
**Title**: ${sd.title}
**Priority**: ${sd.priority}
**Category**: ${sd.category}
**Status**: ${sd.status}

## Context

### CrewAI Compliance Policy
Per Chairman directive (2025-11-07), CrewAI is mandatory baseline infrastructure for all 40 stages. Stage 4 dossier (06_agent-orchestration.md) prescribes LEAD agent for substages 4.1-4.4. Current implementation bypasses CrewAI entirely. This PRD brings Stage 4 into mandatory compliance.

### Stage 4 Current State
- **LOC**: 3,584 LOC across 8 components (verified by design-agent)
- **Crew Available**: Marketing Department Crew with 4 agents
- **Infrastructure Ready**: Stage 2 research pattern proven and reusable
- **Database Validated**: venture_drafts.research_results supports versioned structure (database-agent validation)

## Approach: Hybrid Pattern

**Stage 2 Baseline (Quick)**:
- Agent: competitive_mapper
- Duration: ~2 min
- Output: High-level competitive landscape
- Display: Always shown (fallback on crew failure)

**Stage 4 Deep Analysis (Comprehensive)**:
- Crew: Marketing Department Crew
- Agents: 4 agents (pain_point → competitive → positioning → segmentation)
- Duration: ≤25 min P95
- Output: Deep competitive intelligence with positioning strategy
- Display: Side-by-side with baseline
- Control: Feature flag stage4.crewaiDeep (default ON dev/stage, OFF prod)

## Functional Requirements

${functionalRequirements.map(fr => `### ${fr.id}: ${fr.requirement}

**Priority**: ${fr.priority}

**Acceptance Criteria**:
${fr.acceptance_criteria.map(ac => `- ${ac}`).join('\n')}

**Implementation Notes**:
${fr.implementation_notes && fr.implementation_notes.length > 0 ? fr.implementation_notes.map(note => `- ${note}`).join('\n') : '- See SD metadata for detailed guidelines'}
`).join('\n')}

## Test Strategy

### Test Coverage by Type
${Object.entries(testScenarios.reduce((acc, ts) => {
  acc[ts.test_type] = (acc[ts.test_type] || 0) + 1;
  return acc;
}, {})).map(([type, count]) => `- **${type}**: ${count} test scenarios`).join('\n')}

### Detailed Test Scenarios
${testScenarios.map(ts => `#### ${ts.id}: ${ts.scenario}
- **Type**: ${ts.test_type}
- **Expected Result**: ${ts.expected_result}
`).join('\n')}

## Rollback Strategy

**Trigger Conditions**:
${(rollbackStrategy.trigger_conditions || []).map(tc => `- ${tc}`).join('\n')}

**Rollback Steps**:
${(rollbackStrategy.rollback_steps || []).map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Non-Goals (Out of Scope)

${(nonGoals || []).map(ng => `- ${ng}`).join('\n')}

## Implementation Context (From SD Metadata)

### Dependencies
${(sd.dependencies || []).map(dep => `- **${dep.dependency}** (${dep.type}): ${dep.status}`).join('\n')}

### Risks
${(sd.risks || []).map(risk => `- **${risk.risk}** (${risk.severity}): ${risk.mitigation}`).join('\n')}

### Component Sizing Validation (Design-Agent)
- **Current Stage 4**: 3,584 LOC (8 components)
- **Estimated Addition**: 190 LOC (auto-trigger + progress + comparison + fallback + integration)
- **Projected Total**: 487 LOC for enhanced CompetitiveIntelResults.tsx
- **Compliance**: ✅ COMPLIANT (within 300-600 LOC sweet spot per CLAUDE_PLAN.md)

### Database Schema Validation (Database-Agent)
- **Table**: venture_drafts.research_results (JSONB column)
- **Structure**: Versioned { quick_validation, deep_competitive }
- **Migration Required**: ❌ NO (existing JSONB supports structure)
- **RLS Policies**: ✅ COMPATIBLE (authenticated users have read/write access)

## Success Metrics

${(sd.success_criteria || []).map(sc => `### ${sc.criterion}
**Measure**: ${sc.measure}
`).join('\n')}

## Chairman Approval

**Directive Date**: 2025-11-07
**Acceptance Criteria**: 7 criteria defined in SD metadata
**Validation**: LEAD phase complete, PLAN phase in progress

---

*Generated by: Claude Code (LEO Protocol v4.3.0)*
*PRD Enrichment: Automated learning from SD metadata, database-agent validation, design-agent assessment*
*Date: 2025-11-07*
`;

  // Step 8: Update PRD in database
  console.log('\n📝 Step 2: Updating PRD with enriched data...');

  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      executive_summary: executiveSummary,
      functional_requirements: functionalRequirements,
      acceptance_criteria: enhancedAcceptanceCriteria,
      test_scenarios: testScenarios,
      content: enhancedContent,
      progress: 40, // PLAN phase enrichment complete
      metadata: {
        enriched_from_sd: true,
        enrichment_date: new Date().toISOString(),
        sd_metadata_version: '1.0',
        database_agent_validated: true,
        design_agent_validated: true,
        component_sizing_projection: '487 LOC',
        estimated_total_loc: 987
      }
    })
    .eq('id', 'PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');

  if (updateError) {
    console.error('❌ Error updating PRD:', updateError.message);
    process.exit(1);
  }

  console.log('✅ PRD enriched successfully!');

  // Step 9: Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 Enrichment Summary');
  console.log('═'.repeat(70));
  console.log(`\nFunctional Requirements: ${functionalRequirements.length}`);
  console.log(`Test Scenarios: ${testScenarios.length}`);
  console.log(`Acceptance Criteria: ${enhancedAcceptanceCriteria.length}`);
  console.log(`Executive Summary: ${executiveSummary.length} chars`);
  console.log(`Content: ${enhancedContent.length} chars`);
  console.log(`Progress: 10% → 40%`);

  console.log('\n✅ PRD enrichment complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Verify component sizing compliance');
  console.log('2. Document testing strategy');
  console.log('3. Create PLAN→EXEC handoff');
  console.log('═'.repeat(70));
}

enrichPRD();
