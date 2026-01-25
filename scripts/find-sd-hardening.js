#!/usr/bin/env node
/**
 * Find SD-HARDENING-V1-001 in database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findSD() {
  console.log('Searching for SD-HARDENING-V1-001...\n');

  // Try strategic_directives_v2 first
  const { data: sdV2, error: sdV2Error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_key, title, description, status')
    .or('sd_key.eq.SD-HARDENING-V1-001,sd_key.eq.SD-HARDENING-V1-001')
    .maybeSingle();

  if (sdV2) {
    console.log('✅ Found in strategic_directives_v2:');
    console.log(JSON.stringify(sdV2, null, 2));
    return sdV2;
  }

  if (sdV2Error) {
    console.log('⚠️  strategic_directives_v2 error:', sdV2Error.message);
  }

  // Try strategic_directives (old table)
  const { data: sdOld, error: sdOldError } = await supabase
    .from('strategic_directives')
    .select('*')
    .or('sd_key.eq.SD-HARDENING-V1-001,directive_id.eq.SD-HARDENING-V1-001')
    .maybeSingle();

  if (sdOld) {
    console.log('✅ Found in strategic_directives (legacy):');
    console.log(JSON.stringify(sdOld, null, 2));
    return sdOld;
  }

  if (sdOldError) {
    console.log('⚠️  strategic_directives error:', sdOldError.message);
  }

  console.log('❌ SD not found in either table.');
  console.log('\nPlease create SD-HARDENING-V1-001 first before generating user stories.');
  return null;
}

async function findPRD() {
  console.log('\nSearching for PRD-SD-HARDENING-V1-001...\n');

  const { data: prd, error: prdError } = await supabase
    .from('product_requirements')
    .select('*')
    .eq('directive_id', 'PRD-SD-HARDENING-V1-001')
    .maybeSingle();

  if (prd) {
    console.log('✅ Found PRD:');
    console.log(`   ID: ${prd.id}`);
    console.log(`   Title: ${prd.title || 'N/A'}`);
    console.log(`   Status: ${prd.status || 'N/A'}`);
    return prd;
  }

  if (prdError) {
    console.log('⚠️  PRD error:', prdError.message);
  } else {
    console.log('❌ PRD not found.');
  }

  return null;
}

async function main() {
  const sd = await findSD();
  if (sd) {
    await findPRD();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
