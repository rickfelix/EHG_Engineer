#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 STEP 4-5: Complete infrastructure scan\n');
console.log('═'.repeat(70));

// Query PRDs
console.log('\n3️⃣ Check PRDs for SD-CICD-WORKFLOW-FIX:');
const { data: prds, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status')
  .eq('sd_id', 'SD-CICD-WORKFLOW-FIX');

if (prdError) {
  console.log('   ❌ Error:', prdError.message);
} else if (!prds || prds.length === 0) {
  console.log('   ⚠️  No PRDs found');
} else {
  console.log('   Found', prds.length, 'PRD(s):');
  prds.forEach(p => console.log('      -', p.id, '-', p.title, '(', p.status, ')'));
}

// Check deliverables
console.log('\n4️⃣ Check deliverables for SD-CICD-WORKFLOW-FIX:');
const { data: deliverables, error: delError} = await supabase
  .from('sd_scope_deliverables')
  .select('id, deliverable_name, completion_status, priority')
  .eq('sd_id', 'SD-CICD-WORKFLOW-FIX');

if (delError) {
  console.log('   ❌ Error:', delError.message);
} else if (!deliverables || deliverables.length === 0) {
  console.log('   ⚠️  No deliverables tracked (legacy SD, assumes complete)');
} else {
  console.log('   Found', deliverables.length, 'deliverable(s):');
  const completed = deliverables.filter(d => d.completion_status === 'completed').length;
  console.log('      Completed:', completed, '/', deliverables.length);
  deliverables.forEach(d => console.log('      -', d.deliverable_name, '(', d.completion_status, ')'));
}

// Check user stories
console.log('\n5️⃣ Check user stories for SD-CICD-WORKFLOW-FIX:');
const { data: stories, error: storiesError } = await supabase
  .from('user_stories')
  .select('id, title, validation_status, e2e_test_status')
  .eq('sd_id', 'SD-CICD-WORKFLOW-FIX');

if (storiesError) {
  console.log('   ❌ Error:', storiesError.message);
} else if (!stories || stories.length === 0) {
  console.log('   ⚠️  No user stories (validation not required)');
} else {
  console.log('   Found', stories.length, 'user stor(ies):');
  const validated = stories.filter(s => s.validation_status === 'validated' && s.e2e_test_status === 'passing').length;
  console.log('      Validated:', validated, '/', stories.length);
}

// Check handoffs
console.log('\n6️⃣ Check handoffs for SD-CICD-WORKFLOW-FIX:');
const { data: handoffs, error: handoffsError } = await supabase
  .from('sd_phase_handoffs')
  .select('id, handoff_type, from_phase, to_phase, status')
  .eq('sd_id', 'SD-CICD-WORKFLOW-FIX')
  .order('created_at', { ascending: false });

if (handoffsError) {
  console.log('   ❌ Error:', handoffsError.message);
} else {
  console.log('   Found', handoffs.length, 'handoff(s):');
  const accepted = handoffs.filter(h => h.status === 'accepted');
  console.log('      Accepted:', accepted.length, '/', handoffs.length);
  const uniqueTypes = [...new Set(accepted.map(h => h.handoff_type))];
  console.log('      Unique accepted types:', uniqueTypes.length);
  handoffs.forEach(h => {
    console.log('      -', h.handoff_type, '(', h.from_phase, '→', h.to_phase, ') -', h.status);
  });
}

// Check retrospective
console.log('\n7️⃣ Check retrospective for SD-CICD-WORKFLOW-FIX:');
const { data: retro, error: retroError } = await supabase
  .from('retrospectives')
  .select('id, status, quality_score')
  .eq('sd_id', 'SD-CICD-WORKFLOW-FIX');

if (retroError) {
  console.log('   ❌ Error:', retroError.message);
} else if (!retro || retro.length === 0) {
  console.log('   ⚠️  No retrospective found');
} else {
  console.log('   Found retrospective:');
  retro.forEach(r => console.log('      Status:', r.status, ', Quality:', r.quality_score));
}

console.log('\n═'.repeat(70));
console.log('\n📊 MANUAL PROGRESS CALCULATION FOR SD-CICD-WORKFLOW-FIX:');
console.log('   Current DB value: 100%\n');

const lead = 20;
const plan_prd = (prds && prds.length > 0) ? 20 : 0;
const exec = (!deliverables || deliverables.length === 0) ? 30 : (deliverables.every(d => d.completion_status === 'completed') ? 30 : 0);
const plan_ver = (!stories || stories.length === 0) ? 15 : (stories.every(s => s.validation_status === 'validated' && s.e2e_test_status === 'passing') ? 15 : 0);
const retroExists = (retro && retro.length > 0 && retro[0].status === 'PUBLISHED' && retro[0].quality_score !== null);
const handoffsGood = (handoffs && handoffs.filter(h => h.status === 'accepted').length >= 3);
const lead_final = (retroExists && handoffsGood) ? 15 : 0;

const calculated = lead + plan_prd + exec + plan_ver + lead_final;

console.log('   Phase breakdown:');
console.log('   - LEAD approval (20%):', lead === 20 ? '✅ 20%' : '❌ 0%');
console.log('   - PLAN PRD (20%):', plan_prd === 20 ? '✅ 20%' : '❌ 0%');
console.log('   - EXEC implementation (30%):', exec === 30 ? '✅ 30%' : '❌ 0%');
console.log('   - PLAN verification (15%):', plan_ver === 15 ? '✅ 15%' : '❌ 0%');
console.log('   - LEAD final (15%):', lead_final === 15 ? '✅ 15%' : '❌ 0%');
console.log('\n   Expected progress:', calculated + '%');
console.log('   Actual progress in DB: 100%');
console.log('   🚨 MISMATCH:', calculated === 100 ? 'None!' : 'YES - DB shows 100% but should be ' + calculated + '%');
