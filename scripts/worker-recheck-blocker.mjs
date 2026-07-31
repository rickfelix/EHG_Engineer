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
 *   4 = DRAIN_REQUIRED -> you have undrained inbound messages. You may NOT assert blocker-unchanged
 *                         until you have read them (SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-6).
 *
 * WHY EXIT 4 EXISTS (FR-6). Alpha-3 re-checked its own blocker correctly on every pass, exactly as
 * the directive says to — and still sat for ten hours, because it never re-read INBOUND while the
 * coordinator was actively sending it the diagnosis that would have unstuck it. "Still blocked" is
 * only a truthful claim if you have looked at everything that could have unblocked you. So an
 * undrained inbox makes the assertion UNSOUND, not merely impolite, and this check refuses to let
 * the worker make it. Note the asymmetry: a CLEARED result is never withheld — good news is allowed
 * through an undrained inbox, because withholding it would keep a worker blocked to enforce a
 * process rule, which is the very harm FR-6 exists to prevent.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import fingerprintLib from '../lib/shared/content-fingerprint.cjs';
import { emitFeedback } from '../lib/governance/emit-feedback.js';
import { countUndrainedInbound, applyDrainGate, EXIT_CODES } from '../lib/fleet/blocker-drain-gate.mjs';
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

// FR-6 gate. Runs BEFORE the verdict is printed so the worker is never told "unchanged, stay quiet"
// while an unread answer is sitting in its inbox.
const sessionId = arg('session') || process.env.CLAUDE_SESSION_ID;
// ONE client for the whole run, shared with the emit-feedback tail below. Building a second client
// here and querying from it makes process.exit() race libuv teardown on Windows (exit 127, libuv
// UV_HANDLE_CLOSING assertion), which would silently destroy the 0/2/3/4 exit-code contract that is
// this CLI's entire interface. A client MUST be passed — omitting it makes the count return null
// forever and the gate never fires, i.e. an inert mechanism, the exact failure this SD exists to fix.
const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = sbUrl && sbKey ? createClient(sbUrl, sbKey) : null;

/**
 * Exit WITHOUT racing libuv teardown.
 *
 * Calling process.exit() in the same tick as a just-settled supabase fetch aborts the run on
 * Windows with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" and exit code 127 —
 * silently destroying the 0/2/3/4 contract that is this CLI's entire interface. MEASURED: the
 * drain-count query followed by an immediate exit reproduced 127 every time.
 *
 * So: set exitCode and let the loop drain (clean, natural exit), with an UNREF'd timer as a
 * backstop in case a keep-alive socket would otherwise hold the process open. Unref'd means the
 * timer never itself keeps us alive — it only fires if something else already has.
 */
function finish(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 250).unref();
}

const undrained = await countUndrainedInbound(sessionId, null, { client: supabase });
const gated = applyDrainGate(check.outcome, undrained);
// if/ELSE, not two ifs: finish() only SETS the exit code (it must not process.exit in-tick — see
// above), so a bare `if` would fall through and the tail's finish() would overwrite 4 with 3. That
// exact bug shipped for one run here: the CLI printed DRAIN_REQUIRED and exited 3.
if (gated === 'drain_required') {
  console.log(`[recheck] ${label} -> DRAIN_REQUIRED (${undrained} unread inbound message(s); blocker looks unchanged but you have not read what arrived)`);
  console.log('[recheck] Run /checkin and read your inbox, THEN re-assert. "Still blocked" is not a sound claim until you have.');
  finish(4);
} else {

console.log(`[recheck] ${label} -> ${check.outcome.toUpperCase()} (${check.detail})`);
if (check.outcome === 'cleared') console.log('[recheck] RESUME IMMEDIATELY — do not wait to be told.');
if (check.outcome === 'still_blocking') console.log('[recheck] Unchanged: re-check silently next tick. Do NOT re-report (FR-2).');

// FR-4 instrumentation. Deliberately NON-FATAL and last: measuring must never block or delay the
// worker, and a telemetry outage must not look like a blocker. Same pattern as
// scripts/hooks/stop-loop-wakeup-reminder.cjs.
if (!has('no-record')) {
  try {
    if (supabase) {
      const fp = fingerprint('blocker_recheck', `${label}::${check.detail}`);
      await emitFeedback({
        supabase,
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

finish(EXIT_CODES[check.outcome] ?? 2);
} // end else (non-drain path)
