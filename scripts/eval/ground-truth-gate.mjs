#!/usr/bin/env node
/**
 * ground-truth-gate.mjs — fail-closed trust flip for model_capability_reference
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-5).
 *
 * trusted_for_routing defaults false on every row, and THIS SCRIPT is the only
 * code path allowed to set it true. It does so only when the graded table
 * REPRODUCES >= 1 already-adjudicated result, including an ADVERSARIAL
 * negative (spec Part 5 verification_plan: e.g. a delegate-tier/low-effort
 * failure on a sealed task the high-effort Fable-5 run passed) — a
 * positives-only reproduction is a rubber stamp and does not count.
 *
 * Consumers (intelligent-switch routing, coordinator dispatch tiering, Solomon
 * mode-resolution) MUST filter trusted_for_routing=true. Until this gate
 * passes it exits non-zero and no row is trusted.
 *
 * Run from the repo SHARED ROOT: node scripts/eval/ground-truth-gate.mjs [--dry]
 */
import path from 'path';
import dotenv from 'dotenv';
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
  const { data, error } = await supabase
    .from('model_capability_reference')
    .select('id, task_id, model_id, effort, clears_bar, graded_at, trusted_for_routing');
  if (error) { console.error('read failed (table missing = ceremony pending):', error.message); process.exitCode = 2; return; }

  const verdict = evaluateGroundTruth(data || []);
  console.log(`ground-truth-gate: ${verdict.pass ? 'PASS' : 'BLOCKED'} — ${verdict.reason}`);
  if (!verdict.pass) { process.exitCode = 1; return; }

  if (dry) { console.log('--dry: trust flip skipped'); return; }
  const gradedIds = (data || []).filter(r => r.graded_at).map(r => r.id);
  const up = await supabase
    .from('model_capability_reference')
    .update({ trusted_for_routing: true })
    .in('id', gradedIds)
    .select('id');
  if (up.error) { console.error('trust flip failed:', up.error.message); process.exitCode = 1; return; }
  console.log(`trusted_for_routing=true on ${up.data.length} graded row(s). Routing consumers may now read them.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exitCode = 1; return; });
