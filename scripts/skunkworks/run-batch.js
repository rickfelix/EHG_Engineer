#!/usr/bin/env node

/**
 * Skunkworks Monday Batch — Proposal Generator
 * Orchestrates: read signals → generate proposals → store in rd_proposals
 *
 * Usage:
 *   node scripts/skunkworks/run-batch.js              # full run
 *   node scripts/skunkworks/run-batch.js --dry-run     # preview without writes
 *
 * SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A (FR-006)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readCalibrationSignals } from '../../lib/skunkworks/signal-readers/calibration.js';
import { readCodebaseHealthSignals } from '../../lib/skunkworks/signal-readers/codebase-health.js';
import { readVenturePortfolioSignals } from '../../lib/skunkworks/signal-readers/venture-portfolio.js';
import { generateProposals } from '../../lib/skunkworks/proposal-agent.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const logger = console;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const startTime = Date.now();
  logger.log('');
  logger.log('═══════════════════════════════════════════════════');
  logger.log(' SKUNKWORKS MONDAY BATCH — Proposal Generator');
  logger.log(`  Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  logger.log(`  Time: ${new Date().toISOString()}`);
  logger.log('═══════════════════════════════════════════════════');
  logger.log('');

  const deps = { supabase, logger };
  const errors = [];

  // Phase 1: Collect signals from all readers (fail-open per reader)
  logger.log('Phase 1: Collecting signals...');
  const allSignals = [];

  const readers = [
    { name: 'calibration', fn: readCalibrationSignals },
    { name: 'codebase_health', fn: readCodebaseHealthSignals },
    { name: 'venture_portfolio', fn: readVenturePortfolioSignals },
  ];

  for (const reader of readers) {
    try {
      const signals = await reader.fn(deps);
      allSignals.push(...signals);
      logger.log(`  ✓ ${reader.name}: ${signals.length} signals`);
    } catch (err) {
      logger.warn(`  ✗ ${reader.name}: ${err.message}`);
      errors.push({ reader: reader.name, error: err.message });
    }
  }

  logger.log(`  Total signals: ${allSignals.length}`);
  logger.log('');

  if (allSignals.length === 0) {
    logger.log('No signals found. Nothing to propose.');
    await logBatchRun(0, 0, startTime, errors);
    return;
  }

  // Phase 2: Generate proposals via LLM (with template fallback)
  logger.log('Phase 2: Generating proposals...');
  const proposals = await generateProposals(deps, allSignals);
  logger.log(`  Generated: ${proposals.length} proposals`);
  logger.log('');

  // Phase 3: Store proposals
  if (dryRun) {
    logger.log('Phase 3: DRY RUN — Proposals preview:');
    for (const p of proposals) {
      logger.log(`  📋 [${p.signal_source}] ${p.title}`);
      logger.log(`     Hypothesis: ${p.hypothesis}`);
      logger.log(`     Priority: ${p.priority_score}`);
      logger.log('');
    }
  } else {
    logger.log('Phase 3: Storing proposals...');
    const batchRunId = await createBatchRun(allSignals.length, proposals.length, startTime, errors);

    for (const p of proposals) {
      const { error } = await supabase.from('rd_proposals').insert({
        title: p.title,
        hypothesis: p.hypothesis,
        evidence: p.evidence || [],
        expected_impact: p.expected_outcome,
        priority_score: p.priority_score,
        status: 'pending_review',
        signal_source: p.signal_source,
        methodology: p.methodology,
        expected_outcome: p.expected_outcome,
        batch_run_id: batchRunId,
      });

      if (error) {
        logger.warn(`  ✗ Failed to store "${p.title}": ${error.message}`);
        errors.push({ proposal: p.title, error: error.message });
      } else {
        logger.log(`  ✓ Stored: ${p.title}`);
      }
    }

    // Update batch run with final counts
    await supabase.from('rd_batch_runs').update({
      proposals_generated: proposals.length,
      duration_ms: Date.now() - startTime,
      error_log: errors,
    }).eq('id', batchRunId);
  }

  // Summary
  const duration = Date.now() - startTime;
  logger.log('');
  logger.log('═══════════════════════════════════════════════════');
  logger.log(' BATCH COMPLETE');
  logger.log(`  Signals:   ${allSignals.length}`);
  logger.log(`  Proposals: ${proposals.length}`);
  logger.log(`  Errors:    ${errors.length}`);
  logger.log(`  Duration:  ${duration}ms`);
  logger.log(`  Mode:      ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  logger.log('═══════════════════════════════════════════════════');
}

async function createBatchRun(signalCount, proposalCount, startTime, errors) {
  const { data, error } = await supabase.from('rd_batch_runs').insert({
    batch_type: 'monday_proposals',
    signals_collected: signalCount,
    proposals_generated: proposalCount,
    dry_run: dryRun,
    duration_ms: Date.now() - startTime,
    error_log: errors,
  }).select('id').single();

  if (error) {
    logger.warn(`Failed to log batch run: ${error.message}`);
    return null;
  }
  return data.id;
}

async function logBatchRun(signalCount, proposalCount, startTime, errors) {
  if (dryRun) return;
  await createBatchRun(signalCount, proposalCount, startTime, errors);
}

main().catch(err => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
