#!/usr/bin/env node
/**
 * S20-26 simulated-run SYNTHETIC VENTURE FIXTURE — spec §H1 (reuse, don't invent) +
 * §H5-6 teardown/residue assertions (docs/design/s20-26-simulated-run-harness-spec.md).
 *
 * Creates ONE venture row + the pre-S20 artifact/stage-work history, under the EXISTING
 * fixture conventions so every exclusion guard refuses to route it:
 *   - ventures.is_demo = true            (the canonical isFixtureVenture discriminant —
 *                                         lib/eva/chairman-decision-watcher.js:36)
 *   - metadata.synthetic = true          (live ventures table has NO is_synthetic column —
 *                                         smoke-run finding 2026-07-10: pipeline-runner files
 *                                         still write/filter that phantom column; ledger item)
 *   - name 'TEST-HARNESS-S20-<run-id>'   (TEST- fixture family key)
 *   - metadata.is_fixture / metadata.synthetic = true (spec §H1/§H5-6 markers)
 *
 * Pre-seeded history is DATA-DRIVEN: required artifact types for stages 1..19 come from
 * venture_stages.required_artifacts (canonical) with stage_artifact_requirements fallback —
 * the same two sources the REAL artifact gate reads (lib/eva/stage-artifact-precondition.js),
 * so the fixture enters S20 exactly as a real venture would. Stages >=20 artifacts are NEVER
 * pre-seeded — the band's own machinery must produce them (§H2 instrument-don't-mock).
 *
 * Usage:
 *   node scripts/harness/s20-fixture.mjs create [--run-id <id>] [--entry-stage 20]
 *   node scripts/harness/s20-fixture.mjs teardown --run-id <id>
 *   node scripts/harness/s20-fixture.mjs assert-clean --run-id <id>
 *
 * Teardown is IDEMPOTENT and VERIFIED (§H6): the table list is generated from the run
 * journal's touched-tables set UNION the core seed list, and §H5 fence 6's named residue
 * classes (eva_scheduler_queue / eva_scheduler_metrics) are always asserted — a leaked
 * recurring job operates a ghost venture, the worst residue class.
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
import { RunJournal } from '../../lib/harness/run-journal.mjs';
import { isFixtureVenture } from '../../lib/eva/chairman-decision-watcher.js';
import { ARTIFACT_TYPES } from '../../lib/eva/artifact-types.js';

// FR-3/FR-4 mitigation (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001, risk-agent 2026-07-11):
// the finalize-mirror row lives in venture_artifacts scoped to the SAME venture_id as
// every other fixture row, so teardown's blanket venture_id-scoped delete/residue-count
// on that table would otherwise destroy the very evidence it is meant to survive.
// Structurally excluded from both the delete and the residue count below.
const HARNESS_RUN_JOURNAL_TYPE = ARTIFACT_TYPES.HARNESS_RUN_JOURNAL;

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

export const FIXTURE_NAME_PREFIX = 'TEST-HARNESS-S20-';

/**
 * Core tables the fixture itself seeds — teardown always covers these even before any
 * run journal exists. The run's own touched-tables set (journal) EXTENDS this at teardown.
 */
export const CORE_FIXTURE_TABLES = Object.freeze([
  'venture_artifacts',
  'venture_stage_work',
  // §H5 fence 6 named residue classes (ghost-venture scheduler residue):
  'eva_scheduler_queue',
  'eva_scheduler_metrics',
  // decision/gate surfaces the walk may touch even for fixtures (defense-in-depth):
  'chairman_decisions',
]);

/** The venture row contract — pure, so tests pin it without a DB. */
export function buildFixtureVentureRow(runId, { entryStage = 20 } = {}) {
  return {
    name: `${FIXTURE_NAME_PREFIX}${runId}`,
    description: 'Synthetic S20-26 harness fixture venture (spec H1) — never route, never surface to chairman.',
    problem_statement: 'Harness fixture: exercises the S20-26 band through the real machinery with synthetic drivers.',
    target_market: 'synthetic (harness)',
    origin_type: 'synthetic_pipeline',
    current_lifecycle_stage: entryStage,
    status: 'active',
    is_demo: true,        // canonical isFixtureVenture discriminant
    // NOTE (smoke-run finding 2026-07-10): the LIVE ventures table has NO
    // is_synthetic column (only is_demo + is_scaffolding) — the insert failed
    // with a PostgREST schema error. metadata.synthetic below carries the
    // synthetic marker instead. Separately ledgered: pipeline-runner files
    // (synthetic-venture-factory.js:190, pipeline-executor.js:101,
    // circuit-breaker.js:82) still write/filter the phantom column.
    metadata: {
      is_fixture: true,
      synthetic: true,
      harness: {
        run_id: runId,
        spec: 'docs/design/s20-26-simulated-run-harness-spec.md',
        slice: 'H1',
        created_by: 'scripts/harness/s20-fixture.mjs',
      },
      stage_zero: {
        solution: 'Synthetic harness venture — S20-26 band instrumentation target',
        archetype: 'automator',
      },
    },
  };
}

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/** Data-driven pre-S20 required artifact types (same sources as the real gate). */
export async function requiredArtifactsForStages(supabase, fromStage, toStage) {
  const out = new Map(); // artifact_type -> first stage requiring it
  const { data: canonical } = await supabase
    .from('venture_stages')
    .select('stage_number, required_artifacts')
    .gte('stage_number', fromStage)
    .lte('stage_number', toStage);
  for (const row of canonical || []) {
    for (const t of row.required_artifacts || []) {
      if (!out.has(t)) out.set(t, row.stage_number);
    }
  }
  const { data: legacy } = await supabase
    .from('stage_artifact_requirements')
    .select('stage_number, artifact_type')
    .gte('stage_number', fromStage)
    .lte('stage_number', toStage)
    .eq('is_blocking', true);
  for (const row of legacy || []) {
    if (!out.has(row.artifact_type)) out.set(row.artifact_type, row.stage_number);
  }
  return out;
}

export async function createFixture(supabase, runId, { entryStage = 20, journal } = {}) {
  const j = journal || new RunJournal(runId);
  const row = buildFixtureVentureRow(runId, { entryStage });

  // Guard sanity BEFORE insert: the row must trip the canonical fixture discriminant.
  if (!isFixtureVenture(row)) throw new Error('fixture row does not satisfy isFixtureVenture — refusing to create an unguarded fixture');

  const { data: venture, error } = await supabase.from('ventures').insert(row).select('id, name').single();
  if (error) throw new Error(`fixture venture insert failed: ${error.message}`);
  j.append({ kind: 'lifecycle', event: 'fixture venture created', touched_tables: ['ventures'], detail: { venture_id: venture.id, name: venture.name, entry_stage: entryStage } });

  // Pre-S20 history: completed stage-work rows 1..entryStage-1 (same upsert key + live
  // columns the production write-through uses: stage_status/work_type/advisory_data —
  // lib/eva/stage-work-sync.js; work_type comes from venture_stages, NOT NULL).
  const { data: stageTypes } = await supabase
    .from('venture_stages')
    .select('stage_number, work_type')
    .gte('stage_number', 1)
    .lt('stage_number', entryStage);
  const workTypeByStage = new Map((stageTypes || []).map((r) => [r.stage_number, r.work_type]));
  for (let stage = 1; stage < entryStage; stage++) {
    const { error: swErr } = await supabase
      .from('venture_stage_work')
      .upsert({
        venture_id: venture.id,
        lifecycle_stage: stage,
        stage_status: 'completed',
        work_type: workTypeByStage.get(stage) || 'analysis',
        completed_at: new Date().toISOString(),
        advisory_data: { harness_seeded: true, run_id: runId },
      }, { onConflict: 'venture_id,lifecycle_stage' });
    if (swErr) throw new Error(`stage_work seed failed at stage ${stage}: ${swErr.message}`);
  }
  j.append({ kind: 'lifecycle', event: `stage-work history seeded 1..${entryStage - 1}`, touched_tables: ['venture_stage_work'] });

  // Pre-S20 artifacts, data-driven from the real gate's sources. Stages >= entryStage are
  // NEVER seeded (the band's machinery must produce them — §H2).
  const { writeArtifact } = await import('../../lib/eva/artifact-persistence-service.js');
  const required = await requiredArtifactsForStages(supabase, 1, entryStage - 1);
  for (const [artifactType, stage] of required) {
    await writeArtifact(supabase, {
      ventureId: venture.id,
      lifecycleStage: stage,
      artifactType,
      title: `Harness-seeded ${artifactType} (pre-S${entryStage} history)`,
      artifactData: { harness_seeded: true, run_id: runId, seeded_for_stage: stage },
      metadata: { harness: { run_id: runId } },
      source: 'harness-s20-fixture',
    });
  }
  j.append({ kind: 'lifecycle', event: `pre-S${entryStage} artifact history seeded (${required.size} types, data-driven from venture_stages.required_artifacts)`, touched_tables: ['venture_artifacts'] });

  return { ventureId: venture.id, name: venture.name, journal: j, seededArtifactTypes: [...required.keys()] };
}

/**
 * Fixture-artifact seeder (SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001).
 *
 * Satisfy the stage artifact gate INSTEAD of bypassing it (Solomon adjudication F1
 * 9b55e2a6: the gate is correct, the forced-stage-set hatch was wrong — a stage pointer
 * is derived state; a raw write fabricates traversal history). Introspects the LIVE
 * fn_stage_artifact_precondition RPC for the stage's exact requirements — never a
 * hardcoded list, so it stays correct as gates evolve — and seeds exactly the missing
 * artifacts, provenance-marked metadata.is_fixture, via the same writeArtifact primitive
 * the machinery uses. §H2 (instrument-don't-mock) is preserved by the CALLER: this runs
 * only AFTER the band's real executeStage, as a journaled sanctioned divergence — the
 * machinery's gap is recorded before it is filled.
 *
 * @returns {{seeded: string[], source: string|null, blocked: boolean}}
 */
export async function seedMissingArtifactsForStage(supabase, { ventureId, stage, runId, journal } = {}) {
  if (!ventureId || !Number.isInteger(stage)) throw new Error('seedMissingArtifactsForStage: ventureId and integer stage required');

  // Fail-loud guard: NEVER seed onto a non-fixture venture (real-venture paths are
  // explicitly out of scope; a leak here would fabricate gate satisfaction in prod data).
  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, is_demo, launch_mode, metadata')
    .eq('id', ventureId)
    .single();
  if (vErr || !venture) throw new Error(`seedMissingArtifactsForStage: venture lookup failed: ${vErr?.message || 'not found'}`);
  if (!isFixtureVenture(venture)) throw new Error(`seedMissingArtifactsForStage: ${venture.name} is not a fixture venture — refusing to seed`);

  // Introspect the live gate: the RPC's missing_artifacts[] (text[]) IS the work list.
  const { data: precondition, error: pErr } = await supabase
    .rpc('fn_stage_artifact_precondition', { p_venture_id: ventureId, p_stage: stage });
  if (pErr) throw new Error(`seedMissingArtifactsForStage: fn_stage_artifact_precondition failed: ${pErr.message}`);
  const missing = Array.isArray(precondition?.missing_artifacts) ? precondition.missing_artifacts : [];
  const source = precondition?.source ?? null;
  if (!precondition?.blocked || missing.length === 0) {
    return { seeded: [], source, blocked: precondition?.blocked === true };
  }

  const { writeArtifact } = await import('../../lib/eva/artifact-persistence-service.js');
  const seeded = [];
  for (const artifactType of missing) {
    await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: stage,
      artifactType,
      title: `Harness fixture-seeded ${artifactType} (S${stage} gate requirement)`,
      artifactData: { harness_seeded: true, run_id: runId, seeded_for_stage: stage, gate_source: source },
      metadata: { is_fixture: true, harness: { run_id: runId, seeder: 'seedMissingArtifactsForStage' } },
      source: 'harness-s20-fixture-seeder',
    });
    seeded.push(artifactType);
  }
  journal?.append?.({
    kind: 'observation',
    event: `S${stage} fixture-artifact seed: ${seeded.length} missing gate artifact(s) seeded (source=${source}) so the gate passes because its conditions are MET`,
    touched_tables: ['venture_artifacts'],
    detail: { seeded, gate_source: source, is_fixture: true },
  });
  return { seeded, source, blocked: true };
}

/** Resolve the fixture venture id for a run (by the deterministic name). */
export async function findFixtureVentureId(supabase, runId) {
  const { data } = await supabase
    .from('ventures')
    .select('id')
    .eq('name', `${FIXTURE_NAME_PREFIX}${runId}`)
    .maybeSingle();
  return data?.id || null;
}

/**
 * §H6 idempotent, verified teardown. Table list = journal touched-tables ∪ core list.
 * Deletes child rows by venture_id, then the venture row, then asserts zero residue.
 */
export async function teardownFixture(supabase, runId, { journal } = {}) {
  const j = journal || new RunJournal(runId);
  const ventureId = await findFixtureVentureId(supabase, runId);
  const tables = [...new Set([...CORE_FIXTURE_TABLES, ...j.touchedTables()])]
    .filter((t) => t !== 'ventures');

  const deleted = {};
  if (ventureId) {
    for (const table of tables) {
      let query = supabase.from(table).delete({ count: 'exact' }).eq('venture_id', ventureId);
      if (table === 'venture_artifacts') query = query.neq('artifact_type', HARNESS_RUN_JOURNAL_TYPE);
      const { error, count } = await query;
      // Fail-soft per table (a table without venture_id or not present is journaled, not fatal)
      deleted[table] = error ? `skip: ${error.message}` : (count ?? 0);
    }
    const { error: vErr } = await supabase.from('ventures').delete().eq('id', ventureId);
    if (vErr) throw new Error(`venture delete failed: ${vErr.message}`);
  }
  j.append({ kind: 'lifecycle', event: 'fixture teardown executed', detail: { venture_id: ventureId, deleted } });

  const residue = await assertClean(supabase, runId, { journal: j, ventureId });
  return { ventureId, deleted, residue };
}

/**
 * §H5 fence-6/§H6 residue assertion: zero rows referencing the fixture venture across the
 * generated table list; zero scheduler queue/metrics rows (ghost-venture class). Emits
 * machine-greppable HARNESS_RESIDUE lines and journals any breach as a RESIDUE finding.
 */
export async function assertClean(supabase, runId, { journal, ventureId: knownId } = {}) {
  const j = journal || new RunJournal(runId);
  const ventureId = knownId !== undefined ? knownId : await findFixtureVentureId(supabase, runId);
  const results = {};

  if (ventureId === null) {
    results.ventures = 0;
  } else {
    const { count } = await supabase.from('ventures').select('id', { count: 'exact', head: true }).eq('id', ventureId);
    results.ventures = count ?? 0;
  }

  const tables = [...new Set([...CORE_FIXTURE_TABLES, ...j.touchedTables()])].filter((t) => t !== 'ventures');
  for (const table of tables) {
    if (!ventureId) { results[table] = 0; continue; }
    let query = supabase.from(table).select('*', { count: 'exact', head: true }).eq('venture_id', ventureId);
    if (table === 'venture_artifacts') query = query.neq('artifact_type', HARNESS_RUN_JOURNAL_TYPE);
    const { count, error } = await query;
    results[table] = error ? `unverifiable: ${error.message}` : (count ?? 0);
  }

  let clean = true;
  for (const [table, n] of Object.entries(results)) {
    const bad = typeof n === 'number' ? n > 0 : true; // unverifiable counts as NOT clean (fail-closed)
    if (bad) clean = false;
    console.log(`HARNESS_RESIDUE run=${runId} table=${table} rows=${n}${bad ? ' ⚠' : ''}`);
  }

  // FR-2 (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001): ADDITIVE to the residue-absence
  // checks above — assert the run's journal evidence IS PRESENT post-teardown. Teardown
  // itself never touches the journal file (only DB rows, above); a missing/empty journal
  // here means the run-evidence path regressed (e.g. .harness-runs wiped or a re-key bug).
  const journalEntries = j.readAll();
  const journalEvidencePresent = journalEntries.length > 0;
  results.journal_evidence_present = journalEvidencePresent;
  console.log(`HARNESS_JOURNAL_EVIDENCE run=${runId} present=${journalEvidencePresent} entries=${journalEntries.length}${journalEvidencePresent ? '' : ' ⚠'}`);
  if (!journalEvidencePresent) clean = false;

  if (!clean) {
    if (!journalEvidencePresent) {
      j.finding('RESIDUE', 'post-teardown journal-evidence-present assertion FAILED (journal empty/unreadable)', { results });
    }
    if (Object.entries(results).some(([t, n]) => t !== 'journal_evidence_present' && (typeof n !== 'number' || n > 0))) {
      j.finding('RESIDUE', 'post-teardown residue assertion FAILED', { results });
    }
  } else {
    j.append({ kind: 'fence_assertion', event: 'post-teardown residue assertion PASSED (zero fixture residue, journal evidence present)', detail: { tables: Object.keys(results) } });
  }
  console.log(`HARNESS_CLEAN=${clean} run=${runId}`);
  return { clean, results };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const runIdIdx = args.indexOf('--run-id');
  const runId = runIdIdx >= 0 ? args[runIdIdx + 1] : `hrs20-${Date.now()}`;
  const entryIdx = args.indexOf('--entry-stage');
  const entryStage = entryIdx >= 0 ? Number(args[entryIdx + 1]) || 20 : 20;
  const supabase = makeClient();

  if (mode === 'create') {
    const res = await createFixture(supabase, runId, { entryStage });
    console.log(`HARNESS_FIXTURE_CREATED run=${runId} venture=${res.ventureId} name=${res.name} entry_stage=${entryStage} seeded_artifacts=${res.seededArtifactTypes.length}`);
  } else if (mode === 'teardown') {
    if (runIdIdx < 0) { console.error('teardown requires --run-id'); process.exit(2); }
    const res = await teardownFixture(supabase, runId);
    process.exit(res.residue.clean ? 0 : 1);
  } else if (mode === 'assert-clean') {
    if (runIdIdx < 0) { console.error('assert-clean requires --run-id'); process.exit(2); }
    const res = await assertClean(supabase, runId);
    process.exit(res.clean ? 0 : 1);
  } else {
    console.error('Usage: node scripts/harness/s20-fixture.mjs create [--run-id <id>] [--entry-stage 20] | teardown --run-id <id> | assert-clean --run-id <id>');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error('HARNESS_FIXTURE_ERROR', e.message); process.exit(1); });
}
