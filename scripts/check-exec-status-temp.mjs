#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📊 EXEC Phase Verification\n' + '='.repeat(60));

// Check SD status
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress_percentage')
  .eq('id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .single();

console.log('\n✅ SD Status:');
console.log(`   ID: ${sd.id}`);
console.log(`   Status: ${sd.status}`);
console.log(`   Phase: ${sd.current_phase || 'EXEC (inferred from handoff)'}`);

// Check handoffs
const { data: handoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('from_phase, to_phase, status')
  .eq('sd_id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .order('created_at', { ascending: false })
  .limit(3);

console.log(`\n📋 Recent Handoffs:`);
handoffs?.forEach(h => {
  console.log(`   ✅ ${h.from_phase} → ${h.to_phase} (${h.status})`);
});

// Check PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('id, status, phase, progress')
  .eq('sd_id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .single();

console.log('\n📝 PRD:');
console.log(`   Status: ${prd.status}, Phase: ${prd.phase}, Progress: ${prd.progress}%`);

// Check user stories with implementation context
const { data: stories } = await supabase
  .from('user_stories')
  .select('story_key, title, priority, story_points, implementation_context')
  .eq('sd_id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .order('story_key')
  .limit(3);

console.log(`\n📚 User Stories (first 3):`);
stories?.forEach(s => {
  const hasContext = s.implementation_context && s.implementation_context.length > 100;
  console.log(`   ${s.story_key}: ${s.title.substring(0, 50)}...`);
  console.log(`      Priority: ${s.priority}, Points: ${s.story_points}, Context: ${hasContext ? '✅' : '❌'}`);
});

console.log('\n' + '='.repeat(60) + '\n');
