#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sdId = process.argv[2] || 'SD-VIF-INTEL-001';

console.log(`\n📊 Checking completion status for ${sdId}...\n`);

// Check user stories mapping
const { data: stories } = await supabase
  .from('user_stories')
  .select('story_key, e2e_test_path, e2e_test_status, validation_status')
  .eq('sd_id', sdId);

const mapped = stories.filter(s => s.e2e_test_path !== null).length;
const validated = stories.filter(s => s.validation_status === 'validated').length;
const total = stories.length;

console.log('🧪 User Story Status:');
console.log(`   Total: ${total}`);
console.log(`   E2E Mapped: ${mapped}/${total} (${((mapped/total)*100).toFixed(1)}%)`);
console.log(`   Validated: ${validated}/${total} (${((validated/total)*100).toFixed(1)}%)`);
console.log('');

// Check retrospective
const { data: retros } = await supabase
  .from('retrospectives')
  .select('id, status, quality_score')
  .eq('sd_id', sdId);

console.log('📝 Retrospective:');
console.log(`   Count: ${retros?.length || 0}`);
if (retros && retros.length > 0) {
  retros.forEach((r, idx) => {
    console.log(`   ${idx + 1}. Status: ${r.status}, Quality: ${r.quality_score}`);
  });
}
console.log('');

// Check deliverables
const { data: deliverables } = await supabase
  .from('sd_scope_deliverables')
  .select('deliverable_name, completion_status')
  .eq('sd_id', sdId);

const completedDeliverables = deliverables?.filter(d => d.completion_status === 'completed').length || 0;
const totalDeliverables = deliverables?.length || 0;

console.log('📦 Deliverables:');
console.log(`   Completed: ${completedDeliverables}/${totalDeliverables} (${totalDeliverables > 0 ? ((completedDeliverables/totalDeliverables)*100).toFixed(1) : 0}%)`);
console.log('');

// Check handoffs
const { data: handoffs } = await supabase
  .from('leo_handoff_executions')
  .select('handoff_type, status')
  .eq('sd_id', sdId)
  .order('created_at', { ascending: true });

console.log('🔄 Handoffs:');
console.log(`   Count: ${handoffs?.length || 0}`);
handoffs?.forEach((h, idx) => {
  console.log(`   ${idx + 1}. ${h.handoff_type}: ${h.status}`);
});
console.log('');

// Check blocking issues
console.log('⚠️  Blocking Issues:');
const issues = [];

if (validated < total) {
  issues.push(`User stories not fully validated (${validated}/${total})`);
}

if (!retros || retros.length === 0) {
  issues.push('No retrospective found');
} else if (retros[0].status === 'DRAFT') {
  issues.push('Retrospective status is DRAFT (needs PUBLISHED)');
}

if (completedDeliverables < totalDeliverables) {
  issues.push(`Deliverables incomplete (${completedDeliverables}/${totalDeliverables})`);
}

if (issues.length === 0) {
  console.log('   ✅ No blocking issues found!');
} else {
  issues.forEach((issue, idx) => {
    console.log(`   ${idx + 1}. ${issue}`);
  });
}
console.log('');
