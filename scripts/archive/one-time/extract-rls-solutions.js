#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function extractRLSSolutions() {
  console.log('🔍 Extracting RLS Policy Solutions from SD-AGENT-ADMIN-003\n');

  // Query the specific retrospective with RLS policy implementation
  const { data, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', 'SD-AGENT-ADMIN-003')
    .single();

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!data) {
    console.log('❌ No retrospective found for SD-AGENT-ADMIN-003');
    return;
  }

  console.log('📚 Retrospective: SD-AGENT-ADMIN-003');
  console.log('   Title:', data.title);
  console.log('   Date:', data.conducted_date);
  console.log('   Description:', data.description?.substring(0, 200) + '...\n');

  console.log('='.repeat(70));
  console.log('📖 KEY LEARNINGS (RLS Policy Insights):');
  console.log('='.repeat(70));

  if (data.key_learnings && Array.isArray(data.key_learnings)) {
    data.key_learnings.forEach((learning, idx) => {
      console.log(`\n${idx + 1}. ${typeof learning === 'object' ? JSON.stringify(learning, null, 2) : learning}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ WHAT WENT WELL (Successful Patterns):');
  console.log('='.repeat(70));

  if (data.what_went_well && Array.isArray(data.what_went_well)) {
    data.what_went_well.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${typeof item === 'object' ? JSON.stringify(item, null, 2) : item}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('⚠️  WHAT NEEDS IMPROVEMENT (Lessons):');
  console.log('='.repeat(70));

  if (data.what_needs_improvement && Array.isArray(data.what_needs_improvement)) {
    data.what_needs_improvement.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${typeof item === 'object' ? JSON.stringify(item, null, 2) : item}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎯 ACTION ITEMS (Specific Solutions):');
  console.log('='.repeat(70));

  if (data.action_items && Array.isArray(data.action_items)) {
    data.action_items.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${typeof item === 'object' ? JSON.stringify(item, null, 2) : item}`);
    });
  }

  // Also search for any migration files mentioned
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Searching for RLS Policy Patterns in Description:');
  console.log('='.repeat(70));

  const desc = data.description || '';
  const rlsMatches = desc.match(/RLS.{0,200}/gi) || [];

  if (rlsMatches.length > 0) {
    console.log('\nRLS Mentions Found:');
    rlsMatches.forEach((match, idx) => {
      console.log(`\n${idx + 1}. ${match}`);
    });
  } else {
    console.log('\nNo specific RLS policy patterns found in description.');
  }
}

extractRLSSolutions();
