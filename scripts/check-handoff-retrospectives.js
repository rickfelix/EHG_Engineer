#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const sdId = process.argv[2] || 'SD-VISION-TRANSITION-001D2';

  console.log(`🔍 Checking retrospectives for ${sdId}...\n`);

  const { data, error } = await supabase
    .from('retrospectives')
    .select('id, sd_id, title, retrospective_type, retro_type, created_at, quality_score')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log(`❌ No retrospectives found for ${sdId}`);
    console.log('   The LEAD-TO-PLAN handoff did NOT create a retrospective');
  } else {
    console.log(`✅ Found ${data.length} retrospective(s):`);
    data.forEach(r => {
      console.log(`   ID: ${r.id}`);
      console.log(`   Title: ${r.title}`);
      console.log(`   Retrospective Type: ${r.retrospective_type || 'not set'}`);
      console.log(`   Retro Type: ${r.retro_type || 'not set'}`);
      console.log(`   Created: ${r.created_at}`);
      console.log(`   Quality Score: ${r.quality_score || 'not set'}`);
      console.log('');
    });
  }

  // Also check recent retrospectives with retrospective_type
  console.log('\n📋 Recent handoff retrospectives (any SD):');
  const { data: recent } = await supabase
    .from('retrospectives')
    .select('id, sd_id, title, retrospective_type, created_at')
    .not('retrospective_type', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (recent && recent.length > 0) {
    recent.forEach(r => {
      console.log(`   ${r.sd_id}: ${r.retrospective_type} - ${r.title?.substring(0, 50)}...`);
    });
  } else {
    console.log('   No handoff retrospectives found with retrospective_type set');
  }

  // Check if retrospective_type column exists
  console.log('\n📊 Checking retrospective_type column...');
  const { data: sample } = await supabase
    .from('retrospectives')
    .select('retrospective_type')
    .limit(1);

  if (sample !== null) {
    console.log('   ✅ retrospective_type column exists in table');
  }
}

main();
