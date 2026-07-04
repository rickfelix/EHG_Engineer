#!/usr/bin/env node
/**
 * Retroactive batch backfill driver — SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-2.
 *
 * Drives scripts/ship-witness-retroactive.mjs's runRetroactiveEvaluation() over a list of
 * pre-cutover PRs (the ~62-PR backlog predating the witness machinery), deriving each PR's
 * work-key via the shared heuristic (FR-4) from its live branch name / title. Historical audit
 * completeness ONLY — WITNESS_CUTOVER_ISO and computeAdoptionReadiness's day-window walk
 * (lib/ship/witness-adoption.mjs) are unmodified, so backfilling these rows does NOT advance the
 * 7-day readiness clock; pre-cutover merges remain excluded from the streak by construction.
 * Idempotent (depends on FR-5's writeMergeWitnessTelemetry fix) — safe to re-run.
 *
 * Usage: node scripts/ship-witness-retroactive-batch.mjs --list path/to/prs.json [--json]
 *   prs.json: [{ "repo": "owner/name", "pr": 1234 }, ...]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runRetroactiveEvaluation } from './ship-witness-retroactive.mjs';
import { deriveWorkKey } from '../lib/ship/work-key-derivation.mjs';

function defaultGhRunner(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Fetch a PR's headRefName + title for work-key derivation (best-effort). */
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
 * Batch-drive runRetroactiveEvaluation over a PR list. Fail-open per item — one PR's failure
 * never aborts the batch. Exported for unit testing without a live gh/DB round-trip.
 * @param {Array<{repo:string, pr:number}>} prList
 * @param {{ supabase: object, fetchShape?: Function, evaluate?: Function, logger?: object }} deps
 * @returns {Promise<{ attempted: number, succeeded: number, failed: number, results: Array }>}
 */
export async function runRetroactiveBatch(prList, { supabase, fetchShape = fetchPrShape, evaluate = runRetroactiveEvaluation, logger = console }) {
  let succeeded = 0, failed = 0;
  const results = [];
  for (const { repo, pr } of (prList || [])) {
    try {
      const shape = fetchShape(pr, repo);
      const workKey = deriveWorkKey(shape);
      const result = await evaluate({
        repo, pr, workKey, tier: 'standard',
        reason: 'SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-2 batch backfill (pre-cutover historical audit completeness — does not advance the readiness clock)',
        supabase,
      });
      results.push(result);
      succeeded++;
    } catch (e) {
      failed++;
      logger.warn?.(`⚠️  retroactive batch failed for ${repo}#${pr} (non-fatal): ${e?.message || e}`);
      results.push({ repo, prNumber: pr, error: e?.message || String(e) });
    }
  }
  return { attempted: (prList || []).length, succeeded, failed, results };
}

async function main() {
  const argv = process.argv.slice(2);
  const listIdx = argv.indexOf('--list');
  if (listIdx === -1 || !argv[listIdx + 1]) {
    console.error('Usage: node scripts/ship-witness-retroactive-batch.mjs --list path/to/prs.json [--json]');
    process.exit(2);
  }
  const jsonMode = argv.includes('--json');
  const prList = JSON.parse(readFileSync(argv[listIdx + 1], 'utf8'));

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const summary = await runRetroactiveBatch(prList, { supabase });
  if (jsonMode) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(`[ship-witness-retroactive-batch] ${summary.attempted} PR(s) processed: ${summary.succeeded} succeeded, ${summary.failed} failed`);
  }
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[ship-witness-retroactive-batch] UNHANDLED: ' + (e?.message || e)); process.exit(0); });
}
