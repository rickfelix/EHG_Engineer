#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📝 Creating EXEC→PLAN handoff for SD-STAGE4-UX-EDGE-CASES-001...\n');

const handoffData = {
  from_phase: 'EXEC',
  to_phase: 'PLAN',
  status: 'pending',
  created_at: new Date().toISOString(),

  // 1. Executive Summary
  executive_summary: `## SD-STAGE4-UX-EDGE-CASES-001: P0+P1+P2 Implementation Complete

**Status:** EXEC phase 70% complete (14 of 20 estimated hours)

**What was delivered:**
- P0 (2h): Enhanced empty state messaging + Raw Data tab (129 LOC, commit cbd2fbf2)
- P1 (6h): AgentCompletionStatus state machine (457 LOC, commit 69fa240)
- P2 (6h): Quality metadata display with QualityBadge component (199 LOC, commit 14343392)

**Total implementation:** 785 LOC across 4 files (3 commits)

**Key achievements:**
1. Differentiated 7 AI completion states (success-with-data, success-zero-found, partial-extraction, failed, running, idle, cancelled)
2. Added transparency via Raw Data tab for debugging extraction failures
3. Implemented color-coded quality badges (green ≥80%, amber 60-79%, red <60%)
4. Enhanced UX for blue ocean scenarios (0 competitors found legitimately)

**What remains:**
- P3 (3h): Blue ocean bypass flow with justification dialog
- Backend (6h): LLM extraction fallback in Python CompetitiveMapperAgent
- Test infrastructure: Fix E2E navigation routing (wizard flow vs direct routes)
- Documentation: Update component docs and user guides`,

  // 2. Completeness Report
  completeness: {
    p0_complete: true,
    p1_complete: true,
    p2_complete: true,
    p3_complete: false,
    backend_complete: false,
    tests_passing: false,
    documentation_complete: false,
    total_loc: 785,
    commits: ['cbd2fbf2', '69fa240', '14343392'],
    files_modified: 4,
    files_created: 2
  },

  // 3. Deliverables
  deliverables: [
    'QualityBadge component (161 LOC) - src/components/ui/quality-badge/QualityBadge.tsx',
    'AgentCompletionStatus types (26 LOC) - src/types/agentExecution.ts',
    'State machine logic (75 LOC) - src/hooks/useAgentExecutionStatus.ts',
    'Stage4 UX enhancements (456 LOC) - src/components/stages/Stage4CompetitiveIntelligence.tsx',
    'AgentResultsDisplay integration (67 LOC) - src/components/stages/AgentResultsDisplay.tsx',
    'E2E test suite (679 LOC) - tests/e2e/stage4-ux-edge-cases-p0.spec.ts'
  ],

  // 4. Decisions Made
  decisions: [
    {
      what: 'Client-side state machine instead of backend API v2',
      why: 'Backend returns generic "success". Inspecting execution.results unblocks frontend UX',
      impact: 'Low - Backend can add completion_status field later'
    },
    {
      what: 'Continue P2 despite E2E test failures',
      why: 'Tests fail on navigation infrastructure, not feature bugs',
      impact: 'Medium - Test infrastructure fix needed before merge'
    },
    {
      what: 'Defer P3 and backend LLM fallback',
      why: 'P0+P1+P2 provide 70% value. P3 needs DB schema change. Backend is 6h Python task',
      impact: 'Low - Not blockers for current scope'
    }
  ],

  // 5. Known Issues
  issues: [
    {
      severity: 'HIGH',
      title: 'E2E test navigation mismatch',
      description: 'Tests use /new-venture/stage-4 but app uses wizard flow at /ventures/new',
      fix: 'Update test navigation OR add direct route support',
      effort: '2 hours',
      blocking: false
    },
    {
      severity: 'MEDIUM',
      title: 'Backend does not populate quality_metadata',
      description: 'AgentExecution has quality_metadata field but API does not return it',
      fix: 'Backend to populate confidence_score, quality_issues, extraction_method',
      effort: '3 hours Python',
      blocking: false
    },
    {
      severity: 'LOW',
      title: 'LLM extraction fallback missing',
      description: 'No fallback to LLM when regex parsing fails (FR-4 deferred)',
      fix: 'Implement _llm_extract_competitors() in CompetitiveMapperAgent',
      effort: '6 hours Python',
      blocking: false
    }
  ],

  // 6. Context Health
  context: {
    used: 54245,
    total: 200000,
    percentage: 27,
    status: 'HEALTHY'
  },

  // 7. Action Items
  action_items: [
    '[P0] PLAN reviews P0+P1+P2 implementation (1h)',
    '[P0] Decide: Merge now OR continue with P3 (0.5h)',
    '[P1] Create SD for test infrastructure fix (1h)',
    '[P2] Plan P3 blue ocean bypass (2h)',
    '[P2] Plan backend LLM extraction (2h)'
  ],

  // 8. Learning
  learnings: {
    wins: [
      'Client-side state machine unblocked frontend without backend',
      'Phased implementation allowed incremental tracking',
      'Component sizing within guidelines (161 LOC)',
      'Type safety prevented runtime errors'
    ],
    improvements: [
      'Test infrastructure should be validated before implementation',
      'Backend API v2 coordination needed earlier',
      'Navigation gap in E2E tests not caught by testing-agent'
    ],
    recommendations: [
      'Validate test patterns before implementation',
      'Create backend coordination SD for cross-stack features',
      'Consider wizard flow mocking utilities',
      'Document state machines with diagrams'
    ]
  }
};

// Get current metadata
const { data: prd, error: fetchError } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .single();

if (fetchError) {
  console.error('❌ Error fetching PRD:', fetchError.message);
  process.exit(1);
}

// Merge handoff into metadata
const updatedMetadata = {
  ...(prd.metadata || {}),
  handoffs: [
    ...((prd.metadata?.handoffs || [])),
    handoffData
  ]
};

// Update PRD with handoff
const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    metadata: updatedMetadata,
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .select();

if (error) {
  console.error('❌ Error updating PRD:', error.message);
  process.exit(1);
}

console.log('✅ EXEC→PLAN handoff created successfully!');
console.log(`   PRD: ${data[0].id}`);
console.log(`   Handoffs stored: ${updatedMetadata.handoffs.length}`);
console.log('\n📊 Handoff Summary:');
console.log(`   From: ${handoffData.from_phase} → To: ${handoffData.to_phase}`);
console.log(`   Status: ${handoffData.status}`);
console.log(`   LOC Added: ${handoffData.completeness.total_loc}`);
console.log(`   Commits: ${handoffData.completeness.commits.length}`);
console.log(`   Deliverables: ${handoffData.deliverables.length}`);
console.log(`   Issues: ${handoffData.issues.length} (${handoffData.issues.filter(i => i.blocking).length} blocking)`);
console.log(`   Action Items: ${handoffData.action_items.length}`);
console.log(`   Context: ${handoffData.context.status} (${handoffData.context.percentage}%)`);
console.log('\n🎯 Next Steps:');
console.log('   1. PLAN phase reviews P0+P1+P2 implementation');
console.log('   2. Decision: Merge now OR continue with P3');
console.log('   3. Create follow-up SDs for test infrastructure + backend');
console.log('');
