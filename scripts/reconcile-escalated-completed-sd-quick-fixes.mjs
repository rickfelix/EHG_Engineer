#!/usr/bin/env node
/**
 * Reconcile quick_fixes rows whose escalated_to_sd_id target SD has completed but whose
 * escalation promise was never fulfilled. SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-C (FR-1).
 *
 * THE GAP THIS CLOSES: escalated_to_sd_id records a promise ("this QF's work is tracked
 * as SD X"). Nothing ever fulfils that promise once X reaches status='completed' — the
 * row sits unreconciled forever, disposition_reason_code stuck at the MINT-TIME
 * classification ('escalated_to_sd', written by leo-create-sd.js --from-qf), and
 * resolution_sd_id NULL. This was a DELIBERATE prior exclusion
 * (database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql:63: "deliberately
 * NOT chased via escalated_to_sd_id, out of scope, per plan"), reversed here per the
 * parent CAPA's finding that leaving it untracked is itself a work-state-truth defect.
 *
 * QF-20260911-059: the original selector required status='escalated', so a row re-opened
 * to 'in_progress' (e.g. after its claiming session died) fell out of this script's view
 * entirely even though its escalation promise was identical — the specimen, QF-20260906-881,
 * sat in_progress for days after its target SD (and PR) shipped. Selector widened to drop the
 * status filter: escalated_to_sd_id set + resolution_sd_id still NULL + target SD completed,
 * independent of current status. A row already disposed for an unrelated reason (disposition
 * set to something other than what this script writes) is at theoretical risk of being
 * re-disposed if its escalated_to_sd_id also happens to point at a completed SD — checked
 * against live data at fix time and no such row exists today (the one close candidate,
 * QF-20260808-010 / disposition='premise_unverified_stale', targets a CANCELLED SD, so the
 * completedIds filter below excludes it regardless of this widening). Not yet a structural
 * guard — see the unit test below for the selector's documented actual behavior.
 *
 * MECHANISM: the single canonical writer, lib/quick-fix/status-writer.cjs
 * setQuickFixStatus() — never a hand-rolled .update(). Target status is 'closed', not
 * 'completed': 'completed' carries an unrelated completed_requires_verification CHECK
 * (tests_passing/uat_verified/force_completed) this reconciliation has no business
 * satisfying. disposition_reason_code is FREE TEXT — deliberately NOT the separate
 * `disposition` column (a 5-value CHECK owned by scripts/coordinator-stale-qf-disposition-
 * sweep.mjs for an unrelated population; none of its values describe this case).
 *
 * Dry-run by default, mirroring scripts/one-off/backfill-stranded-escalated-qfs.mjs and
 * scripts/coordinator-stale-qf-disposition-sweep.mjs. Every run (dry-run AND live) writes
 * a manifest of each target row's pre-reconciliation state.
 *
 * Usage:
 *   node scripts/reconcile-escalated-completed-sd-quick-fixes.mjs             (dry-run)
 *   node scripts/reconcile-escalated-completed-sd-quick-fixes.mjs --dry-run   (explicit)
 *   node scripts/reconcile-escalated-completed-sd-quick-fixes.mjs --live
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { setQuickFixStatus } from '../lib/quick-fix/status-writer.cjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISPOSITION_REASON_CODE = 'escalated_sd_completed';
const DISPOSED_BY = 'scripts/reconcile-escalated-completed-sd-quick-fixes.mjs';

/**
 * Fetch the target population: quick_fixes rows with an unfulfilled escalated_to_sd_id
 * promise -- NOT YET DISPOSITIONED BY THIS RECONCILER -- whose target strategic_directives_v2
 * row has status='completed'. QF-20260911-059: matched on escalated_to_sd_id/resolution_sd_id
 * alone, regardless of the row's current status -- a row re-opened away from 'escalated'
 * (e.g. to 'in_progress') carries the exact same unfulfilled promise.
 *
 * QF-20260911-983: the "not yet reconciled" signal is disposition_reason_code IS NULL, NOT
 * resolution_sd_id IS NULL. scripts/qf-link-resolution.mjs (an operator-confirmed, separately
 * invoked tool) can set resolution_sd_id on an escalated row WITHOUT ever setting disposition:
 * its qfOpen check explicitly excludes status='escalated' rows from its own cancel path (by
 * design -- "explicitly awaiting an SD, not simply closed-loop work"), so it falls through to a
 * raw .update({resolution_sd_id}) that stamps nothing else. The old resolution_sd_id-based
 * filter then treated that row as "already reconciled" forever, since this reconciler's own
 * candidate set never saw it again. Live-measured 2026-09-12: QF-20260903-379 and
 * QF-20260903-433 both carry resolution_sd_id === escalated_to_sd_id (set by qf-link-resolution.mjs)
 * with disposition_reason_code still NULL and status stuck at 'escalated' -- exactly this gap.
 * Verified no cross-population risk: 0 of 143 live escalated_to_sd_id rows have
 * disposition_reason_code NULL AND resolution_sd_id pointing at a DIFFERENT SD than
 * escalated_to_sd_id (the shape that would make this widening pick the wrong target).
 * @param {object} supabase
 * @returns {Promise<Array<{id:string, escalated_to_sd_id:string, sd_key:string}>>}
 */
export async function findTargetRows(supabase) {
  // Full reads, not capped samples -- PostgREST silently clamps an un-.range()'d select to
  // POSTGREST_MAX_ROWS (1000), which count-truncation-diff-lint correctly flags as a NEW
  // unbounded read. Both queries here must see the WHOLE population (candidate rows /
  // matching SD ids), so fetchAllPaginated is the right tool, not a declared sampling cap.
  let escalated;
  try {
    escalated = await fetchAllPaginated(() => supabase
      .from('quick_fixes')
      .select('id, escalated_to_sd_id, disposition_reason_code, resolution_sd_id')
      .not('escalated_to_sd_id', 'is', null));
  } catch (err) {
    const e = new Error(`[reconcile-escalated] fetch escalated rows failed: ${err.message}`);
    e.code = 'RECONCILE_FETCH_FAILED';
    throw e;
  }
  const candidates = (escalated || []).filter((r) => r.disposition_reason_code == null);
  if (candidates.length === 0) return [];

  const targetIds = [...new Set(candidates.map((r) => r.escalated_to_sd_id))];
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .in('id', targetIds));
  } catch (err) {
    const e = new Error(`[reconcile-escalated] fetch target SDs failed: ${err.message}`);
    e.code = 'RECONCILE_FETCH_FAILED';
    throw e;
  }
  const completedIds = new Map((sds || []).filter((s) => s.status === 'completed').map((s) => [s.id, s.sd_key]));

  return candidates
    .filter((r) => completedIds.has(r.escalated_to_sd_id))
    .map((r) => ({ id: r.id, escalated_to_sd_id: r.escalated_to_sd_id, sd_key: completedIds.get(r.escalated_to_sd_id) }));
}

/**
 * Reconcile one row: transition escalated -> closed via the canonical writer.
 * @param {object} supabase
 * @param {{id:string, escalated_to_sd_id:string}} row
 * @returns {Promise<{id:string, status:string}>}
 */
export async function reconcileRow(supabase, row) {
  return setQuickFixStatus(supabase, row.id, {
    status: 'closed',
    // QF-20260904-757: disposition (the column of record, 5/6-value CHECK) alongside
    // disposition_reason_code (free text) -- this write previously left disposition NULL,
    // which both blocked quick_fixes_closed_requires_disposition's VALIDATE step and
    // undercounted every disposition-keyed report. 'promoted' is correct here: the row's
    // work was tracked to completion via an SD (escalated_to_sd_id/resolution_sd_id both
    // set below), matching the enum's existing 'promoted' meaning elsewhere in the codebase.
    disposition: 'promoted',
    disposition_reason_code: DISPOSITION_REASON_CODE,
    disposed_by: DISPOSED_BY,
    disposed_at: new Date().toISOString(),
    resolution_sd_id: row.escalated_to_sd_id,
  });
}

function writeManifest(targets, mode) {
  const outDir = path.join(__dirname, 'one-off', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `${stamp}-reconcile-escalated-manifest.json`);
  fs.writeFileSync(outPath, JSON.stringify({ mode, generated_at: new Date().toISOString(), targets }, null, 2));
  return outPath;
}

export async function run({ supabase, live = false, log = console.log } = {}) {
  const targets = await findTargetRows(supabase);
  log(`Found ${targets.length} escalated quick_fixes row(s) whose target SD has completed.`);
  for (const t of targets) log(`  ${t.id} -> ${t.sd_key} (${t.escalated_to_sd_id})`);

  const manifestPath = writeManifest(targets, live ? 'live' : 'dry-run');
  log(`Manifest written: ${manifestPath}`);

  if (!live) {
    log('Dry-run — no writes made. Pass --live to reconcile.');
    return { targets, reconciled: [] };
  }

  const reconciled = [];
  for (const t of targets) {
    const result = await reconcileRow(supabase, t);
    log(`  reconciled ${t.id}: -> ${result.status}`);
    reconciled.push(result);
  }
  log(`Reconciled ${reconciled.length} row(s).`);
  return { targets, reconciled };
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await run({ supabase, live });
}

import { isMainModule } from '../lib/utils/is-main-module.js';
if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('[reconcile-escalated] FATAL:', e && e.message);
    process.exitCode = 1;
  });
}
