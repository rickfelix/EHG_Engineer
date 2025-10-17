#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-AGENT-ADMIN-001')
  .single();

console.log('📋 SD-AGENT-ADMIN-001 Details\n');
console.log('Title:', sd.title);
console.log('Status:', sd.status);
console.log('Priority:', sd.priority);
console.log('Progress:', `${sd.progress}%`);
console.log('Phase:', sd.current_phase);
console.log('\n📄 Full Description:');
console.log(sd.description);
console.log('\n🎯 Strategic Objectives:');
console.log(JSON.stringify(sd.strategic_objectives, null, 2));
console.log('\n📊 Success Metrics:');
console.log(JSON.stringify(sd.success_metrics, null, 2));

// Query PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-AGENT-ADMIN-001')
  .single();

if (prd) {
  console.log('\n📄 PRD EXISTS');
  console.log('Title:', prd.title);
  console.log('Story Points:', prd.story_points);
}

// Query backlog
const { data: backlog } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', 'SD-AGENT-ADMIN-001')
  .order('priority', { ascending: false });

console.log('\n📋 Backlog Items:', backlog?.length || 0);
backlog?.slice(0, 10).forEach((item, idx) => {
  console.log(`\n${idx + 1}. ${item.backlog_title}`);
  console.log(`   Priority: ${item.priority}`);
  console.log(`   Description: ${item.item_description}`);
  if (item.extras?.Description_1) {
    console.log(`   Details: ${item.extras.Description_1.substring(0, 150)}...`);
  }
});
