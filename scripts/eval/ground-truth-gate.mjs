#!/usr/bin/env node
/**
 * ground-truth-gate.mjs — ADVISORY adversarial-split signal for
 * model_capability_reference (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-5).
 *
 * ADVISORY ONLY — MUST NEVER FLIP ROUTING TRUST (RISK e25f3adf C1, sole-writer
 * invariant). The CANONICAL binder is lib/eval/ground-truth-gate.mjs
 * `bindTrustedForRouting` (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-C, child C):
 * it is the SOLE code path allowed to set trusted_for_routing=true, and it binds
 * ONLY against an INDEPENDENTLY-ADJUDICATED oracle, stamping binding_id + bound_at.
 *
 * This EVAL-001 script computes and REPORTS an adversarial-split heuristic over
 * already-graded rows (a task with a clears_bar=true row AND a clears_bar=false
 * row from a different model/effort — a positives-only reproduction is a rubber
 * stamp and does not count). But that split is SELF-GRADED, not adjudicated, so
 * under the fail-closed doctrine it must NOT bind: this script performs NO write
 * to trusted_for_routing. It surfaces the signal and exits; binding is the child-C
 * binder's job alone.
 *
 * Consumers (intelligent-switch routing, coordinator dispatch tiering, Solomon
 * mode-resolution) MUST filter trusted_for_routing=true.
 *
 * Run from the repo SHARED ROOT: node scripts/eval/ground-truth-gate.mjs [--dry]
 */
import path from 'path';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — evaluateGroundTruth groups
// EVERY row by task_id; a capped read would silently hide adversarial splits that exist
// past row 1000 with no error, making the gate FAIL-CLOSED for the wrong reason.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
dotenv.config();

/**
 * Pure decision: given graded rows, does the table reproduce an adjudicated
 * result adversarially? Requires, for at least one task_id: a row with
 * clears_bar=true AND a row (different model/effort) with clears_bar=false.
 * Fail-closed: empty/ungraded input -> {pass:false}.
 */
export function evaluateGroundTruth(rows) {
  const graded = (rows || []).filter(r => r.clears_bar !== null && r.clears_bar !== undefined && r.graded_at);
  if (graded.length === 0) {
    return { pass: false, reason: 'FAIL-CLOSED: no graded rows — grading has not run; nothing to reproduce' };
  }
  const byTask = {};
  for (const r of graded) (byTask[r.task_id] ||= []).push(r);
  for (const [taskId, taskRows] of Object.entries(byTask)) {
    const pass = taskRows.find(r => r.clears_bar === true);
    const fail = taskRows.find(r => r.clears_bar === false);
    if (pass && fail && (pass.model_id !== fail.model_id || pass.effort !== fail.effort)) {
      return {
        pass: true,
        reason: `reproduced adjudicated split on ${taskId}: ${pass.model_id}:${pass.effort} clears, ${fail.model_id}:${fail.effort} does not`,
        graded: graded.length,
      };
    }
  }
  return { pass: false, reason: 'FAIL-CLOSED: graded rows exist but no adversarial reproduction (need a pass AND a fail on the same task from different model/effort)' };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('model_capability_reference')
      .select('id, task_id, model_id, effort, clears_bar, graded_at, trusted_for_routing')
      .order('id', { ascending: true }));
  } catch (e) {
    console.error('read failed (table missing = ceremony pending):', e.message);
    process.exitCode = 2;
    return;
  }

  const verdict = evaluateGroundTruth(rows);
  console.log(`ground-truth-gate (ADVISORY): ${verdict.pass ? 'REPRODUCED-SPLIT' : 'BLOCKED'} — ${verdict.reason}`);
  if (!verdict.pass) { process.exitCode = 1; return; }

  // ADVISORY ONLY (RISK e25f3adf C1, sole-writer invariant): this script has no
  // adjudicated oracle, so it MUST NOT flip trusted_for_routing. Binding is owned
  // exclusively by lib/eval/ground-truth-gate.mjs bindTrustedForRouting (child C),
  // which reproduces an independently-adjudicated verdict and stamps binding_id +
  // bound_at. Report the split signal and stop — no row is modified here.
  const gradedCount = rows.filter(r => r.graded_at).length;
  console.log(dry
    ? `--dry: advisory only — ${gradedCount} graded row(s) show an adversarial split; the child-C binder owns any flip (no row modified).`
    : `advisory only — ${gradedCount} graded row(s) show an adversarial split, but routing trust is NOT flipped here; the child-C binder (lib/eval/ground-truth-gate.mjs) is the sole writer. No row modified.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exitCode = 1; return; });
