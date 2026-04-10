#!/usr/bin/env node
/**
 * SD Queue Drainer - SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001
 *
 * CLI entry point: npm run sd:drain
 *
 * Spawns up to 3 Agent sub-tasks with worktree isolation and virtual
 * session claims to process the SD queue in parallel.
 *
 * Usage:
 *   npm run sd:drain                   # Default: 2 agents
 *   npm run sd:drain -- --max-agents 1 # Single agent
 *   npm run sd:drain -- --dry-run      # Preview without executing
 *   npm run sd:drain -- --track A      # Filter to track A only
 */

import { DrainOrchestrator } from '../lib/drain-orchestrator.mjs';
import { getOrCreateSession } from '../lib/session-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Argument parsing ──────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    maxAgents: 2,
    dryRun: false,
    track: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-agents':
      case '-n':
        opts.maxAgents = parseInt(args[++i], 10);
        if (isNaN(opts.maxAgents) || opts.maxAgents < 1 || opts.maxAgents > 3) {
          console.error('Error: --max-agents must be 1, 2, or 3');
          process.exit(1);
        }
        break;
      case '--dry-run':
      case '-d':
        opts.dryRun = true;
        break;
      case '--track':
      case '-t':
        opts.track = args[++i]?.toUpperCase();
        if (!['A', 'B', 'C', 'STANDALONE'].includes(opts.track)) {
          console.error('Error: --track must be A, B, C, or STANDALONE');
          process.exit(1);
        }
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  return opts;
}

function showHelp() {
  console.log(`
SD Queue Drainer - Parallel Agent Processing

Usage: npm run sd:drain [-- options]

Options:
  --max-agents, -n <1-3>   Number of parallel agents (default: 2)
  --dry-run, -d            Preview what would be processed
  --track, -t <A|B|C>     Filter SDs by execution track
  --help, -h               Show this help

Examples:
  npm run sd:drain                     # 2 agents, all tracks
  npm run sd:drain -- --max-agents 1   # Single agent (Phase 1)
  npm run sd:drain -- --dry-run        # Preview mode
  npm run sd:drain -- -n 2 -t A        # 2 agents, track A only
`);
}

// ── Resolve parent session ────────────────────────────────────────
// QF-20260409-402: Previously returned `drain_parent_${Date.now()}` when no
// active non-virtual session existed. That synthesized string violates
// claude_sessions_parent_session_id_fkey when used as parent for virtual
// drain sessions (same root cause fixed for execute-team in QF-20260409-889).
// Now calls getOrCreateSession() which guarantees a real claude_sessions row.

async function resolveParentSession() {
  const session = await getOrCreateSession();
  return session.session_id;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  console.log('═══════════════════════════════════════════');
  console.log('  SD QUEUE DRAINER');
  console.log('═══════════════════════════════════════════');
  console.log(`  Agents:  ${opts.maxAgents}`);
  console.log(`  Track:   ${opts.track || 'all'}`);
  console.log(`  Dry Run: ${opts.dryRun}`);
  console.log('═══════════════════════════════════════════\n');

  const parentSessionId = await resolveParentSession();
  console.log(`  Parent session: ${parentSessionId}\n`);

  const orchestrator = new DrainOrchestrator({
    parentSessionId,
    maxAgents: opts.maxAgents,
    trackFilter: opts.track,
    dryRun: opts.dryRun
  });

  // Graceful shutdown handlers
  let shuttingDown = false;
  async function handleShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
    const summary = await orchestrator.shutdown();
    printSummary(summary);
    process.exit(0);
  }

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Run the drain
  const summary = await orchestrator.run();
  printSummary(summary);
}

function printSummary(summary) {
  console.log('\n═══════════════════════════════════════════');
  console.log('  DRAIN SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`  Duration:   ${summary.elapsed_seconds}s`);
  console.log(`  Completed:  ${summary.sds_completed}`);
  console.log(`  Failed:     ${summary.sds_failed}`);
  console.log(`  Slots Used: ${summary.slots_used}`);

  if (summary.completed_sds.length > 0) {
    console.log('\n  ✅ Completed SDs:');
    for (const sd of summary.completed_sds) {
      console.log(`     - ${sd}`);
    }
  }

  if (summary.failed_sds.length > 0) {
    console.log('\n  ❌ Failed SDs:');
    for (const sd of summary.failed_sds) {
      console.log(`     - ${sd}`);
    }
  }

  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
