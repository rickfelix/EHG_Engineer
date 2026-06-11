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
 * Pure decision: given the two latest main snapshots (newest first) and the
 * list of OPEN red-merge QFs, decide what to do.
 * @param {Array<{findings: Array<{failed_count: number, commit_sha?: string, branch?: string}>}>} snapshots newest-first
 * @param {Array<{id: string, description?: string}>} openRedMergeQfs
 * @returns {{action: 'file_qf'|'noop', reason: string, signature?: string, newFailed?: number, prevFailed?: number, sha?: string}}
 */
export function decide(snapshots = [], openRedMergeQfs = []) {
  const f = (s) => (s && s.findings && s.findings[0]) || {};
  if (snapshots.length < 2) return { action: 'noop', reason: 'fewer than 2 main snapshots — no baseline to compare' };
  const [latest, prev] = snapshots;
  const newFailed = Number(f(latest).failed_count ?? NaN);
  const prevFailed = Number(f(prev).failed_count ?? NaN);
  if (!Number.isFinite(newFailed) || !Number.isFinite(prevFailed)) {
    return { action: 'noop', reason: 'snapshot missing failed_count' };
  }
  if (newFailed <= prevFailed) return { action: 'noop', reason: `green: failed ${newFailed} <= baseline ${prevFailed}` };

  const sha = f(latest).commit_sha || 'unknown-sha';
  const signature = `red-merge:${DIMENSION}:${sha}`;
  if (openRedMergeQfs.some((q) => (q.description || '').includes(signature))) {
    return { action: 'noop', reason: `dedup: open QF already carries signature ${signature}` };
  }
  if (openRedMergeQfs.length > 0) {
    // Storm guard: one open red-merge QF at a time — a flaky test flipping
    // signatures must not file a QF per merge.
    return { action: 'noop', reason: `storm guard: ${openRedMergeQfs.length} red-merge QF(s) already open` };
  }
  return { action: 'file_qf', reason: `red merge: failed ${prevFailed} -> ${newFailed}`, signature, newFailed, prevFailed, sha };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: snaps, error } = await db
    .from(TABLE)
    .select('id, findings, created_at')
    .eq('dimension', DIMENSION)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { console.error('snapshot read failed:', error.message); process.exit(1); }
  const mainSnaps = (snaps || []).filter((s) => (s.findings?.[0]?.branch || '') === 'main').slice(0, 2);

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
