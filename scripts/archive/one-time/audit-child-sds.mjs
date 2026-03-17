#!/usr/bin/env node

/**
 * audit-child-sds.mjs
 *
 * Read-only audit script for child Strategic Directives.
 * Validates carry_forward blocks across all child SDs in the database.
 *
 * Part of Phase A: SD Split Carry-Forward Mechanism
 * This script performs NO database writes - validation only.
 *
 * Usage:
 *   node scripts/audit-child-sds.mjs              # Audit all child SDs
 *   node scripts/audit-child-sds.mjs --verbose    # Show detailed gate results
 *   node scripts/audit-child-sds.mjs --json       # Output JSON format
 *   node scripts/audit-child-sds.mjs --sd SD-XXX  # Audit specific SD
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import {
  validateCarryForward,
  formatValidationResults,
  ValidationSeverity,
  Gates
} from './validators/carry-forward-validator.js';

// Load environment variables
config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_KEY environment variables required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    json: false,
    sdId: null,
    phase: 'PLAN_ENTRY' // Default phase for audit
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--sd' && args[i + 1]) {
      options.sdId = args[++i];
    } else if (arg === '--phase' && args[i + 1]) {
      options.phase = args[++i].toUpperCase();
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
audit-child-sds.mjs - Validate carry_forward blocks for child SDs

Usage:
  node scripts/audit-child-sds.mjs [options]

Options:
  --verbose, -v    Show detailed gate results
  --json           Output JSON format
  --sd <SD-ID>     Audit specific SD only
  --phase <phase>  Validation phase: PLAN_ENTRY, PRD_APPROVAL, PLAN_TO_EXEC
  --help, -h       Show this help message

Examples:
  node scripts/audit-child-sds.mjs
  node scripts/audit-child-sds.mjs --verbose
  node scripts/audit-child-sds.mjs --sd SD-VISION-V2-001
  node scripts/audit-child-sds.mjs --phase PRD_APPROVAL --json
`);
}

/**
 * Fetch all active SDs from database
 */
async function fetchAllSDs(specificSdId = null) {
  let query = supabase
    .from('strategic_directives_v2')
    .select('id, title, status, parent_sd_id, metadata, target_application')
    .eq('is_active', true)
    .in('status', ['active', 'draft', 'in_progress', 'approved', 'completed']);

  if (specificSdId) {
    query = query.eq('id', specificSdId);
  }

  const { data, error } = await query.order('id');

  if (error) {
    throw new Error(`Failed to fetch SDs: ${error.message}`);
  }

  return data || [];
}

/**
 * Create ancestor fetcher function for G10 validation
 */
function createAncestorFetcher(allSDs) {
  const sdMap = new Map(allSDs.map(sd => [sd.id, sd]));

  return async (sdId) => {
    return sdMap.get(sdId) || null;
  };
}

/**
 * Run audit on all child SDs
 */
async function runAudit(options) {
  const projectRoot = process.cwd();

  // Fetch all SDs
  const allSDs = await fetchAllSDs(options.sdId);

  if (allSDs.length === 0) {
    if (options.sdId) {
      console.error(`SD not found: ${options.sdId}`);
      process.exit(1);
    }
    console.log('No active SDs found in database.');
    return;
  }

  // Filter to child SDs only (those with parent_sd_id)
  const childSDs = allSDs.filter(sd => sd.parent_sd_id);
  const parentSDs = allSDs.filter(sd => !sd.parent_sd_id);

  // Create ancestor fetcher
  const fetchAncestors = createAncestorFetcher(allSDs);

  // Run validation on each child SD
  const results = [];
  for (const sd of childSDs) {
    const result = await validateCarryForward(sd, {
      phase: options.phase,
      projectRoot,
      fetchAncestors
    });
    results.push(result);
  }

  // Also validate parent SDs (should pass quickly - no carry_forward required)
  for (const sd of parentSDs) {
    const result = await validateCarryForward(sd, {
      phase: options.phase,
      projectRoot,
      fetchAncestors
    });
    results.push(result);
  }

  // Output results
  if (options.json) {
    outputJSON(results, allSDs, options);
  } else {
    outputText(results, allSDs, options);
  }

  // Return exit code based on failures
  const failures = results.filter(r => r.overallStatus === ValidationSeverity.FAIL);
  return failures.length > 0 ? 1 : 0;
}

/**
 * Output results in JSON format
 */
function outputJSON(results, allSDs, options) {
  const output = {
    audit_date: new Date().toISOString(),
    phase: options.phase,
    summary: {
      total_sds: allSDs.length,
      child_sds: results.filter(r => r.isChildSd).length,
      parent_sds: results.filter(r => !r.isChildSd).length,
      pass: results.filter(r => r.overallStatus === ValidationSeverity.PASS).length,
      warn: results.filter(r => r.overallStatus === ValidationSeverity.WARN).length,
      escalate: results.filter(r => r.overallStatus === ValidationSeverity.ESCALATE).length,
      fail: results.filter(r => r.overallStatus === ValidationSeverity.FAIL).length
    },
    results: results
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Output results in text format
 */
function outputText(results, allSDs, options) {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              CHILD SD CARRY-FORWARD AUDIT                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Date: ${new Date().toISOString().slice(0, 19).padEnd(55)}║`);
  console.log(`║  Phase: ${options.phase.padEnd(54)}║`);
  console.log(`║  Mode: READ-ONLY (no database writes)${' '.repeat(25)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // Summary
  const childResults = results.filter(r => r.isChildSd);
  const parentResults = results.filter(r => !r.isChildSd);

  console.log('\n📊 SUMMARY');
  console.log('─'.repeat(60));
  console.log(`  Total SDs: ${allSDs.length}`);
  console.log(`  Parent SDs: ${parentResults.length}`);
  console.log(`  Child SDs: ${childResults.length}`);
  console.log('');

  const statusCounts = {
    [ValidationSeverity.PASS]: results.filter(r => r.overallStatus === ValidationSeverity.PASS).length,
    [ValidationSeverity.WARN]: results.filter(r => r.overallStatus === ValidationSeverity.WARN).length,
    [ValidationSeverity.ESCALATE]: results.filter(r => r.overallStatus === ValidationSeverity.ESCALATE).length,
    [ValidationSeverity.FAIL]: results.filter(r => r.overallStatus === ValidationSeverity.FAIL).length
  };

  console.log(`  ✅ PASS: ${statusCounts[ValidationSeverity.PASS]}`);
  console.log(`  ⚠️  WARN: ${statusCounts[ValidationSeverity.WARN]}`);
  console.log(`  🔶 ESCALATE: ${statusCounts[ValidationSeverity.ESCALATE]}`);
  console.log(`  ❌ FAIL: ${statusCounts[ValidationSeverity.FAIL]}`);

  // Parent SDs (brief)
  if (parentResults.length > 0) {
    console.log('\n📁 PARENT SDs (no carry_forward required)');
    console.log('─'.repeat(60));
    for (const result of parentResults) {
      const sd = allSDs.find(s => s.id === result.sdId);
      console.log(`  ✅ ${result.sdId}: ${sd?.title?.substring(0, 45) || 'N/A'}`);
    }
  }

  // Child SDs (detailed if verbose or if there are issues)
  if (childResults.length > 0) {
    console.log('\n👶 CHILD SDs');
    console.log('─'.repeat(60));

    for (const result of childResults) {
      const sd = allSDs.find(s => s.id === result.sdId);

      if (options.verbose || result.overallStatus !== ValidationSeverity.PASS) {
        console.log(formatValidationResults(result));
        console.log(`   Title: ${sd?.title?.substring(0, 50) || 'N/A'}`);
        console.log(`   Parent: ${sd?.parent_sd_id || 'N/A'}`);
        console.log('');
      } else {
        // Brief output for passing SDs in non-verbose mode
        console.log(`  ✅ ${result.sdId}: ${sd?.title?.substring(0, 45) || 'N/A'}`);
      }
    }
  } else {
    console.log('\n👶 CHILD SDs');
    console.log('─'.repeat(60));
    console.log('  No child SDs found in database.');
    console.log('  (All current SDs are root-level with no parent_sd_id)');
  }

  // Gate compliance summary
  if (childResults.length > 0 && options.verbose) {
    console.log('\n📋 GATE COMPLIANCE (Child SDs only)');
    console.log('─'.repeat(60));

    const gateStats = {};
    Object.values(Gates).forEach(gate => {
      gateStats[gate] = { pass: 0, warn: 0, escalate: 0, fail: 0 };
    });

    childResults.forEach(result => {
      Object.entries(result.gates).forEach(([gate, gateResult]) => {
        gateStats[gate][gateResult.status.toLowerCase()]++;
      });
    });

    Object.entries(gateStats).forEach(([gate, stats]) => {
      const total = stats.pass + stats.warn + stats.escalate + stats.fail;
      if (total > 0) {
        const passRate = Math.round((stats.pass / total) * 100);
        console.log(`  ${gate}: ${passRate}% pass (${stats.pass}/${total})`);
      }
    });
  }

  // Final verdict
  console.log('\n' + '═'.repeat(60));
  if (statusCounts[ValidationSeverity.FAIL] > 0) {
    console.log('❌ AUDIT FAILED - Action required before PRD approval');
  } else if (statusCounts[ValidationSeverity.ESCALATE] > 0) {
    console.log('🔶 AUDIT PASSED WITH ESCALATIONS - Chairman review required');
  } else if (statusCounts[ValidationSeverity.WARN] > 0) {
    console.log('⚠️  AUDIT PASSED WITH WARNINGS');
  } else {
    console.log('✅ AUDIT PASSED - All SDs compliant');
  }
  console.log('═'.repeat(60) + '\n');
}

// Main execution
const options = parseArgs();

runAudit(options)
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error('Audit error:', err.message);
    process.exit(1);
  });
