#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function updateSequenceRank() {
  console.log('📋 Updating SD-MULTIMEDIA-001 sequence rank...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Update sequence_rank to 1 (top of the list)
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({ sequence_rank: 1 })
      .eq('id', 'SD-MULTIMEDIA-001')
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database error:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Sequence rank updated successfully!');
    console.log(`   New sequence_rank: ${data.sequence_rank}`);
    console.log('\n📊 SD will now appear at the top when sorting ascending.');
    
  } catch (_error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateSequenceRank();
