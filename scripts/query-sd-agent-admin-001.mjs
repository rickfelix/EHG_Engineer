#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Querying SD-AGENT-ADMIN-001...\n');

// Query the SD
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-AGENT-ADMIN-001')
  .single();

if (sdError) {
  console.error('❌ Error querying SD:', sdError);
  
  // Try to find similar SDs
  const { data: similarSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, description')
    .ilike('id', '%AGENT%')
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('\n📋 Found similar SDs:');
  similarSDs?.forEach(s => {
    console.log(`  - ${s.id}: ${s.title}`);
  });
  
  process.exit(1);
}

console.log('✅ SD Found\n');
console.log('ID:', sd.id);
console.log('Title:', sd.title);
console.log('Status:', sd.status);
console.log('Priority:', sd.priority);
console.log('Progress:', `${sd.progress}%`);
console.log('Current Phase:', sd.current_phase);
console.log('\nDescription:', sd.description?.substring(0, 200) + '...');
console.log('\nStrategic Objectives:', sd.strategic_objectives?.substring(0, 200) + '...');

// Query linked PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-AGENT-ADMIN-001')
  .single();

console.log('\n📄 PRD Status:', prd ? '✅ Exists' : '❌ Not found');
if (prd) {
  console.log('PRD ID:', prd.id);
  console.log('PRD Title:', prd.title);
}

// Query backlog items
const { data: backlog } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', 'SD-AGENT-ADMIN-001')
  .order('priority', { ascending: false });

console.log('\n📋 Backlog Items:', backlog?.length || 0);
backlog?.forEach((item, idx) => {
  console.log(`  ${idx + 1}. [${item.priority}] ${item.backlog_title}`);
});
