#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Checking SD-RECONNECT-009 Retrospective\n');

const { data: retro, error } = await supabase
  .from('retrospectives')
  .select('*')
  .eq('sd_id', 'SD-RECONNECT-009')
  .single();

if (error) {
  console.log('No retrospective found for SD-RECONNECT-009');
  console.log('Error:', error.message);
  process.exit(0);
}

console.log(`Retrospective ID: ${retro.id}`);
console.log(`Quality Score: ${retro.quality_score}/100`);
console.log(`Objectives Met: ${retro.objectives_met}/${retro.total_objectives}`);
console.log('\nKey Learnings:');
if (retro.learnings && retro.learnings.length > 0) {
  retro.learnings.forEach((learning, i) => {
    console.log(`${i + 1}. ${learning}`);
  });
}
console.log('\nWhat Went Well:');
if (retro.what_went_well) {
  console.log(retro.what_went_well.substring(0, 500));
}
console.log('\nWhat Could Be Improved:');
if (retro.what_could_improve) {
  console.log(retro.what_could_improve.substring(0, 500));
}

process.exit(0);
