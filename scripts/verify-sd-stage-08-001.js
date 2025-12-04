#!/usr/bin/env node

/**
 * SD-STAGE-08-001 Compliance Verification Script
 * Verifies all required LEO Protocol records exist
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SD_LEGACY_ID = 'SD-STAGE-08-001';

async function main() {
  console.log('=== SD-STAGE-08-001 LEO Protocol Compliance Verification ===\n');

  let allPassed = true;

  // Check PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, progress, created_by')
    .eq('sd_id', SD_LEGACY_ID)
    .single();

  console.log('1. PRD (product_requirements_v2):');
  if (prdError) {
    console.log('   ❌ NOT FOUND:', prdError.message);
    allPassed = false;
  } else {
    console.log('   ✅ FOUND:', prd.id);
    console.log('      Title:', prd.title);
    console.log('      Status:', prd.status, `(${prd.progress}% complete)`);
    console.log('      Created by:', prd.created_by);
  }

  console.log('');

  // Check handoffs
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_by, metadata')
    .eq('sd_id', SD_LEGACY_ID)
    .order('created_at', { ascending: true });

  console.log('2. Phase Handoffs (sd_phase_handoffs):');
  if (handoffError) {
    console.log('   ❌ ERROR:', handoffError.message);
    allPassed = false;
  } else if (!handoffs || handoffs.length === 0) {
    console.log('   ❌ NOT FOUND: No handoffs');
    allPassed = false;
  } else {
    console.log(`   ✅ FOUND ${handoffs.length} handoffs:`);
    handoffs.forEach((h, i) => {
      const isRemediation = h.metadata?.remediation ? ' (REMEDIATION)' : '';
      console.log(`      ${i + 1}. ${h.handoff_type} - ${h.status}${isRemediation}`);
    });

    // Verify all 4 required handoffs
    const requiredHandoffs = ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'];
    const foundTypes = handoffs.map(h => h.handoff_type);
    const missing = requiredHandoffs.filter(type => !foundTypes.includes(type));

    if (missing.length > 0) {
      console.log('   ⚠️  Missing handoffs:', missing.join(', '));
      allPassed = false;
    }
  }

  console.log('');

  // Check retrospectives
  const { data: retros, error: retroError } = await supabase
    .from('retrospectives')
    .select('id, title, status, conducted_date')
    .eq('sd_id', SD_LEGACY_ID);

  console.log('3. Retrospectives:');
  if (retroError) {
    console.log('   ❌ ERROR:', retroError.message);
    allPassed = false;
  } else if (!retros || retros.length === 0) {
    console.log('   ⚠️  NOT FOUND: No retrospectives (optional but recommended)');
  } else {
    console.log(`   ✅ FOUND ${retros.length} retrospective(s):`);
    retros.forEach((r, i) => {
      console.log(`      ${i + 1}. ${r.title || '(Untitled)'} - ${r.status}`);
    });
  }

  console.log('');
  console.log('====================================');
  if (allPassed) {
    console.log('✅ Compliance Status: PASS');
    console.log('SD-STAGE-08-001 has all required LEO Protocol records.');
  } else {
    console.log('❌ Compliance Status: FAIL');
    console.log('SD-STAGE-08-001 is missing required LEO Protocol records.');
    process.exit(1);
  }
}

main();
