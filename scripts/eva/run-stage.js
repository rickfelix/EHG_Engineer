#!/usr/bin/env node
/**
 * run-stage.js - CLI for Stage Execution Engine
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-001: FR-003
 *
 * Orchestrates: contract validation → analysisStep execution → artifact persistence.
 *
 * Usage:
 *   node scripts/eva/run-stage.js --venture-id <UUID> --stage <N>
 *   node scripts/eva/run-stage.js --venture-id <UUID> --stage <N> --dry-run
 */

import { executeStage } from '../../lib/eva/stage-execution-engine.js';
import { validateContracts } from '../../lib/eva/contract-validator.js';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const ventureId = getArg('--venture-id');
const stageNumber = parseInt(getArg('--stage') || '0', 10);
const dryRun = args.includes('--dry-run');

if (!ventureId || !stageNumber) {
  console.error('Usage: node scripts/eva/run-stage.js --venture-id <UUID> --stage <N> [--dry-run]');
  process.exit(1);
}

console.log('\n🔧 Stage Execution Engine');
console.log(`   Venture: ${ventureId}`);
console.log(`   Stage:   ${stageNumber}`);
console.log(`   Dry Run: ${dryRun}`);
console.log('');

(async () => {
  // 1. Validate contracts
  console.log('📋 Step 1: Contract Validation');
  const contracts = await validateContracts({ targetStage: stageNumber, ventureId });
  console.log(`   Required stages: ${contracts.requiredStages.join(', ') || '(none)'}`);
  console.log(`   Satisfied: ${contracts.satisfiedContracts.length}`);
  console.log(`   Missing:   ${contracts.missingContracts.length}`);

  if (!contracts.passed) {
    console.error('\n❌ Contract validation failed:');
    for (const missing of contracts.missingContracts) {
      console.error(`   Stage ${missing.stage}: ${missing.reason}`);
    }
    console.error('\n   Complete upstream stages before running this stage.');
    process.exit(1);
  }
  console.log(`   ✅ All contracts satisfied (${contracts.latencyMs}ms)\n`);

  // 2. Execute stage
  console.log('⚡ Step 2: Stage Execution');
  const result = await executeStage({ stageNumber, ventureId, dryRun });

  console.log(`   Template: ${result.template}`);
  console.log(`   Has analysisStep: ${result.hasAnalysisStep}`);
  console.log(`   Validation: ${result.validation.valid ? '✅ PASS' : '❌ FAIL'}`);
  if (result.validation.errors.length > 0) {
    for (const err of result.validation.errors) {
      console.log(`     - ${err}`);
    }
  }

  // 3. Results
  console.log('\n📊 Results:');
  console.log(`   Latency: ${result.latencyMs}ms`);
  if (result.persisted) {
    console.log(`   Artifact ID: ${result.artifactId}`);
    console.log('   ✅ Persisted to venture_artifacts');
  } else if (dryRun) {
    console.log('   [DRY RUN] Not persisted');
  } else {
    console.log('   ⚠️ Not persisted (validation failed)');
  }

  console.log('');
})().catch(err => {
  console.error(`\n❌ Stage execution failed: ${err.message}`);
  process.exit(1);
});
