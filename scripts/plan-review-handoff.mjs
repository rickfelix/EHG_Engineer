#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n🔍 PLAN Phase Review: SD-STAGE4-UX-EDGE-CASES-001\n');
console.log('='.repeat(60));

// Get PRD with handoff
const { data: prd, error } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log('\n📋 PRD Status:');
console.log(`   ID: ${prd.id}`);
console.log(`   Status: ${prd.status}`);
console.log(`   Phase: ${prd.phase}`);
console.log(`   Progress: ${prd.progress}%`);
const execProgress = prd.phase_progress?.EXEC_IMPL || 0;
console.log(`   EXEC Progress: ${execProgress}%`);

const handoffs = prd.metadata?.handoffs || [];
console.log(`\n📨 Handoffs: ${handoffs.length}`);

if (handoffs.length > 0) {
  const latestHandoff = handoffs[handoffs.length - 1];
  console.log(`\n   From: ${latestHandoff.from_phase} → To: ${latestHandoff.to_phase}`);
  console.log(`   Status: ${latestHandoff.status}`);
  console.log(`   LOC Added: ${latestHandoff.completeness?.total_loc || 0}`);
  console.log(`   Commits: ${latestHandoff.completeness?.commits?.length || 0}`);
  const issues = latestHandoff.issues || [];
  const blocking = issues.filter(i => i.blocking).length;
  console.log(`   Issues: ${issues.length} total (${blocking} blocking)`);
  console.log(`   Context: ${latestHandoff.context?.status || 'N/A'} (${latestHandoff.context?.percentage || 0}%)`);

  console.log('\n📦 Deliverables:');
  const deliverables = latestHandoff.deliverables || [];
  deliverables.forEach((d, i) => {
    console.log(`   ${i + 1}. ${d}`);
  });

  console.log('\n🚨 Known Issues:');
  issues.forEach((issue, i) => {
    const blockingTag = issue.blocking ? '[BLOCKING]' : '[NON-BLOCKING]';
    console.log(`   ${i + 1}. [${issue.severity}] ${blockingTag} ${issue.title}`);
    console.log(`      Fix: ${issue.fix} (${issue.effort})`);
  });
}

console.log('\n✅ Checklist Progress:');
const execChecklist = prd.exec_checklist || [];
const completed = execChecklist.filter(c => c.checked).length;
console.log(`   ${completed}/${execChecklist.length} items complete (${Math.round(completed/execChecklist.length*100)}%)`);

execChecklist.forEach((item, i) => {
  const status = item.checked ? '✅' : '❌';
  console.log(`   ${status} ${i + 1}. ${item.text}`);
});

console.log('\n📊 Functional Requirements:');
const frs = prd.functional_requirements || [];
frs.forEach((fr, i) => {
  const frNum = i + 1;
  const requirement = fr.requirement || fr.title || fr;
  console.log(`   FR-${frNum}: ${requirement}`);
});

console.log('\n' + '='.repeat(60));
console.log('');
