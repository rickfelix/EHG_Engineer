#!/usr/bin/env node
/**
 * Intelligence Loop Pipeline CLI
 * Part of SD-LEO-INFRA-UNIFIED-STRATEGIC-INTELLIGENCE-001-C
 *
 * Orchestrates the closed-loop intelligence pipeline:
 *   1. Analyze — detect capability gaps between strategy objectives and delivered capabilities
 *   2. Propose — generate SD proposals from gaps with governor gate
 *   3. Run — full pipeline (analyze + propose + governor)
 *
 * Usage:
 *   node scripts/pipeline/intelligence-loop.js analyze [--dry-run]
 *   node scripts/pipeline/intelligence-loop.js propose [--dry-run] [--max-proposals N]
 *   node scripts/pipeline/intelligence-loop.js run [--dry-run] [--max-proposals N]
 */

import 'dotenv/config';
import { analyzeCapabilityGaps } from '../../lib/strategy/capability-gap-analyzer.js';
import { generateProposals, getPendingProposals } from '../../lib/strategy/sd-proposal-generator.js';

const command = process.argv[2];
const isDryRun = process.argv.includes('--dry-run');
const maxProposalsArg = process.argv.indexOf('--max-proposals');
const maxProposals = maxProposalsArg !== -1 ? parseInt(process.argv[maxProposalsArg + 1], 10) : undefined;

function printGapAnalysis(result) {
  if (!result.success) {
    console.error('Gap analysis failed:', result.error);
    return;
  }

  console.log('\nCapability Gap Analysis');
  console.log('═'.repeat(60));
  console.log(`  Objectives analyzed: ${result.summary.total_objectives}`);
  console.log(`  With gaps: ${result.summary.objectives_with_gaps}`);
  console.log(`  Total target capabilities: ${result.summary.total_target_capabilities}`);
  console.log(`  Delivered: ${result.summary.total_delivered}`);
  console.log(`  Gaps: ${result.summary.total_gaps}`);
  console.log('─'.repeat(60));

  for (const obj of result.objectives) {
    if (obj.gap_capabilities.length === 0) continue;
    console.log(`\n  [${obj.time_horizon.toUpperCase()}] ${obj.objective_title}`);
    console.log(`    Coverage: ${obj.coverage_pct}%`);
    console.log(`    Gaps (${obj.gap_capabilities.length}):`);
    for (const gap of obj.gap_capabilities) {
      console.log(`      - ${gap}`);
    }
  }

  if (result.summary.total_gaps === 0) {
    console.log('\n  ✅ No capability gaps detected.');
  }
  console.log('═'.repeat(60));
}

async function runAnalyze() {
  console.log(`Intelligence Loop: Analyze ${isDryRun ? '(DRY RUN)' : ''}`);
  const result = await analyzeCapabilityGaps();
  printGapAnalysis(result);
  return result;
}

async function runPropose() {
  console.log(`Intelligence Loop: Propose ${isDryRun ? '(DRY RUN)' : ''}`);
  const opts = { dryRun: isDryRun };
  if (maxProposals) opts.maxProposals = maxProposals;

  const result = await generateProposals(opts);
  if (!result.success) {
    console.error('Proposal generation failed:', result.error);
    return result;
  }

  console.log(`\nProposals: ${result.proposals.length} ${isDryRun ? 'would be created' : 'created'}`);
  if (result.skipped > 0) {
    console.log(`Governor gate deferred: ${result.skipped} proposals queued for next cycle`);
  }

  if (!isDryRun && result.proposals.length > 0) {
    console.log('\nCreated proposals:');
    for (const p of result.proposals) {
      console.log(`  - [${p.priority}] ${p.title} (id: ${p.id})`);
    }
    console.log('\nUse `node scripts/proposal-manage.js list` to review and approve.');
  }

  return result;
}

async function runFull() {
  console.log(`Intelligence Loop: Full Run ${isDryRun ? '(DRY RUN)' : ''}`);
  console.log('═'.repeat(60));

  // Phase 1: Analyze
  console.log('\n📊 Phase 1: Capability Gap Analysis');
  const gapResult = await analyzeCapabilityGaps();
  printGapAnalysis(gapResult);

  if (!gapResult.success || gapResult.totalGaps === 0) {
    console.log('\nNo gaps to process. Pipeline complete.');
    return;
  }

  // Phase 2: Propose
  console.log('\n📝 Phase 2: SD Proposal Generation');
  const opts = { dryRun: isDryRun };
  if (maxProposals) opts.maxProposals = maxProposals;
  const propResult = await generateProposals(opts);

  if (!propResult.success) {
    console.error('Proposal generation failed:', propResult.error);
    return;
  }

  console.log(`Proposals: ${propResult.proposals.length} ${isDryRun ? 'would be created' : 'created'}`);
  if (propResult.skipped > 0) {
    console.log(`Governor gate deferred: ${propResult.skipped} to next cycle`);
  }

  // Phase 3: Summary
  console.log('\n📋 Phase 3: Pipeline Summary');
  console.log('─'.repeat(60));
  console.log(`  Gaps detected: ${gapResult.totalGaps}`);
  console.log(`  Proposals generated: ${propResult.proposals.length}`);
  console.log(`  Proposals deferred: ${propResult.skipped}`);

  if (!isDryRun) {
    const pending = await getPendingProposals();
    console.log(`  Total pending proposals: ${pending.length}`);
    console.log('\n  Next: Chairman reviews proposals via:');
    console.log('    node scripts/proposal-manage.js list');
    console.log('    node scripts/proposal-manage.js approve <id>');
  }

  console.log('═'.repeat(60));
}

switch (command) {
  case 'analyze':
    runAnalyze().catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  case 'propose':
    runPropose().catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  case 'run':
    runFull().catch(err => { console.error('Error:', err.message); process.exit(1); });
    break;
  default:
    console.log('Intelligence Loop Pipeline');
    console.log('');
    console.log('Usage:');
    console.log('  analyze   - Detect capability gaps between strategy objectives and delivered capabilities');
    console.log('  propose   - Generate SD proposals from gaps (with governor gate)');
    console.log('  run       - Full pipeline: analyze + propose + summary');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run           Show results without DB writes');
    console.log('  --max-proposals N   Override governor gate limit (default: 5)');
    break;
}
