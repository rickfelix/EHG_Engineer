#!/usr/bin/env node
/**
 * set-activity-state.cjs — Node port of .claude/set-activity-state.ps1
 *
 * SD-LEO-INFRA-PRETOOLUSE-HOOK-LATENCY-001
 *
 * The PowerShell version paid ~900-1050ms of interpreter startup on every
 * invocation (measured 5-run baseline pre-fix), occasionally breaching the
 * hook's 2000ms timeout cap fleet-wide (~2,076 timeouts over 19 days). Node
 * process startup measures ~60-70ms for an equivalent hook in this repo, so
 * porting to Node (the runtime every other hook here already rides) removes
 * the interpreter cold-start cost at the source instead of tuning it.
 *
 * Semantics preserved exactly from set-activity-state.ps1: merge
 * {activity_state, last_active_epoch, hook_triggered} into the existing
 * STATE_FILE JSON, leaving any other keys (written by .claude/statusline.cjs)
 * untouched. STATE_FILE path matches statusline.cjs's LOG_DIR constant.
 */

const fs = require('fs');
const path = require('path');

/**
 * Resolves the MAIN checkout's root — never the current worktree's — by stripping a
 * trailing `.worktrees/<name>` segment from this file's own location. Hooks fire from
 * whichever worktree is active, but the statusline that reads STATE_FILE always renders
 * the canonical checkout's state, so every worktree must converge on the same path.
 * No literal home path (no-literal-home-path-lint): computed, not hardcoded.
 */
function resolveMainRepoRoot() {
  const hookRepoRoot = path.resolve(__dirname, '..', '..');
  const match = hookRepoRoot.match(/^(.*)[/\\]\.worktrees[/\\][^/\\]+$/);
  return match ? match[1] : hookRepoRoot;
}

/**
 * LEO_ACTIVITY_STATE_FILE overrides the computed default. Production NEVER sets it — the
 * three invocation sites in .claude/settings.json (PreToolUse/UserPromptSubmit/Stop) pass
 * no env, so the default applies. The override exists so tests exercise THIS file rather
 * than a path-rewritten copy of it (a copy would prove nothing about what actually ships).
 * Mirrors the LEO_RETRY_STATE_DIR seam in scripts/hooks/retry-state-manager.cjs.
 */
const STATE_FILE =
  process.env.LEO_ACTIVITY_STATE_FILE ||
  path.join(resolveMainRepoRoot(), '.claude', 'logs', '.context-state.json');
const LOG_DIR = path.dirname(STATE_FILE);

const state = process.argv[2] || 'idle';

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  let stateData = {};
  try {
    const content = fs.readFileSync(STATE_FILE, 'utf8');
    if (content) stateData = JSON.parse(content);
  } catch (_) {
    stateData = {};
  }
  // Array.isArray is NOT redundant with the typeof check: typeof [] === 'object', so an array
  // payload passes that guard, receives the three keys as NAMED properties, and then
  // JSON.stringify serialises it back as a bare array — silently DISCARDING the hook's entire
  // write, on every subsequent invocation, with no error anywhere. Caught by
  // tests/unit/hooks/set-activity-state.test.js (the non-object-JSON case).
  if (!stateData || typeof stateData !== 'object' || Array.isArray(stateData)) stateData = {};

  stateData.activity_state = state;
  stateData.last_active_epoch = Math.floor(Date.now() / 1000);
  stateData.hook_triggered = true;

  fs.writeFileSync(STATE_FILE, JSON.stringify(stateData), 'utf8');
} catch (_) {
  // Intentionally silent: activity-state write is best-effort, matching the
  // PowerShell version's try/catch-to-empty-state fallback behavior.
}
