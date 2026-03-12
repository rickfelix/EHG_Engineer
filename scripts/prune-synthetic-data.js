#!/usr/bin/env node

/**
 * Synthetic Data Pruning Script
 *
 * Idempotent archival of old synthetic ventures with experiment safety.
 * Ventures assigned to active experiments are never pruned.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-B
 *
 * Usage:
 *   node scripts/prune-synthetic-data.js [options]
 *
 * Options:
 *   --retention-days <N>  Days to retain (default: 90)
 *   --dry-run             Preview without making changes
 *   --verbose             Show detailed output
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const DEFAULT_RETENTION_DAYS = 90;

function parseArgs(argv) {
  const args = {
    retentionDays: DEFAULT_RETENTION_DAYS,
    dryRun: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--retention-days':
        args.retentionDays = parseInt(argv[++i], 10);
        if (isNaN(args.retentionDays) || args.retentionDays < 1) {
          console.error('Error: --retention-days must be a positive integer');
          process.exit(1);
        }
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        process.exit(1);
    }
  }

  return args;
}

async function getActiveExperimentVentureIds(supabase) {
  const { data, error } = await supabase
    .from('experiment_assignments')
    .select('venture_id')
    .in('status', ['active', 'pending']);

  if (error) {
    console.warn('[prune] Warning: Could not check experiment assignments:', error.message);
    return new Set();
  }

  return new Set((data || []).map(r => r.venture_id));
}

async function findPruneCandidates(supabase, cutoffDate, activeExperimentIds) {
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, created_at, metadata')
    .eq('is_synthetic', true)
    .lt('created_at', cutoffDate.toISOString())
    .is('archived_at', null);

  if (error) {
    throw new Error(`Failed to query synthetic ventures: ${error.message}`);
  }

  const candidates = [];
  const protected_ = [];

  for (const venture of (data || [])) {
    if (activeExperimentIds.has(venture.id)) {
      protected_.push(venture);
    } else {
      candidates.push(venture);
    }
  }

  return { candidates, protected: protected_ };
}

async function archiveVentures(supabase, ventureIds, dryRun) {
  if (dryRun || ventureIds.length === 0) {
    return { archived: 0, skipped: dryRun };
  }

  const now = new Date().toISOString();
  const { error, count } = await supabase
    .from('ventures')
    .update({ archived_at: now })
    .in('id', ventureIds)
    .is('archived_at', null); // Idempotent: only archive if not already archived

  if (error) {
    throw new Error(`Failed to archive ventures: ${error.message}`);
  }

  return { archived: count || ventureIds.length, skipped: false };
}

async function main() {
  const args = parseArgs(process.argv);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - args.retentionDays);

  console.log('[prune] Synthetic Data Pruning');
  console.log(`[prune] Retention: ${args.retentionDays} days (cutoff: ${cutoffDate.toISOString().split('T')[0]})`);
  if (args.dryRun) console.log('[prune] DRY RUN — no changes will be made');

  // Step 1: Get active experiment venture IDs (safety check)
  const activeExperimentIds = await getActiveExperimentVentureIds(supabase);
  if (args.verbose) {
    console.log(`[prune] Active experiment ventures: ${activeExperimentIds.size}`);
  }

  // Step 2: Find prune candidates
  const { candidates, protected: protectedVentures } = await findPruneCandidates(
    supabase, cutoffDate, activeExperimentIds
  );

  console.log(`[prune] Found ${candidates.length} ventures eligible for pruning`);
  if (protectedVentures.length > 0) {
    console.log(`[prune] Protected by active experiments: ${protectedVentures.length}`);
  }

  if (args.verbose && candidates.length > 0) {
    console.log('[prune] Candidates:');
    for (const v of candidates.slice(0, 20)) {
      console.log(`  - ${v.name} (created: ${v.created_at.split('T')[0]})`);
    }
    if (candidates.length > 20) {
      console.log(`  ... and ${candidates.length - 20} more`);
    }
  }

  if (candidates.length === 0) {
    console.log('[prune] Nothing to prune');
    return;
  }

  // Step 3: Archive
  const ventureIds = candidates.map(v => v.id);
  const result = await archiveVentures(supabase, ventureIds, args.dryRun);

  if (args.dryRun) {
    console.log(`[prune] DRY RUN: Would archive ${candidates.length} ventures`);
  } else {
    console.log(`[prune] Archived ${result.archived} ventures`);
  }
}

main().catch(err => {
  console.error('[prune] Fatal error:', err.message);
  process.exit(1);
});
