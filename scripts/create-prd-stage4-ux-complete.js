#!/usr/bin/env node

/**
 * PRD Creation for SD-STAGE4-UX-EDGE-CASES-001
 * Complete PRD with all requirements filled in
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_ID = 'SD-STAGE4-UX-EDGE-CASES-001';
const PRD_ID = 'PRD-SD-STAGE4-UX-EDGE-CASES-001';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating Complete PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch SD UUID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found:', sdError?.message);
    process.exit(1);
  }

  console.log('✅ Found SD:', sd.title);
  console.log('   UUID:', sd.uuid_id);

  const prd = {
    id: PRD_ID,
    sd_id: SD_ID,
    sd_uuid: sd.uuid_id,
    title: 'Stage 4 UX Improvements: Zero Competitor & Failed Research Edge Cases - Technical Implementation',
    version: '1.0',
    status: 'planning',
    category: sd.category,
    priority: sd.priority,

    // Executive Summary
    executive_summary: `Enhance Stage 4 Competitive Intelligence UX to handle edge cases where AI analysis produces non-standard results. Currently, users cannot distinguish between different completion states (AI found 0 competitors vs. AI hasn't run vs. extraction failed). This creates confusion and blocks legitimate blue ocean opportunities.

This PRD implements a comprehensive state machine for AI completion statuses, exposes quality metadata to build user trust, adds LLM extraction fallback for robustness, and provides clear visual indicators for each scenario.

Expected Impact: 80% reduction in user confusion, 60% reduction in support tickets, 70% reduction in extraction failures, 100% blue ocean scenario support.`,

    // Business Context
    business_context: `**Business Justification**: Stage 4 is a critical decision point in the venture workflow. Current UX confusion at this stage erodes trust in AI automation and blocks users from proceeding with valid blue ocean opportunities (markets with zero direct competitors).

**Value Proposition**: By providing transparent AI result interpretation and clear guidance for edge cases, we enable confident decision-making and reduce friction in the venture validation process.

**Target Users**: Venture founders using the EHG platform to validate market opportunities through AI-powered competitive analysis.`,

    // Technical Context
    technical_context: `**Existing Systems**:
- Frontend: React + TypeScript, Stage4CompetitiveIntelligence.tsx (1062 LOC), AgentResultsDisplay.tsx, useAgentExecutionStatus.ts hook
- Backend: Python FastAPI, research_orchestrator.py (717 LOC), CompetitiveMapperAgent with regex-based extraction
- Database: research_sessions table (Supabase), no schema changes required

**Constraints**:
- Must maintain backward compatibility with existing agent execution API
- LLM fallback adds 2-5s latency (acceptable for <10% of cases)
- State complexity requires clear documentation and logging

**Technology Stack**: React 18, TypeScript 5, Shadcn UI, Python 3.11, Claude 4.5 Sonnet (LLM fallback), FastAPI`,

    // Functional Requirements (minimum 3)
    functional_requirements: [
      {
        id: 'FR-1',
        priority: 'CRITICAL',
        description: 'User must be able to distinguish between 4 AI completion states',
        acceptance_criteria: [
          'success-with-data: Shows competitor count badge and results tabs',
          'success-zero-found: Shows blue ocean opportunity card with explanation',
          'partial-extraction: Shows warning with raw analysis accordion',
          'failed: Shows error card with retry button'
        ],
        user_story_mapping: ['US-001', 'US-002']
      },
      {
        id: 'FR-2',
        priority: 'HIGH',
        description: 'Raw AI analysis must be accessible when extraction fails',
        acceptance_criteria: [
          'Accordion component in partial-extraction state',
          'Shows full analysis text from backend',
          'Syntax highlighting for structured data',
          'Copy-to-clipboard functionality'
        ],
        user_story_mapping: ['US-001']
      },
      {
        id: 'FR-3',
        priority: 'HIGH',
        description: 'Quality metadata visible to user (confidence scores, issues)',
        acceptance_criteria: [
          'Badge showing confidence score 0-100%',
          'Color-coded: green ≥80%, amber 60-79%, red <60%',
          'Tooltip with quality issues list',
          'Visible in all success states'
        ],
        user_story_mapping: ['US-003']
      },
      {
        id: 'FR-4',
        priority: 'MEDIUM',
        description: 'LLM extraction fallback reduces regex failure rate by 70%',
        acceptance_criteria: [
          'Triggers when regex finds ≤1 competitors AND analysis >200 chars',
          'Uses Claude 4.5 Sonnet for structured extraction',
          'Adds quality_metadata.extraction_method field',
          'Logs fallback usage for monitoring'
        ],
        user_story_mapping: ['US-004']
      },
      {
        id: 'FR-5',
        priority: 'LOW',
        description: 'Blue ocean bypass allows proceeding with 0 competitors',
        acceptance_criteria: [
          'Button appears in success-zero-found state',
          'Requires justification textarea (min 50 chars)',
          'Saves justification to venture metadata',
          'Proceeds to next stage'
        ],
        user_story_mapping: ['US-005']
      }
    ],

    // Non-Functional Requirements
    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'LLM extraction fallback completes within 5 seconds',
        measurement: 'Backend latency monitoring',
        target: '<5s for 95th percentile'
      },
      {
        type: 'usability',
        requirement: 'State clarity score ≥90% in post-launch survey',
        measurement: 'User survey: "Can you identify the AI completion state?"',
        target: '90% correct identification'
      },
      {
        type: 'reliability',
        requirement: 'Extraction failure rate ≤30% (down from 100% regex-only)',
        measurement: 'Backend metrics: successful extractions / total attempts',
        target: '≥70% success rate'
      }
    ],

    // Technical Requirements
    technical_requirements: [
      {
        id: 'TR-1',
        description: 'TypeScript: Define AgentCompletionStatus enum with 4 states'
      },
      {
        id: 'TR-2',
        description: 'Frontend: Update useAgentExecutionStatus hook with state machine logic'
      },
      {
        id: 'TR-3',
        description: 'Backend: Add quality_metadata to agent execution API response (v2 field)'
      },
      {
        id: 'TR-4',
        description: 'Backend: Implement _llm_extract_competitors() in CompetitiveMapperAgent'
      },
      {
        id: 'TR-5',
        description: 'UI: Create reusable QualityBadge component with confidence score display'
      }
    ],

    // System Architecture
    system_architecture: `## Component Architecture

### Frontend (React + TypeScript)
**Modified Components**:
- Stage4CompetitiveIntelligence.tsx: Enhanced state handling (+150 LOC)
- AgentResultsDisplay.tsx: Add raw analysis tab (+80 LOC)
- useAgentExecutionStatus.ts: State machine logic (+60 LOC)

**New Components**:
- QualityBadge.tsx: Confidence score indicator (~50 LOC)
- RawAnalysisAccordion.tsx: Collapsible raw text view (~70 LOC)
- BlueOceanBypassDialog.tsx: Justification modal (~90 LOC)

**Type Definitions**:
- AgentCompletionStatus enum (4 states)
- QualityMetadata interface
- ExecutionResult interface (enhanced)

### Backend (Python + FastAPI)
**Modified Files**:
- research_orchestrator.py: Expose quality_metadata (+30 LOC)
- competitive_mapper.py: Add LLM fallback method (+120 LOC)
- agent_execution.py: API response versioning (+20 LOC)

**New Methods**:
- CompetitiveMapperAgent._llm_extract_competitors()
- CompetitiveMapperAgent._determine_completion_status()

### State Machine Flow
\`\`\`
API Response Analysis
  ↓
├─ competitors.length > 0? → success-with-data
├─ competitors.length === 0 AND analysis exists? → success-zero-found
├─ extraction_failed === true? → partial-extraction
└─ error? → failed
\`\`\``,

    // Data Model
    data_model: {
      tables: [],
      note: 'No schema changes required. Uses existing research_sessions and agent execution tracking.'
    },

    // API Specifications (documenting backend modifications)
    api_specifications: [
      {
        endpoint: '/api/agent-execution/list',
        method: 'GET',
        description: 'Enhanced response with quality_metadata field',
        request: {},
        response: {
          executions: [{
            id: 'string',
            status: 'success',
            completion_status: 'success-with-data | success-zero-found | partial-extraction | failed',
            results: {
              competitive: {
                competitors: [],
                summary: 'string',
                quality_metadata: {
                  confidence_score: 85,
                  quality_issues: [],
                  extraction_method: 'regex | llm_fallback'
                }
              }
            }
          }]
        }
      }
    ],

    // UI/UX Requirements
    ui_ux_requirements: [
      {
        component: 'AIProgressCard',
        wireframe: 'Shows spinner during execution, hides when complete',
        user_flow: 'User sees real-time progress, then results appear'
      },
      {
        component: 'AgentResultsDisplay - Raw Analysis Tab',
        wireframe: 'New tab showing formatted analysis text',
        user_flow: 'User clicks "Raw Analysis" tab → sees full AI output → can copy text'
      },
      {
        component: 'QualityBadge',
        wireframe: 'Badge with confidence % and color coding',
        user_flow: 'User hovers badge → tooltip shows quality issues'
      },
      {
        component: 'Blue Ocean Message Card',
        wireframe: 'Info card with lightbulb icon, explanation, and bypass button',
        user_flow: 'User sees 0 competitors → reads explanation → optionally bypasses'
      }
    ],

    // Implementation Approach
    implementation_approach: `## Phase 1: P0 Quick Wins (2 hours)
- Enhanced empty state messages (Stage4CompetitiveIntelligence.tsx)
- Raw analysis tab (AgentResultsDisplay.tsx)
- AI completed indicator

## Phase 2: P1 State Management (6 hours)
- Define AgentCompletionStatus enum
- Update useAgentExecutionStatus hook with state machine
- Update backend agent_execution.py to return completion_status field
- Add state-specific UI components

## Phase 3: P2 Quality Metadata (3 hours)
- Create QualityBadge component
- Enhance research_orchestrator.py to expose quality_metadata
- Display badges in UI with tooltips

## Phase 4: P2 LLM Extraction Fallback (6 hours)
- Implement _llm_extract_competitors() in CompetitiveMapperAgent
- Add Claude 4.5 Sonnet integration
- Trigger logic: regex fails + analysis exists
- Logging and monitoring

## Phase 5: P3 Blue Ocean Bypass (3 hours - optional)
- Create BlueOceanBypassDialog component
- Add justification validation (min 50 chars)
- Save to venture metadata
- Navigation to next stage`,

    // Technology Stack
    technology_stack: [
      'React 18', 'TypeScript 5', 'Vite', 'Shadcn UI', 'Supabase PostgreSQL',
      'Python 3.11', 'FastAPI', 'Claude 4.5 Sonnet (Anthropic API)', 'Playwright (E2E)'
    ],

    // Dependencies
    dependencies: [
      {
        name: '@anthropic-ai/sdk',
        type: 'npm',
        status: 'existing',
        notes: 'Already used in backend, no new install needed'
      },
      {
        name: 'Shadcn UI - Accordion',
        type: 'internal',
        status: 'existing',
        notes: 'For raw analysis collapsible view'
      },
      {
        name: 'Shadcn UI - Badge',
        type: 'internal',
        status: 'existing',
        notes: 'For quality metadata display'
      }
    ],

    // Test Scenarios
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'AI finds 3+ competitors',
        test_type: 'e2e',
        steps: ['Navigate to Stage 4', 'Wait for AI execution', 'Verify success-with-data state', 'Verify competitor cards displayed'],
        expected_result: 'Competitors tab shows 3+ competitor cards, quality badge visible'
      },
      {
        id: 'TS-2',
        scenario: 'AI finds 0 competitors (blue ocean)',
        test_type: 'e2e',
        steps: ['Mock API to return 0 competitors', 'Navigate to Stage 4', 'Verify success-zero-found state'],
        expected_result: 'Blue ocean opportunity card shown with lightbulb icon and explanation'
      },
      {
        id: 'TS-3',
        scenario: 'Regex extraction fails but analysis exists',
        test_type: 'e2e',
        steps: ['Mock API with analysis but empty competitors array', 'Verify partial-extraction state', 'Click raw analysis accordion'],
        expected_result: 'Warning card shown, raw analysis accordion expands with full text'
      },
      {
        id: 'TS-4',
        scenario: 'AI execution fails completely',
        test_type: 'e2e',
        steps: ['Mock API error', 'Verify failed state', 'Click retry button'],
        expected_result: 'Error card with retry button, retry triggers new execution'
      },
      {
        id: 'TS-5',
        scenario: 'Quality metadata display (high confidence)',
        test_type: 'e2e',
        steps: ['Mock API with confidence_score: 92', 'Verify green badge shown', 'Hover badge'],
        expected_result: 'Green badge "92%", tooltip shows "High confidence, no issues"'
      },
      {
        id: 'TS-6',
        scenario: 'Quality metadata display (low confidence)',
        test_type: 'e2e',
        steps: ['Mock API with confidence_score: 55, quality_issues: ["Limited data"]', 'Verify amber badge', 'Hover badge'],
        expected_result: 'Amber badge "55%", tooltip shows quality issues list'
      },
      {
        id: 'TS-7',
        scenario: 'Blue ocean bypass flow',
        test_type: 'e2e',
        steps: ['Navigate to 0 competitor scenario', 'Click bypass button', 'Enter justification (50+ chars)', 'Submit'],
        expected_result: 'Justification saved, navigates to next stage'
      },
      {
        id: 'TS-8',
        scenario: 'LLM fallback logs correctly',
        test_type: 'integration',
        steps: ['Trigger regex failure scenario', 'Verify _llm_extract_competitors() called', 'Check logs'],
        expected_result: 'Backend logs show "LLM extraction fallback succeeded", extraction_method: llm_fallback'
      }
    ],

    // Acceptance Criteria
    acceptance_criteria: [
      'All functional requirements (FR-1 through FR-5) implemented and tested',
      'All 8 test scenarios passing in E2E suite',
      'Quality metadata visible in all success states with correct color coding',
      'LLM extraction fallback reduces failure rate to ≤30% (measured via backend metrics)',
      'Blue ocean bypass flow saves justification and proceeds to next stage',
      'No breaking changes to existing Stage 4 functionality',
      'State transitions logged for debugging',
      'Documentation updated (component props, API responses, state machine diagram)'
    ],

    // Performance Requirements
    performance_requirements: {
      page_load_time: '<2s',
      concurrent_users: 100,
      api_response_time: '<5s for LLM fallback, <500ms for standard execution',
      database_query_time: 'N/A (no new queries)',
      caching_strategy: 'API responses cached in useAgentExecutionStatus hook (3s polling interval)'
    },

    // Plan Checklist
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'User stories generated (auto via STORIES sub-agent)', checked: false },
      { text: 'Technical architecture documented', checked: true },
      { text: 'Test scenarios defined (8 scenarios)', checked: true },
      { text: 'Dependencies verified (no new npm packages)', checked: true }
    ],

    // Exec Checklist
    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'P0: Enhanced empty states implemented', checked: false },
      { text: 'P1: AgentCompletionStatus enum defined', checked: false },
      { text: 'P1: State machine logic in useAgentExecutionStatus', checked: false },
      { text: 'P2: QualityBadge component created', checked: false },
      { text: 'P2: Quality metadata API exposure', checked: false },
      { text: 'P2: LLM extraction fallback implemented', checked: false },
      { text: 'P3: Blue ocean bypass dialog (optional)', checked: false },
      { text: 'Unit tests written', checked: false },
      { text: 'E2E tests written (8 scenarios)', checked: false }
    ],

    // Validation Checklist
    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'E2E tests passing (100% coverage)', checked: false },
      { text: 'Performance benchmarks met', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'PLAN supervisor verification passed', checked: false },
      { text: 'LEAD final approval obtained', checked: false }
    ],

    // Progress
    progress: 10,

    // Phase
    phase: 'PLAN',

    // Phase Progress
    phase_progress: {
      PLAN_PRD: 10,
      PLAN_VERIFY: 0,
      EXEC_IMPL: 0,
      LEAD_FINAL: 0
    },

    // Risks
    risks: [
      {
        risk: 'LLM extraction fallback adds unpredictable latency',
        impact: 'User waits 5+ seconds in 10% of cases',
        mitigation: 'Only trigger on regex failure, show loading spinner, async processing',
        probability: 'LOW'
      },
      {
        risk: 'State complexity increases debugging difficulty',
        impact: 'Longer time to diagnose issues in production',
        mitigation: 'Comprehensive logging at each state transition, clear state machine diagram',
        probability: 'MEDIUM'
      },
      {
        risk: 'Backend API changes break existing functionality',
        impact: 'Current Stage 4 stops working',
        mitigation: 'Version API responses (v2 field), graceful degradation for old clients',
        probability: 'LOW'
      }
    ],

    // Constraints
    constraints: [
      {
        type: 'technical',
        impact: 'Must maintain backward compatibility',
        mitigation: 'Use optional v2 fields, graceful fallback to existing behavior'
      },
      {
        type: 'business',
        impact: 'Cannot block users for >30 seconds',
        mitigation: 'LLM fallback timeout at 10s, fail gracefully to manual entry'
      }
    ],

    // Assumptions
    assumptions: [
      {
        assumption: 'Anthropic API (Claude) has 95%+ uptime',
        validation_method: 'Monitor API availability, implement circuit breaker'
      },
      {
        assumption: 'Users understand "blue ocean opportunity" terminology',
        validation_method: 'User testing, tooltips with explanations'
      },
      {
        assumption: 'Existing research_sessions table has sufficient data',
        validation_method: 'Database verification confirmed (no schema changes)'
      }
    ],

    // Stakeholders
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement: 'PRD creation, architecture design, PLAN→EXEC handoff'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation',
        involvement: 'Code implementation, testing, EXEC→PLAN handoff'
      },
      {
        name: 'QA Director Sub-Agent',
        role: 'Quality Assurance',
        involvement: 'E2E test execution, 100% user story coverage validation'
      },
      {
        name: 'LEAD Agent',
        role: 'Strategic Oversight',
        involvement: 'Final approval, retrospective generation'
      }
    ],

    // Metadata
    metadata: {
      created_via_script: true,
      database_verified: true,
      retrospectives_consulted: 0,
      issue_patterns_matched: 0,
      quality_gates: [],
      risk_analysis: {},
      success_metrics: []
    }
  };

  // Insert PRD
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert([prd])
    .select();

  if (error) {
    console.error('❌ Failed to create PRD:', error.message);
    console.error('   Code:', error.code);
    console.error('   Details:', error.details);
    process.exit(1);
  }

  console.log('\n✅ PRD Created Successfully!');
  console.log('   ID:', data[0].id);
  console.log('   Title:', data[0].title);
  console.log('   Status:', data[0].status);
  console.log('   Story Points:', data[0].story_point_estimate);

  console.log('\n📋 Next Steps:');
  console.log('   1. Verify user stories auto-generated');
  console.log('   2. Run STORIES sub-agent for implementation context enrichment');
  console.log('   3. Create PLAN→EXEC handoff');
}

createPRD().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
