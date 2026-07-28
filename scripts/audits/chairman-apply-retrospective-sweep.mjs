#!/usr/bin/env node
/**
 * Chairman-apply retrospective sweep — CLI (SD-LEO-INFRA-RETROSPECTIVE-SWEEP-EVERY-001).
 *
 * READ-ONLY. Audits what already shipped under a chairman apply-gate that read as protection while
 * providing none. Remediates nothing: where a live object diverges from what a chairman approved,
 * that is chairman-facing by construction.
 *
 * EXPECTED OUTPUT SHAPE (FR-2 AC-5/AC-13/AC-14) — read this before calling a run broken. Measured
 * over the live 43-item population: an object-naming approval exists for 16 (37%), a named .sql
 * artifact for 16 (37%), metadata.migration_files for 0 (0%), and BOTH approval and artifact for
 * just 4 (9%). APPLIED requires all three inputs, so ~91% UNVERIFIABLE IS THE CORRECT ANSWER, not a
 * bug. Materially more APPLIED than 4 means a rule was implemented looser than AC-12 pins it.
 * The conclusion is robust: under all three candidate readings of the predicate APPLIED lands at
 * 11, 5 or 4 of 43, so the deliverable is a REMEDIATION BACKLOG regardless.
 *
 * Usage: node scripts/audits/chairman-apply-retrospective-sweep.mjs [--json] [--limit N]
 * Exit: 0 nothing actionable · 1 chairman-actionable findings · 2 a CONTROL failed (never trust the run)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  VERDICT, UNVERIFIABLE_REASON, POPULATION_ARMS,
  classifyItem, checkManifest, checkBaselines, reasonHistogram, exitCodeFor,
} from '../../lib/audits/chairman-apply-sweep.js';
// Collectors live in lib/ because both of this module's real defects were in THEM, and the suite
// could not reach them while they sat behind the Supabase import in this file.
import {
  isQuickFixMember, isCompletionFlagMember, buildPopulation, addCompletionFlagArm, buildEvidence,
} from '../../lib/audits/chairman-apply-collectors.js';

dotenv.config();

const METADATA_ARMS = POPULATION_ARMS.filter(
  (a) => a !== 'quick_fixes_freetext' && a !== 'completion_flag_index');

const PAGE_SIZE = 1000;

/**
 * The manifest. Every seed is SOLE-REACH for its arm â€” dropping that arm loses it entirely â€” and
 * the set spans arms, VALUE SHAPES (boolean-true, boolean-false, prose) and STATUS SHAPES
 * (completed, draft, cancelled). A missing member HARD-FAILS: a manifest's coverage equals its
 * membership, and a seed that silently stops resolving is a coverage loss that reports as a pass.
 */
const MANIFEST = Object.freeze([
  { identifier: 'SD-LEO-INFRA-SECURITY-HYGIENE-RLS-SEARCHPATH-001', source_arm: 'requires_chairman_apply', note: 'flagship: artifact and live disagree' },
  { identifier: 'SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001', source_arm: 'chairman_gated', note: 'PROSE value shape; the population only draft' },
  { identifier: 'SD-LEO-INFRA-ENABLE-TRI-PARTY-001', source_arm: 'chairman_gate', note: 'cancelled â€” status is a disposition, not a filter' },
  { identifier: 'SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001', source_arm: 'apply_authority', note: 'CHAIRMAN-ONLY carried as a PREFIX, not an equality' },
  { identifier: 'SD-LEO-FIX-GUARD-UNGUARDED-UUID-001', source_arm: 'chairman_gated_migration', note: 'migration arm' },
  { identifier: 'SD-LEO-INFRA-LEO-PROTOCOL-SECTIONS-ID-SEQ-RESYNC-001', source_arm: 'requires_chairman_apply_note', note: 'FALSE-boolean value shape' },
  { identifier: 'QF-20260719-281', source_arm: 'quick_fixes_freetext', note: 'TS-21: the arm must RESOLVE this, not merely accept the manifest shape' },
  { identifier: 'FEEDBACK-008c71b8-29df-48b1-9ded-ecdb464e5273', source_arm: 'completion_flag_index', note: 'the completion-flag arm; unreachable from SD metadata by construction' },
]);

/** Directional floors. A count may only GROW; a non-zero check cannot see a predicate error. */
const BASELINE = Object.freeze({
  requires_chairman_apply: 29, chairman_gated_migration: 6, chairman_gated: 3,
  chairman_gate: 2, apply_authority: 2, requires_chairman_apply_note: 2,
});

/**
 * Fetch every row, then RECONCILE against an exact count and refuse to proceed on a mismatch.
 * Not defensive boilerplate: a bare select returns 1000 of 5441 rows, which yielded a population of
 * ONE and five of six seeds reported ABSENT â€” a truncated read is indistinguishable from a genuinely
 * smaller table, so nothing downstream can catch it. Observed live, not hypothesised.
 */
async function fetchAllReconciled(supabase, table, columns) {
  const head = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (head.error) throw new Error(`${table} count failed: ${head.error.message}`);
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await supabase.from(table).select(columns).order('id').range(from, from + PAGE_SIZE - 1);
    if (page.error) throw new Error(`${table} page@${from} failed: ${page.error.message}`);
    rows.push(...(page.data || []));
    if (!page.data || page.data.length < PAGE_SIZE) break;
  }
  if (rows.length !== head.count) {
    throw new Error(`${table} RECONCILE FAILED: fetched ${rows.length} of ${head.count} â€” refusing to report on a partial read`);
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('CONTROL FAILURE: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    process.exitCode = 2;
    return;
  }
  const supabase = createClient(url, key);

  let sds; let qfs; let feedbackRows; let controlsOk = true;
  const controlFailures = [];
  try {
    sds = await fetchAllReconciled(supabase, 'strategic_directives_v2', 'id,sd_key,status,metadata');
    qfs = await fetchAllReconciled(supabase, 'quick_fixes', 'id,title,description,status');
    feedbackRows = await fetchAllReconciled(supabase, 'feedback', 'id,title,description,status,category');
  } catch (err) {
    console.error(`CONTROL FAILURE: ${err.message}`);
    process.exitCode = 2;
    return;
  }

  const population = addCompletionFlagArm(buildPopulation(sds, qfs, METADATA_ARMS), feedbackRows);
  const ids = population.map((p) => p.identifier);

  const manifest = checkManifest(MANIFEST, ids, POPULATION_ARMS);
  if (!manifest.ok) {
    controlsOk = false;
    for (const m of manifest.missing) controlFailures.push(`manifest seed unreachable: ${m.identifier} (${m.source_arm})`);
    for (const a of manifest.unseededArms) controlFailures.push(`arm carries no manifest seed: ${a}`);
  }

  const observedPerArm = {};
  for (const arm of METADATA_ARMS) observedPerArm[arm] = population.filter((p) => p.arms.includes(arm)).length;
  const baselines = checkBaselines(observedPerArm, BASELINE);
  if (!baselines.ok) {
    controlsOk = false;
    for (const r of baselines.regressions) controlFailures.push(`arm ${r.arm} shrank: floor ${r.floor}, observed ${r.got}`);
  }

  const rows = population.map((item) => {
    const evidence = buildEvidence(item);
    const result = classifyItem(evidence);
    return {
      identifier: item.identifier, source: item.source, status: item.status,
      arms: item.arms, dispositions: item.dispositions,
      verdict: result.verdict, reason: result.reason, inputs: result.inputs,
      approval_identifiers: evidence.approval.identifiers,
      artifact_path: evidence.artifact.path,
      surplus_unattributable: result.surplusUnattributable === true,
    };
  });

  const verdictCounts = {};
  for (const r of rows) verdictCounts[r.verdict] = (verdictCounts[r.verdict] || 0) + 1;
  const histogram = reasonHistogram(rows);

  const report = {
    generated_at: new Date().toISOString(),
    population_size: rows.length,
    per_arm: observedPerArm,
    verdicts: verdictCounts,
    unverifiable_reasons: histogram,
    controls_ok: controlsOk,
    control_failures: controlFailures,
    rows: asJson ? rows : undefined,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== CHAIRMAN-APPLY RETROSPECTIVE SWEEP (read-only) ===');
    console.log(`population: ${rows.length}   sources: ${new Set(rows.map((r) => r.source)).size}`);
    console.log(`per-arm: ${JSON.stringify(observedPerArm)}`);
    console.log(`verdicts: ${JSON.stringify(verdictCounts)}`);
    console.log(`UNVERIFIABLE by reason: ${JSON.stringify(histogram)}`);
    console.log('\nEach reason names what would have to EXIST for the item to become answerable —');
    console.log('that is what makes this a remediation backlog rather than a mostly-empty table.');
    if (!controlsOk) {
      console.log('\n*** CONTROL FAILURE — do not trust this run ***');
      for (const f of controlFailures) console.log(`  - ${f}`);
    }
  }

  process.exitCode = exitCodeFor(rows, controlsOk);
}

main().catch((err) => {
  console.error(`CONTROL FAILURE (uncaught): ${err.message}`);
  process.exitCode = 2;
});
