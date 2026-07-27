#!/usr/bin/env node
/**
 * SD-LEO-INFRA-BLOCKED-WORKER-SELF-RECHECK-001 (FR-4) — re-run your own blocker check, and record
 * the outcome so the fleet can measure how often blockers self-resolve.
 *
 * WHY THIS EXISTS. The directive change (FR-1/FR-2) tells a blocked worker to re-run its own
 * blocker check every wakeup. That is correct but it had NO RUNTIME HOOK: the re-check is a worker
 * typing git commands, so there was nowhere for FR-4's instrumentation to live and no way to learn
 * the clear-rate. This CLI is that hook. It performs the check AND emits the measurement, which
 * also makes the directive's "the re-check is one command" claim literally true rather than
 * aspirational.
 *
 * MEASURED MOTIVATION: two seats burned 5h23m and 9h41m on conditions that had already cleared,
 * while awake and emitting 66 and 74 coordination rows. Neither re-checked on any tick.
 *
 * USAGE
 *   node scripts/worker-recheck-blocker.mjs --gate-file scripts/sd-start.js   # RESYNC_REQUIRED
 *   node scripts/worker-recheck-blocker.mjs --dirty                           # peer-dirty tree
 *   node scripts/worker-recheck-blocker.mjs --gate-file <p> --sd SD-XXX-001 --no-record
 *
 * EXIT CODES (so a worker can branch without parsing prose)
 *   0 = CLEARED        -> the condition no longer blocks you. RESUME IMMEDIATELY.
 *   3 = STILL_BLOCKING -> unchanged. Re-check silently next tick; do NOT re-report (FR-2).
 *   2 = INDETERMINATE  -> the check itself could not run (e.g. git fetch failed). Treated as
 *                         still-blocking for safety, but reported distinctly so a broken check is
 *                         never silently read as "still blocked" forever. Fail-safe, not fail-quiet.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import fingerprintLib from '../lib/shared/content-fingerprint.cjs';
import { emitFeedback } from '../lib/governance/emit-feedback.js';
import 'dotenv/config';

const { fingerprint } = fingerprintLib;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', timeout: 20000 }).trim();
}

/**
 * RESYNC_REQUIRED: is the named gate file behind origin/main? Mirrors
 * lib/claim/gate-freshness-check.mjs, which measures the behind-count of ONE file path (not a
 * whole-root behind count — a distinction that matters, since the root is chronically dirty).
 */
function checkGateFile(gateFile) {
  // A path that does not exist yields an EMPTY `git log ... -- <path>`, which is indistinguishable
  // from "not behind" and would report CLEARED — the DANGEROUS direction, since the worker would
  // resume while still genuinely blocked. A typo must never read as good news, so an unknown path
  // is INDETERMINATE rather than cleared.
  if (!existsSync(gateFile)) {
    return { outcome: 'indeterminate', detail: `gate file not found in working tree: ${gateFile} (typo? an empty git-log for a missing path is NOT evidence the gate cleared)` };
  }
  try {
    git(['fetch', 'origin', 'main', '--quiet']);
  } catch (e) {
    return { outcome: 'indeterminate', detail: `git fetch failed: ${e.message}` };
  }
  try {
    const behind = git(['log', '--oneline', 'HEAD..origin/main', '--', gateFile]);
    return behind
      ? { outcome: 'still_blocking', detail: `${behind.split('\n').filter(Boolean).length} commit(s) behind on ${gateFile}` }
      : { outcome: 'cleared', detail: `${gateFile} is level with origin/main` };
  } catch (e) {
    return { outcome: 'indeterminate', detail: `git log failed: ${e.message}` };
  }
}

/** Peer-dirty tree: the exact read behind the "three peer-dirty files" case (tree-currency.cjs). */
function checkDirty() {
  try {
    const dirty = git(['status', '--porcelain']);
    return dirty
      ? { outcome: 'still_blocking', detail: `${dirty.split('\n').filter(Boolean).length} dirty path(s)` }
      : { outcome: 'cleared', detail: 'working tree is clean' };
  } catch (e) {
    return { outcome: 'indeterminate', detail: `git status failed: ${e.message}` };
  }
}

const gateFile = arg('gate-file');
const check = has('dirty') ? checkDirty() : checkGateFile(gateFile || 'scripts/sd-start.js');
const label = has('dirty') ? 'peer-dirty-tree' : `gate-file:${gateFile || 'scripts/sd-start.js'}`;

console.log(`[recheck] ${label} -> ${check.outcome.toUpperCase()} (${check.detail})`);
if (check.outcome === 'cleared') console.log('[recheck] RESUME IMMEDIATELY — do not wait to be told.');
if (check.outcome === 'still_blocking') console.log('[recheck] Unchanged: re-check silently next tick. Do NOT re-report (FR-2).');

// FR-4 instrumentation. Deliberately NON-FATAL and last: measuring must never block or delay the
// worker, and a telemetry outage must not look like a blocker. Same pattern as
// scripts/hooks/stop-loop-wakeup-reminder.cjs.
if (!has('no-record')) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const fp = fingerprint('blocker_recheck', `${label}::${check.detail}`);
      await emitFeedback({
        supabase: createClient(url, key),
        title: `blocker re-check: ${label} -> ${check.outcome}`,
        description: `${check.detail}. Emitted by scripts/worker-recheck-blocker.mjs per SD-LEO-INFRA-BLOCKED-WORKER-SELF-RECHECK-001 FR-4.`,
        category: 'blocker_recheck',
        severity: 'low',
        source_type: 'blocker_recheck',
        // Clear-rate is derived by counting DISTINCT dedup_key values, never occurrence_count:
        // emit-feedback.js returns early on a dedupe hit without updating that column.
        dedup_key: `blocker_recheck::${fp}::${check.outcome}`,
        metadata: { sd_key: arg('sd'), check: label, outcome: check.outcome, blocker_fingerprint: fp },
      });
    }
  } catch { /* instrumentation is never load-bearing */ }
}

process.exit(check.outcome === 'cleared' ? 0 : check.outcome === 'still_blocking' ? 3 : 2);
