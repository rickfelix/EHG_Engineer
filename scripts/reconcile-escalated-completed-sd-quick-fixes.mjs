#!/usr/bin/env node
/**
 * Reconcile quick_fixes rows stuck status='escalated' after their target SD completed.
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-C (FR-1).
 *
 * THE GAP THIS CLOSES: escalated_to_sd_id records a promise ("this QF's work is tracked
 * as SD X"). Nothing ever fulfils that promise once X reaches status='completed' — the
 * row sits status='escalated' forever, disposition_reason_code stuck at the MINT-TIME
 * classification ('escalated_to_sd', written by leo-create-sd.js --from-qf), and
 * resolution_sd_id NULL. This was a DELIBERATE prior exclusion
 * (database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql:63: "deliberately
 * NOT chased via escalated_to_sd_id, out of scope, per plan"), reversed here per the
 * parent CAPA's finding that leaving it untracked is itself a work-state-truth defect.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISPOSITION_REASON_CODE = 'escalated_sd_completed';
const DISPOSED_BY = 'scripts/reconcile-escalated-completed-sd-quick-fixes.mjs';

/**
 * Fetch the target population: quick_fixes rows status='escalated' whose escalated_to_sd_id
 * points at a strategic_directives_v2 row with status='completed'.
 * @param {object} supabase
 * @returns {Promise<Array<{id:string, escalated_to_sd_id:string, sd_key:string}>>}
 */
export async function findTargetRows(supabase) {
  const { data: escalated, error: escErr } = await supabase
    .from('quick_fixes')
    .select('id, escalated_to_sd_id, disposition_reason_code, resolution_sd_id')
    .eq('status', 'escalated')
    .not('escalated_to_sd_id', 'is', null);
  if (escErr) {
    const e = new Error(`[reconcile-escalated] fetch escalated rows failed: ${escErr.message}`);
    e.code = 'RECONCILE_FETCH_FAILED';
    throw e;
  }
  const candidates = (escalated || []).filter((r) => r.resolution_sd_id == null);
  if (candidates.length === 0) return [];

  const targetIds = [...new Set(candidates.map((r) => r.escalated_to_sd_id))];
  const { data: sds, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status')
    .in('id', targetIds);
  if (sdErr) {
    const e = new Error(`[reconcile-escalated] fetch target SDs failed: ${sdErr.message}`);
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
