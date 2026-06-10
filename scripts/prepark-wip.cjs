#!/usr/bin/env node
/**
 * Pre-park durable-WIP CLI — run from inside a claim-bound worktree BEFORE
 * arming a turn-ending ScheduleWakeup so a partial commit survives a
 * sweep-driven claim release + peer re-route.
 *
 * SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-1).
 *
 *   node scripts/prepark-wip.cjs                 # uses process.cwd() as the worktree
 *   node scripts/prepark-wip.cjs --worktree <p>  # explicit worktree path
 *   node scripts/prepark-wip.cjs --sd <SD-KEY>   # label the WIP commit
 *
 * ALWAYS exits 0 — never blocks the wake flow (same contract as park-worker.cjs).
 */
'use strict';

const { runPreparkWip } = require('../lib/fleet/prepark-wip.cjs');

function parseArgs(argv) {
  const args = { worktree: process.cwd(), sd: process.env.SD_KEY || '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--worktree' && argv[i + 1]) args.worktree = argv[++i];
    else if (argv[i] === '--sd' && argv[i + 1]) args.sd = argv[++i];
  }
  return args;
}

function main() {
  const { worktree, sd } = parseArgs(process.argv.slice(2));
  let r;
  try {
    r = runPreparkWip({ worktreePath: worktree, sdKey: sd });
  } catch (e) {
    console.warn('[prepark-wip] unexpected error (non-fatal):', e && e.message);
    return;
  }
  if (r.action === 'noop') {
    console.log(`[prepark-wip] no-op (${r.note || 'nothing to push'})${r.branch ? ` [${r.branch}]` : ''}`);
  } else if (r.pushed) {
    console.log(`[prepark-wip] pushed ${r.branch} to origin — WIP now recoverable after re-route (action=${r.action})`);
  } else {
    console.log(`[prepark-wip] ${r.action} on ${r.branch || '(no branch)'} — ${r.note || 'committed locally (not pushed)'}`);
  }
}

if (require.main === module) {
  try { main(); } finally { process.exit(0); }
}

module.exports = { parseArgs };
