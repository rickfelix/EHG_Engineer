#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function searchRetros() {
  console.log('🔍 Searching Retrospectives for RLS Policy Solutions\n');
  
  // Search for RLS-related retrospectives
  const { data, error } = await supabase
    .from('retrospectives')
    .select('*')
    .or('description.ilike.%RLS%,title.ilike.%RLS%,description.ilike.%row level security%,title.ilike.%policy%')
    .eq('status', 'PUBLISHED')
    .order('conducted_date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`📚 Found ${data?.length || 0} relevant retrospectives\n`);

  if (data && data.length > 0) {
    data.forEach((retro, i) => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${i + 1}. ${retro.title || 'Untitled'}`);
      console.log(`   SD: ${retro.sd_id}`);
      console.log(`   Date: ${retro.conducted_date || 'N/A'}`);
      console.log(`${'='.repeat(60)}`);
      
      if (retro.key_learnings && Array.isArray(retro.key_learnings)) {
        console.log('\n📖 Key Learnings:');
        retro.key_learnings.forEach((learning, idx) => {
          console.log(`   ${idx + 1}. ${learning}`);
        });
      }

      if (retro.what_went_well && Array.isArray(retro.what_went_well)) {
        console.log('\n✅ What Went Well:');
        retro.what_went_well.forEach((item, idx) => {
          console.log(`   ${idx + 1}. ${item}`);
        });
      }

      if (retro.what_needs_improvement && Array.isArray(retro.what_needs_improvement)) {
        console.log('\n⚠️  What Needs Improvement:');
        retro.what_needs_improvement.forEach((item, idx) => {
          console.log(`   ${idx + 1}. ${item}`);
        });
      }

      if (retro.action_items && Array.isArray(retro.action_items)) {
        console.log('\n🎯 Action Items:');
        retro.action_items.forEach((item, idx) => {
          console.log(`   ${idx + 1}. ${item}`);
        });
      }

      if (retro.description) {
        console.log('\n📝 Description (first 500 chars):');
        console.log('   ' + retro.description.substring(0, 500) + '...');
      }
    });
  } else {
    console.log('No RLS-related retrospectives found.');
    console.log('\n💡 Searching for any database-related retrospectives...');
    
    const { data: dbRetros } = await supabase
      .from('retrospectives')
      .select('*')
      .or('description.ilike.%database%,title.ilike.%database%,description.ilike.%migration%,description.ilike.%supabase%')
      .eq('status', 'PUBLISHED')
      .order('conducted_date', { ascending: false })
      .limit(3);

    if (dbRetros && dbRetros.length > 0) {
      console.log(`\n📚 Found ${dbRetros.length} database-related retrospectives:`);
      dbRetros.forEach((retro, i) => {
        console.log(`   ${i + 1}. ${retro.title || retro.sd_id} - ${retro.conducted_date || 'N/A'}`);
      });
    }
  }
}

searchRetros();
