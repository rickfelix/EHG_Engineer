#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📝 Updating PRD-SD-STAGE4-UX-EDGE-CASES-001 status to approved...\n');

// Update PRD status and mark all plan_checklist items as complete
const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    status: 'approved',
    phase: 'implementation',
    progress: 30,  // PLAN complete, starting EXEC
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'User stories generated (STORIES sub-agent)', checked: true },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: true },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: true }
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
console.log(`   PLAN Checklist: ${data[0].plan_checklist.filter(c => c.checked).length}/${data[0].plan_checklist.length} complete`);
console.log('');
