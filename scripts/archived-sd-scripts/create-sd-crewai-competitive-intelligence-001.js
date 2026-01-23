#!/usr/bin/env node

/**
 * Create SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
 * Strategic Directive: Implement CrewAI Agent Integration for Stage 4 Competitive Intelligence
 * Per LEO Protocol v4.3.0
 * Chairman Approved: 2025-11-07
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use SERVICE_ROLE_KEY to bypass RLS policies (per database-agent recommendation)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('Creating SD-CREWAI-COMPETITIVE-INTELLIGENCE-001...\n');

  const sdData = {
    id: 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001',
    sd_key: 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001',
    title: 'Implement CrewAI Agent Integration for Stage 4 Competitive Intelligence',
    version: '1.0',
    status: 'pending_approval',
    priority: 'high',
    category: 'integration',
    sd_type: 'infrastructure',
    current_phase: 'LEAD',

    description: 'Bring Stage 4 (Competitive Intelligence & Market Defense) into compliance with mandatory CrewAI baseline infrastructure by integrating Marketing Department Crew using proven Stage 2 research infrastructure pattern. Implements hybrid approach: Stage 2 baseline (competitive_mapper) + Stage 4 deep analysis (Marketing Department Crew with 4 agents).',

    rationale: 'Stage 4 dossier prescribes LEAD agent for substages 4.1-4.4 (Competitor Identification, Feature Comparison, Market Positioning, Defense Strategy). Under mandatory CrewAI policy (Chairman directive 2025-11-07), dossier prescriptions are binding specifications. Current implementation bypasses CrewAI agents entirely, using direct OpenAI API. This SD brings Stage 4 into compliance by reusing proven Stage 2 research infrastructure.',

    scope: `INCLUDED IN SCOPE:
- Backend: Add session_type: "deep" routing to Marketing Department Crew (research_orchestrator.py)
- Frontend: Auto-trigger deep analysis on Stage 4 entry via ventureResearch.ts service
- UI: Display Stage 2 baseline (competitive_mapper) + Stage 4 deep results side-by-side
- Storage: Reuse venture_drafts.research_results JSONB with versioned structure
- Feature Flag: feature.stage4.crewaiDeep=true (default ON dev/stage, OFF prod)
- Resilience: Fallback banner on crew failure, direct OpenAI failover
- Progress: Real-time progress indicator during 4-agent sequential execution
- Telemetry: Log session metrics (duration, agent execution, token usage)
- Security: Preserve existing RLS policies on venture_drafts

EXCLUDED FROM SCOPE:
- External API integrations (CB Insights, Crunchbase, SimilarWeb) - future enhancement
- New agent creation - reuse existing 6 competitive intelligence agents
- Cross-stage research refactor - isolated to Stage 4 only
- UX redesign - minimal UI changes for compliance
- Feature matrix UI overhaul - use existing components

DATABASE CHANGES:
- Modified tables: venture_drafts (research_results column structure)
- No new tables or columns

DELIVERABLES:
- Backend: research_orchestrator.py updated with "deep" routing
- Service: ventureResearch.ts supports session_type: "deep"
- UI: Stage 4 auto-triggers deep analysis, displays baseline + deep
- Tests: E2E tests for integration, fallback, feature flag
- Documentation: Stage 4 dossier updated with compliance status
- Feature Flag: stage4.crewaiDeep deployed with ON dev/stage, OFF prod
- Telemetry: Session metrics logged for monitoring`,

    success_criteria: [
      {
        criterion: 'CrewAI Invocation: Stage 4 invokes Marketing Department Crew',
        measure: 'E2E test verifies session_type: "deep" routes to Marketing Department Crew, no direct OpenAI bypass'
      },
      {
        criterion: 'UI Behavior: Baseline + deep analysis displayed side-by-side',
        measure: 'Navigate to Stage 4, verify competitive_mapper baseline visible and deep analysis auto-triggers'
      },
      {
        criterion: 'Resilience: Graceful fallback on crew failure',
        measure: 'Simulate crew failure, verify banner displays "Deep analysis unavailable, showing baseline"'
      },
      {
        criterion: 'SLA: ≤25 min P95 execution time with progress indicator',
        measure: 'Performance test confirms P95 ≤25 min, UI shows 4-agent progress (pain_point → competitive → positioning → segmentation)'
      },
      {
        criterion: 'Telemetry: Session metrics logged',
        measure: 'Query database after deep analysis, verify session duration, agent execution times, token usage recorded'
      },
      {
        criterion: 'Security: RLS policies intact',
        measure: 'Database-agent validates venture_drafts RLS policies allow authorized writes only'
      },
      {
        criterion: 'Documentation: Stage 4 dossier compliance status updated',
        measure: 'Stage 4 review files show CrewAI integration status changed from "deferred" to "implemented"'
      }
    ],

    dependencies: [
      {
        dependency: 'Stage 2 research infrastructure (ventureResearch.ts, research_results storage)',
        type: 'technical',
        status: 'ready'
      },
      {
        dependency: 'Marketing Department Crew (4 agents operational)',
        type: 'technical',
        status: 'ready'
      },
      {
        dependency: 'venture_drafts.research_results JSONB column',
        type: 'database',
        status: 'ready'
      }
    ],

    risks: [
      {
        risk: 'Crew execution timeout (>25 min)',
        severity: 'medium',
        mitigation: 'Feature flag OFF in prod initially, monitor P95 in staging'
      },
      {
        risk: 'Research results schema conflict',
        severity: 'high',
        mitigation: 'Versioned structure { quick_validation, deep_competitive } prevents overwrites'
      },
      {
        risk: 'RLS policy blocks crew writes',
        severity: 'high',
        mitigation: 'Database-agent validates RLS before implementation'
      },
      {
        risk: 'Agent-platform unavailable',
        severity: 'low',
        mitigation: 'Fallback to baseline (competitive_mapper), banner notification'
      }
    ],

    metadata: {
      source_stage: 'Stage 4 - Competitive Intelligence & Market Defense',
      source_review_date: '2025-11-07',
      dossier_reference: 'docs/workflow/dossiers/stage-04/06_agent-orchestration.md',
      review_files: [
        'docs/workflow/stage_reviews/stage-04/01_dossier_summary.md',
        'docs/workflow/stage_reviews/stage-04/02_as_built_inventory.md',
        'docs/workflow/stage_reviews/stage-04/03_gap_analysis.md',
        'docs/workflow/stage_reviews/stage-04/04_decision_record.md',
        'docs/workflow/stage_reviews/stage-04/05_outcome_log.md'
      ],
      crewai_verified: false,
      crewai_agents: [
        'pain_point_analysis_agent',
        'competitive_analysis_agent',
        'market_positioning_agent',
        'customer_segmentation_agent'
      ],
      crewai_crew: 'Marketing Department Crew',
      stage2_infrastructure_reuse: true,
      chairman_approved: '2025-11-07',
      mandatory_compliance: true,
      acceptance_criteria_detailed: [
        {
          criteria: 'Backend routing for session_type: "deep" implemented',
          verification: 'POST /api/research/sessions with session_type: "deep" routes to Marketing Department Crew',
          acceptance_test: 'E2E test creates deep session, verifies crew execution'
        },
        {
          criteria: 'Frontend auto-triggers deep analysis on Stage 4 entry',
          verification: 'Stage 4 UI calls ventureResearch.createResearchSession({ session_type: "deep" })',
          acceptance_test: 'Navigate to Stage 4, verify deep session created automatically'
        },
        {
          criteria: 'Research results stored in versioned structure',
          verification: 'venture_drafts.research_results contains { quick_validation: {...}, deep_competitive: {...} }',
          acceptance_test: 'Query database after Stage 4 completion, verify structure'
        },
        {
          criteria: 'Feature flag controls deep analysis execution',
          verification: 'feature.stage4.crewaiDeep=false skips deep analysis, shows baseline only',
          acceptance_test: 'Toggle flag OFF, verify Stage 4 shows baseline without deep trigger'
        },
        {
          criteria: 'Progress indicator shows agent execution status',
          verification: 'UI displays 4-agent progress: pain_point → competitive → positioning → segmentation',
          acceptance_test: 'Watch Stage 4 deep analysis, verify progress updates'
        },
        {
          criteria: 'Fallback banner on crew failure',
          verification: 'Crew failure shows banner with "Deep analysis unavailable, showing baseline"',
          acceptance_test: 'Simulate crew failure, verify banner and baseline display'
        },
        {
          criteria: 'Session telemetry logged',
          verification: 'Database has session duration, agent execution times, token usage',
          acceptance_test: 'Complete deep analysis, query session metrics'
        }
      ],
      test_plan: {
        unit_tests: [
          'research_orchestrator.py: Test _execute_deep_competitive() routing',
          'ventureResearch.ts: Test createResearchSession with session_type: "deep"',
          'Feature flag: Test stage4.crewaiDeep=false skips deep trigger'
        ],
        integration_tests: [
          'POST /api/research/sessions with session_type: "deep" returns 200',
          'Marketing Department Crew executes 4 agents sequentially',
          'Research results stored in venture_drafts.research_results'
        ],
        e2e_tests: [
          'stage4-crewai-integration.spec.ts: Navigate Stage 4, verify deep auto-trigger',
          'stage4-crewai-fallback.spec.ts: Simulate crew failure, verify baseline fallback',
          'stage4-feature-flag.spec.ts: Toggle flag OFF, verify deep skipped'
        ],
        performance_tests: [
          'Crew execution time ≤25 min P95',
          'UI progress updates within 2 sec of agent transitions',
          'Baseline display ≤1 sec on crew failure'
        ]
      },
      rollback_strategy: {
        trigger_conditions: [
          'Crew execution timeout >30 min P95',
          'Failure rate >10% in production',
          'RLS policy blocks venture_drafts writes'
        ],
        rollback_steps: [
          'Step 1: Set feature.stage4.crewaiDeep=false globally',
          'Step 2: Verify Stage 4 reverts to baseline-only display',
          'Step 3: Monitor for zero crew invocations',
          'Step 4: Database-agent validates no schema corruption',
          'Step 5: Incident retrospective within 48 hours'
        ]
      },
      non_goals: [
        'External API integrations (CB Insights, Crunchbase) - deferred to future SD',
        'New crew creation - reuse existing Marketing Department Crew',
        'Agent role modifications - use agents as-is',
        'Cross-stage research refactor - Stage 4 only',
        'Feature matrix UI overhaul - separate enhancement'
      ],
      implementation_guidelines: [
        'Step 1: Add "deep" routing in research_orchestrator.py line 298',
        'Step 2: Create _execute_deep_competitive() method invoking Marketing Department Crew',
        'Step 3: Update ventureResearch.ts to support session_type: "deep"',
        'Step 4: Modify Stage 4 UI to auto-trigger deep session on mount',
        'Step 5: Update ResearchResultsCard to display baseline + deep side-by-side',
        'Step 6: Add feature flag check: if (!flags.stage4.crewaiDeep) skip deep trigger',
        'Step 7: Implement progress polling with agent status display',
        'Step 8: Add fallback banner component for crew failures',
        'Step 9: Create E2E test: stage4-crewai-integration.spec.ts',
        'Step 10: Update Stage 4 dossier compliance status in review files'
      ]
    },

    sequence_rank: 1000, // High priority for mandatory compliance
    created_by: 'LEAD',
    target_application: 'EHG' // Customer-facing application
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error.message);
      process.exit(1);
    }

    console.log('✅ SD-CREWAI-COMPETITIVE-INTELLIGENCE-001 created successfully!\n');
    console.log('Database record:', JSON.stringify(data, null, 2));

    console.log('\n📋 Next steps per LEO Protocol:');
    console.log('1. Invoke database-agent for schema validation');
    console.log('2. Invoke design-agent for UI validation');
    console.log('3. Create LEAD→PLAN handoff');
    console.log('4. Update Stage 4 review files (move from deferred to created)');
    console.log('5. Status will remain "pending_lead_approval" until Chairman signs off');

  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    process.exit(1);
  }
}

createStrategicDirective();
