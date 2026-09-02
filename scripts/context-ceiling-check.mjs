#!/usr/bin/env node
/**
 * SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001 FR-3: a role-agnostic CLI wrapper around
 * lib/fleet/context-ceiling-checker.cjs, for any role-seat loop that (unlike Adam's and the
 * coordinator's, wired natively into scripts/adam-quiet-tick.mjs / scripts/coordinator-quiet-tick.mjs)
 * has no dedicated .mjs tick script in this repo to edit directly.
 *
 * Confirmed via Explore evidence (LEAD-TO-PLAN): no scripts/solomon-*-tick.mjs exists -- Solomon's
 * role-seat loop runs as a /loop-driven prompt, not a checked-in cron script. This CLI is the
 * reusable enforcement point any such loop can call each pass via Bash: the printed
 * QUIET_TICK_CONTEXT_CEILING line lands in that same turn's tool result, same as the native
 * wiring in the other two seats.
 *
 * Usage:
 *   node scripts/context-ceiling-check.mjs --role solomon --session-id <CLAUDE_SESSION_ID>
 *   node scripts/context-ceiling-check.mjs --role solomon   # session id from $CLAUDE_SESSION_ID
 *
 * Fail-soft by design (matches checkContextCeiling's own contract): never exits non-zero on a
 * classification/enforcement outcome -- only on a genuine usage error (missing --role/session).
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { checkContextCeiling } = require('../lib/fleet/context-ceiling-checker.cjs');
const {
  defaultReadLatestUsageRow,
  defaultInvokeCompactSkill,
  defaultPersistCeilingEvent,
} = require('../lib/fleet/context-ceiling-default-deps.cjs');

function parseArgs(argv) {
  const out = { role: null, sessionId: null, json: argv.includes('--json') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--role') out.role = argv[i + 1];
    if (argv[i] === '--session-id') out.sessionId = argv[i + 1];
  }
  return out;
}

async function main() {
  const { role, sessionId: cliSessionId, json } = parseArgs(process.argv.slice(2));
  const sessionId = cliSessionId || process.env.CLAUDE_SESSION_ID;

  if (!role) {
    console.error('Usage: node scripts/context-ceiling-check.mjs --role <role> [--session-id <id>] [--json]');
    process.exitCode = 1;
    return;
  }
  if (!sessionId) {
    console.error('No session id: pass --session-id or set CLAUDE_SESSION_ID.');
    process.exitCode = 1;
    return;
  }

  const result = await checkContextCeiling({
    role,
    sessionId,
    deps: {
      readLatestUsageRow: defaultReadLatestUsageRow,
      invokeCompactSkill: defaultInvokeCompactSkill,
      persistCeilingEvent: defaultPersistCeilingEvent,
    },
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else if (result.verdict !== 'CEILING') {
    // The CEILING branch already printed its own QUIET_TICK_CONTEXT_CEILING line inside
    // checkContextCeiling; avoid a second, redundant line for the common non-ceiling cases.
    console.log(`CONTEXT_CEILING_CHECK role=${role} verdict=${result.verdict}`);
  }
}

main().catch((err) => {
  console.error('context-ceiling-check: unexpected error:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
