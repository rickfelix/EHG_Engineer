#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📝 Updating PRD for P0 completion...\n');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    status: 'in_progress',
    phase: 'implementation',
    progress: 40, // P0 complete (20% of total), P1 starting
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 40, // P0 done, P1 in progress
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },
    exec_checklist: [
      { text: 'Development environment setup', checked: true },
      { text: 'P0: Enhanced empty state messaging', checked: true },
      { text: 'P0: Raw analysis tab added', checked: true },
      { text: 'P0: Git commit created', checked: true },
      { text: 'P0: E2E tests delegated to testing-agent', checked: true },
      { text: 'P1: AgentCompletionStatus enum (backend + frontend)', checked: false },
      { text: 'P1: State machine logic in useAgentExecutionStatus', checked: false },
      { text: 'P2: Quality metadata display', checked: false },
      { text: 'P2: LLM extraction fallback (backend)', checked: false },
      { text: 'P3: Blue ocean bypass flow', checked: false },
      { text: 'All tests passing (unit + E2E)', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .select();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ PRD updated successfully!');
console.log(`   Status: ${data[0].status}`);
console.log(`   Phase: ${data[0].phase}`);
console.log(`   Progress: ${data[0].progress}%`);
console.log(`   EXEC Progress: ${data[0].phase_progress.EXEC_IMPL}%`);
console.log(`   Checklist: ${data[0].exec_checklist.filter(c => c.checked).length}/${data[0].exec_checklist.length} complete`);
console.log('\n📋 P0 Complete:');
console.log('   - Enhanced empty state messaging ✅');
console.log('   - Raw analysis tab ✅');
console.log('   - Git commit cbd2fbf2 ✅');
console.log('   - E2E tests created (679 LOC) ✅');
console.log('\n🚀 P1 Next: AgentCompletionStatus enum + state machine (6 hours)');
console.log('');
