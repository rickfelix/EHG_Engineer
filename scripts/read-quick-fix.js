#!/usr/bin/env node

/**
 * Read Quick-Fix Details
 * Display complete quick-fix information for implementation
 *
 * Usage:
 *   node scripts/read-quick-fix.js QF-20251117-001
 *   node scripts/read-quick-fix.js QF-20251117-001 --json  (JSON output)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function readQuickFix(qfId, options = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch quick-fix record
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error || !qf) {
    console.log(`❌ Quick-fix not found: ${qfId}`);
    process.exit(1);
  }

  // JSON output mode
  if (options.json) {
    console.log(JSON.stringify(qf, null, 2));
    return qf;
  }

  // Human-readable output
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎯 Quick-Fix: ${qfId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Basic info
  console.log('📌 BASIC INFORMATION\n');
  console.log(`   Title:       ${qf.title}`);
  console.log(`   Type:        ${qf.type}`);
  console.log(`   Severity:    ${qf.severity}`);
  console.log(`   Status:      ${qf.status}`);
  console.log(`   Created:     ${new Date(qf.created_at).toLocaleString()}\n`);

  // Description
  console.log('📝 DESCRIPTION\n');
  console.log(`   ${qf.description}\n`);

  // Reproduction steps
  if (qf.steps_to_reproduce) {
    console.log('🔄 STEPS TO REPRODUCE\n');
    console.log(`   ${qf.steps_to_reproduce}\n`);
  }

  // Expected vs actual
  if (qf.expected_behavior || qf.actual_behavior) {
    console.log('🎭 BEHAVIOR\n');
    if (qf.expected_behavior) {
      console.log(`   Expected: ${qf.expected_behavior}`);
    }
    if (qf.actual_behavior) {
      console.log(`   Actual:   ${qf.actual_behavior}`);
    }
    console.log();
  }

  // Screenshot
  if (qf.screenshot_path) {
    console.log('📸 SCREENSHOT\n');
    console.log(`   ${qf.screenshot_path}\n`);
  }

  // Scope
  console.log('📏 SCOPE\n');
  console.log(`   Estimated LOC: ${qf.estimated_loc || 'not specified'}`);
  if (qf.actual_loc) {
    console.log(`   Actual LOC:    ${qf.actual_loc}`);
  }
  if (qf.files_changed) {
    const files = Array.isArray(qf.files_changed) ? qf.files_changed : JSON.parse(qf.files_changed);
    console.log(`   Files Changed: ${files.length}`);
    files.forEach(file => console.log(`      - ${file}`));
  }
  console.log();

  // Implementation tracking
  if (qf.status !== 'open') {
    console.log('🔧 IMPLEMENTATION\n');
    if (qf.branch_name) {
      console.log(`   Branch:     ${qf.branch_name}`);
    }
    if (qf.commit_sha) {
      console.log(`   Commit:     ${qf.commit_sha.substring(0, 7)}`);
    }
    if (qf.pr_url) {
      console.log(`   PR:         ${qf.pr_url}`);
    }
    if (qf.started_at) {
      console.log(`   Started:    ${new Date(qf.started_at).toLocaleString()}`);
    }
    if (qf.completed_at) {
      console.log(`   Completed:  ${new Date(qf.completed_at).toLocaleString()}`);
    }
    console.log();
  }

  // Verification
  if (qf.tests_passing !== null || qf.uat_verified !== null) {
    console.log('✅ VERIFICATION\n');
    console.log(`   Tests Passing: ${qf.tests_passing ? '✅ Yes' : '❌ No'}`);
    console.log(`   UAT Verified:  ${qf.uat_verified ? '✅ Yes' : '❌ No'}`);
    if (qf.verified_by) {
      console.log(`   Verified By:   ${qf.verified_by}`);
    }
    if (qf.verification_notes) {
      console.log(`   Notes:         ${qf.verification_notes}`);
    }
    console.log();
  }

  // Escalation info
  if (qf.status === 'escalated') {
    console.log('⚠️  ESCALATION\n');
    console.log(`   Reason:    ${qf.escalation_reason}`);
    if (qf.escalated_to_sd_id) {
      console.log(`   SD:        ${qf.escalated_to_sd_id}`);
    }
    console.log();
  }

  // Next steps based on status
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (qf.status === 'open') {
    console.log('📍 NEXT STEPS\n');
    console.log(`   1. Classify:       node scripts/classify-quick-fix.js ${qfId}`);
    console.log(`   2. Create branch:  git checkout -b quick-fix/${qfId}`);
    console.log('   3. Implement fix:  (≤50 LOC, single file preferred)');
    console.log('   4. Restart server: pkill -f "npm run dev" && npm run dev');
    console.log('   5. Run tests:      npm run test:unit && npm run test:e2e');
    console.log('   6. Verify UAT:     (manually test the fix)');
    console.log(`   7. Complete:       node scripts/complete-quick-fix.js ${qfId}\n`);
  } else if (qf.status === 'in_progress') {
    console.log('📍 IN PROGRESS\n');
    console.log('   1. Continue implementation (≤50 LOC)');
    console.log('   2. Restart server: pkill -f "npm run dev" && npm run dev');
    console.log('   3. Run tests:      npm run test:unit && npm run test:e2e');
    console.log('   4. Verify UAT:     (manually test the fix)');
    console.log(`   5. Complete:       node scripts/complete-quick-fix.js ${qfId}\n`);
  } else if (qf.status === 'completed') {
    console.log('✅ COMPLETED\n');
    console.log('   This quick-fix has been completed and verified.\n');
  } else if (qf.status === 'escalated') {
    console.log('⚠️  ESCALATED TO FULL SD\n');
    console.log('   This issue requires a full Strategic Directive.');
    console.log('   Follow LEAD→PLAN→EXEC workflow.\n');
  }

  return qf;
}

// CLI argument parsing
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
LEO Quick-Fix Workflow - Read Issue Details

Usage:
  node scripts/read-quick-fix.js QF-20251117-001
  node scripts/read-quick-fix.js QF-20251117-001 --json

Options:
  --json              Output in JSON format
  --help, -h          Show this help

Examples:
  node scripts/read-quick-fix.js QF-20251117-001
  node scripts/read-quick-fix.js QF-20251117-001 --json
  `);
  process.exit(0);
}

const qfId = args[0];
const options = {
  json: args.includes('--json')
};

// Run
readQuickFix(qfId, options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
