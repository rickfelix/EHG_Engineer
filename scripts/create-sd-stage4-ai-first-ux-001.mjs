#!/usr/bin/env node

/**
 * Create SD-STAGE4-AI-FIRST-UX-001
 * Strategic Directive: AI-First Competitive Intelligence UX
 * Per LEO Protocol v4.2.0
 * Chairman Approved via LEAD Strategic Validation Gate: 2025-11-08
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
  console.log('Creating SD-STAGE4-AI-FIRST-UX-001...\n');

  const sdData = {
    id: 'SD-STAGE4-AI-FIRST-UX-001',
    sd_key: 'SD-STAGE4-AI-FIRST-UX-001',
    title: 'AI-First Competitive Intelligence UX',
    version: '1.0',
    status: 'active',
    priority: 'high',
    category: 'feature',
    sd_type: 'feature',
    current_phase: 'LEAD',

    description: 'Transform Stage 4 (Competitive Intelligence) from manual-first to AI-first workflow. Auto-start AI agents on page load, provide prominent progress tracking, block navigation until analysis completes, and hide manual entry in advanced settings.',

    rationale: 'Current Stage 4 UI prominently features manual competitor entry forms, while AI agents run silently in background after user clicks Complete Analysis & Continue. This inverts the value proposition: users must manually enter data when automated AI research is the core capability. User explicitly stated: "I as a user, I\'m not going to manually enter the competitor\'s information."',

    scope: `INCLUDED IN SCOPE:
- UI Restructure (Phase 1, 2-3 days): Move manual entry to Advanced Settings accordion, create prominent AI progress card with task-level breakdown
- Agent Integration & Progress Tracking (Phase 2, 2-3 days): Create agent_execution_logs table, implement real-time progress streaming from Agent Platform to React UI
- Results Display (Phase 3, 1-2 days): Update 6-tab UI (Overview, Features, Pricing, SWOT, Positioning, Narrative) to consume AI-generated results
- Error Handling (Phase 4, 1 day): Graceful fallback to manual entry on agent failures, retry mechanism, explicit Skip button

EXCLUDED FROM SCOPE:
- External API integrations (CB Insights, Crunchbase, SimilarWeb) - future enhancement
- Agent performance optimization - use existing agent execution times
- Multi-competitor parallelization - sequential processing acceptable for MVP
- Real-time agent output streaming - polling-based progress acceptable for MVP

DATABASE CHANGES:
- New table: agent_execution_logs (tracks progress for UI display)
- Modified tables: venture_drafts (research_results structure), competitors (AI-generated fields)

DELIVERABLES:
- UI: Stage 4 auto-starts AI agents on mount, shows progress card with live activity feed
- Backend: Progress tracking API endpoints (GET /api/agents/execution-logs/:venture_id)
- Service: ventureResearch.ts supports progress polling and agent status
- Database: agent_execution_logs table with RLS policies
- Tests: E2E tests for auto-start, progress display, navigation blocking, manual fallback
- Documentation: Stage 4 dossier updated with AI-first workflow`,

    strategic_intent: 'Showcase EHG\'s AI-first value proposition by making automated competitive intelligence the primary workflow, with manual data entry as an advanced fallback. This aligns with product positioning as an AI-powered venture building platform.',

    success_criteria: [
      {
        criterion: 'AI analysis auto-starts on Stage 4 page load',
        measure: 'E2E test: Navigate to Stage 4, verify agent execution starts within 2 seconds without user click'
      },
      {
        criterion: 'Prominent progress UI showing task-level breakdown + live activity feed',
        measure: 'UI displays: "Analyzing competitors... (2/5 tasks complete)" with expandable activity log showing agent actions'
      },
      {
        criterion: 'Navigation blocked until AI analysis completes or user explicitly skips',
        measure: 'Next/Back buttons disabled during analysis, Skip button displays "Continue without AI analysis" confirmation modal'
      },
      {
        criterion: 'Manual competitor entry hidden in Advanced Settings accordion',
        measure: 'Manual entry UI collapsed by default, requires accordion click to reveal, labeled "Manual Entry (Advanced)"'
      },
      {
        criterion: 'Real-time progress streaming from Agent Platform to React UI',
        measure: 'Progress updates visible within 5 seconds of agent task transitions, polling interval ≤3 seconds'
      },
      {
        criterion: 'Graceful fallback to manual entry on agent failures',
        measure: 'Agent failure shows error banner + auto-expands Advanced Settings accordion with manual entry form'
      }
    ],

    dependencies: [
      {
        dependency: 'Agent Platform operational with Stage 4 competitive intelligence agents',
        type: 'technical',
        status: 'ready'
      },
      {
        dependency: 'venture_drafts.research_results JSONB column exists',
        type: 'database',
        status: 'ready'
      },
      {
        dependency: 'Stage 4 UI component (CompetitiveIntelligence.tsx) exists',
        type: 'technical',
        status: 'ready'
      }
    ],

    risks: [
      {
        risk: 'Agent execution time unpredictable (may exceed user patience threshold)',
        severity: 'medium',
        mitigation: 'Display estimated time + progress indicator, provide Skip button after 30 seconds'
      },
      {
        risk: 'Agent failures block workflow entirely',
        severity: 'high',
        mitigation: 'Automatic fallback to manual entry on any agent error, retry button, clear error messaging'
      },
      {
        risk: 'Progress streaming adds complexity (WebSockets vs polling)',
        severity: 'low',
        mitigation: 'Use polling as MVP (3-second interval), defer WebSockets to future enhancement'
      },
      {
        risk: 'Navigation blocking frustrates users if agents are slow',
        severity: 'medium',
        mitigation: 'Skip button always available, estimated time display, activity feed shows progress'
      }
    ],

    metadata: {
      source_stage: 'Stage 4 - Competitive Intelligence & Market Defense',
      chairman_input: 'User explicitly requested AI-first UX for Stage 4 with auto-start, progress tracking, and manual entry hidden. Direct quote: "I as a user, I\'m not going to manually enter the competitor\'s information."',
      chairman_approved: '2025-11-08',
      lead_validation_gate_completed: true,
      estimated_effort: '6-9 days (4 phases)',
      proposed_solution: {
        phase_1: 'UI Restructure (2-3 days): Move manual entry to accordion, create prominent AI progress card',
        phase_2: 'Agent Integration & Progress Tracking (2-3 days): Create agent_execution_logs table, implement progress streaming',
        phase_3: 'Results Display (1-2 days): Update 6-tab UI to consume AI results',
        phase_4: 'Error Handling (1 day): Fallback to manual entry, retry mechanism, skip button'
      },
      acceptance_criteria_detailed: [
        {
          criteria: 'Auto-start on page load',
          verification: 'useEffect hook calls ventureResearch.startAgentAnalysis() on mount',
          acceptance_test: 'E2E: Navigate to Stage 4, verify API call to /api/agents/start within 2 seconds'
        },
        {
          criteria: 'Progress card displays task breakdown',
          verification: 'UI polls /api/agents/execution-logs/:venture_id every 3 seconds, displays task_name + status',
          acceptance_test: 'E2E: Start analysis, verify progress updates visible (e.g., "Analyzing competitor features... 60%")'
        },
        {
          criteria: 'Navigation blocked during analysis',
          verification: 'Next/Back buttons disabled when agent_status = "running"',
          acceptance_test: 'E2E: Click Next during analysis, verify button is disabled'
        },
        {
          criteria: 'Skip button available',
          verification: 'Skip button visible after agent_status = "running" for >10 seconds',
          acceptance_test: 'E2E: Click Skip, verify confirmation modal, proceed to manual entry'
        },
        {
          criteria: 'Manual entry in Advanced Settings',
          verification: 'Accordion labeled "Advanced Settings" collapsed by default, contains manual competitor form',
          acceptance_test: 'E2E: Verify manual entry hidden, click accordion, verify form visible'
        },
        {
          criteria: 'Fallback on agent failure',
          verification: 'agent_status = "failed" auto-expands Advanced Settings, shows error banner',
          acceptance_test: 'E2E: Simulate agent failure, verify error message + manual entry visible'
        }
      ],
      test_plan: {
        unit_tests: [
          'ventureResearch.ts: Test startAgentAnalysis() API call',
          'ventureResearch.ts: Test getExecutionLogs() polling logic',
          'CompetitiveIntelligence.tsx: Test auto-start on mount',
          'CompetitiveIntelligence.tsx: Test navigation blocking when analyzing'
        ],
        integration_tests: [
          'POST /api/agents/start returns 200 with execution_id',
          'GET /api/agents/execution-logs/:venture_id returns progress array',
          'Agent failure returns 500, triggers fallback UI'
        ],
        e2e_tests: [
          'stage4-ai-autostart.spec.ts: Navigate to Stage 4, verify auto-start',
          'stage4-progress-tracking.spec.ts: Verify progress updates during analysis',
          'stage4-navigation-blocking.spec.ts: Verify Next/Back disabled during analysis',
          'stage4-skip-button.spec.ts: Click Skip, verify manual entry fallback',
          'stage4-manual-fallback.spec.ts: Simulate agent failure, verify manual entry visible',
          'stage4-advanced-settings.spec.ts: Verify manual entry hidden in accordion'
        ],
        performance_tests: [
          'Progress updates visible within 5 seconds of agent task transitions',
          'UI polling interval ≤3 seconds',
          'Skip button appears within 1 second of 10-second threshold'
        ]
      },
      implementation_guidelines: [
        'Step 1: Database - Create agent_execution_logs table with RLS policies (PLAN agent)',
        'Step 2: Backend - Add GET /api/agents/execution-logs/:venture_id endpoint',
        'Step 3: Service - Update ventureResearch.ts with startAgentAnalysis() and getExecutionLogs()',
        'Step 4: UI - Refactor CompetitiveIntelligence.tsx to auto-start agents on mount',
        'Step 5: UI - Create ProgressCard component with task breakdown + activity feed',
        'Step 6: UI - Move manual entry to AdvancedSettings accordion (collapsed by default)',
        'Step 7: UI - Disable Next/Back buttons when agent_status = "running"',
        'Step 8: UI - Add Skip button with confirmation modal',
        'Step 9: UI - Implement fallback: agent failure → auto-expand Advanced Settings',
        'Step 10: Tests - Create E2E test suite (6 tests above)',
        'Step 11: Documentation - Update Stage 4 dossier with AI-first workflow'
      ],
      rollback_strategy: {
        trigger_conditions: [
          'Agent auto-start causes >20% increase in API errors',
          'User complaints about forced AI workflow (>5 reports)',
          'Performance degradation (page load >3 seconds P95)'
        ],
        rollback_steps: [
          'Step 1: Add feature flag feature.stage4.aiAutoStart (default OFF)',
          'Step 2: Revert to manual "Start AI Analysis" button when flag OFF',
          'Step 3: Keep progress tracking + manual fallback (non-breaking)',
          'Step 4: Monitor metrics for 48 hours',
          'Step 5: Incident retrospective to identify root cause'
        ]
      },
      non_goals: [
        'External API integrations (CB Insights, Crunchbase) - separate SD',
        'Real-time WebSocket streaming - polling sufficient for MVP',
        'Multi-competitor parallel processing - sequential acceptable',
        'Agent performance optimization - use existing execution times',
        'UX redesign of 6-tab results display - only data source changes'
      ]
    },

    sequence_rank: 850,
    created_by: 'LEAD',
    target_application: 'EHG'
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error.message);
      console.error('Full error details:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    console.log('✅ SD-STAGE4-AI-FIRST-UX-001 created successfully!\n');
    console.log('Database record:', JSON.stringify(data, null, 2));

    console.log('\n📋 Next steps per LEO Protocol:');
    console.log('1. Invoke database-agent for agent_execution_logs table schema validation');
    console.log('2. Invoke design-agent for UI validation (progress card, Advanced Settings accordion)');
    console.log('3. Create LEAD→PLAN handoff (after Chairman final sign-off)');
    console.log('4. Status: "active" (LEAD approved via strategic validation gate)');
    console.log('5. Current Phase: LEAD (awaiting Chairman final approval to proceed to PLAN)');

    console.log('\n🎯 Strategic Validation Gate Results:');
    console.log('✅ Q1: Simplicity - AI-first workflow simplifies user experience (no manual data entry)');
    console.log('✅ Q2: Business Value - Showcases AI capabilities, aligns with product positioning');
    console.log('✅ Q3: Timing - Stage 4 needs improvement, user explicitly requested this UX');
    console.log('✅ Q4: Constraints - Reuses existing agents, no external APIs, 6-9 day estimate reasonable');
    console.log('✅ Q5: Rollback - Feature flag + fallback to manual entry provides safe rollback');
    console.log('✅ Q6: Edge Cases - Agent failures handled with manual fallback, skip button for slow agents');

  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

createStrategicDirective();
