#!/usr/bin/env node

/**
 * Claude Code Release Check — CLI Entry Point
 *
 * Orchestrates the full release monitoring pipeline:
 *   1. Fetch new releases from GitHub (release-monitor)
 *   2. Analyze relevance to EHG (release-analyzer)
 *   3. Notify chairman via Telegram (chairman-notifier)
 *   4. Process any prior approval decisions (approval-handler)
 *
 * Usage:
 *   npm run release:check
 *   npm run release:check -- --dry-run --verbose
 *   npm run release:check -- --stage monitor     # run only stage 1
 *   npm run release:check -- --stage analyze     # run only stage 2
 *   npm run release:check -- --stage notify      # run only stage 3
 *   npm run release:check -- --stage approve     # run only stage 4
 */

import { syncReleases } from '../lib/integrations/claude-code/release-monitor.js';
import { analyzePendingReleases } from '../lib/integrations/claude-code/release-analyzer.js';
import { notifyEvaluatedReleases } from '../lib/integrations/claude-code/chairman-notifier.js';
import { processApprovals } from '../lib/integrations/claude-code/approval-handler.js';

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    stage: args.find((a, i) => args[i - 1] === '--stage') || null,
    includePrerelease: args.includes('--prerelease')
  };
}

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Claude Code Release Monitor Pipeline      ║');
  console.log('╚══════════════════════════════════════════════╝');

  if (opts.dryRun) console.log('  Mode: DRY RUN (no DB writes)\n');

  const shouldRun = (stage) => !opts.stage || opts.stage === stage;

  // ── Stage 1: Fetch releases ──────────────────────────────────
  let monitorResult = null;
  if (shouldRun('monitor')) {
    console.log('\n── Stage 1: Fetch GitHub Releases ──');
    monitorResult = await syncReleases({
      dryRun: opts.dryRun,
      verbose: opts.verbose,
      includePrerelease: opts.includePrerelease
    });
    console.log(`  Found: ${monitorResult.releasesFound} | New: ${monitorResult.inserted} | Known: ${monitorResult.skipped}`);
    if (monitorResult.errors.length > 0) {
      console.log(`  Errors: ${monitorResult.errors.length}`);
    }
  }

  // ── Stage 2: Analyze pending releases ────────────────────────
  let analyzerResult = null;
  if (shouldRun('analyze') && !opts.dryRun) {
    console.log('\n── Stage 2: Analyze Relevance ──');
    analyzerResult = await analyzePendingReleases({ verbose: opts.verbose });
    console.log(`  Analyzed: ${analyzerResult.analyzed} | Evaluating: ${analyzerResult.evaluating} | Auto-skipped: ${analyzerResult.skipped}`);
  }

  // ── Stage 3: Notify chairman ─────────────────────────────────
  let notifyResult = null;
  if (shouldRun('notify') && !opts.dryRun) {
    console.log('\n── Stage 3: Chairman Notification ──');
    notifyResult = await notifyEvaluatedReleases({ verbose: opts.verbose });
    console.log(`  Notified: ${notifyResult.notified} | Skipped: ${notifyResult.skipped} | Failed: ${notifyResult.failed}`);
  }

  // ── Stage 4: Process approvals ───────────────────────────────
  let approvalResult = null;
  if (shouldRun('approve') && !opts.dryRun) {
    console.log('\n── Stage 4: Process Approvals ──');
    approvalResult = await processApprovals({ verbose: opts.verbose });
    console.log(`  Approved→inbox: ${approvalResult.approved} | Rejected: ${approvalResult.rejected} | Expired: ${approvalResult.expired}`);
  }

  // ── Summary ──────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Pipeline complete in ${elapsed}s`);

  if (approvalResult?.feedbackItems?.length > 0) {
    console.log('\n  New inbox items:');
    for (const item of approvalResult.feedbackItems) {
      console.log(`    • ${item.tag} → feedback ${item.feedbackId}`);
    }
  }
}

main().catch(err => {
  console.error(`\n✗ Pipeline failed: ${err.message}`);
  process.exit(1);
});
