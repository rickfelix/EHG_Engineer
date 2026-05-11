#!/usr/bin/env node
/**
 * LEO Protocol Handoff System - Unified CLI
 *
 * This is the main entry point for all handoff operations.
 * Uses the modular handoff system for improved maintainability.
 *
 * This is a thin wrapper that delegates to the modular implementation
 * in scripts/modules/handoff/cli/. The modular handoff executors in
 * scripts/modules/handoff/executors/ perform the actual UPDATEs on
 * strategic_directives_v2 (phase transitions, claim-col writes, status flips).
 *
 * @canonical-writer-for: strategic_directives_v2
 * (Per docs/reference/canonical-write-paths.md — handoff.js is the canonical
 * writer for SD-V2 phase/status transitions. Other writers must be in
 * exempt_writers list. Originating SD: SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-7.)
 *
 * Usage:
 *   node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
 *   node scripts/handoff.js list [SD-ID]
 *   node scripts/handoff.js stats
 *
 * @see scripts/modules/handoff/ for implementation
 */

import { main } from './modules/handoff/cli/index.js';
import { claimGuard } from '../lib/claim-guard.mjs';
import { startHeartbeat } from '../lib/heartbeat-manager.mjs';
import { assertCwdValid, ExecContextError } from '../lib/exec-context-guard.mjs';

// SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR1 call-site migration):
// Start an in-process heartbeat for the duration of this script. Cooperative
// ownership mode means the parent Claude Code session retains claim
// ownership — we don't release on exit. This closes the "long gate
// evaluation triggers stale-sweep auto-release" race that caused live
// claim loss during validation-agent runs on 2026-04-24.
// No-op when CLAUDE_SESSION_ID is absent (CI, ad-hoc manual runs).
if (process.env.CLAUDE_SESSION_ID) {
  startHeartbeat(process.env.CLAUDE_SESSION_ID, { ownershipMode: 'cooperative' });
}

// SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-2): cwd-validity precondition.
// Fail fast if the script is running from an orphaned worktree (e.g. cwd is
// a worktree dir whose branch was deleted by `gh pr merge --delete-branch`).
// Without this guard, downstream module imports (e.g. scripts/lib/sd-id-resolver.js)
// crash with confusing module-not-found errors after the claim has been touched.
// See harness backlog d66a075d for the witnessed LEAD-FINAL crash.
try {
  assertCwdValid();
} catch (err) {
  if (err instanceof ExecContextError && err.code === 'STALE_CWD') {
    console.error(`[handoff.js] ❌ STALE_CWD precondition failed: ${err.message}`);
    console.error('   Remediation: cd to the main repo root before running handoff.js,');
    console.error('   or recreate the worktree with: git worktree add <path> <branch>');
    process.exit(1);
  }
  throw err;
}

// SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: Pre-delegate claim assertion
// Ensures claim exists before forwarding to the handoff executor
const args = process.argv.slice(2);
const sdIdArg = args[2]; // e.g., node handoff.js execute LEAD-TO-PLAN <SD-ID>
if (args[0] === 'execute' && sdIdArg) {
  try {
    const result = await claimGuard(sdIdArg, null, { autoFallback: true });
    if (!result.success && !result.fallback) {
      console.error(`[handoff.js] Claim check failed for ${sdIdArg}: ${result.error}`);
      if (result.owner) {
        console.error(`   Owner: ${result.owner.session_id} (${result.owner.heartbeat_age_human})`);
      }
      process.exit(1);
    }
  } catch (e) {
    // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: Fail-open on DB unavailability
    console.warn(`[handoff.js] ⚠️  Claim check failed (fail-open): ${e.message}`);
  }
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
