#!/usr/bin/env node
/**
 * S20-26 SIMULATED FULL-LIFE RUN — the owning-seat runner (Charlie slice:
 * §H3 instrumentation/coverage + §H4 synthetic drivers + §H6 containment sweep +
 * §H7 checkpoint-resume band ladder), built on the Bravo slice (§H1 fixture,
 * §H2/§H3 RunJournal, §H9 calibration). Spec:
 * docs/design/s20-26-simulated-run-harness-spec.md; O-requirements:
 * docs/design/s20-26-operations-greenfield-spec.md.
 *
 * INSTRUMENT-DON'T-MOCK (§H2): every band runs the REAL machinery —
 * stage-execution-engine.executeStage() for the stage's analysis + artifact
 * persistence, then artifact-persistence-service.advanceStage() so the REAL
 * exit-gate enforcer + binding gate-debt checks fire. A gate BLOCK is an
 * OBSERVATION (that is the machinery working), never an abort: per §H7 the run
 * records the finding and CONTINUES from the next drivable point — the product
 * is the band's drivability map, not a crash log of its first gap.
 *
 * §H4 DRIVERS: after the go-live band (S24), the runner attempts each synthetic
 * driver (stranger visitor, conversion, test-rail payment + attribution,
 * support ticket, incident, injected-clock review cadence). A driver whose
 * machinery does not exist in this repo journals a first-class CANNOT_DRIVE
 * finding mapped to its O-requirement — the honest form of coverage.
 *
 * §H5/§H6 FENCES: the enumerated allowed-divergence set below is the ONLY
 * sanctioned test-mode surface; the runner journals every fence it exercises
 * and ends with the scheduler-residue + touched-tables containment sweep
 * (teardown itself is a separate explicit step: s20-fixture.mjs teardown).
 *
 * §H7 CHECKPOINT-RESUME: band completion is journaled; a re-run with the same
 * --run-id SKIPS completed bands (the journal is the continuation point;
 * ownership never transfers). Clock is injectable (--clock ISO) and advanced
 * per band (--clock-step-hours) so cadence logic never wall-clock-waits.
 *
 * Usage:
 *   node scripts/harness/s20-run.mjs run    --run-id <id> [--entry-stage 20] [--to-stage 26]
 *                                           [--clock 2026-07-12T09:00:00Z] [--clock-step-hours 24]
 *                                           [--create-fixture] [--sweep-only]
 *   node scripts/harness/s20-run.mjs status --run-id <id>
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
import { RunJournal, finalizeMirror } from '../../lib/harness/run-journal.mjs';
import { bridgeCannotDriveFindings } from '../../lib/harness/capability-gap-bridge.mjs';
import { createFixture, findFixtureVentureId, assertClean } from './s20-fixture.mjs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

/** §H2/§H5: the ONLY sanctioned divergences from production behavior. */
export const ALLOWED_DIVERGENCES = Object.freeze([
  'stripe_test_keys',          // H5.1 — test-rail payments only
  'preview_only_deploy',       // H5.2 — preview() leg, never promote; plan-mode without adapters
  'sandboxed_outreach',        // H5.3 — zero real sends; degraded-mode email redirect
  'mock_registrar',            // H5.4 — no domain purchases
  'no_marketlens_signups',     // H5.5 — live MarketLens untouched
  'synthetic_fixture_venture', // H5.6 — is_demo/is_synthetic fixture, teardown-cascaded
  'coordinator_routed_gate',   // H5.7 — demand execution_gate satisfied with explicit test provenance via coordinator
  'injected_clock',            // H4 — clock advancement, never wall-clock waits
]);

/**
 * §H3: per-band O-requirement mapping (what each stage's machinery, when it
 * fires, is evidence OF). Coverage closes over this + the post-launch drivers.
 */
export const STAGE_O_MAP = Object.freeze({
  20: ['O2'],             // build execution / code quality toward launch gate-crossing
  21: ['O3'],             // demand PLAN (Stage-21 artifact-only by design)
  22: ['O3', 'O9'],       // distribution setup (channel envelope honesty)
  23: ['O2'],             // launch readiness = the gate-crossing precondition
  24: ['O1', 'O2', 'O4'], // go-live (simulated mode, labeled) + external-observation gauges
  25: ['O4', 'O7', 'O8'], // post-launch review: provenance-reached metrics, feedback loop, review cadence
  26: ['O7', 'O8'],       // growth playbook: retention loop + scale-or-exit input
});

/** §H4 post-launch synthetic drivers, each mapped to its O-requirement. */
export const POST_LAUNCH_DRIVERS = Object.freeze([
  { key: 'stranger_visitor', o: ['O3'], desc: 'scripted stranger-visitor against the preview deploy' },
  { key: 'conversion_event', o: ['O3', 'O7'], desc: 'synthetic conversion event' },
  { key: 'test_rail_payment', o: ['O6'], desc: 'Stripe test-key payment -> attribution assertion' },
  { key: 'support_ticket', o: ['O5'], desc: 'synthetic support ticket -> triage observation' },
  { key: 'incident_probe', o: ['O5'], desc: 'synthetic incident (tripped health probe) -> remediation/escalation' },
  { key: 'review_cadence', o: ['O8'], desc: 'injected-clock advancement -> post-launch review cadence fires' },
]);

export const ALL_O_REQUIREMENTS = Object.freeze(['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10']);

/**
 * O10 is the run-META acceptance criterion (all per-loop O-reqs mapped AND containment
 * clean AND journal durable) — no band or driver maps to it BY DESIGN, so feeding it into
 * the per-loop coverage matrix guarantees a noise DEAD_LOOP finding on every single run
 * (QF-20260711-967 / Solomon F4). Graded once, at run level, in runArc()'s close-out below.
 */
export const LOOP_O_REQUIREMENTS = Object.freeze(ALL_O_REQUIREMENTS.filter((r) => r !== 'O10'));

/**
 * Per-band advance policy (SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001; supersedes the
 * forced-stage-set hatch, rejected by Solomon adjudication F1 9b55e2a6 — the gate is
 * correct, a raw stage-pointer write fabricates traversal history):
 * - 'real-gates' (DEFAULT): the band advances only through the live gate path;
 *   a block is a drivability edge and the venture stays put (stage-mismatch
 *   cascades downstream are themselves honest evidence).
 * - 'fixture-artifact-seed': after journaling the real block, introspect
 *   fn_stage_artifact_precondition and seed exactly the missing artifacts
 *   (metadata.is_fixture provenance) via seedMissingArtifactsForStage, then retry the
 *   REAL advance — the gate passes because its conditions are MET, never bypassed.
 *   Declared through the §H2 config-diff seam as the 'fixture_artifact_seed'
 *   divergence — sanctioned ONLY when the coordinator enumerates it pre-run. A block
 *   the seeder cannot satisfy (e.g. prose exit gates with no registered verifier)
 *   remains an honest journaled halt — there is NO raw stage-set fallback.
 */
export const ADVANCE_POLICIES = Object.freeze(['real-gates', 'fixture-artifact-seed']);
export const FIXTURE_ARTIFACT_SEED_DIVERGENCE = 'fixture_artifact_seed';

/** The enumerated divergence set for a given advance policy. */
export function allowedDivergencesFor(advancePolicy = 'real-gates') {
  return advancePolicy === 'fixture-artifact-seed'
    ? Object.freeze([...ALLOWED_DIVERGENCES, FIXTURE_ARTIFACT_SEED_DIVERGENCE])
    : ALLOWED_DIVERGENCES;
}

/** Injectable stepping clock (§H4): starts at a fixed ISO, advances on demand. */
export function makeSteppingClock(startIso, stepHours = 24) {
  let t = Date.parse(startIso);
  if (!Number.isFinite(t)) throw new Error(`invalid --clock '${startIso}'`);
  return {
    now: () => new Date(t).toISOString(),
    step: () => { t += stepHours * 3600 * 1000; return new Date(t).toISOString(); },
  };
}

/** §H7 resume: bands already journaled complete for this run id. */
export function completedBands(journal) {
  const done = new Set();
  for (const e of journal.readAll()) {
    if (e.kind === 'checkpoint' && e.detail?.band_complete) done.add(e.detail.band_complete);
  }
  return done;
}

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/**
 * Run one stage band through the REAL machinery: executeStage -> journal ->
 * advanceStage (real exit gates). Returns { advanced } — a block is journaled
 * as an observation of the live gate, never thrown past the band.
 */
export async function runBand({ supabase, journal, ventureId, stage, clock, logger = console, seams = {}, advancePolicy = 'real-gates' }) {
  const oReqs = STAGE_O_MAP[stage] || [];
  const executeStage = seams.executeStage || (await import('../../lib/eva/stage-execution-engine.js')).executeStage;
  const advanceStage = seams.advanceStage || (await import('../../lib/eva/artifact-persistence-service.js')).advanceStage;

  // 1. The stage's own machinery (analysis step + artifact persistence).
  let exec;
  try {
    exec = await executeStage({ stageNumber: stage, ventureId, supabase, logger });
    journal.append({
      kind: 'observation',
      event: `S${stage} executeStage ran (template=${exec.template || 'n/a'}, valid=${exec.validation?.valid !== false})`,
      o_requirements: oReqs,
      touched_tables: ['venture_artifacts', 'system_events'],
      detail: { artifact_id: exec.artifactId || null, policy_halt: exec.output?.policy_halt || false },
    });
  } catch (e) {
    journal.finding('CANNOT_DRIVE', `S${stage} executeStage threw: ${String(e.message).slice(0, 300)}`, { o_requirements: oReqs, stage });
    journal.append({ kind: 'checkpoint', event: `band S${stage} checkpoint (execute failed, continuing)`, detail: { band_complete: stage } });
    return { advanced: false, executed: false };
  }

  // 2. The REAL advance path — exit-gate enforcer + binding gate-debt fire here.
  try {
    await advanceStage(supabase, { ventureId, fromStage: stage, toStage: stage + 1, handoffData: { harness: true } });
    journal.append({
      kind: 'observation',
      event: `S${stage} -> S${stage + 1} advanced through the REAL gate path (exit-gate enforcer + gate debt)`,
      o_requirements: oReqs,
      touched_tables: ['ventures', 'venture_stage_work'],
    });
    journal.append({ kind: 'checkpoint', event: `band S${stage} complete`, detail: { band_complete: stage } });
    return { advanced: true, executed: true };
  } catch (e) {
    // A live gate block IS machinery evidence (never an abort — §H7).
    journal.append({
      kind: 'observation',
      event: `S${stage} advance BLOCKED by live gates: ${String(e.message).slice(0, 400)}`,
      o_requirements: [...oReqs, 'O2'],
      touched_tables: ['system_events'],
      detail: { blocked: true, at_clock: clock.now() },
    });

    // 'fixture-artifact-seed' policy (SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001):
    // satisfy the artifact gate instead of bypassing it. The real block above stays
    // journaled as the drivability evidence (§H2 — the machinery's gap is recorded
    // before it is filled); then the missing gate artifacts are seeded with is_fixture
    // provenance and the REAL advance retried through the live trigger. Unsanctioned
    // use self-reports: assertDivergenceAllowed lands it as TEST_MODE_DIVERGENCE when
    // the policy's set doesn't include it. A block seeding cannot satisfy (prose exit
    // gates) falls through to the honest checkpoint halt — no raw stage-set fallback.
    if (advancePolicy === 'fixture-artifact-seed') {
      journal.assertDivergenceAllowed(FIXTURE_ARTIFACT_SEED_DIVERGENCE, [...allowedDivergencesFor(advancePolicy)], { stage, to: stage + 1 });
      const doSeed = seams.seedMissingArtifacts || (await import('./s20-fixture.mjs')).seedMissingArtifactsForStage;
      try {
        const seedResult = await doSeed(supabase, { ventureId, stage, runId: journal.runId, journal });
        if (seedResult.seeded.length > 0) {
          await advanceStage(supabase, { ventureId, fromStage: stage, toStage: stage + 1, handoffData: { harness: true, fixture_artifact_seed: seedResult.seeded } });
          journal.append({
            kind: 'observation',
            event: `S${stage} -> S${stage + 1} advanced through the REAL gate path after fixture-artifact seed (${seedResult.seeded.length} type(s), gate conditions MET — never bypassed)`,
            o_requirements: oReqs,
            touched_tables: ['ventures', 'venture_stage_work', 'venture_artifacts'],
            detail: { seeded: seedResult.seeded, gate_source: seedResult.source },
          });
          journal.append({ kind: 'checkpoint', event: `band S${stage} complete (fixture-artifact-seed policy)`, detail: { band_complete: stage } });
          return { advanced: true, executed: true, seeded: seedResult.seeded };
        }
        // Nothing missing => the block is NOT the artifact gate (e.g. prose exit
        // gates). Journal the honest edge below — seeding cannot and must not help.
        journal.append({
          kind: 'observation',
          event: `S${stage} block is not artifact-gate-satisfiable (0 missing artifacts, source=${seedResult.source}) — honest halt, no fallback`,
          o_requirements: oReqs,
          touched_tables: [],
          detail: { seeded: [], gate_source: seedResult.source },
        });
      } catch (se) {
        journal.append({ kind: 'finding', finding_type: 'CANNOT_DRIVE', event: `S${stage} fixture-artifact seed/retry failed: ${String(se.message).slice(0, 200)}`, o_requirements: oReqs, detail: { stage } });
      }
    }

    journal.append({ kind: 'checkpoint', event: `band S${stage} checkpoint (advance blocked — drivability edge)`, detail: { band_complete: stage } });
    return { advanced: false, executed: true };
  }
}

/**
 * §H4 post-launch drivers. Each driver either exercises real machinery or
 * journals an honest CANNOT_DRIVE with the reason the surface is undrivable
 * from this repo today. `seams` lets tests (and future wiring) inject drivers.
 */
export async function runPostLaunchDrivers({ supabase, journal, ventureId, clock, seams = {} }) {
  for (const driver of POST_LAUNCH_DRIVERS) {
    const impl = seams[driver.key];
    if (impl) {
      try {
        const detail = await impl({ supabase, ventureId, clock, journal });
        journal.append({ kind: 'observation', event: `driver ${driver.key} fired: ${driver.desc}`, o_requirements: driver.o, touched_tables: detail?.touched_tables || [], detail: detail || {} });
        continue;
      } catch (e) {
        journal.finding('CANNOT_DRIVE', `driver ${driver.key} threw: ${String(e.message).slice(0, 300)}`, { o_requirements: driver.o });
        continue;
      }
    }
    // No implementation seam yet — the honest default per §H7: first-class finding.
    const reason = {
      stranger_visitor: 'no preview deploy exists for the fixture (preview() runs plan-mode without adapters — blocked_on_credentials by design, H5.2)',
      conversion_event: 'depends on stranger_visitor reaching a live preview surface',
      test_rail_payment: 'no payment-attribution machinery found in EHG_Engineer lib/ (attribution rail lives with the venture app; O6 undrivable from the platform repo alone)',
      support_ticket: 'no support-ticket/triage machinery found in lib/ (O5 loop not built)',
      incident_probe: 'no health-probe/remediation loop callable for a fixture venture (O5 loop not built)',
      review_cadence: 'post-launch review cadence has no pre-scheduled machinery to fire under an injected clock (O8 scheduler absent)',
    }[driver.key] || 'no driver seam wired';
    journal.finding('CANNOT_DRIVE', `driver ${driver.key}: ${reason}`, { o_requirements: driver.o, at_clock: clock.now() });
  }
}

/** §H6 containment sweep (run-level; teardown is the separate explicit step). */
export async function containmentSweep({ supabase, journal, runId, ventureId, advancePolicy = 'real-gates' }) {
  // Fence 6: ghost-venture scheduler residue must be zero DURING the run too.
  for (const table of ['eva_scheduler_queue', 'eva_scheduler_metrics']) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('venture_id', ventureId);
    if (error) {
      journal.finding('NO_DATA_GAUGE', `containment: ${table} unverifiable: ${error.message}`, { table });
    } else if ((count ?? 0) > 0) {
      journal.finding('RESIDUE', `containment: ${count} ${table} row(s) reference the fixture MID-RUN (ghost-venture class)`, { table, count });
    } else {
      journal.append({ kind: 'fence_assertion', event: `containment: zero ${table} rows for fixture`, detail: { table } });
    }
  }
  // Enumerated divergences the run exercises are journaled up-front for the diff auditor.
  const allowed = [...allowedDivergencesFor(advancePolicy)];
  for (const d of allowed) journal.assertDivergenceAllowed(d, allowed, { declared_upfront: true });
  journal.append({ kind: 'fence_assertion', event: 'containment sweep complete', detail: { run_id: runId } });
}

export async function runArc({ runId, entryStage = 20, toStage = 26, clockStart, clockStepHours = 24, createFixtureFirst = false, sweepOnly = false, advancePolicy = 'real-gates', supabase: sb, seams = {}, baseDir } = {}) {
  const supabase = sb || makeClient();
  const clock = makeSteppingClock(clockStart || new Date().toISOString(), clockStepHours);
  const journal = new RunJournal(runId, { clock: clock.now, ...(baseDir ? { baseDir } : {}) });

  let ventureId = await findFixtureVentureId(supabase, runId);
  if (!ventureId && createFixtureFirst) {
    const created = await createFixture(supabase, runId, { entryStage, journal });
    ventureId = created.ventureId;
  }
  if (!ventureId) throw new Error(`no fixture venture for run ${runId} — create one first (s20-fixture.mjs create --run-id ${runId} or pass --create-fixture)`);

  journal.append({ kind: 'lifecycle', event: `run arc started (S${entryStage}..S${toStage})`, detail: { venture_id: ventureId, clock: clock.now() } });

  if (!sweepOnly) {
    const done = completedBands(journal);
    for (let stage = entryStage; stage <= toStage; stage++) {
      if (done.has(stage)) { journal.append({ kind: 'lifecycle', event: `band S${stage} already complete — resumed past it (§H7)` }); continue; }
      await runBand({ supabase, journal, ventureId, stage, clock, seams, advancePolicy });
      clock.step(); // injected-clock advancement between bands (never wall-clock waits)
    }
    await runPostLaunchDrivers({ supabase, journal, ventureId, clock, seams });
  }

  await containmentSweep({ supabase, journal, runId, ventureId, advancePolicy });

  // §H3 coverage close-out: every PER-LOOP O-requirement observed or first-class-found.
  // O10 is excluded here — it is not a loop, it is graded once below (QF-20260711-967).
  const coverage = journal.checkCoverage([...LOOP_O_REQUIREMENTS]);
  for (const f of coverage.findings) journal.append({ kind: 'finding', finding_type: f.finding_type, event: f.event, o_requirements: f.o_requirements, detail: {} });
  journal.append({ kind: 'lifecycle', event: `run arc pass complete: covered=${coverage.covered.join(',') || 'none'} uncovered=${coverage.uncovered.join(',') || 'none'}`, detail: { coverage } });

  // FR-1 (SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001): CANNOT_DRIVE findings are
  // negative capability data -- bridge them into a durable capability-gap signal.
  // Fail-soft: a feedback-write failure must never fail the harness run itself.
  try {
    const bridgeResult = await bridgeCannotDriveFindings(supabase, coverage, { harnessSource: 's20-run', runId });
    if (bridgeResult.failed?.length > 0) {
      journal.append({ kind: 'lifecycle', event: `capability-gap bridge: ${bridgeResult.failed.length} finding(s) failed to persist (non-blocking)`, detail: { failed: bridgeResult.failed } });
    }
  } catch (err) {
    journal.append({ kind: 'lifecycle', event: `capability-gap bridge failed (non-blocking): ${err.message}` });
  }

  // FR-3/FR-4 (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001): durable system_events mirror of
  // the journal, independent of both .harness-runs scratch and the fixture's own lifecycle.
  const mirror = await finalizeMirror({ supabase, journal, ventureId, seams: seams.finalizeMirror ? { insertEvent: seams.finalizeMirror } : {} });

  // O10 run-meta verdict, graded ONCE at run level: every per-loop O-req mapped (not dead)
  // AND the containment sweep found no residue AND the journal is non-empty/durable.
  const o10AllMapped = coverage.uncovered.length === 0;
  const o10ResidueClean = !journal.readAll().some((e) => e.kind === 'finding' && e.finding_type === 'RESIDUE');
  const o10JournalDurable = journal.readAll().length > 0;
  const o10Pass = o10AllMapped && o10ResidueClean && o10JournalDurable;
  if (o10Pass) {
    journal.append({ kind: 'observation', event: 'O10 run-meta verdict: all loops mapped, containment clean, journal durable', o_requirements: ['O10'] });
  } else {
    journal.finding('DEAD_LOOP', `O10 run-meta verdict FAILED: all_mapped=${o10AllMapped} residue_clean=${o10ResidueClean} journal_durable=${o10JournalDurable}`, { o_requirements: ['O10'] });
  }

  return { runId, ventureId, coverage, mirror, o10: { pass: o10Pass, allMapped: o10AllMapped, residueClean: o10ResidueClean, journalDurable: o10JournalDurable }, journalPath: journal.path };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
  const runId = flag('run-id', null);
  if (!runId) { console.error('--run-id required'); process.exit(2); }

  if (mode === 'run') {
    const res = await runArc({
      runId,
      entryStage: Number(flag('entry-stage', 20)),
      toStage: Number(flag('to-stage', 26)),
      clockStart: flag('clock', undefined),
      clockStepHours: Number(flag('clock-step-hours', 24)),
      createFixtureFirst: args.includes('--create-fixture'),
      sweepOnly: args.includes('--sweep-only'),
      advancePolicy: flag('advance-policy', 'real-gates'),
    });
    const { coverage } = res;
    console.log(`HARNESS_RUN_PASS run=${res.runId} venture=${res.ventureId} positive=${coverage.positive.length}/${LOOP_O_REQUIREMENTS.length} mapping_covered=${coverage.covered.length}/${LOOP_O_REQUIREMENTS.length} O10=${res.o10.pass ? 'pass' : 'FAILED'} journal=${res.journalPath}`);
    if (coverage.blocked.length) console.log(`  BLOCKED: ${coverage.blocked.join(',')}`);
    if (coverage.cannotDrive.length) console.log(`  CANNOT_DRIVE: ${coverage.cannotDrive.join(',')}`);
    if (coverage.uncovered.length) console.log(`  DEAD_LOOP: ${coverage.uncovered.join(',')}`);
    process.exit(0);
  } else if (mode === 'status') {
    const journal = new RunJournal(runId);
    const events = journal.readAll();
    const findings = events.filter((e) => e.kind === 'finding');
    console.log(`HARNESS_RUN_STATUS run=${runId} events=${events.length} findings=${findings.length} bands_complete=${[...completedBands(journal)].join(',') || 'none'}`);
    for (const f of findings) console.log(`  FINDING ${f.finding_type}: ${f.event}`);
    process.exit(0);
  } else {
    console.error('Usage: s20-run.mjs run --run-id <id> [...] | status --run-id <id>');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((e) => { console.error('HARNESS_RUN_ERROR', e.message); process.exit(1); });
}
