#!/usr/bin/env node
/**
 * Handoff Compliance Checker
 *
 * Detects handoffs created outside the proper LEO Protocol handoff system.
 * Valid handoffs should have created_by = 'UNIFIED-HANDOFF-SYSTEM'.
 *
 * Usage:
 *   node scripts/check-handoff-compliance.js [SD-ID]
 *   npm run handoff:compliance [SD-ID]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCompliance(sdId = null) {
  console.log('');
  console.log('🔍 LEO Protocol Handoff Compliance Check');
  console.log('='.repeat(60));

  // Build query
  let query = supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type, from_phase, to_phase, status, created_by, created_at')
    .order('created_at', { ascending: false });

  if (sdId) {
    query = query.eq('sd_id', sdId);
    console.log(`   Checking: ${sdId}`);
  } else {
    console.log('   Checking: All recent handoffs (last 30 days)');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query = query.gte('created_at', thirtyDaysAgo.toISOString());
  }

  const { data: handoffs, error } = await query.limit(100);

  if (error) {
    console.error('❌ Failed to query handoffs:', error.message);
    process.exit(1);
  }

  if (!handoffs || handoffs.length === 0) {
    console.log('');
    console.log('ℹ️  No handoffs found');
    process.exit(0);
  }

  // Categorize handoffs
  const compliant = [];
  const bypassed = [];

  for (const h of handoffs) {
    if (h.created_by === 'UNIFIED-HANDOFF-SYSTEM') {
      compliant.push(h);
    } else {
      bypassed.push(h);
    }
  }

  console.log('');
  console.log('📊 Results');
  console.log('-'.repeat(60));
  console.log(`   Total Handoffs: ${handoffs.length}`);
  console.log(`   ✅ Compliant (UNIFIED-HANDOFF-SYSTEM): ${compliant.length}`);
  console.log(`   ⚠️  Bypassed (other created_by): ${bypassed.length}`);

  if (bypassed.length > 0) {
    console.log('');
    console.log('⚠️  BYPASSED HANDOFFS DETECTED');
    console.log('-'.repeat(60));
    console.log('   These handoffs were created outside the proper LEO Protocol flow:');
    console.log('');

    for (const h of bypassed) {
      console.log(`   📄 ${h.sd_id} | ${h.handoff_type}`);
      console.log(`      Status: ${h.status}`);
      console.log(`      Created By: ${h.created_by || 'NULL'}`);
      console.log(`      Date: ${new Date(h.created_at).toLocaleString()}`);
      console.log('');
    }

    console.log('   REMEDIATION:');
    console.log('   Run the proper handoff scripts to ensure validation:');
    console.log('');
    console.log('   node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>');
    console.log('   node scripts/handoff.js execute PLAN-TO-EXEC <SD-ID>');
    console.log('   node scripts/handoff.js execute EXEC-TO-PLAN <SD-ID>');
    console.log('   node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID>');
    console.log('');
  }

  // Calculate compliance rate
  const complianceRate = handoffs.length > 0
    ? Math.round((compliant.length / handoffs.length) * 100)
    : 100;

  console.log('');
  console.log('📈 Compliance Rate');
  console.log('-'.repeat(60));
  console.log(`   ${complianceRate}% of handoffs created via proper LEO Protocol flow`);

  if (complianceRate < 100) {
    console.log('');
    console.log('   ⚠️  TARGET: 100% compliance');
    console.log('   See CLAUDE_CORE.md "MANDATORY: Phase Transition Commands" section');
  } else {
    console.log('');
    console.log('   ✅ All handoffs compliant with LEO Protocol');
  }

  console.log('');

  // Exit with error code if non-compliant
  process.exit(bypassed.length > 0 ? 1 : 0);
}

// Run
const sdId = process.argv[2];
checkCompliance(sdId).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
