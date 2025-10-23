#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkStories() {
  const { data, error } = await supabase
    .from('user_stories')
    .select('id, story_key, title, implementation_context')
    .eq('sd_id', 'SD-2025-1020-UDI')
    .order('id', { ascending: true });

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== USER STORIES VERIFICATION ===');
  console.log('Total:', data.length, 'stories');
  console.log('');

  let withContext = 0;

  data.forEach((s, i) => {
    let hasContext = false;
    if (typeof s.implementation_context === 'string') {
      hasContext = s.implementation_context.trim().length > 0;
    } else if (s.implementation_context != null) {
      hasContext = true;
    }

    if (hasContext) withContext++;

    console.log(`${i+1}. ${s.story_key || s.id}`);
    console.log(`   Title: ${s.title}`);
    console.log(`   Implementation Context: ${hasContext ? '✓ YES' : '✗ MISSING'}`);
    console.log('');
  });

  console.log('=== SUMMARY ===');
  console.log(`With implementation_context: ${withContext} / ${data.length} (${Math.round(withContext/data.length*100)}%)`);
  console.log('');
  console.log('BMAD Validation: Need ≥80% coverage');
  console.log(`Status: ${(withContext/data.length >= 0.8) ? '✅ PASS' : '⚠️  FAIL'}`);
}

checkStories();
