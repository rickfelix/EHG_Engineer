#!/usr/bin/env node
/**
 * Verify Quick-Fix Completion
 *
 * Used by pre-push hook to validate Quick-Fix completion
 * before allowing merge to main.
 *
 * Exit codes:
 *   0 - QF is ready for merge (status = 'completed')
 *   1 - QF is NOT ready (incomplete or failed requirements)
 *   2 - Error querying database
 *
 * Usage:
 *   node scripts/verify-qf-completion.js QF-20251223-001
 *   QF_ID=QF-20251223-001 node scripts/verify-qf-completion.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function verifyQFCompletion(qfId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(2);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch quick-fix record
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error) {
    console.error(`Error checking QF ${qfId}:`, error.message);
    process.exit(2);
  }

  if (!qf) {
    console.error(`Quick-Fix ${qfId} not found in database`);
    process.exit(2);
  }

  console.log('\n===========================================');
  console.log('       QUICK-FIX COMPLETION VERIFICATION');
  console.log('===========================================\n');
  console.log(`QF ID:    ${qfId}`);
  console.log(`Title:    ${qf.title}`);
  console.log(`Status:   ${qf.status}`);
  console.log(`Type:     ${qf.type}`);
  console.log(`Severity: ${qf.severity}\n`);

  // Check completion requirements
  const checks = {
    status_completed: qf.status === 'completed',
    tests_passing: qf.tests_passing === true,
    uat_verified: qf.uat_verified === true,
    pr_created: qf.pr_url && qf.pr_url.length > 0,
    loc_under_limit: (qf.actual_loc || qf.estimated_loc || 0) <= 50
  };

  const allPassed = Object.values(checks).every(v => v);

  console.log('Completion Requirements:');
  console.log(`  ${checks.status_completed ? '✓' : '✗'} Status is 'completed': ${qf.status}`);
  console.log(`  ${checks.tests_passing ? '✓' : '✗'} Tests passing: ${qf.tests_passing || false}`);
  console.log(`  ${checks.uat_verified ? '✓' : '✗'} UAT verified: ${qf.uat_verified || false}`);
  console.log(`  ${checks.pr_created ? '✓' : '✗'} PR created: ${qf.pr_url || 'none'}`);
  console.log(`  ${checks.loc_under_limit ? '✓' : '✗'} LOC ≤ 50: ${qf.actual_loc || qf.estimated_loc || 'unknown'}`);

  if (allPassed) {
    console.log('\n✅ STATUS: READY FOR MERGE\n');
    process.exit(0);
  } else {
    console.log('\n❌ STATUS: NOT READY FOR MERGE\n');

    console.log('Missing Requirements:');
    if (!checks.status_completed) {
      console.log('  - Quick-Fix status must be "completed"');
      console.log('    Run: node scripts/complete-quick-fix.js ' + qfId);
    }
    if (!checks.tests_passing) {
      console.log('  - Tests must pass (unit + E2E smoke)');
      console.log('    Run: npm run test:unit && npm run test:e2e -- --grep="smoke"');
    }
    if (!checks.uat_verified) {
      console.log('  - UAT must be verified manually');
    }
    if (!checks.pr_created) {
      console.log('  - PR URL must be provided');
      console.log('    Run: node scripts/complete-quick-fix.js ' + qfId + ' --pr-url <URL>');
    }
    if (!checks.loc_under_limit) {
      console.log('  - Actual LOC exceeds 50 line limit');
      console.log('    Consider escalating to full SD');
    }

    console.log('\nTo complete the Quick-Fix:');
    console.log(`  node scripts/complete-quick-fix.js ${qfId} --pr-url <PR_URL>`);
    console.log('');

    process.exit(1);
  }
}

// Get QF ID from command line or environment
const qfId = process.argv[2] || process.env.QF_ID;

if (!qfId) {
  console.error('Usage: node scripts/verify-qf-completion.js <QF-ID>');
  console.error('Example: node scripts/verify-qf-completion.js QF-20251223-001');
  process.exit(2);
}

verifyQFCompletion(qfId);
