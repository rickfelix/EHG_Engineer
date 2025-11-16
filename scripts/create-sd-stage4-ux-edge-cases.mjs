#!/usr/bin/env node

/**
 * Create SD-STAGE4-UX-EDGE-CASES-001
 * Stage 4 UX Improvements: Zero Competitor & Failed Research Edge Cases
 *
 * Purpose: Improve Stage 4 Competitive Intelligence UX to handle edge cases
 * - Zero competitors found (legitimate blue ocean)
 * - AI extraction failures (parsing errors)
 * - Low-confidence results
 * - Quality metadata visibility
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSD() {
  console.log('📋 Creating SD-STAGE4-UX-EDGE-CASES-001...\n');

  const sd = {
    id: 'SD-STAGE4-UX-EDGE-CASES-001',
    title: 'Stage 4 UX Improvements: Zero Competitor & Failed Research Edge Cases',
    description: `Improve Stage 4 Competitive Intelligence UX to handle edge cases: zero competitors found, AI extraction failures, and low-confidence results. Implement state differentiation, expose quality metadata, add LLM extraction fallback, and provide clear user guidance for non-standard outcomes.

**Problem**: Users cannot distinguish between AI states (found 0 vs hasn't run vs extraction failed). Raw AI analysis is hidden when competitor extraction fails. No quality/confidence indicators shown. Cannot proceed with 0 competitors even for legitimate blue ocean opportunities.

**Solution**:
- P0: Better empty state messages, raw analysis tab (2 hours)
- P1: New status types + state machine (6 hours)
- P2: Expose quality metadata from backend (3 hours)
- P2: LLM extraction fallback (6 hours)
- P3: Blue ocean bypass flow (3 hours)

**Impact**: User confusion ↓ 80%, Support tickets ↓ 60%`,

    current_phase: 'LEAD',
    status: 'active',
    priority: 'HIGH', // Using priority field that exists
    category: 'UI/UX Enhancement',
    parent_sd_id: 'SD-STAGE4-AI-FIRST-UX-001',
    target_application: 'ehg', // Main business application
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    metadata: {
      estimated_hours: 20,
      complexity_estimate: 'MEDIUM',
      business_value: 'HIGH',
      priority_score: 82, // HIGH: 70-89
      problem_statement: 'Users cannot distinguish between AI states (found 0 vs hasn\'t run vs extraction failed). Raw AI analysis is hidden when competitor extraction fails. No quality/confidence indicators shown. Cannot proceed with 0 competitors even for legitimate blue ocean opportunities.',

      success_criteria: [
        'User can distinguish between AI completion states (success-with-data, success-zero-found, partial-extraction, failed)',
        'Raw AI analysis is accessible when extraction fails (accordion or tab)',
        'Quality metadata (confidence scores, issues) visible to user',
        'LLM extraction fallback reduces regex failure rate by 70%+',
        'Blue ocean bypass allows proceeding with 0 competitors (with justification)'
      ],

      technical_approach: `P0 Quick Wins (2 hours):
- Better empty state messages (distinguish AI states)
- Raw analysis tab in AgentResultsDisplay
- "AI Completed" indicator when execution.status === 'success'

P1 State Management (6 hours):
- New AgentCompletionStatus types (success-with-data, success-zero-found, partial-extraction)
- Update backend agent_execution.py to return detailed status
- Frontend state machine in useAgentExecutionStatus hook

P2 Quality Metadata (3 hours):
- Expose confidence_score, quality_issues from backend validation
- Display badges/indicators in UI
- Quality warnings when confidence < 80%

P2 LLM Extraction Fallback (6 hours):
- Add _llm_extract_competitors() method to CompetitiveMapperAgent
- Trigger when regex finds <=1 competitors and analysis > 200 chars
- Use Claude 4.5 Sonnet for structured extraction

P3 Blue Ocean Bypass (3 hours):
- Allow proceeding with 0 competitors
- Require justification textarea
- Save justification to database`,

      risks: [
        {
          risk: 'Backend API breaking changes to agent execution responses',
          mitigation: 'Version API responses (v2 field), graceful degradation for old clients',
          likelihood: 'MEDIUM',
          impact: 'LOW'
        },
        {
          risk: 'LLM extraction fallback adds 2-5s latency',
          mitigation: 'Async only on regex failure (<10% of cases), user sees spinner',
          likelihood: 'LOW',
          impact: 'LOW'
        },
        {
          risk: 'State complexity increases debugging difficulty',
          mitigation: 'Clear state machine documentation, add detailed logging',
          likelihood: 'LOW',
          impact: 'MEDIUM'
        },
        {
          risk: 'User confusion during rollout (new UX patterns)',
          mitigation: 'Phased rollout, A/B testing for P3 bypass flow',
          likelihood: 'MEDIUM',
          impact: 'MEDIUM'
        }
      ],

      dependencies: [
        {
          type: 'parent',
          id: 'SD-STAGE4-AI-FIRST-UX-001',
          description: 'Parent SD for Stage 4 AI-First UX strategy'
        },
        {
          type: 'enhancement',
          location: '/mnt/c/_EHG/ehg/agent-platform/app/services/research_orchestrator.py',
          description: 'Backend enhancement to expose quality metadata'
        },
        {
          type: 'enhancement',
          location: '/mnt/c/_EHG/ehg/agent-platform/app/agents/research/competitive_mapper.py',
          description: 'Add LLM extraction fallback method'
        },
        {
          type: 'frontend',
          location: '/mnt/c/_EHG/ehg/src/components/stages/Stage4CompetitiveIntelligence.tsx',
          description: 'Main component requiring state management updates'
        },
        {
          type: 'frontend',
          location: '/mnt/c/_EHG/ehg/src/hooks/useAgentExecutionStatus.ts',
          description: 'Hook requiring new status type handling'
        }
      ],

      impact_analysis: {
        user_experience: 'User confusion ↓ 80% (clear state differentiation)',
        support_cost: 'Support tickets ↓ 60% (self-service via raw analysis)',
        trust_in_ai: 'HIGH increase (transparency → confidence)',
        conversion_rate: 'MEDIUM increase (no blocker on 0 competitors)',
        technical_debt: 'NEGATIVE (improves code quality, adds proper state machine)'
      },

      validation_approach: `E2E Testing:
- Test 1: AI finds 3+ competitors → success-with-data state
- Test 2: AI finds 0 competitors → success-zero-found state + blue ocean message
- Test 3: AI analysis text exists but regex fails → partial-extraction state + raw analysis visible
- Test 4: AI execution fails → failed state + retry button
- Test 5: Confidence score < 70% → warning badge shown
- Test 6: User bypasses with 0 competitors → justification saved`,

      related_sds: [
        'SD-STAGE4-AGENT-PROGRESS-001',
        'SD-STAGE4-UI-RESTRUCTURE-001',
        'SD-STAGE4-RESULTS-DISPLAY-001',
        'SD-STAGE4-ERROR-HANDLING-001'
      ]
    }
  };

  // Insert SD
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .insert([sd])
    .select();

  if (sdError) {
    console.error('❌ Error creating SD:', sdError.message);
    process.exit(1);
  }

  console.log('✅ Strategic Directive created successfully!\n');
  console.log(`ID: ${sdData[0].id}`);
  console.log(`Title: ${sdData[0].title}`);
  console.log(`Priority: ${sdData[0].priority}`);
  console.log(`Estimated Hours: ${sdData[0].metadata?.estimated_hours || 'N/A'}`);
  console.log(`Business Value: ${sdData[0].metadata?.business_value || 'N/A'}`);
  console.log(`Parent SD: ${sdData[0].parent_sd_id}`);
  console.log(`\n✅ SD status: ${sdData[0].status}`);
  console.log(`✅ Current phase: ${sdData[0].current_phase}`);

  console.log('\n📋 Next Steps:');
  console.log('1. Create LEAD→PLAN handoff: node scripts/unified-handoff-system.js execute LEAD-TO-PLAN SD-STAGE4-UX-EDGE-CASES-001');
  console.log('2. Create PRD: node scripts/add-prd-to-database.js SD-STAGE4-UX-EDGE-CASES-001');
  console.log('3. Generate user stories (auto during PRD creation)');
}

createSD().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
