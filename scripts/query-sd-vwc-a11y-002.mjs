#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Querying SD-VWC-A11Y-002 Current State');
console.log('═'.repeat(70));

// Get SD details
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-VWC-A11Y-002')
  .single();

if (sdError) {
  console.log('❌ SD not found:', sdError.message);
  process.exit(1);
}

console.log('\n📋 SD Details:');
console.log('   ID:', sd.id);
console.log('   Title:', sd.title);
console.log('   Status:', sd.status);
console.log('   Current Phase:', sd.current_phase);
console.log('   Progress:', sd.progress_percentage + '%');
console.log('   Priority:', sd.priority);
console.log('   Created:', sd.created_at?.substring(0, 10));

// Check for PRD
const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('id, status')
  .eq('sd_uuid', sd.uuid_id);

console.log('\n📄 PRD Status:');
console.log('   PRDs Found:', prds?.length || 0);
if (prds?.length > 0) {
  prds.forEach(prd => console.log('   -', prd.id, '(' + prd.status + ')'));
}

// Check for handoffs
const { data: handoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('id, from_phase, to_phase, status, created_at')
  .eq('sd_id', sd.id)
  .order('created_at', { ascending: false });

console.log('\n🔄 Handoff History:');
console.log('   Total Handoffs:', handoffs?.length || 0);
if (handoffs?.length > 0) {
  handoffs.slice(0, 5).forEach(h => {
    console.log('   -', h.from_phase, '→', h.to_phase, '(' + h.status + ')', h.created_at.substring(0, 10));
  });
}

// Check for user stories
const { data: stories } = await supabase
  .from('user_stories')
  .select('id, title, status, validation_status')
  .eq('sd_id', sd.id);

console.log('\n📝 User Stories:');
console.log('   Total:', stories?.length || 0);
if (stories?.length > 0) {
  const completed = stories.filter(s => s.status === 'completed').length;
  const validated = stories.filter(s => s.validation_status === 'validated').length;
  console.log('   Completed:', completed + '/' + stories.length);
  console.log('   Validated:', validated + '/' + stories.length);
  console.log('\n   Story Details:');
  stories.forEach((s, i) => {
    console.log(`   ${i+1}. ${s.title}`);
    console.log(`      ID: ${s.id}`);
    console.log(`      Status: ${s.status} | Validation: ${s.validation_status || 'N/A'}`);
  });
}

console.log('\n' + '═'.repeat(70));
console.log('🎯 PHASE DETERMINATION:');

if (sd.current_phase === 'LEAD_APPROVAL' && (!prds || prds.length === 0)) {
  console.log('   ➡️  LEAD PHASE: Need to create LEAD→PLAN handoff');
  console.log('   Action: Load CLAUDE_LEAD.md');
} else if (sd.current_phase.startsWith('PLAN') && (!prds || prds.length === 0)) {
  console.log('   ➡️  PLAN PHASE: Need to create PRD');
  console.log('   Action: Load CLAUDE_PLAN.md');
} else if (sd.current_phase.startsWith('EXEC') || (prds && prds.length > 0 && (!stories || stories.length === 0))) {
  console.log('   ➡️  EXEC PHASE: Need to implement features');
  console.log('   Action: Load CLAUDE_EXEC.md');
} else if (sd.current_phase.startsWith('PLAN') && prds && prds.length > 0) {
  console.log('   ➡️  PLAN VERIFICATION: Need to verify implementation');
  console.log('   Action: Load CLAUDE_PLAN.md');
} else {
  console.log('   ℹ️  Phase:', sd.current_phase);
}

console.log('\n📊 DESCRIPTION:');
console.log(sd.description || '(No description)');
