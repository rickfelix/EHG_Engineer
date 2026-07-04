#!/usr/bin/env node
/**
 * Red-merge detector — SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-3).
 *
 * Two red checks merged to main overnight 2026-06-11 (runs 27319083708 /
 * 27318731588 + the contaminated #4599): the coverage workflow's PR leg is
 * deliberately non-blocking (continue-on-error, admin-merge flow), so a merge
 * with NEW failures lands silently. This detector runs on the MAIN-branch leg
 * (after compare-to-main-snapshot writes the new snapshot) and:
 *   1. compares the two most recent main snapshots (codebase_health_snapshots),
 *   2. on failed_count increase, files ONE ci-blocking QF (deduped by signature
 *      AND by any-open-red-merge-QF storm guard),
 *   3. writes an audit row (best-effort) naming the merge SHA + counts.
 *
 * The PR leg is untouched (TR-3): blocking semantics come from the auto-QF +
 * audit trail; branch protection is a separate chairman decision.
 *
 * Usage: node scripts/ci/red-merge-detector.mjs [--dry-run]
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { classifyRegressions } from '../lib/baseline-regression-check.mjs';

const DIMENSION = 'ci_test_failure_count'; // must match compare-to-main-snapshot.mjs
const TABLE = 'codebase_health_snapshots';

/**
 * NOISE FLOOR — the minimum amount the failure count must sit ABOVE the settled
 * baseline to count as elevated. Persistence (below) does the heavy lifting; the
 * floor only ignores trivial wiggle. Env-overridable. (SD-REFILL-00V2SADI)
 */
export const DEFAULT_NOISE_FLOOR = (() => {
  const n = Number(process.env.RED_MERGE_NOISE_FLOOR);
  return Number.isFinite(n) && n >= 0 ? n : 1;
})();

/**
 * CUMULATIVE-ROT thresholds (SD-LEO-INFRA-CI-BASELINE-ROT-DETECT-001). decide()
 * only fires on a CONFIRMED RISE above the settled median, so a slow climb that
 * stays under the per-merge jump is absorbed into the creeping median and never
 * trips (observed: 102 -> 134 over 13d). detectBaselineRot() below catches that
 * blind spot. Both thresholds are env-overridable (mirrors DEFAULT_NOISE_FLOOR).
 */
export const DEFAULT_ROT_CEILING = (() => {
  const n = Number(process.env.RED_MERGE_ROT_CEILING);
  return Number.isFinite(n) && n > 0 ? n : 110;
})();
export const DEFAULT_TREND_DELTA = (() => {
  const n = Number(process.env.RED_MERGE_TREND_DELTA);
  return Number.isFinite(n) && n > 0 ? n : 15;
})();

/**
 * Does a QF description carry this exact signature? Delimiter-anchored so a sha-PREFIX cannot
 * collide (`:abc123` must not match a QF for `:abc123def456`). A match requires the char after the
 * signature to be end-of-string or a non-hex char (SHAs are [0-9a-f]). (SD-REFILL-00Z7INJF / RCA F2)
 */
function descHasSignature(desc, signature) {
  const d = desc || '';
  let idx = d.indexOf(signature);
  while (idx !== -1) {
    const after = d[idx + signature.length];
    if (after === undefined || !/[0-9a-fA-F]/.test(after)) return true;
    idx = d.indexOf(signature, idx + 1);
  }
  return false;
}

/** Median of the finite numbers in `nums` (NaN if none). Pure. */
function median(nums) {
  const a = nums.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Pure decision: given a trailing window of recent main snapshots (NEWEST FIRST)
 * and the list of OPEN red-merge QFs, decide what to do.
 *
 * ci_test_failure_count on main is FLAKY — it bounces across adjacent runs (the
 * motivating sequence: 102→103→118→103→114→103). The original rule (fire whenever
 * latest > the single immediately-prior snapshot) tripped a false-positive
 * CI-blocking QF on every transient up-bounce. (SD-REFILL-00V2SADI)
 *
 * Hardened rule — a CONFIRMED rise, never a single spike:
 *   • baseline = MEDIAN of the SETTLED window (excludes the candidate latest TWO
 *     readings, so a 1- or 2-run flaky spike cannot inflate its own baseline),
 *   • fire only when BOTH the latest AND the prior reading sit ≥ NOISE_FLOOR above
 *     that baseline (persistence — a lone transient bounce never qualifies).
 * Needs ≥3 snapshots (latest + prev + ≥1 settled baseline reading).
 *
 * ONE-SHOT-PER-EVENT contract: a regression fires during the ~run window before it
 * settles into the trailing median (which then absorbs it) — by design, paired with the
 * dedup + storm-guard so a single event yields exactly one QF, not one per merge. A
 * FURTHER sustained rise above the new elevated baseline still fires (masking does not
 * compound). (RCA 105b7143)
 *
 * @param {Array<{findings: Array<{failed_count: number, commit_sha?: string, branch?: string}>}>} snapshots newest-first
 * @param {Array<{id: string, description?: string}>} openRedMergeQfs
 * @param {{noiseFloor?: number}} [opts]
 * @returns {{action: 'file_qf'|'noop', reason: string, signature?: string, newFailed?: number, prevFailed?: number, baseline?: number, sha?: string}}
 */
export function decide(snapshots = [], openRedMergeQfs = [], opts = {}) {
  const noiseFloor = Number.isFinite(opts.noiseFloor) ? opts.noiseFloor : DEFAULT_NOISE_FLOOR;
  const f = (s) => (s && s.findings && s.findings[0]) || {};
  if (snapshots.length < 3) {
    return { action: 'noop', reason: `insufficient history (${snapshots.length} main snapshot(s); need ≥3 for confirmed-rise detection)` };
  }
  const counts = snapshots.map((s) => Number(f(s).failed_count ?? NaN));
  const [newFailed, prevFailed] = counts;
  if (!Number.isFinite(newFailed) || !Number.isFinite(prevFailed)) {
    return { action: 'noop', reason: 'snapshot missing failed_count' };
  }
  // Settled baseline excludes the candidate latest two readings, so a 1- or 2-run
  // flaky spike cannot inflate its own baseline.
  const baseline = median(counts.slice(2));
  if (!Number.isFinite(baseline)) return { action: 'noop', reason: 'no settled baseline' };

  // PERSISTENCE + NOISE FLOOR: a single transient bounce never qualifies.
  const elevated = (v) => v - baseline >= noiseFloor;
  if (!(elevated(newFailed) && elevated(prevFailed))) {
    return {
      action: 'noop',
      reason: `no confirmed rise: latest ${newFailed}, prev ${prevFailed} vs settled median ${baseline} (floor ${noiseFloor})`,
    };
  }

  const sha = f(snapshots[0]).commit_sha || 'unknown-sha';
  const signature = `red-merge:${DIMENSION}:${sha}`;
  // Dedup across ANY QF status: an offending sha is immutable and should be flagged at most once,
  // EVER. A QF that completed minutes ago must still suppress a re-file while the snapshot pair
  // still shows the rise. opts.dedupeQfs carries recent red-merge QFs of any status (caller bounds
  // the window); fall back to the open list when absent. (SD-REFILL-00Z7INJF)
  // Skip dedup on the 'unknown-sha' sentinel — its signature is degenerate, so deduping on it would
  // wrongly suppress DISTINCT sha-less regressions (RCA f4ab2603 F5).
  if (sha !== 'unknown-sha') {
    const dedupeQfs = Array.isArray(opts.dedupeQfs) ? opts.dedupeQfs : openRedMergeQfs;
    if (dedupeQfs.some((q) => descHasSignature(q.description, signature))) {
      return { action: 'noop', reason: `dedup: a QF already carries signature ${signature}` };
    }
  }
  if (openRedMergeQfs.length > 0) {
    // Storm guard: one open red-merge QF at a time — a flaky test flipping
    // signatures must not file a QF per merge.
    return { action: 'noop', reason: `storm guard: ${openRedMergeQfs.length} red-merge QF(s) already open` };
  }
  return {
    action: 'file_qf',
    reason: `confirmed red merge: settled median ${baseline} -> sustained ${prevFailed},${newFailed}`,
    signature, newFailed, prevFailed, baseline, sha,
  };
}

/**
 * Pure CUMULATIVE-ROT detector (SD-LEO-INFRA-CI-BASELINE-ROT-DETECT-001).
 *
 * decide() above fires only on a CONFIRMED RISE above the settled median, so a
 * slow climb that stays under the per-merge jump (observed: 102 -> 134 over 13d)
 * is absorbed into the creeping median and never trips. This catches that blind
 * spot two ways, both with the same single-bounce immunity decide() uses (the
 * latest TWO readings must qualify, so a lone flaky spike never fires):
 *
 *   • ABSOLUTE CEILING — the two most recent failed_counts both sit at/above an
 *     absolute ceiling (the suite is simply too red, however it got there). This
 *     is the rule that catches an ALREADY-rotted baseline whose window is flat.
 *   • CUMULATIVE TREND — the median of the recent half of the window sits
 *     >= trendDelta above the median of the older half (decay in progress), with
 *     both latest readings above that older-half median.
 *
 * Pure + deterministic (no Date.now/Math.random); newest-first snapshots, same
 * shape decide() consumes. Does NOT touch decide() — additive (TR-1).
 *
 * @param {Array<{findings: Array<{failed_count: number}>}>} snapshots newest-first
 * @param {{ceiling?: number, trendDelta?: number}} [opts]
 * @returns {{rotted: boolean, rule: 'absolute_ceiling'|'cumulative_trend'|null, reason: string, latest?: number, prev?: number, ceiling?: number, recentMedian?: number, olderMedian?: number}}
 */
export function detectBaselineRot(snapshots = [], opts = {}) {
  const ceiling = Number.isFinite(opts.ceiling) ? opts.ceiling : DEFAULT_ROT_CEILING;
  const trendDelta = Number.isFinite(opts.trendDelta) ? opts.trendDelta : DEFAULT_TREND_DELTA;
  const f = (s) => (s && s.findings && s.findings[0]) || {};
  const counts = snapshots.map((s) => Number(f(s).failed_count ?? NaN)).filter(Number.isFinite);
  if (counts.length < 2) {
    return { rotted: false, rule: null, reason: `insufficient history (${counts.length} reading(s); need >=2)` };
  }
  const [latest, prev] = counts;

  // ABSOLUTE CEILING — persistence: the latest TWO both at/above the ceiling.
  if (latest >= ceiling && prev >= ceiling) {
    return {
      rotted: true, rule: 'absolute_ceiling',
      reason: `failed_count sustained at/above ceiling ${ceiling} (latest ${latest}, prev ${prev})`,
      latest, prev, ceiling,
    };
  }

  // CUMULATIVE TREND — needs >=4 readings to split into recent/older halves.
  if (counts.length >= 4) {
    const half = Math.floor(counts.length / 2);
    const recentMedian = median(counts.slice(0, half));
    const olderMedian = median(counts.slice(half));
    // Single-bounce immunity: BOTH recent readings must sit a full trendDelta
    // above the older-half median (a lone spike inflating recentMedian fails this).
    if (
      Number.isFinite(recentMedian) && Number.isFinite(olderMedian) &&
      recentMedian - olderMedian >= trendDelta &&
      latest >= olderMedian + trendDelta && prev >= olderMedian + trendDelta
    ) {
      return {
        rotted: true, rule: 'cumulative_trend',
        reason: `recent median ${recentMedian} is >= ${trendDelta} above older median ${olderMedian} (sustained climb)`,
        latest, prev, recentMedian, olderMedian,
      };
    }
  }

  return {
    rotted: false, rule: null,
    reason: `no rot: latest ${latest}/prev ${prev} below ceiling ${ceiling}; no sustained ${trendDelta}+ climb`,
    latest, prev, ceiling,
  };
}

/**
 * IDENTITY + REACHABILITY gate on a count-based file_qf verdict (RCA a34446da,
 * QF-20260704-263 — 4th confirmed count-vs-identity false positive). decide()'s
 * count rule is a cheap pre-filter; a +1 from a flaky test in a file the merge
 * never touched is not a red merge. Delegates to the already-shipped PR-leg
 * comparator so the two gates never drift. Returns null (not []) when either
 * snapshot predates failed_test_ids (legacy) — the caller must fall back to
 * the count verdict rather than treat that as "zero regressions".
 * @param {{findings?: Array<{failed_test_ids?: string[]}>}} latestSnap
 * @param {{findings?: Array<{failed_test_ids?: string[]}>}} prevSnap
 * @param {string[]|null} changedFiles
 * @returns {string[]|null}
 */
export function genuineReachableRegressions(latestSnap, prevSnap, changedFiles) {
  const currentIds = latestSnap?.findings?.[0]?.failed_test_ids;
  const baselineIds = prevSnap?.findings?.[0]?.failed_test_ids;
  if (!Array.isArray(currentIds) || !Array.isArray(baselineIds)) return null;
  return classifyRegressions({
    currentFailed: currentIds.length, currentIds,
    baselineFailedCount: baselineIds.length, baselineIds, changedFiles,
  }).newRegressions;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: snaps, error } = await db
    .from(TABLE)
    .select('id, findings, created_at')
    .eq('dimension', DIMENSION)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }) // deterministic tie-break for same-second snapshots (RCA 105b7143)
    .limit(10);
  if (error) { console.error('snapshot read failed:', error.message); process.exit(1); }
  // Pass a trailing WINDOW (not just 2) so decide() can compute a robust settled-median
  // baseline + confirm persistence — the flaky-bounce noise floor (SD-REFILL-00V2SADI).
  const mainSnaps = (snaps || []).filter((s) => (s.findings?.[0]?.branch || '') === 'main').slice(0, 8);

  // CUMULATIVE-ROT check (SD-LEO-INFRA-CI-BASELINE-ROT-DETECT-001) — catches the
  // slow decay decide() is blind to. Report-only mode; never files a QF here.
  if (process.argv.includes('--rot-check')) {
    const rot = detectBaselineRot(mainSnaps);
    console.log(`[red-merge-detector] rot-check: ${rot.rotted ? 'BASELINE_ROT_DETECTED' : 'no rot'} — ${rot.reason}`);
    if (rot.rotted && !dryRun) {
      try {
        await db.from('audit_log').insert({
          event: 'BASELINE_ROT_DETECTED',
          metadata: { rule: rot.rule, latest: rot.latest, prev: rot.prev, ceiling: rot.ceiling, recentMedian: rot.recentMedian, olderMedian: rot.olderMedian, reason: rot.reason },
        });
      } catch { /* best effort — never blocks */ }
    }
    return;
  }

  const { data: openQfs } = await db
    .from('quick_fixes')
    .select('id, description, status')
    .in('status', ['open', 'in_progress'])
    .ilike('title', '%red-merge%');

  // Dedup window: red-merge QFs of ANY status created in the last 48h, so a QF that completed
  // minutes ago still suppresses a re-file for the same offending sha (SD-REFILL-00Z7INJF). The
  // open list above remains the storm-guard input (open/in_progress only).
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: recentQfs } = await db
    .from('quick_fixes')
    .select('id, description, status, created_at')
    .gte('created_at', since48h)
    .ilike('title', '%red-merge%');

  const verdict = decide(mainSnaps, openQfs || [], { dedupeQfs: recentQfs || [] });
  console.log(`[red-merge-detector] ${verdict.action}: ${verdict.reason}`);
  if (verdict.action !== 'file_qf') return;

  // IDENTITY+REACHABILITY GATE (RCA a34446da, QF-20260704-263): suppress unless a
  // NEW failing identity is reachable from the merge's own diff — same rule as the
  // PR-leg gate (shared module, no drift). Fails open to the count-fire when either
  // snapshot lacks failed_test_ids or the diff can't be computed.
  let changedFiles = null;
  try {
    changedFiles = execFileSync('git', ['show', '--name-only', '--format=', verdict.sha], { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\\/g, '/'));
  } catch { /* diff hiccup — fall open to identity-only (still better than count-only) */ }
  const genuine = genuineReachableRegressions(mainSnaps[0], mainSnaps[1], changedFiles);
  if (Array.isArray(genuine)) {
    if (genuine.length === 0) {
      console.log(`[red-merge-detector] noop: count ${verdict.prevFailed}->${verdict.newFailed} at ${verdict.sha.slice(0, 10)} has no NEW failing test reachable from its diff — flaky-count jitter, not a red merge`);
      return;
    }
    verdict.newRegressions = genuine;
  }

  if (dryRun) { console.log('[red-merge-detector] dry-run — would file QF with signature', verdict.signature); return; }

  // File the ci-blocking QF via the canonical creation script.
  const title = `CI red-merge: main test failures rose ${verdict.prevFailed} -> ${verdict.newFailed} at ${verdict.sha.slice(0, 10)}`;
  const namedTests = Array.isArray(verdict.newRegressions) && verdict.newRegressions.length
    ? `\n\nNewly-failing test(s) reachable from this commit's diff:\n- ${verdict.newRegressions.join('\n- ')}`
    : '';
  const description = `${verdict.signature}\n\nA merge to main increased the unit-test failure count from ${verdict.prevFailed} to ${verdict.newFailed} (commit ${verdict.sha}).${namedTests}\n\n` +
    `Reproduce: node scripts/audit-test-failures.mjs --pr-only --format=json | jq .new_failures. ` +
    `Fix the regression — do NOT regenerate the baseline snapshot to absorb it. Auto-filed by scripts/ci/red-merge-detector.mjs (SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 FR-3).`;
  let out = '';
  try {
    out = execFileSync(process.execPath, [
      'scripts/create-quick-fix.js',
      '--title', title,
      '--type', 'bug',
      '--severity', 'high',
      '--description', description,
    ], { encoding: 'utf8' });
    console.log(out.split('\n').filter((l) => l.includes('QF-')).slice(0, 2).join('\n'));
  } catch (e) {
    console.error('[red-merge-detector] QF creation failed:', e.message);
    process.exitCode = 1;
  }

  // Audit row — best-effort, never blocks.
  try {
    await db.from('audit_log').insert({
      event: 'RED_MERGE_DETECTED',
      metadata: { signature: verdict.signature, sha: verdict.sha, prev_failed: verdict.prevFailed, new_failed: verdict.newFailed, qf_output: out.slice(0, 500) },
    });
  } catch { /* best effort */ }
}

const isMain = process.argv[1] && import.meta.url.endsWith('red-merge-detector.mjs') && process.argv[1].endsWith('red-merge-detector.mjs');
if (isMain) main().catch((e) => { console.error(e.message); process.exit(1); });
