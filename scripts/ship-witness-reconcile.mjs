#!/usr/bin/env node
/**
 * Ship-witness reconciliation sweep — SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-1.
 *
 * Closes the async-merge witness gap: attemptAutoMerge() (lib/ship/auto-merge.mjs) fully
 * witnesses every merge it drives synchronously, but a large share of real merges never go
 * through it at all — most concretely, `gh pr merge --auto` (GitHub's native async auto-merge,
 * used directly by /quick-fix and similar ad-hoc merges) completes the merge LATER, with no
 * local process alive to observe it. Confirmed live in this SD's PRD Baseline Observation: 66 of
 * 106 merges since cutover were unwitnessed, and QF-20260703-999's own merge (a direct
 * `gh pr merge --auto --squash` call) was one of them.
 *
 * Rather than patch every possible merge call site (untractable — the gap is structural to async
 * --auto merges, not a fixed set of bypass paths), this sweep periodically finds any merge with
 * zero witness row (reusing the SAME detectUnwitnessedMerges the readiness report and gauge
 * already use) and backfills a witness row for it, tagged lane='reconcile-sweep' so it's
 * distinguishable from a real-time mergeWork() observation. Best-effort, fail-open per item —
 * one PR's failure never aborts the sweep. Wired into scripts/gauge-runner.mjs's existing
 * cadence (no new scheduler).
 *
 * Usage: node scripts/ship-witness-reconcile.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  PLATFORM_REPOS,
  WITNESS_CUTOVER_ISO,
  defaultFetchMergedPlatformPRs,
  detectUnwitnessedMerges,
  fetchAllWitnessRows,
} from '../lib/ship/witness-adoption.mjs';
import { writeMergeWitnessTelemetry } from '../lib/ship/merge-witness-telemetry.mjs';
import { deriveWorkKey } from '../lib/ship/work-key-derivation.mjs';

const JSON_MODE = process.argv.includes('--json');
export const RECONCILE_LANE = 'reconcile-sweep';

function defaultGhRunner(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Fetch a merged PR's headRefName + title (best-effort; null fields on lookup failure). */
export function fetchPrShape(prNumber, repo, runner = defaultGhRunner) {
  const r = runner(['pr', 'view', String(prNumber), '-R', repo, '--json', 'headRefName,title']);
  if (r.code !== 0) return { branchName: null, title: null };
  try {
    const parsed = JSON.parse(r.stdout.trim() || '{}');
    return { branchName: parsed.headRefName ?? null, title: parsed.title ?? null };
  } catch {
    return { branchName: null, title: null };
  }
}

/**
 * Given an unwitnessed-merge set (from detectUnwitnessedMerges), write a reconcile-sweep
 * telemetry row for each, deriving a work-key via the injected shape-fetcher. Never fabricates
 * a work-key (null when undeterminable) — coverage still reaches 100% either way. Exported for
 * unit testing without a live gh/DB round-trip.
 * @param {Array<{repo:string, prNumber:number, mergedAt:string}>} unwitnessed
 * @param {{ supabase: object, fetchShape?: Function, logger?: object }} deps
 * @returns {Promise<{ attempted: number, written: number, skipped: number, failed: number }>}
 */
export async function reconcileUnwitnessedMerges(unwitnessed, { supabase, fetchShape = fetchPrShape, logger = console }) {
  let written = 0, skipped = 0, failed = 0;
  for (const m of (unwitnessed || [])) {
    try {
      const shape = fetchShape(m.prNumber, m.repo);
      const workKey = deriveWorkKey(shape);
      const verdict = { overall: 'observe-only', prNumber: m.prNumber, workKey, tier: 'standard', rungs: [] };
      const result = await writeMergeWitnessTelemetry(supabase, verdict, { repo: m.repo, lane: RECONCILE_LANE, logger });
      if (!result.ok) { failed++; continue; }
      if (result.skipped) skipped++; else written++;
    } catch (e) {
      failed++;
      logger.warn?.(`⚠️  reconcile sweep failed for ${m.repo}#${m.prNumber} (non-fatal): ${e?.message || e}`);
    }
  }
  return { attempted: (unwitnessed || []).length, written, skipped, failed };
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[ship-witness-reconcile] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);

  const merges = PLATFORM_REPOS.flatMap((r) => defaultFetchMergedPlatformPRs(r.owner, r.name, WITNESS_CUTOVER_ISO, defaultGhRunner));
  // QF-20260719-201: paginated read — the bare select truncated at PostgREST's 1000-row default.
  let telemetryRows;
  try { telemetryRows = await fetchAllWitnessRows(supabase); }
  catch (e) { console.error('[ship-witness-reconcile] ' + e.message); process.exit(1); }

  const { unwitnessed } = detectUnwitnessedMerges(merges, telemetryRows);
  const summary = await reconcileUnwitnessedMerges(unwitnessed, { supabase });

  if (JSON_MODE) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(`[ship-witness-reconcile] ${summary.attempted} unwitnessed merge(s) found -> ${summary.written} backfilled, ${summary.skipped} already-witnessed (race), ${summary.failed} failed`);
  }
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[ship-witness-reconcile] UNHANDLED: ' + (e?.message || e)); process.exit(0); });
}
