#!/usr/bin/env node
/**
 * Chairman-apply retrospective sweep — CLI (SD-LEO-INFRA-RETROSPECTIVE-SWEEP-EVERY-001).
 *
 * READ-ONLY. Audits what already shipped under a chairman apply-gate that read as protection while
 * providing none. Remediates nothing: where a live object diverges from what a chairman approved,
 * that is chairman-facing by construction.
 *
 * *** THIS AUDIT HAS NOT YET CONCLUDED THAT ANYTHING IS FINE. READ BEFORE THE OUTPUT. ***
 *
 * Live probing (FR-4) IS NOT BUILT. `live.probed` is hardcoded false, so of five verdicts only
 * UNVERIFIABLE is reachable and EXIT CODE 1 CANNOT OCCUR. A clean exit 0 means "no control
 * failed", NOT "no divergence exists" -- nothing has yet compared a live database object against
 * what a chairman approved. Every row reports the reason it is unanswerable, which is the honest
 * state and is the whole deliverable at this stage: a REMEDIATION BACKLOG naming what must exist
 * before each item can be judged.
 *
 * Stated first and this loudly because the failure mode is specific: a reader who sees 92 rows,
 * zero findings and exit 0 concludes the gate was fine all along -- the exact false-clean this
 * audit was commissioned to disprove.
 *
 * FR-4 (live probing) and FR-5 are UNIMPLEMENTED. That is a deferral, not a completion; see the
 * deferral record written to the feedback channel rather than trusting this comment alone.
 *
 * EXPECTED OUTPUT SHAPE (FR-2 AC-5/AC-13/AC-14), so a correct run is not "fixed" into a wrong one.
 * Over the live 106-item population about 31% carry a named .sql artifact and the rest carry none,
 * giving a histogram of roughly {NO_ARTIFACT: 73, CLASS_UNPROBEABLE: 33}. These counts are a
 * SNAPSHOT of live tables that grow; treat a drift as a prompt to re-measure, never as evidence the
 * population was loosened. Once probing lands,
 * APPLIED still requires an object-naming approval AND an artifact AND a live probe, and BOTH
 * approval-and-artifact measured only 4 of the original 43 SD-arm members -- so APPLIED stays rare,
 * and a run reporting many APPLIED has loosened a rule rather than found good news. The conclusion
 * is robust to the predicate choice: under all three candidate readings APPLIED lands at 11, 5 or 4.
 *
 * Usage: node scripts/audits/chairman-apply-retrospective-sweep.mjs [--json] [--limit N]
 * Exit: 0 nothing actionable · 1 chairman-actionable findings · 2 a CONTROL failed (never trust the run)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  VERDICT, UNVERIFIABLE_REASON, POPULATION_ARMS,
  classifyItem, checkManifest, checkBaselines, reasonHistogram, exitCodeFor,
  findUnconsumedKeys, deriveScopeGaps, EXCLUDED_KEYS,
} from '../../lib/audits/chairman-apply-sweep.js';
// Collectors live in lib/ because both of this module's real defects were in THEM, and the suite
// could not reach them while they sat behind the Supabase import in this file.
import {
  isQuickFixMember, isCompletionFlagMember, buildPopulation, addCompletionFlagArm, buildEvidence,
} from '../../lib/audits/chairman-apply-collectors.js';

// quiet: dotenv writes a banner to STDOUT, which makes --json output unparseable.
dotenv.config({ quiet: true });

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
  // EVERY source_arm below is MEASURED, not asserted. The first version of this manifest annotated
  // arms from the PRD narrative, and when the arm-aware check landed it immediately falsified three
  // of eight: each seed was a genuine member, just reached via a different arm than claimed. The
  // "every seed is sole-reach for its arm" property had been an authoring-time belief that no
  // control could see, which is exactly why the check now takes population rows rather than ids.
  { identifier: 'SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001', source_arm: 'requires_chairman_apply', note: 'FALSE-boolean value shape (ruled_out) on a COMPLETED SD' },
  { identifier: 'SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A', source_arm: 'chairman_gated_migration', note: 'migration arm' },
  { identifier: 'SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001', source_arm: 'chairman_gated', note: 'PROSE value shape; the population only DRAFT' },
  { identifier: 'SD-LEO-INFRA-SECURITY-HYGIENE-RLS-SEARCHPATH-001', source_arm: 'chairman_gated', note: 'flagship RLS case — reached via chairman_gated, NOT requires_chairman_apply as first annotated' },
  { identifier: 'SD-LEO-INFRA-ENABLE-TRI-PARTY-001', source_arm: 'chairman_gate', note: 'CANCELLED — status is a disposition, never a filter' },
  { identifier: 'SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001', source_arm: 'apply_authority', note: 'CHAIRMAN-ONLY carried as a PREFIX, not an equality' },
  { identifier: 'SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F', source_arm: 'requires_chairman_apply_note', note: 'prose note arm' },
  { identifier: 'SD-EHG-IDEATION-PIPELINE-SEAMS-001', source_arm: 'requires_chairman_ddl', note: 'in_progress' },
  { identifier: 'SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001', source_arm: 'chairman_gated_ddl', note: '' },
  { identifier: 'SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001', source_arm: 'migration_requires_chairman_apply', note: '' },
  { identifier: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001', source_arm: 'irreversible_exec_chairman_gated', note: 'status=active' },
  { identifier: 'SD-EHG-IDEATION-PIPELINE-SEAMS-001', source_arm: 'chairman_gated_fence_20260726', note: 'same SD, second arm — a live coordinator fence' },
  { identifier: 'SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B', source_arm: 'chairman_gated_migration_possible', note: '' },
  { identifier: 'SD-FDBK-GEN-FIX-TRG-ENFORCE-001', source_arm: 'apply_to_prod_requires_user_go', note: '' },
  { identifier: 'SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001', source_arm: 'chairman_enum_migration_authorization', note: 'ALTER TYPE venture_origin_type ADD VALUE' },
  { identifier: 'SD-LEO-INFRA-ADAM-DURABLE-STANDING-001', source_arm: 'may_require_ddl', note: 'DRAFT status' },
  { identifier: 'PRD-PRD-SD-LEO-INFRA-LAUNCH-MODE-POLICY-002', source_arm: 'gated_ddl', note: 'PRD-borne DDL gate — reachable only after the population read PRD metadata' },
  { identifier: 'SD-LEO-INFRA-MIGRATION-DEPLOY-DRIFT-001', source_arm: 'chairman_approval', note: 'FR-1 apply of ~9 migration gaps — the member that admitted this arm' },
  { identifier: 'SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001', source_arm: 'chairman_authorized', note: 'additive migrations authorised via the governed apply path' },
  { identifier: 'SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001', source_arm: 'chairman_authorization', note: 'the CHARTER of the gate this audit examines' },
  { identifier: 'SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-D', source_arm: 'chairman_preauthorization', note: 'conditional pre-authorised flip' },
  { identifier: 'QF-20260719-281', source_arm: 'quick_fixes_freetext', note: 'TS-21: the arm must RESOLVE this, not merely accept the manifest shape' },
  { identifier: 'FEEDBACK-008c71b8-29df-48b1-9ded-ecdb464e5273', source_arm: 'completion_flag_index', note: 'unreachable from SD metadata by construction' },
]);

/** Directional floors. A count may only GROW; a non-zero check cannot see a predicate error. */
const BASELINE = Object.freeze({
  requires_chairman_apply: 29, chairman_gated_migration: 6, chairman_gated: 3,
  chairman_gate: 2, apply_authority: 2, requires_chairman_apply_note: 2,
  // The free-text arms are 48% of the population and previously carried NO floor, so both could
  // have collapsed to zero with baselines.ok true and exit 0.
  quick_fixes_freetext: 20, completion_flag_index: 19,
  // The nine keys admitted after reading their values. Floors are the measured counts.
  requires_chairman_ddl: 1, chairman_gated_ddl: 1, migration_requires_chairman_apply: 1,
  irreversible_exec_chairman_gated: 1, chairman_gated_fence_20260726: 1,
  chairman_gated_migration_possible: 1, apply_to_prod_requires_user_go: 1,
  chairman_enum_migration_authorization: 1, may_require_ddl: 2,
  chairman_authorized: 10, chairman_authorization: 3, chairman_preauthorization: 1,
  gated_ddl: 1,
  chairman_approval: 4,
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

  let sds; let qfs; let feedbackRows; let prds; let controlsOk = true;
  const controlFailures = [];
  try {
    sds = await fetchAllReconciled(supabase, 'strategic_directives_v2', 'id,sd_key,status,metadata');
    qfs = await fetchAllReconciled(supabase, 'quick_fixes', 'id,title,description,status');
    feedbackRows = await fetchAllReconciled(supabase, 'feedback', 'id,title,description,status,category,metadata');
    prds = await fetchAllReconciled(supabase, 'product_requirements_v2', 'id,metadata,status');
  } catch (err) {
    console.error(`CONTROL FAILURE: ${err.message}`);
    process.exitCode = 2;
    return;
  }

  const population = addCompletionFlagArm(buildPopulation(sds, qfs, METADATA_ARMS, [
    ...prds.map((r) => ({ identifier: `PRD-${r.id}`, metadata: r.metadata, status: r.status, source: 'product_requirements_v2' })),
    ...feedbackRows.map((r) => ({ identifier: `FEEDBACK-${r.id}`, metadata: r.metadata, status: r.status, source: 'feedback' })),
  ]), feedbackRows);
  const manifest = checkManifest(MANIFEST, population, POPULATION_ARMS);
  if (!manifest.ok) {
    controlsOk = false;
    for (const m of manifest.missing) controlFailures.push(`manifest seed unreachable: ${m.identifier} (${m.source_arm})`);
    for (const a of manifest.unseededArms) controlFailures.push(`arm carries no manifest seed: ${a}`);
    for (const u of manifest.armsUnknown) controlFailures.push(
      `manifest seed ${u.identifier} arm claim UNCHECKABLE (caller passed no arms)`);
    for (const w of manifest.wrongArm) controlFailures.push(
      `manifest seed ${w.identifier} no longer reached via its arm ${w.source_arm} (observed: ${w.observed_arms.join(',')})`);
  }

  const observedPerArm = {};
  for (const arm of POPULATION_ARMS) observedPerArm[arm] = population.filter((p) => p.arms.includes(arm)).length;
  // FR-7 AC-3. Runs over EVERY SD, not just current members — the whole point is to see keys no
  // arm reads. A key with sole-reach > 0 means the population is provably incomplete.
  const unconsumed = findUnconsumedKeys([
    ...sds.map((sd) => ({ identifier: sd.sd_key, metadata: sd.metadata, source: 'strategic_directives_v2' })),
    ...prds.map((r) => ({ identifier: `PRD-${r.id}`, metadata: r.metadata, source: 'product_requirements_v2' })),
    ...feedbackRows.map((r) => ({ identifier: `FEEDBACK-${r.id}`, metadata: r.metadata, source: 'feedback' })),
  ], POPULATION_ARMS, undefined, population.map((r) => r.identifier));
  if (!unconsumed.ok) {
    controlsOk = false;
    for (const u of unconsumed.unreachableMembers) {
      controlFailures.push(
        `UNREACHABLE MEMBER ${u.identifier} [${u.source}] carries ${u.arms.join(',')} but NO arm reaches it — buildPopulation reads strategic_directives_v2 metadata only`);
    }
    for (const f of unconsumed.findings.filter((x) => x.soleReach > 0)) {
      controlFailures.push(
        `UNCONSUMED_KEY ${f.key} [${f.sources.join(',')}]: ${f.members} rows, ${f.soleReach} reached by NO arm — admit it or add it to EXCLUDED_KEYS with a reason`);
    }
  }
  const baselines = checkBaselines(observedPerArm, BASELINE, POPULATION_ARMS);
  for (const a of baselines.armsWithoutFloor) {
    controlsOk = false;
    controlFailures.push(`arm has NO baseline floor: ${a}`);
  }
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
      // Stamped by buildPopulation via matchesAuthorityPrefix. Emitted here because a value
      // computed and never read is the same dead control as a function never called — the fix
      // for that finding had only relocated the deadness from uninvoked to unread.
      chairman_only: item.chairmanOnly === true,
      verdict: result.verdict, reason: result.reason, inputs: result.inputs,
      approval_identifiers: evidence.approval.identifiers,
      artifact_path: evidence.artifact.path,
      surplus_unattributable: result.surplusUnattributable === true,
    };
  });

  // Derived from the evidence actually built, so it cannot drift from the code it describes.
  const probingImplemented = rows.some((r) => r.inputs && r.inputs.live);

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
    unconsumed_keys: unconsumed.findings,
    unreachable_members: unconsumed.unreachableMembers,
    scope_gaps: deriveScopeGaps(unconsumed.unreachableMembers),
    probing_implemented: probingImplemented,
    exit_1_reachable: probingImplemented,
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
    console.log(`
unconsumed-key scan: ${unconsumed.findings.length} candidate keys across `
      + `${new Set([...sds.map(()=>'sd'), ...prds.map(()=>'prd'), ...feedbackRows.map(()=>'fb')]).size} tables, `
      + `${unconsumed.findings.filter((f) => f.soleReach > 0).length} with sole-reach, `
      + `${unconsumed.unreachableMembers.length} unreachable members. `
      + `${Object.keys(EXCLUDED_KEYS).length} keys suppressed by EXCLUDED_KEYS.`);
    // Unconditional, never an else-branch on "no findings": a reader seeing zero findings and
    // exit 0 must not read that as the gate having been fine. Nothing has compared a live object
    // to an approval yet.
    if (!probingImplemented) {
      console.log('\n*** NOT A CLEAN BILL OF HEALTH ***');
      console.log('Live probing is NOT implemented, so APPLIED / DIVERGENT / NOT-APPLIED are');
      console.log('UNREACHABLE and exit 1 cannot occur. Exit 0 means "no control failed" -- it');
      console.log('does NOT mean no divergence exists. Nothing has compared a live database');
      console.log('object against what a chairman approved. That comparison is FR-4, still to build.');
    }
    const gaps = deriveScopeGaps(unconsumed.unreachableMembers);
    if (gaps.length) {
      console.log('\n*** SCOPE GAPS (real gates the population cannot reach) ***');
      for (const g of gaps) console.log(`  ${g.source}: ${g.count} row(s) - ${g.why_unreachable}`);
    }

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
