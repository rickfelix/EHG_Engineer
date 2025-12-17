#!/usr/bin/env node
/**
 * Get PRD requirements for a given SD
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getPRDRequirements(prdId) {
  const { data: prd, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', prdId)
    .single();

  if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  }

  console.log('=== PRD REQUIREMENTS ===');
  console.log('ID:', prd.id);
  console.log('SD ID:', prd.sd_id);
  console.log('\n=== FUNCTIONAL REQUIREMENTS ===');
  if (prd.functional_requirements) {
    console.log(JSON.stringify(prd.functional_requirements, null, 2));
  } else {
    console.log('No functional requirements');
  }
  console.log('\n=== SUCCESS CRITERIA ===');
  if (prd.success_criteria) {
    console.log(JSON.stringify(prd.success_criteria, null, 2));
  } else {
    console.log('No success criteria');
  }
  console.log('\n=== METADATA ===');
  if (prd.metadata) {
    console.log(JSON.stringify(prd.metadata, null, 2));
  } else {
    console.log('No metadata');
  }
}

const prdId = process.argv[2] || 'PRD-SD-FOUNDATION-V3-001';
getPRDRequirements(prdId).catch(console.error);
