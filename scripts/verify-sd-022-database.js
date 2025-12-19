#!/usr/bin/env node
/**
 * SD-022-PROTOCOL-REMEDIATION-001 Database Verification
 *
 * Verifies all database records exist for this process improvement SD:
 * - Strategic directive record
 * - Product requirements
 * - Phase handoffs
 * - Retrospectives
 *
 * Expected: No migrations needed (retroactive compliance SD)
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import fs from 'fs/promises';

async function verifyRecords() {
  console.log('=== SD-022-PROTOCOL-REMEDIATION-001 Database Verification ===\n');

  const supabase = createSupabaseServiceClient();

  // Check strategic directive (use 'id' column, not 'sd_id')
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, current_phase, status')
    .eq('id', 'SD-022-PROTOCOL-REMEDIATION-001')
    .single();

  console.log('1. Strategic Directive:');
  if (sdError) {
    console.log('   ❌ NOT FOUND:', sdError.message);
  } else {
    console.log('   ✅ FOUND:', sd.id);
    console.log('      Title:', sd.title);
    console.log('      Phase:', sd.current_phase);
    console.log('      Status:', sd.status);
  }

  // Check PRD (use 'id' column for prd_id)
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, version, sd_id')
    .eq('sd_id', 'SD-022-PROTOCOL-REMEDIATION-001');

  console.log('\n2. Product Requirements:');
  if (prdError || !prd || prd.length === 0) {
    console.log('   ❌ NOT FOUND');
    if (prdError) console.log('      Error:', prdError.message);
  } else {
    console.log('   ✅ FOUND:', prd.length, 'record(s)');
    prd.forEach(p => console.log('      -', p.id, p.title, 'v' + p.version));
  }

  // Check handoffs (use 'id' column for handoff_id)
  const { data: handoffs, error: handoffsError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, created_at, sd_id')
    .eq('sd_id', 'SD-022-PROTOCOL-REMEDIATION-001')
    .order('created_at', { ascending: true });

  console.log('\n3. Phase Handoffs:');
  if (handoffsError || !handoffs || handoffs.length === 0) {
    console.log('   ❌ NOT FOUND');
    if (handoffsError) console.log('      Error:', handoffsError.message);
  } else {
    console.log('   ✅ FOUND:', handoffs.length, 'record(s)');
    handoffs.forEach(h => {
      const date = new Date(h.created_at).toISOString().split('T')[0];
      console.log('      -', h.from_phase, '->', h.to_phase, '(' + date + ')');
    });
  }

  // Check retrospectives (use 'id' column for retro_id)
  const { data: retros, error: retrosError } = await supabase
    .from('retrospectives')
    .select('id, title, created_at, sd_id')
    .eq('sd_id', 'SD-022-PROTOCOL-REMEDIATION-001');

  console.log('\n4. Retrospectives:');
  if (retrosError || !retros || retros.length === 0) {
    console.log('   ❌ NOT FOUND');
    if (retrosError) console.log('      Error:', retrosError.message);
  } else {
    console.log('   ✅ FOUND:', retros.length, 'record(s)');
    retros.forEach(r => {
      const date = new Date(r.created_at).toISOString().split('T')[0];
      console.log('      -', r.id, '(' + date + ')');
    });
  }

  // Check for any migration files
  console.log('\n5. Migration Files:');
  const migrationsDir = './supabase/migrations';

  try {
    const files = await fs.readdir(migrationsDir);
    const sd022Files = files.filter(f =>
      f.toLowerCase().includes('sd-022') ||
      f.toLowerCase().includes('sd_022') ||
      f.toLowerCase().includes('protocol-remediation')
    );

    if (sd022Files.length === 0) {
      console.log('   ✅ NO MIGRATION FILES (expected for retroactive SD)');
    } else {
      console.log('   ⚠️ FOUND:', sd022Files.length, 'file(s)');
      sd022Files.forEach(f => console.log('      -', f));
    }
  } catch (err) {
    console.log('   ❌ ERROR reading migrations directory:', err.message);
  }

  // Final verdict
  console.log('\n=== VERIFICATION RESULT ===');
  const allPresent = !sdError && prd && prd.length > 0 && handoffs && handoffs.length > 0;

  if (allPresent) {
    console.log('✅ PASS: All expected database records exist');
    console.log('   - Strategic directive: FOUND');
    console.log('   - Product requirements: FOUND');
    console.log('   - Phase handoffs: FOUND');
    console.log('   - Retrospectives:', retros && retros.length > 0 ? 'FOUND' : 'NOT FOUND (optional)');
    console.log('\n📋 No migrations needed for this process improvement SD');
    console.log('   This SD is retroactive protocol compliance - database records already exist');
    return 0;
  } else {
    console.log('⚠️ INCOMPLETE: Some records missing');
    console.log('   Review findings above for details');
    console.log('\n❌ ACTION_REQUIRED: Missing database records detected');
    return 1;
  }
}

verifyRecords()
  .then(code => process.exit(code))
  .catch(err => {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  });
