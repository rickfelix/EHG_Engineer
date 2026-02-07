#!/usr/bin/env node

/**
 * Check for SD types that exist in strategic_directives_v2 but not in sd_stream_requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkGaps() {
  // Get all sd_types from strategic_directives_v2
  const { data: sdTypes, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_type')
    .not('sd_type', 'is', null);

  if (sdError) {
    console.error('Error fetching SD types:', sdError);
    return;
  }

  const uniqueSDTypes = [...new Set(sdTypes.map(s => s.sd_type))].sort();
  console.log('\nSD Types in strategic_directives_v2:');
  console.log(uniqueSDTypes.join(', '));

  // Get all sd_types from sd_stream_requirements
  const { data: reqTypes, error: reqError } = await supabase
    .from('sd_stream_requirements')
    .select('sd_type');

  if (reqError) {
    console.error('Error fetching requirement types:', reqError);
    return;
  }

  const uniqueReqTypes = [...new Set(reqTypes.map(r => r.sd_type))].sort();
  console.log('\nSD Types in sd_stream_requirements:');
  console.log(uniqueReqTypes.join(', '));

  // Find missing types
  const missing = uniqueSDTypes.filter(t => !uniqueReqTypes.includes(t));

  console.log('\n=== MISSING TYPES (in SDs but not in requirements) ===');
  if (missing.length === 0) {
    console.log('✅ No gaps found. All SD types have requirements entries.');
  } else {
    console.log(`❌ ${missing.length} type(s) missing:`);
    missing.forEach(type => {
      console.log(`   - ${type}`);
    });
  }

  // Count SDs using missing types
  if (missing.length > 0) {
    console.log('\n=== SD COUNT BY MISSING TYPE ===');
    for (const type of missing) {
      const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, title, status')
        .eq('sd_type', type);

      console.log(`\n${type}: ${sds.length} SD(s)`);
      sds.forEach(sd => {
        console.log(`   - ${sd.sd_key}: ${sd.title} (${sd.status})`);
      });
    }
  }

  // Also show sample from existing types
  console.log('\n=== SAMPLE REQUIREMENTS (from existing types) ===');
  const { data: samples } = await supabase
    .from('sd_stream_requirements')
    .select('*')
    .in('sd_type', ['feature', 'documentation', 'orchestrator', 'bugfix'])
    .limit(4);

  samples.forEach(s => {
    console.log(`\n${s.sd_type} (${s.stream_type}):`);
    console.log(`  PRD required: ${s.prd_required}`);
    console.log(`  E2E required: ${s.e2e_required}`);
    console.log(`  Min handoffs: ${s.min_handoffs}`);
    console.log(`  Gate threshold: ${s.gate_threshold}%`);
  });
}

checkGaps().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
