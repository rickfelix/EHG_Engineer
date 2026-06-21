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
  if (openRedMergeQfs.some((q) => (q.description || '').includes(signature))) {
    return { action: 'noop', reason: `dedup: open QF already carries signature ${signature}` };
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

  const { data: openQfs } = await db
    .from('quick_fixes')
    .select('id, description, status')
    .in('status', ['open', 'in_progress'])
    .ilike('title', '%red-merge%');

  const verdict = decide(mainSnaps, openQfs || []);
  console.log(`[red-merge-detector] ${verdict.action}: ${verdict.reason}`);
  if (verdict.action !== 'file_qf') return;

  if (dryRun) { console.log('[red-merge-detector] dry-run — would file QF with signature', verdict.signature); return; }

  // File the ci-blocking QF via the canonical creation script.
  const title = `CI red-merge: main test failures rose ${verdict.prevFailed} -> ${verdict.newFailed} at ${verdict.sha.slice(0, 10)}`;
  const description = `${verdict.signature}\n\nA merge to main increased the unit-test failure count from ${verdict.prevFailed} to ${verdict.newFailed} (commit ${verdict.sha}). ` +
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
