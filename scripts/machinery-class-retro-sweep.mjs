#!/usr/bin/env node
/**
 * machinery-class-retro-sweep.mjs — SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-6).
 *
 * DETECTION-ONLY: runs the FR-2 machinery-class classifier + FR-1/FR-3/FR-4 activation-
 * evidence checks over the last 30 days of completed SDs/QFs, and reports which ones would
 * have FAILED activation gating under the amended Definition-of-Done (classified as
 * machinery-class, currently UNWIRED — no real-event evidence, no ARMED registration).
 *
 * This IS the smoke test of the classifier's validity: it is expected to re-find the named
 * dormant specimens (cold-recovery, eva-scheduler watcher, capture gauge, remediation
 * router) that motivated this SD in the first place. No re-adjudication, no gate re-run
 * against those SDs, and — critically — ZERO writes. Read-only by construction.
 *
 * Usage: node scripts/machinery-class-retro-sweep.mjs [--days N] [--json]
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { classifyMachineryClass } from '../lib/machinery-class/classify.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import { evaluateActivationEvidence, checkActivationEvidence, checkArmedRegistration } from './modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js';

const DAYS_ARG_IDX = process.argv.indexOf('--days');
const DAYS = DAYS_ARG_IDX !== -1 ? Number(process.argv[DAYS_ARG_IDX + 1]) || 30 : 30;
const JSON_OUTPUT = process.argv.includes('--json');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Fetch completed SDs from the last N days. Exported for tests (mockable client).
 * @param {object} sb
 * @param {number} days
 * @returns {Promise<object[]>}
 */
export async function fetchRecentCompletedSds(sb, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  // Paginated — SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: every row is
  // classified/evaluated below (strategic_directives_v2 is unbounded-growth).
  try {
    return await fetchAllPaginated(() => sb
      .from('strategic_directives_v2')
      .select('sd_key, id, title, description, scope, status, sd_type, key_changes, completion_date, metadata, parent_sd_id')
      .eq('status', 'completed')
      .gte('completion_date', since)
      .order('id', { ascending: true }));
  } catch (error) {
    console.error(`[machinery-class-retro-sweep] load failed: ${error.message}`);
    return [];
  }
}

/**
 * Classify + evaluate one SD's activation state. Pure composition of the FR-2/FR-1 checks;
 * exported so the "would-have-failed" determination is independently testable.
 * @param {object} sb
 * @param {object} sd
 * @returns {Promise<{ sd_key: string, machineryClass: boolean, kind: string, state: string }|null>}
 */
export async function evaluateSdForSweep(sb, sd) {
  const classification = classifyMachineryClass(sd);
  if (!classification.machineryClass) return null;
  const [hasActivatedEvidence, hasArmedRegistration] = await Promise.all([
    checkActivationEvidence(sb, sd),
    checkArmedRegistration(sb, sd),
  ]);
  const evaluation = evaluateActivationEvidence(sd, { hasActivatedEvidence, hasArmedRegistration });
  return { sd_key: sd.sd_key, machineryClass: true, kind: evaluation.machineryKind, state: evaluation.state };
}

/**
 * Run the full sweep. Read-only — no writes anywhere in this function.
 * @param {object} sb
 * @param {number} days
 * @returns {Promise<{ totalScanned: number, machineryClassCount: number, wouldHaveFailed: object[] }>}
 */
export async function runSweep(sb, days) {
  const sds = await fetchRecentCompletedSds(sb, days);
  const results = [];
  for (const sd of sds) {
    const result = await evaluateSdForSweep(sb, sd);
    if (result) results.push(result);
  }
  const wouldHaveFailed = results.filter((r) => r.state === 'UNWIRED');
  return { totalScanned: sds.length, machineryClassCount: results.length, wouldHaveFailed };
}

async function main() {
  const { totalScanned, machineryClassCount, wouldHaveFailed } = await runSweep(supabase, DAYS);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ days: DAYS, totalScanned, machineryClassCount, wouldHaveFailed }, null, 2));
    return;
  }

  console.log(`[machinery-class-retro-sweep] ${DAYS}-day window: ${totalScanned} completed SD(s) scanned, ${machineryClassCount} classified machinery-class.`);
  if (wouldHaveFailed.length === 0) {
    console.log('  No machinery-class SD would have failed activation gating (all ACTIVATED or ARMED).');
  } else {
    console.log(`  ${wouldHaveFailed.length} machinery-class SD(s) would have FAILED activation gating (UNWIRED — no real-event evidence, no ARMED registration):`);
    for (const r of wouldHaveFailed) console.log(`    - ${r.sd_key} (${r.kind})`);
  }
  console.log('\nDetection only — zero writes, no re-adjudication of these SDs.');
}

// Entrypoint guard (matches coordinator-backlog-rank.mjs's own convention): importing this
// module must NOT run the DB-touching sweep.
const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[machinery-class-retro-sweep] fatal:', err?.message || err);
    process.exitCode = 1;
  });
}
