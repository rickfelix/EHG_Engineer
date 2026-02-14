/**
 * eva run - Unified CLI Dispatcher for EVA Orchestration
 *
 * SD: SD-EVA-FEAT-CLI-DISPATCHER-001
 *
 * Orchestrates a venture through EVA lifecycle stages (0-25)
 * by wrapping the eva-orchestrator processStage/run loop.
 *
 * Usage:
 *   node scripts/eva-run.js <venture_id> [options]
 *
 * Options:
 *   --stage <N>       Start from stage N instead of current lifecycle_stage
 *   --dry-run         Skip persistence and transitions (preview mode)
 *   --json            Output results as JSON
 *   --chairman <id>   Chairman user ID for preference loading
 *
 * Exit Codes:
 *   0  All stages completed successfully
 *   1  Usage error (missing arguments, invalid options)
 *   2  Venture not found in database
 *   3  Chairman decision required (REQUIRE_REVIEW)
 *   4  Stage execution error (FAILED or BLOCKED)
 *
 * Examples:
 *   node scripts/eva-run.js abc-123-def
 *   node scripts/eva-run.js abc-123-def --stage 10
 *   node scripts/eva-run.js abc-123-def --dry-run
 *   npm run eva:run -- abc-123-def
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { run as orchestratorRun } from '../lib/eva/eva-orchestrator.js';

// ── Exit Codes ──────────────────────────────────────────────

const EXIT = Object.freeze({
  SUCCESS: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  CHAIRMAN_REVIEW: 3,
  EXECUTION_ERROR: 4,
});

// ── Argument Parsing ──────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (next === undefined || next.startsWith('--')) return undefined;
  return next;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printUsage() {
  console.log(`
Usage: node scripts/eva-run.js <venture_id> [options]

Options:
  --stage <N>       Start from stage N (default: current lifecycle_stage)
  --dry-run         Preview mode (no persistence)
  --json            Output results as JSON
  --chairman <id>   Chairman user ID

Exit Codes:
  0  Success
  1  Usage error
  2  Venture not found
  3  Chairman review required
  4  Execution error
`);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const ventureId = process.argv[2];

  if (!ventureId || ventureId.startsWith('--')) {
    console.error('Error: Missing venture_id argument');
    printUsage();
    return EXIT.USAGE;
  }

  const startStage = getArg('stage');
  const dryRun = hasFlag('dry-run');
  const jsonOutput = hasFlag('json');
  const chairmanId = getArg('chairman');

  if (startStage !== undefined && (isNaN(Number(startStage)) || Number(startStage) < 0 || Number(startStage) > 25)) {
    console.error(`Error: --stage must be a number between 0 and 25 (got: ${startStage})`);
    return EXIT.USAGE;
  }

  // Initialize Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    return EXIT.USAGE;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Validate venture exists - check eva_ventures first, fall back to ventures
  let venture;

  const { data: evaVenture, error: evaError } = await supabase
    .from('eva_ventures')
    .select('id, name, status')
    .eq('id', ventureId)
    .maybeSingle();

  if (evaError) {
    console.error(`Error: Database query failed: ${evaError.message}`);
    return EXIT.EXECUTION_ERROR;
  }

  if (evaVenture) {
    // Get current_lifecycle_stage from ventures table via the venture_id FK
    const { data: ventureData } = await supabase
      .from('ventures')
      .select('current_lifecycle_stage')
      .eq('id', evaVenture.id)
      .maybeSingle();

    venture = {
      ...evaVenture,
      current_lifecycle_stage: ventureData?.current_lifecycle_stage ?? 1,
    };
  }

  if (!venture) {
    // Try ventures table directly
    const { data: directVenture, error: directError } = await supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage')
      .eq('id', ventureId)
      .maybeSingle();

    if (directError) {
      console.error(`Error: Database query failed: ${directError.message}`);
      return EXIT.EXECUTION_ERROR;
    }

    venture = directVenture;
  }

  if (!venture) {
    console.error(`Error: Venture not found: ${ventureId}`);
    return EXIT.NOT_FOUND;
  }

  const currentStage = venture.current_lifecycle_stage ?? 1;
  const effectiveStartStage = startStage !== undefined ? Number(startStage) : currentStage;

  if (!jsonOutput) {
    console.log('');
    console.log('============================================================');
    console.log('  EVA RUN - Venture Orchestration');
    console.log('============================================================');
    console.log(`  Venture:  ${venture.name}`);
    console.log(`  ID:       ${ventureId}`);
    console.log(`  Status:   ${venture.status}`);
    console.log(`  Stage:    ${effectiveStartStage}${startStage !== undefined ? ` (override from ${currentStage})` : ''}`);
    if (dryRun) console.log('  Mode:     DRY RUN (no persistence)');
    console.log('============================================================');
    console.log('');
  }

  const startTime = Date.now();

  // Build orchestrator options
  const options = {
    autoProceed: true,
    dryRun,
    maxStages: 25 - effectiveStartStage + 1,
  };

  if (chairmanId) options.chairmanId = chairmanId;

  // If --stage is specified, update the venture stage before running
  if (startStage !== undefined && Number(startStage) !== currentStage && !dryRun) {
    const { error: updateError } = await supabase
      .from('ventures')
      .update({ current_lifecycle_stage: Number(startStage) })
      .eq('id', ventureId);

    if (updateError) {
      console.error(`Error: Failed to set start stage: ${updateError.message}`);
      return EXIT.EXECUTION_ERROR;
    }
  }

  // Run orchestration
  let results;
  try {
    results = await orchestratorRun(
      { ventureId, options },
      { supabase },
    );
  } catch (err) {
    console.error(`Error: Orchestration failed: ${err.message}`);
    if (!jsonOutput) {
      console.error(`Stack: ${err.stack}`);
    }
    return EXIT.EXECUTION_ERROR;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Analyze results
  const completed = results.filter(r => r.status === 'COMPLETED');
  const blocked = results.filter(r => r.status === 'BLOCKED');
  const failed = results.filter(r => r.status === 'FAILED');
  const reviewRequired = results.filter(r => r.filterDecision?.action === 'REQUIRE_REVIEW');

  if (jsonOutput) {
    console.log(JSON.stringify({
      ventureId,
      ventureName: venture.name,
      startStage: effectiveStartStage,
      stagesProcessed: results.length,
      completed: completed.length,
      blocked: blocked.length,
      failed: failed.length,
      reviewRequired: reviewRequired.length,
      elapsedSeconds: Number(elapsed),
      results,
    }, null, 2));
  } else {
    // Print per-stage results
    for (const result of results) {
      const icon = result.status === 'COMPLETED' ? 'OK' :
        result.status === 'BLOCKED' ? 'BLOCKED' :
          result.status === 'FAILED' ? 'FAILED' : '??';
      const filterInfo = result.filterDecision?.action === 'REQUIRE_REVIEW'
        ? ' -> Awaiting chairman decision'
        : result.filterDecision?.action === 'STOP'
          ? ' -> STOP'
          : '';
      console.log(`  [Stage ${String(result.stageId).padStart(2, ' ')}/25] ${icon}${filterInfo}`);
    }

    console.log('');
    console.log('------------------------------------------------------------');
    console.log(`  Stages processed: ${results.length}`);
    console.log(`  Completed:        ${completed.length}`);
    if (blocked.length > 0) console.log(`  Blocked:          ${blocked.length}`);
    if (failed.length > 0) console.log(`  Failed:           ${failed.length}`);
    if (reviewRequired.length > 0) console.log(`  Review required:  ${reviewRequired.length}`);
    console.log(`  Time elapsed:     ${elapsed}s`);
    console.log('------------------------------------------------------------');
  }

  // Determine exit code
  if (reviewRequired.length > 0) {
    const lastReview = reviewRequired[reviewRequired.length - 1];
    if (!jsonOutput) {
      console.log('');
      console.log('  Awaiting chairman decision.');
      console.log(`  Stage ${lastReview.stageId} triggered review.`);
      if (lastReview.filterDecision?.reasons) {
        console.log('  Triggers:');
        for (const reason of lastReview.filterDecision.reasons) {
          console.log(`    - ${reason}`);
        }
      }
      console.log('');
      console.log('  Approve/reject via:');
      console.log('    node scripts/eva-decisions.js list --status pending');
      console.log('    node scripts/eva-decisions.js approve <id> --rationale "reason"');
      console.log('');
    }
    return EXIT.CHAIRMAN_REVIEW;
  }

  if (failed.length > 0) {
    const lastFailed = failed[failed.length - 1];
    if (!jsonOutput) {
      console.error(`\n  Error at stage ${lastFailed.stageId}: ${lastFailed.errors?.[0] || 'Unknown error'}\n`);
    }
    return EXIT.EXECUTION_ERROR;
  }

  if (blocked.length > 0) {
    if (!jsonOutput) {
      const lastBlocked = blocked[blocked.length - 1];
      console.log(`\n  Blocked at stage ${lastBlocked.stageId}\n`);
    }
    return EXIT.EXECUTION_ERROR;
  }

  if (!jsonOutput) {
    console.log('\n  All stages completed successfully.\n');
  }
  return EXIT.SUCCESS;
}

// Cross-platform ESM entry point
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  main().then(code => {
    process.exitCode = code;
  }).catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exitCode = EXIT.EXECUTION_ERROR;
  });
}

export { main, EXIT };
