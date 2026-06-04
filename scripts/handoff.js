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

// Builtin + builtin-only-lib imports ONLY at module top. These never resolve
// through node_modules, so they load even when an orphaned worktree's
// node_modules junction is dangling. The heavy graph (main/claimGuard/
// startHeartbeat — which transitively pull @supabase/* via node_modules) is
// imported DYNAMICALLY below, AFTER the FR-1 re-exec preflight.
import { spawnSync } from 'node:child_process';
import { assertCwdValid, ExecContextError } from '../lib/exec-context-guard.mjs';
import { getRepoRoot } from '../lib/repo-paths.js';
import { planHandoffReexec } from '../lib/handoff-reexec.mjs';

// === FR-1 (SD-FDBK-INFRA-WORKTREE-AUTO-REMOVED-001): re-exec recovery ===
// When cwd is an orphaned worktree (its branch was deleted by
// `gh pr merge --delete-branch`, dropping it out of `git worktree list`), the
// heavy import graph below fails at MODULE-RESOLUTION time — earlier than any
// in-body guard can run, and `process.chdir()` cannot re-resolve an already
// evaluated ESM graph. So we detect-and-re-exec HERE, before the dynamic
// imports, using a pure planner (lib/handoff-reexec.mjs, builtin-only). The
// child runs the MAIN repo's handoff.js (whose node_modules is intact) from the
// main root, with an env sentinel (LEO_HANDOFF_REEXEC) as a loop-guard.
const _reexecPlan = planHandoffReexec({
  sentinelSet: Boolean(process.env.LEO_HANDOFF_REEXEC),
  assertCwdValid,
  isStaleCwd: (err) => err instanceof ExecContextError && err.code === 'STALE_CWD',
  getRepoRoot,
  cwd: process.cwd(),
});
if (_reexecPlan.reexec) {
  console.error('[handoff.js] ♻️  STALE_CWD: cwd is an orphaned worktree (branch deleted by --delete-branch).');
  console.error(`   Re-executing from the main repo root: ${_reexecPlan.mainRoot}`);
  const child = spawnSync(process.execPath, [_reexecPlan.mainScript, ...process.argv.slice(2)], {
    cwd: _reexecPlan.mainRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, LEO_HANDOFF_REEXEC: '1' },
  });
  process.exit(child.status == null ? 1 : child.status);
}
// reexec=false (sentinel_set | cwd_valid | no_valid_main_root) → proceed.
// If cwd is still broken (no_valid_main_root / sentinel set), the loud STALE_CWD
// guard below preserves the original exit(1) failure (never silently swallowed).

// Heavy graph: dynamic imports deferred until cwd is known-good (or re-exec'd).
const { main } = await import('./modules/handoff/cli/index.js');
const { claimGuard } = await import('../lib/claim-guard.mjs');
const { startHeartbeat } = await import('../lib/heartbeat-manager.mjs');

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
// Retained as the fallback when the FR-1 preflight above could NOT recover
// (sentinel set but cwd still broken, or no valid main root resolved). Fails
// fast and loud rather than crashing later with a confusing module-not-found.
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
