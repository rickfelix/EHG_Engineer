#!/usr/bin/env node

/**
 * Update SD-RECONNECT-002 with complete risks and success_metrics
 * to meet 85% completeness threshold for LEAD→PLAN handoff
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const update = {
  risks: [
    {
      risk: 'Routing configuration missing for /ventures/:id/stage/:stageNumber',
      probability: 'MEDIUM',
      impact: 'Users redirected to 404 after venture creation',
      mitigation: 'PLAN phase will verify routing exists before EXEC begins'
    },
    {
      risk: 'Database update failure during scaffoldStage1()',
      probability: 'LOW',
      impact: 'Venture created but workflow not initialized',
      mitigation: 'Add try-catch error handling, show user-friendly error toast'
    },
    {
      risk: 'Existing ventures backward compatibility',
      probability: 'LOW',
      impact: 'Old ventures may have NULL or 0 for current_workflow_stage',
      mitigation: 'Changes are additive only, existing ventures unchanged'
    }
  ],

  success_metrics: [
    {
      metric: 'Venture creation → Stage 1 redirect rate',
      target: '100%',
      measurement: 'All new ventures automatically navigate to /ventures/{id}/stage/1'
    },
    {
      metric: 'Database scaffolding success rate',
      target: '100%',
      measurement: 'All ventures have current_workflow_stage = 1 and workflow_status = pending'
    },
    {
      metric: 'Implementation efficiency',
      target: '≤1.5 hours',
      measurement: 'Total EXEC phase time from start to PR submission'
    },
    {
      metric: 'LOC changes',
      target: '≤50 lines',
      measurement: 'Total lines of code added/modified (target: ~33 LOC)'
    }
  ],

  metadata: {
    ...{
      prd_reference: "03-New-Venture-PRD.md",
      database_tables: ["ideas", "ventures", "workflow_executions"],
      features_hidden: ["Voice capture", "EVA validation", "Strategic context", "40-stage workflow"],
      components_affected: ["VenturesPage.tsx", "VentureCreateDialog.tsx", "VentureCreationDialog.tsx"],
      target_implementation: "VentureCreationDialog (full)",
      current_implementation: "VentureCreateDialog (stub)"
    },
    prd_id: 'PRD-e4701480-6363-4b09-9a0c-66e169298eca',
    over_engineering_score: '8/30',
    scope_reduction: 'pragmatic_minimal',
    deferred_scope: [
      'Dialog consolidation (3→1)',
      'Full workflow orchestration',
      'Stage 2-40 automation'
    ]
  },

  updated_at: new Date().toISOString()
};

console.log('📝 Updating SD-RECONNECT-002 with risks and success_metrics...\n');

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update(update)
  .eq('id', 'SD-RECONNECT-002')
  .select();

if (error) {
  console.error('❌ Error updating SD:', error);
  process.exit(1);
}

console.log('✅ SD-RECONNECT-002 Updated Successfully');
console.log('   Risks:', data[0].risks.length);
console.log('   Success Metrics:', data[0].success_metrics.length);
console.log('   Metadata:', Object.keys(data[0].metadata).length, 'keys');
console.log('\n📊 Completeness should now meet 85% threshold');
