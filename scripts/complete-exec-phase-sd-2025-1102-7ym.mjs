#!/usr/bin/env node
/**
 * Complete EXEC Phase for SD-2025-1102-7YM
 * Records implementation completion and updates PRD status
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey
);

const SD_ID = 'SD-2025-1102-7YM';
const PRD_ID = 'PRD-SD-2025-1102-7YM';

async function completeExecPhase() {
  console.log(`\n🏗️  Completing EXEC Phase for ${SD_ID}`);
  console.log('='.repeat(70));

  // Update PRD with completed exec checklist and progress
  const prdUpdate = {
    status: 'implemented',  // PRD implemented, ready for VERIFY
    phase: 'verification',
    progress: 85,  // 85% = EXEC complete, ready for VERIFY
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 100,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },
    exec_checklist: [
      { text: 'FR-1: VentureDataTable research column added', checked: true },
      { text: 'FR-2: ConfigurableMetrics extended with research category', checked: true },
      { text: 'FR-3: ResearchMetricsSummaryCard component created', checked: true },
      { text: 'FR-4: AdvancementCriteriaCard component created', checked: true },
      { text: 'FR-5: Research Focus preset view added', checked: true },
      { text: 'FR-6: VentureCard composite score badge added', checked: true },
      { text: 'Build passes with no TypeScript errors', checked: true },
      { text: 'Changes committed and pushed to feature branch', checked: true },
      { text: 'Pre-commit hooks passed', checked: true }
    ],
    implementation_summary: {
      files_created: [
        'src/components/ventures/ResearchMetricsSummaryCard.tsx',
        'src/components/ventures/AdvancementCriteriaCard.tsx'
      ],
      files_modified: [
        'src/components/ventures/ConfigurableMetrics.tsx',
        'src/components/ventures/VentureCard.tsx',
        'src/components/ventures/VentureDataTable.tsx',
        'src/components/ventures/VentureOverviewTab.tsx',
        'src/components/ventures/index.ts'
      ],
      lines_added: 809,
      commit: '0ba61a3a',
      branch: 'feat/SD-2025-1102-7YM-optimize-ventures-management-attributes'
    },
    updated_at: new Date().toISOString()
  };

  const { data: prdData, error: prdError } = await supabase
    .from('product_requirements_v2')
    .update(prdUpdate)
    .eq('id', PRD_ID)
    .select('id, status, phase, progress');

  if (prdError) {
    console.error('❌ Failed to update PRD:', prdError.message);
  } else {
    console.log('✅ PRD updated:');
    console.log(`   Status: ${prdData[0]?.status}`);
    console.log(`   Phase: ${prdData[0]?.phase}`);
    console.log(`   Progress: ${prdData[0]?.progress}%`);
  }

  // Update SD status to reflect VERIFY readiness
  const sdUpdate = {
    current_phase: 'VERIFY',
    progress_percentage: 85,
    updated_at: new Date().toISOString()
  };

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .update(sdUpdate)
    .eq('id', SD_ID)
    .select('id, current_phase, progress_percentage');

  if (sdError) {
    console.error('❌ Failed to update SD:', sdError.message);
  } else {
    console.log('✅ SD updated:');
    console.log(`   Current Phase: ${sdData[0]?.current_phase}`);
    console.log(`   Progress: ${sdData[0]?.progress_percentage}%`);
  }

  // Create handoff record for EXEC-TO-VERIFY
  const handoffData = {
    sd_id: SD_ID,
    from_phase: 'EXEC',
    to_phase: 'VERIFY',
    status: 'approved',
    handoff_content: {
      summary: 'EXEC phase complete. All 6 functional requirements implemented and committed.',
      prd_id: PRD_ID,
      implementation: {
        files_created: 2,
        files_modified: 5,
        lines_added: 809,
        commit_hash: '0ba61a3a',
        branch: 'feat/SD-2025-1102-7YM-optimize-ventures-management-attributes'
      },
      functional_requirements_completed: [
        'FR-1: VentureDataTable research column',
        'FR-2: ConfigurableMetrics research category',
        'FR-3: ResearchMetricsSummaryCard',
        'FR-4: AdvancementCriteriaCard',
        'FR-5: Research Focus preset',
        'FR-6: VentureCard score badge'
      ],
      verification_tasks: [
        'Visual regression testing on VenturesPage',
        'Test preset selection functionality',
        'Verify tooltip data displays correctly',
        'E2E test for metric drill-down flow',
        'Mobile responsive testing'
      ]
    },
    created_at: new Date().toISOString()
  };

  const { data: handoffResult, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .insert(handoffData)
    .select('id, status');

  if (handoffError) {
    console.error('❌ Failed to create handoff record:', handoffError.message);
  } else {
    console.log('✅ EXEC-TO-VERIFY handoff recorded:');
    console.log(`   ID: ${handoffResult[0]?.id}`);
    console.log(`   Status: ${handoffResult[0]?.status}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🏁 EXEC PHASE SUMMARY');
  console.log('='.repeat(70));
  console.log(`
Strategic Directive: ${SD_ID}
PRD: ${PRD_ID}
Status: Ready for VERIFY Phase

Implementation Complete:
✅ FR-1: VentureDataTable research column with score badge
✅ FR-2: ConfigurableMetrics extended with 4 research metrics
✅ FR-3: ResearchMetricsSummaryCard for aggregate display
✅ FR-4: AdvancementCriteriaCard for threshold visualization
✅ FR-5: Research Focus preset view with 4 preset options
✅ FR-6: VentureCard composite score badge

Git Status:
✅ Commit: 0ba61a3a
✅ Branch: feat/SD-2025-1102-7YM-optimize-ventures-management-attributes
✅ Pushed to origin

Next Steps (VERIFY Phase):
1. Run E2E tests for VenturesPage functionality
2. Visual regression testing
3. Review implementation against PRD acceptance criteria
4. Create PR for merge to main
`);
}

completeExecPhase().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
