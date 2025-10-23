#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-SD-VWC-A11Y-002')
  .single();

console.log('📄 PRD:', prd.id);
console.log('Title:', prd.title);
console.log('\n🎯 OVERVIEW:');
console.log(prd.overview || 'No overview');

console.log('\n📝 FUNCTIONAL REQUIREMENTS:');
const reqs = prd.functional_requirements || [];
reqs.forEach((req, i) => {
  if (typeof req === 'object') {
    console.log(`\n${i+1}. ${req.title || req.requirement || 'Untitled'}`);
    if (req.description) console.log(`   ${req.description}`);
    if (req.details) console.log(`   Details: ${req.details}`);
  } else {
    console.log(`${i+1}. ${req}`);
  }
});

console.log('\n✅ EXEC CHECKLIST (' + (prd.exec_checklist?.length || 0) + ' items):');
const checklist = prd.exec_checklist || [];
checklist.forEach((item, i) => {
  const status = item.checked ? '✅' : '⬜';
  if (typeof item === 'object') {
    console.log(`   ${status} ${item.item || item.title || item.description}`);
  } else {
    console.log(`   ${status} ${item}`);
  }
});

console.log('\n📋 USER STORIES:');
const { data: stories } = await supabase
  .from('user_stories')
  .select('id, title, description, acceptance_criteria, status, validation_status')
  .eq('prd_id', 'PRD-SD-VWC-A11Y-002')
  .order('sequence_rank', { ascending: true });

stories?.forEach((story, i) => {
  console.log(`\n${i+1}. ${story.title}`);
  console.log(`   Status: ${story.status} | Validation: ${story.validation_status || 'N/A'}`);
  if (story.description) console.log(`   Description: ${story.description.substring(0, 150)}...`);
});
