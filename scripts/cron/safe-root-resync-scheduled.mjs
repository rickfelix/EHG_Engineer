#!/usr/bin/env node
/**
 * Scheduled safe-root-resync — fetch+ff-merge ONLY (SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-A).
 *
 * scripts/safe-root-resync.mjs (npm run resync:safe) had ZERO periodic_process_registry rows —
 * scheduled nowhere, its own liveness unwatched. This wires it in, but deliberately schedules
 * ONLY the fetch+ff-merge half (skipLockClear: true) — per the parent SD's git-flow-expert
 * refinement, the clear-stale-index-lock step is excluded from the periodic job because it can
 * race a live lock creation; that step stays manual-only (`npm run resync:safe` with no flags).
 *
 * Also tracks consecutive-identical-abort escalation (FR-5): a lone abort is routine, but the
 * SAME abort reason on two consecutive scheduled runs escalates rather than retrying silently
 * forever. Escalation state persists in periodic_process_registry.liveness_source_ref so it
 * survives this being a fresh process every tick.
 *
 * Usage: node scripts/cron/safe-root-resync-scheduled.mjs --repo <path> [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { safeRootResync } from '../safe-root-resync.mjs';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { trackAbortEscalation } from '../../lib/git/resync-escalation.js';

export const PROCESS_KEY = 'standard_loop:safe-root-resync-fetch-ff-merge';

/**
 * Map a safeRootResync() result to a stable, dedup-able abort-reason string, or null.
 *
 * QF-20260902-805: a dirty-tree skip is NOT a benign no-op like 'already_current' — the root did
 * NOT advance to origin/main, exactly the did-not-fast-forward shape that silently stalled the
 * fleet for 14.6h (RCA 9a02a76d). It is now tracked as 'dirty_skip' so trackAbortEscalation()
 * (already built, already escalates on the 2nd consecutive identical reason) surfaces a
 * persistently-dirty root instead of treating every dirty skip as a fresh, unremarkable success.
 */
export function abortReasonFor(result) {
  if (!result) return 'no_result';
  if (result.ok === false) {
    if (result.conflict) return 'non_ff_conflict';
    return result.aborted || 'unknown_abort';
  }
  if (result.skipped === 'dirty') return 'dirty_skip';
  return null; // ok:true, genuinely synced (already_current) or a real fast-forward — never an abort
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function loadEscalationState(supabase, processKey) {
  const { data } = await supabase
    .from('periodic_process_registry')
    .select('liveness_source_ref')
    .eq('process_key', processKey)
    .maybeSingle();
  return data?.liveness_source_ref?.escalation_state || null;
}

/**
 * @param {object|null} dirtyVerdict - QF-20260902-805: a durable SKIPPED_DIRTY verdict (skip
 *   reason + capped dirty-file list) written on EVERY dirty skip, not only at escalation — so the
 *   root's did-not-fast-forward state is observable from the registry row itself, never only
 *   inferable from an escalation firing.
 */
async function persistEscalationState(supabase, processKey, nextState, escalated, dirtyVerdict = null) {
  const { data: row } = await supabase
    .from('periodic_process_registry')
    .select('liveness_source_ref')
    .eq('process_key', processKey)
    .maybeSingle();
  const liveness_source_ref = {
    ...(row?.liveness_source_ref || {}),
    escalation_state: nextState,
    // Cleared on any non-dirty run (fast-forward or genuinely already-current) so a stale verdict
    // never outlives the condition that produced it.
    last_dirty_verdict: dirtyVerdict,
  };
  await supabase
    .from('periodic_process_registry')
    .update({
      liveness_source_ref,
      updated_at: new Date().toISOString(),
      ...(escalated ? { last_state: 'ESCALATED', last_state_changed_at: new Date().toISOString() } : {}),
    })
    .eq('process_key', processKey);
}

async function main() {
  const repoPath = arg('--repo', null);
  if (!repoPath) {
    console.error('[safe-root-resync-scheduled] --repo <path> is required (no cwd fallback by design)');
    process.exit(2);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = url && key ? createClient(url, key) : null;

  const result = await safeRootResync({ cwd: repoPath, supabase, skipLockClear: true });
  const abortReason = abortReasonFor(result);

  let escalated = false;
  if (supabase) {
    try {
      const prior = await loadEscalationState(supabase, PROCESS_KEY);
      const tracked = trackAbortEscalation(prior, abortReason);
      escalated = tracked.escalated;
      const dirtyVerdict = abortReason === 'dirty_skip'
        ? { skipped: 'dirty', dirtyFiles: result.dirtyFiles || [], at: new Date().toISOString() }
        : null;
      await persistEscalationState(supabase, PROCESS_KEY, tracked.nextState, escalated, dirtyVerdict);
      if (!escalated) await stampLastFired(supabase, PROCESS_KEY);
    } catch (err) {
      console.error(`[safe-root-resync-scheduled] escalation-state bookkeeping failed (non-fatal): ${err.message}`);
    }
  }

  if (escalated) {
    // Structured, alert-tagged line — distinguishable from routine abort/skip logging so an
    // operator or a downstream alert scan can grep for it (FR-5 AC-1).
    console.error(`[safe-root-resync-scheduled] ESCALATION: second consecutive identical abort (reason=${abortReason}) — repo=${repoPath}`);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ repoPath, abortReason, escalated, result }, null, 2));
  } else if (abortReason) {
    console.log(`[safe-root-resync-scheduled] abort: ${abortReason}${escalated ? ' (ESCALATED)' : ''}`);
  } else {
    console.log(`[safe-root-resync-scheduled] ok — ${repoPath}`);
  }

  process.exitCode = abortReason ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('safe-root-resync-scheduled.mjs')) {
  main().catch((err) => {
    console.error(`[safe-root-resync-scheduled] ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}
