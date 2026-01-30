#!/usr/bin/env node
/**
 * OIV Validate CLI - Operational Integration Verification
 * SD-LEO-INFRA-OIV-001
 *
 * Manual CLI tool for running OIV validation outside of handoff flow.
 *
 * Usage:
 *   npm run oiv:validate                      # Validate all contracts
 *   npm run oiv:validate -- --sd-type feature # Filter by SD type
 *   npm run oiv:validate -- --maxLevel L3     # Override max level
 *   npm run oiv:validate -- --contract <key>  # Validate specific contract
 *   npm run oiv:validate -- --verbose         # Verbose output
 *   npm run oiv:validate -- --json            # JSON output only
 *
 * Exit codes:
 *   0 = PASS/SKIP (all contracts passed or skipped)
 *   1 = FAIL (one or more contracts failed)
 *   2 = ERROR (database or configuration error)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import minimist from 'minimist';
import { OIVVerifier } from './modules/handoff/validation/oiv/OIVVerifier.js';

// Parse CLI arguments
const argv = minimist(process.argv.slice(2), {
  string: ['sd-type', 'maxLevel', 'contract', 'gate'],
  boolean: ['verbose', 'json', 'allowRuntime', 'help'],
  alias: {
    t: 'sd-type',
    l: 'maxLevel',
    c: 'contract',
    g: 'gate',
    v: 'verbose',
    j: 'json',
    r: 'allowRuntime',
    h: 'help'
  },
  default: {
    verbose: false,
    json: false,
    allowRuntime: false
  }
});

// Help text
if (argv.help) {
  console.log(`
OIV Validate CLI - Operational Integration Verification
SD-LEO-INFRA-OIV-001

Usage:
  npm run oiv:validate [options]

Options:
  -t, --sd-type <type>    Filter contracts by SD type (e.g., feature, infrastructure)
  -l, --maxLevel <level>  Override max verification level (L1-L5)
                          Policy maxLevel = min(SD type level, this flag)
  -c, --contract <key>    Validate specific contract by key
  -g, --gate <name>       Filter by gate name (e.g., EXEC-TO-PLAN)
  -v, --verbose           Verbose output with per-checkpoint details
  -j, --json              JSON output only (for CI/CD integration)
  -r, --allowRuntime      Allow L4/L5 runtime verification (default: false)
  -h, --help              Show this help message

Examples:
  npm run oiv:validate
  npm run oiv:validate -- --sd-type feature --verbose
  npm run oiv:validate -- --contract sub-agent-design-visual-polish
  npm run oiv:validate -- --maxLevel L2 --json
  npm run oiv:validate -- --gate EXEC-TO-PLAN

Exit Codes:
  0 = PASS/SKIP (all contracts passed or skipped)
  1 = FAIL (one or more contracts failed)
  2 = ERROR (database or configuration error)
`);
  process.exit(0);
}

// Validate Supabase configuration
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(2);
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Create verifier
const verifier = new OIVVerifier({
  basePath: process.cwd(),
  verbose: argv.verbose
});

// SD-type to max level mapping (same as OIVGate)
const SD_TYPE_MAX_LEVELS = {
  feature: 'L5_ARGS_COMPATIBLE',
  security: 'L5_ARGS_COMPATIBLE',
  infrastructure: 'L3_EXPORT_EXISTS',
  enhancement: 'L3_EXPORT_EXISTS',
  refactor: 'L3_EXPORT_EXISTS',
  bugfix: 'L3_EXPORT_EXISTS',
  database: 'L3_EXPORT_EXISTS',
  performance: 'L3_EXPORT_EXISTS',
  api: 'L3_EXPORT_EXISTS',
  backend: 'L3_EXPORT_EXISTS',
  documentation: null,
  docs: null,
  process: null,
  orchestrator: null,
  qa: null,
  discovery_spike: null
};

async function main() {
  const runId = crypto.randomUUID();
  const startTime = Date.now();

  if (!argv.json) {
    console.log('\n🔗 OIV Validate CLI');
    console.log('═'.repeat(60));
    console.log(`Run ID: ${runId}`);
    if (argv['sd-type']) console.log(`SD Type filter: ${argv['sd-type']}`);
    if (argv.maxLevel) console.log(`Max level override: ${argv.maxLevel}`);
    if (argv.contract) console.log(`Contract filter: ${argv.contract}`);
    if (argv.gate) console.log(`Gate filter: ${argv.gate}`);
    if (argv.allowRuntime) console.log('Runtime verification: ENABLED');
    console.log('═'.repeat(60));
    console.log('');
  }

  try {
    // Load contracts
    let query = supabase
      .from('leo_integration_contracts')
      .select('*')
      .eq('is_active', true);

    if (argv.contract) {
      query = query.eq('contract_key', argv.contract);
    }

    if (argv.gate) {
      query = query.eq('gate_name', argv.gate);
    }

    const { data: contracts, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!contracts || contracts.length === 0) {
      if (argv.json) {
        console.log(JSON.stringify({
          run_id: runId,
          status: 'SKIP',
          message: 'No contracts found',
          contracts_total: 0,
          contracts_passed: 0,
          contracts_failed: 0,
          contracts_skipped: 0
        }, null, 2));
      } else {
        console.log('ℹ️  No contracts found matching criteria');
      }
      process.exit(0);
    }

    // Filter by SD type if specified
    let filteredContracts = contracts;
    if (argv['sd-type']) {
      const sdType = argv['sd-type'].toLowerCase();
      filteredContracts = contracts.filter(c => {
        if (!c.sd_type_scope || c.sd_type_scope.length === 0) {
          return true; // No scope = applies to all
        }
        return c.sd_type_scope.includes(sdType);
      });

      if (!argv.json) {
        console.log(`Filtered to ${filteredContracts.length} contracts for SD type '${sdType}'`);
        console.log('');
      }
    }

    // Determine max level based on SD type or override
    let defaultMaxLevel = 'L3_EXPORT_EXISTS';
    if (argv['sd-type']) {
      const typeLevel = SD_TYPE_MAX_LEVELS[argv['sd-type'].toLowerCase()];
      if (typeLevel === null) {
        if (!argv.json) {
          console.log(`⏭️  SD type '${argv['sd-type']}' is exempt from OIV`);
        }
        console.log(JSON.stringify({
          run_id: runId,
          status: 'SKIP',
          message: `SD type '${argv['sd-type']}' is exempt from OIV`,
          contracts_total: 0,
          contracts_passed: 0,
          contracts_failed: 0,
          contracts_skipped: filteredContracts.length
        }, null, 2));
        process.exit(0);
      }
      defaultMaxLevel = typeLevel || defaultMaxLevel;
    }

    // Apply maxLevel override (use minimum of policy and override)
    if (argv.maxLevel) {
      const levelOrder = ['L1_FILE_EXISTS', 'L2_IMPORT_RESOLVES', 'L3_EXPORT_EXISTS', 'L4_FUNCTION_CALLABLE', 'L5_ARGS_COMPATIBLE'];
      const normalizedOverride = argv.maxLevel.toUpperCase();
      const expandedOverride = normalizedOverride.startsWith('L') && normalizedOverride.length <= 2
        ? levelOrder.find(l => l.startsWith(normalizedOverride))
        : normalizedOverride;

      if (expandedOverride) {
        const overrideIdx = levelOrder.indexOf(expandedOverride);
        const defaultIdx = levelOrder.indexOf(defaultMaxLevel);
        if (overrideIdx !== -1 && overrideIdx < defaultIdx) {
          defaultMaxLevel = expandedOverride;
        }
      }
    }

    // Block runtime verification unless explicitly allowed
    if (!argv.allowRuntime && ['L4_FUNCTION_CALLABLE', 'L5_ARGS_COMPATIBLE'].includes(defaultMaxLevel)) {
      if (!argv.json) {
        console.log(`⚠️  Runtime verification (${defaultMaxLevel}) requires --allowRuntime flag`);
        console.log('   Using L3_EXPORT_EXISTS instead');
        console.log('');
      }
      defaultMaxLevel = 'L3_EXPORT_EXISTS';
    }

    if (!argv.json) {
      console.log(`Effective max level: ${defaultMaxLevel}`);
      console.log(`Contracts to verify: ${filteredContracts.length}`);
      console.log('');
    }

    // Verify contracts
    const results = [];
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const failedContracts = [];

    for (const contract of filteredContracts) {
      // Determine effective level for this contract
      const contractLevel = contract.checkpoint_level || 'L3_EXPORT_EXISTS';
      const levelOrder = ['L1_FILE_EXISTS', 'L2_IMPORT_RESOLVES', 'L3_EXPORT_EXISTS', 'L4_FUNCTION_CALLABLE', 'L5_ARGS_COMPATIBLE'];
      const effectiveLevel = levelOrder.indexOf(defaultMaxLevel) <= levelOrder.indexOf(contractLevel)
        ? defaultMaxLevel
        : contractLevel;

      if (!argv.json) {
        console.log(`├─ ${contract.contract_key}`);
        if (argv.verbose) {
          console.log(`│  Level: ${effectiveLevel} (contract: ${contractLevel})`);
        }
      }

      const result = await verifier.verify(contract, effectiveLevel);
      results.push({
        contract_key: contract.contract_key,
        ...result
      });

      // Persist result to database
      try {
        await supabase.from('leo_integration_verification_results').insert({
          run_id: runId,
          contract_id: contract.id,
          contract_key: contract.contract_key,
          sd_id: null,
          sd_type: argv['sd-type'] || null,
          handoff_type: argv.gate || null,
          l1_result: result.checkpoints?.l1?.status || null,
          l1_details: result.checkpoints?.l1 || {},
          l2_result: result.checkpoints?.l2?.status || null,
          l2_details: result.checkpoints?.l2 || {},
          l3_result: result.checkpoints?.l3?.status || null,
          l3_details: result.checkpoints?.l3 || {},
          l4_result: result.checkpoints?.l4?.status || null,
          l4_details: result.checkpoints?.l4 || {},
          l5_result: result.checkpoints?.l5?.status || null,
          l5_details: result.checkpoints?.l5 || {},
          final_status: result.final_status,
          final_checkpoint: result.final_checkpoint,
          failure_checkpoint: result.failure_checkpoint,
          score: result.score,
          error_message: result.error_message,
          remediation_hint: result.remediation_hint,
          started_at: result.started_at,
          completed_at: result.completed_at,
          duration_ms: result.duration_ms
        });
      } catch (dbError) {
        if (!argv.json) {
          console.warn(`│  ⚠️  Failed to persist result: ${dbError.message}`);
        }
      }

      if (result.final_status === 'PASS') {
        passedCount++;
        if (!argv.json) {
          console.log(`│  ✓ PASS (${result.final_checkpoint}, score: ${result.score})`);
        }
      } else if (result.final_status === 'SKIP') {
        skippedCount++;
        if (!argv.json) {
          console.log('│  ⏭️ SKIP');
        }
      } else {
        failedCount++;
        failedContracts.push({
          key: contract.contract_key,
          checkpoint: result.failure_checkpoint,
          error: result.error_message,
          remediation: result.remediation_hint
        });
        if (!argv.json) {
          console.log(`│  ✗ FAIL at ${result.failure_checkpoint}`);
          console.log(`│    Error: ${result.error_message}`);
          if (result.remediation_hint) {
            console.log(`│    Fix: ${result.remediation_hint}`);
          }
        }
      }

      if (!argv.json && argv.verbose && result.checkpoints) {
        for (const [level, checkpoint] of Object.entries(result.checkpoints)) {
          console.log(`│    ${level.toUpperCase()}: ${checkpoint.status}`);
        }
      }
    }

    const duration = Date.now() - startTime;
    const overallStatus = failedCount === 0 ? 'PASS' : 'FAIL';

    // Output summary
    const summary = {
      run_id: runId,
      status: overallStatus,
      contracts_total: filteredContracts.length,
      contracts_passed: passedCount,
      contracts_failed: failedCount,
      contracts_skipped: skippedCount,
      overall_score: filteredContracts.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / filteredContracts.length)
        : 100,
      failed_contracts: failedContracts,
      max_level: defaultMaxLevel,
      duration_ms: duration
    };

    if (argv.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log('');
      console.log('═'.repeat(60));
      console.log('OIV Validation Summary');
      console.log('─'.repeat(60));
      console.log(`Status: ${overallStatus === 'PASS' ? '✓ PASS' : '✗ FAIL'}`);
      console.log(`Contracts: ${filteredContracts.length} total, ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped`);
      console.log(`Score: ${summary.overall_score}%`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Run ID: ${runId}`);
      if (failedContracts.length > 0) {
        console.log('');
        console.log('Failed Contracts:');
        failedContracts.forEach((fc, i) => {
          console.log(`  ${i + 1}. ${fc.key} (${fc.checkpoint})`);
          console.log(`     Error: ${fc.error}`);
          if (fc.remediation) {
            console.log(`     Fix: ${fc.remediation}`);
          }
        });
      }
      console.log('═'.repeat(60));
    }

    // Exit with appropriate code
    process.exit(failedCount === 0 ? 0 : 1);

  } catch (error) {
    if (argv.json) {
      console.log(JSON.stringify({
        run_id: runId,
        status: 'ERROR',
        error: error.message
      }, null, 2));
    } else {
      console.error(`\n❌ Error: ${error.message}`);
    }
    process.exit(2);
  }
}

main();
