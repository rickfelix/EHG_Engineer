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
 *   node scripts/eva/run-stage.js --check
 */

import { executeStage, loadStageTemplate } from '../../lib/eva/stage-execution-engine.js';
import { validateContracts } from '../../lib/eva/contract-validator.js';
import { outputInlineContext, persistInlineResult } from '../../lib/eva/inline-analysis-adapter.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// --check mode: scan stage templates
if (args.includes('--check')) {
  const templatesDir = join(__dirname, '../../lib/eva/stage-templates');
  console.log('\n📋 Stage Template Health Check');
  console.log('═'.repeat(50));

  let found = 0;
  let missing = 0;
  let incomplete = 0;

  for (let i = 1; i <= 25; i++) {
    const padded = String(i).padStart(2, '0');
    const fileName = `stage-${padded}.js`;

    try {
      const files = readdirSync(templatesDir);
      if (!files.includes(fileName)) {
        console.log(`   ❌ Stage ${padded}: MISSING`);
        missing++;
        continue;
      }

      const template = await loadStageTemplate(i);
      const hasValidate = typeof template.validate === 'function';
      const hasCompute = typeof template.computeDerived === 'function';
      const hasAnalysis = typeof template.analysisStep === 'function';

      if (hasValidate && hasCompute && hasAnalysis) {
        console.log(`   ✅ Stage ${padded}: ${template.title || template.id} (validate + compute + analysis)`);
        found++;
      } else {
        const funcs = [hasValidate && 'validate', hasCompute && 'compute', hasAnalysis && 'analysis'].filter(Boolean);
        console.log(`   ⚠️  Stage ${padded}: ${template.title || template.id} (${funcs.join(', ') || 'no functions'})`);
        incomplete++;
      }
    } catch {
      console.log(`   ❌ Stage ${padded}: ERROR loading`);
      missing++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`   Complete: ${found}  Incomplete: ${incomplete}  Missing: ${missing}`);
  console.log(`   Coverage: ${Math.round(((found + incomplete) / 25) * 100)}%`);
  console.log('');
  process.exit(0);
}

const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const ventureId = getArg('--venture-id');
const stageNumber = parseInt(getArg('--stage') || '0', 10);
const dryRun = args.includes('--dry-run');
const inlineMode = args.includes('--inline');
const persistJson = getArg('--persist');

if (!ventureId || !stageNumber) {
  console.error('Usage: node scripts/eva/run-stage.js --venture-id <UUID> --stage <N> [--dry-run] [--inline] [--persist <JSON>] [--check] [--verbose]');
  process.exit(1);
}

// Inline mode: output context for Claude Code
if (inlineMode) {
  outputInlineContext({ stageNumber, ventureId }).catch(err => {
    console.error(`\n❌ Inline mode failed: ${err.message}`);
    process.exit(1);
  });
  // Don't fall through to standard execution
} else if (persistJson) {
  // Persist mode: write Claude Code's inline result
  persistInlineResult({ stageNumber, ventureId, resultJson: persistJson }).catch(err => {
    console.error(`\n❌ Persist failed: ${err.message}`);
    process.exit(1);
  });
} else {
// Standard execution mode (original code below)

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
  // QF-20260802-245: --verbose surfaces the engine's own progress lines. They were unconditionally
  // discarded (log: () => {}), which is WHY the 10-minute block was unlabeled: executeStage logs
  // onBeforeAnalysis, the chairman-gate outcome, post-contract validation, EVA keys, persist and
  // stage-work sync — every one of which would have located the stall immediately. Kept OFF by
  // default so existing callers' output is byte-identical; opt in when diagnosing.
  const verbose = args.includes('--verbose');
  const silentLogger = verbose
    ? { log: console.log, warn: console.warn, error: console.error }
    : { log: () => {}, warn: console.warn, error: console.error };
  const result = await executeStage({ stageNumber, ventureId, dryRun, logger: silentLogger });

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

  // QF-20260802-245: EXIT EXPLICITLY. Without this the async IIFE resolves and the process
  // survives until Node's event loop drains — which it never does, because real mode opens
  // Supabase connections dry-run skips (resolveEvaKeys, persistArtifact, syncStageWork,
  // processLifecycleTerminal are all !dryRun-guarded) and their undici keep-alive sockets hold
  // the loop open.
  //
  // MEASURED, NOT INFERRED: a real-mode stage-5 run completed in 28.3s with validation PASS,
  // updated venture_artifacts 5f1d42f5 and venture_stage_work in place — and then sat until a
  // 150s timeout killed it. The operator who filed this saw a ">10 minute silent block with zero
  // rows written" and reasonably concluded the stage was hanging pre-persist. IT HAD ALREADY
  // FINISHED. The rows looked absent because this path UPDATES existing artifacts (the is_current
  // dedup at artifact-persistence-service.js:97-120 returns the existing id), so created_at and
  // new-row counts are correctly unchanged while the write genuinely lands.
  //
  // CLAUDE.md documents this identical pattern for add-prd-to-database
  // (SD-LEO-INFRA-ADD-PRD-EXIT-CODE-SUCCESS-001): lingering supabase/undici handles hold the loop
  // until Bash SIGTERMs the process (exit 143) AFTER the writes landed, so callers mis-read a
  // success as a failure. Same fix, same reason.
  process.exit(0);
})().catch(err => {
  console.error(`\n❌ Stage execution failed: ${err.message}`);
  process.exit(1);
});
} // end standard execution mode
