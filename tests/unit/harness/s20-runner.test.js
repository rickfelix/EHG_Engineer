/**
 * S20-26 harness RUNNER (Charlie slice — §H3/§H4/§H6/§H7) unit pins.
 * Pure-local: injected seams + fake supabase + fixed clock; no DB, no LLM.
 *
 * @module tests/unit/harness/s20-runner.test
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import {
  ALLOWED_DIVERGENCES, STAGE_O_MAP, POST_LAUNCH_DRIVERS, ALL_O_REQUIREMENTS,
  makeSteppingClock, completedBands, runBand, runPostLaunchDrivers, runArc,
  allowedDivergencesFor, FIXTURE_ARTIFACT_SEED_DIVERGENCE, ADVANCE_POLICIES,
} from '../../../scripts/harness/s20-run.mjs';
import { RunJournal } from '../../../lib/harness/run-journal.mjs';

const BASE = '.harness-runs-test';
afterAll(() => { try { rmSync(BASE, { recursive: true, force: true }); } catch { /* best-effort */ } });

const fixedClock = () => '2026-07-12T09:00:00.000Z';

function fakeSupabase({ ventureExists = true, schedulerRows = 0 } = {}) {
  return {
    from: (table) => ({
      select: () => ({
        eq: (col, _val) => {
          if (table === 'ventures' && col === 'name') {
            return { maybeSingle: async () => ({ data: ventureExists ? { id: 'v-fixture' } : null }) };
          }
          // count-head queries (scheduler residue)
          return Promise.resolve({ count: table.startsWith('eva_scheduler') ? schedulerRows : 0, error: null });
        },
      }),
      // runArc()'s finalizeMirror() (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001) writes a
      // durable system_events row at the end of every run.
      insert: async () => ({ error: null }),
    }),
  };
}

describe('runner constants (§H2/§H3 shape pins)', () => {
  it('the allowed-divergence set is exactly the enumerated H5 fences + injected clock', () => {
    expect([...ALLOWED_DIVERGENCES].sort()).toEqual([
      'coordinator_routed_gate', 'injected_clock', 'mock_registrar', 'no_marketlens_signups',
      'preview_only_deploy', 'sandboxed_outreach', 'stripe_test_keys', 'synthetic_fixture_venture',
    ]);
  });

  it('every band S20..S26 maps to >=1 O-requirement, and band+driver maps reach every O except O10', () => {
    for (let s = 20; s <= 26; s++) expect((STAGE_O_MAP[s] || []).length, `S${s}`).toBeGreaterThan(0);
    const reachable = new Set();
    for (const os of Object.values(STAGE_O_MAP)) for (const o of os) reachable.add(o);
    for (const d of POST_LAUNCH_DRIVERS) for (const o of d.o) reachable.add(o);
    const missing = ALL_O_REQUIREMENTS.filter((o) => !reachable.has(o));
    // O10 is the acceptance requirement — satisfied by the run itself (coverage close-out),
    // so it is the only one allowed to be unreachable from bands/drivers.
    expect(missing).toEqual(['O10']);
  });

  it('stepping clock: fixed start, deterministic step, never wall-clock', () => {
    const c = makeSteppingClock('2026-07-12T09:00:00Z', 24);
    expect(c.now()).toBe('2026-07-12T09:00:00.000Z');
    c.step();
    expect(c.now()).toBe('2026-07-13T09:00:00.000Z');
  });
});

describe('runBand (§H2 instrument-don\'t-mock, §H7 never-abort)', () => {
  it('executes the real seams, journals the observation with O-mapping, advances, checkpoints the band', async () => {
    const journal = new RunJournal('t-band-ok', { baseDir: BASE, clock: fixedClock });
    const executeStage = vi.fn(async () => ({ template: 'stage-20', artifactId: 'a1', validation: { valid: true }, output: {} }));
    const advanceStage = vi.fn(async () => ({}));
    const r = await runBand({ supabase: {}, journal, ventureId: 'v1', stage: 20, clock: { now: fixedClock }, seams: { executeStage, advanceStage } });
    expect(r).toEqual({ advanced: true, executed: true });
    expect(executeStage).toHaveBeenCalledWith(expect.objectContaining({ stageNumber: 20, ventureId: 'v1' }));
    expect(advanceStage).toHaveBeenCalledWith({}, expect.objectContaining({ fromStage: 20, toStage: 21 }));
    const events = journal.readAll();
    expect(events.find((e) => e.kind === 'observation' && e.event.includes('S20 executeStage')).o_requirements).toEqual(['O2']);
    expect(events.find((e) => e.kind === 'checkpoint').detail.band_complete).toBe(20);
  });

  it('a live gate BLOCK is journaled as an OBSERVATION and the band checkpoints — never throws (§H7)', async () => {
    const journal = new RunJournal('t-band-blocked', { baseDir: BASE, clock: fixedClock });
    const executeStage = vi.fn(async () => ({ artifactId: 'a1', validation: { valid: true }, output: {} }));
    const advanceStage = vi.fn(async () => { throw new Error('advanceStage blocked by exit-gate enforcer. Blocked by: demand_gate'); });
    const r = await runBand({ supabase: {}, journal, ventureId: 'v1', stage: 22, clock: { now: fixedClock }, seams: { executeStage, advanceStage } });
    expect(r).toEqual({ advanced: false, executed: true });
    const blockedObs = journal.readAll().find((e) => e.event.includes('BLOCKED by live gates'));
    expect(blockedObs.kind).toBe('observation');
    expect(blockedObs.detail.blocked).toBe(true);
  });

  it('an executeStage crash lands as CANNOT_DRIVE and the run continues (checkpoint written)', async () => {
    const journal = new RunJournal('t-band-crash', { baseDir: BASE, clock: fixedClock });
    const executeStage = vi.fn(async () => { throw new Error('template missing'); });
    const r = await runBand({ supabase: {}, journal, ventureId: 'v1', stage: 25, clock: { now: fixedClock }, seams: { executeStage, advanceStage: vi.fn() } });
    expect(r).toEqual({ advanced: false, executed: false });
    const finding = journal.readAll().find((e) => e.kind === 'finding');
    expect(finding.finding_type).toBe('CANNOT_DRIVE');
    expect(journal.readAll().some((e) => e.kind === 'checkpoint')).toBe(true);
  });
});

describe('post-launch drivers (§H4 honest defaults)', () => {
  it('unwired drivers journal first-class CANNOT_DRIVE findings mapped to their O-requirements', async () => {
    const journal = new RunJournal('t-drivers-default', { baseDir: BASE, clock: fixedClock });
    await runPostLaunchDrivers({ supabase: {}, journal, ventureId: 'v1', clock: { now: fixedClock } });
    const findings = journal.readAll().filter((e) => e.kind === 'finding');
    expect(findings).toHaveLength(POST_LAUNCH_DRIVERS.length);
    const o6 = findings.find((f) => f.event.includes('test_rail_payment'));
    expect(o6.finding_type).toBe('CANNOT_DRIVE');
    expect(o6.detail.o_requirements).toEqual(['O6']);
  });

  it('a wired driver seam runs and journals an observation; a throwing seam lands as CANNOT_DRIVE', async () => {
    const journal = new RunJournal('t-drivers-wired', { baseDir: BASE, clock: fixedClock });
    const seams = {
      stranger_visitor: vi.fn(async () => ({ touched_tables: ['preview_hits'] })),
      conversion_event: vi.fn(async () => { throw new Error('no conversion endpoint'); }),
    };
    await runPostLaunchDrivers({ supabase: {}, journal, ventureId: 'v1', clock: { now: fixedClock }, seams });
    const events = journal.readAll();
    expect(events.find((e) => e.event.includes('driver stranger_visitor fired')).kind).toBe('observation');
    expect(events.find((e) => e.event.includes('conversion_event threw')).finding_type).toBe('CANNOT_DRIVE');
    expect(journal.touchedTables()).toContain('preview_hits');
  });
});

describe('runArc (§H7 resume + §H3 coverage close-out)', () => {
  it('resumes past completed bands (journal is the continuation point) and closes coverage over O1..O10', async () => {
    const runId = 't-arc-resume';
    const pre = new RunJournal(runId, { baseDir: BASE, clock: fixedClock });
    pre.append({ kind: 'checkpoint', event: 'band S20 complete', detail: { band_complete: 20 } });
    expect(completedBands(pre).has(20)).toBe(true);

    const executeStage = vi.fn(async ({ stageNumber }) => ({ template: `stage-${stageNumber}`, artifactId: 'a', validation: { valid: true }, output: {} }));
    const advanceStage = vi.fn(async () => ({}));
    const res = await runArc({
      runId, entryStage: 20, toStage: 22, clockStart: '2026-07-12T09:00:00Z',
      supabase: fakeSupabase(), seams: { executeStage, advanceStage }, baseDir: BASE,
    });
    // S20 skipped (resumed), S21+S22 executed.
    expect(executeStage.mock.calls.map((c) => c[0].stageNumber)).toEqual([21, 22]);
    // Coverage close-out ran: uncovered requirements landed as findings (drivers were default CANNOT_DRIVE, which COUNTS as covered).
    expect(res.coverage.covered).toEqual(expect.arrayContaining(['O3', 'O5', 'O6', 'O8']));
    // O10 (QF-20260711-967): excluded from the per-loop matrix entirely — never a DEAD_LOOP
    // noise finding for O10 ITSELF — and graded once at run level instead. In this scenario
    // S20 was resumed/skipped so its O2 mapping never actually fires -> the composite
    // honestly reports NOT all-mapped (this is real signal, not the old guaranteed-noise bug).
    expect(res.coverage.uncovered).not.toContain('O10');
    expect(res.coverage.uncovered).toContain('O2');
    expect(res.o10.allMapped).toBe(false);
    expect(res.o10.residueClean).toBe(true);
    expect(res.o10.pass).toBe(false);
    const journal = new RunJournal(runId, { baseDir: BASE, clock: fixedClock });
    const o10Event = journal.readAll().find((e) => (e.o_requirements || []).includes('O10'));
    expect(o10Event.kind).toBe('finding');
    expect(o10Event.finding_type).toBe('DEAD_LOOP');
  });

  it('O10 passes when every band S20..S26 actually drives its O-mapping and containment is clean', async () => {
    const runId = 't-arc-o10-pass';
    const executeStage = vi.fn(async ({ stageNumber }) => ({ template: `stage-${stageNumber}`, artifactId: 'a', validation: { valid: true }, output: {} }));
    const advanceStage = vi.fn(async () => ({}));
    const res = await runArc({
      runId, entryStage: 20, toStage: 26, clockStart: '2026-07-12T09:00:00Z',
      supabase: fakeSupabase(), seams: { executeStage, advanceStage }, baseDir: BASE,
    });
    expect(res.coverage.uncovered).toEqual([]);
    expect(res.o10).toEqual({ pass: true, allMapped: true, residueClean: true, journalDurable: true });
    const journal = new RunJournal(runId, { baseDir: BASE, clock: fixedClock });
    const o10Event = journal.readAll().find((e) => (e.o_requirements || []).includes('O10'));
    expect(o10Event.kind).toBe('observation');
  });

  it('containment sweep journals scheduler residue as a RESIDUE finding when rows exist mid-run', async () => {
    const executeStage = vi.fn(async () => ({ artifactId: 'a', validation: { valid: true }, output: {} }));
    const res = await runArc({
      runId: 't-arc-residue', entryStage: 21, toStage: 21, clockStart: '2026-07-12T09:00:00Z',
      supabase: fakeSupabase({ schedulerRows: 3 }), seams: { executeStage, advanceStage: vi.fn(async () => ({})) }, baseDir: BASE,
    });
    const journal = new RunJournal('t-arc-residue', { baseDir: BASE, clock: fixedClock });
    const residue = journal.readAll().filter((e) => e.finding_type === 'RESIDUE');
    expect(residue.length).toBeGreaterThanOrEqual(1);
    // O10 must fail when the run's own containment sweep found residue mid-run.
    expect(res.o10.residueClean).toBe(false);
    expect(res.o10.pass).toBe(false);
    expect(residue[0].event).toMatch(/ghost-venture class/);
    expect(res.ventureId).toBe('v-fixture');
  });
});

describe('advance policy (SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001: seed the gate, never bypass it)', () => {

  it('real-gates (default) excludes fixture_artifact_seed; fixture-artifact-seed enumerates it', () => {
    expect(ADVANCE_POLICIES).toEqual(['real-gates', 'fixture-artifact-seed']);
    expect(allowedDivergencesFor('real-gates')).not.toContain(FIXTURE_ARTIFACT_SEED_DIVERGENCE);
    expect(allowedDivergencesFor('fixture-artifact-seed')).toContain(FIXTURE_ARTIFACT_SEED_DIVERGENCE);
  });

  it('fixture-artifact-seed: journals the REAL block first, seeds the missing artifacts, retries the REAL advance, band completes', async () => {
    const journal = new RunJournal('t-policy-seed', { baseDir: BASE, clock: fixedClock });
    const executeStage = vi.fn(async () => ({ artifactId: 'a', validation: { valid: true }, output: {} }));
    // First advance blocked by the artifact gate; retry after seeding succeeds.
    const advanceStage = vi.fn()
      .mockRejectedValueOnce(new Error('STAGE_ADVANCEMENT_ARTIFACT_GATE: missing required artifact(s): market_analysis'))
      .mockResolvedValueOnce({});
    const seedMissingArtifacts = vi.fn(async () => ({ seeded: ['market_analysis'], source: 'canonical', blocked: true }));
    const r = await runBand({
      supabase: {}, journal, ventureId: 'v1', stage: 20, clock: { now: fixedClock },
      seams: { executeStage, advanceStage, seedMissingArtifacts }, advancePolicy: 'fixture-artifact-seed',
    });
    expect(r).toMatchObject({ advanced: true, seeded: ['market_analysis'] });
    expect(advanceStage).toHaveBeenCalledTimes(2); // real path both times — no raw write
    const events = journal.readAll();
    expect(events.some((e) => e.event.includes('BLOCKED by live gates'))).toBe(true); // drivability evidence preserved (§H2)
    expect(events.find((e) => e.event.includes('allowed test-mode divergence: fixture_artifact_seed'))).toBeTruthy();
    expect(events.find((e) => e.event.includes('after fixture-artifact seed'))).toBeTruthy();
    expect(events.find((e) => e.kind === 'checkpoint').detail.band_complete).toBe(20);
  });

  it('fixture-artifact-seed: a non-artifact block (0 missing) halts honestly — no fallback, no forced set', async () => {
    const journal = new RunJournal('t-policy-seed-prose', { baseDir: BASE, clock: fixedClock });
    const advanceStage = vi.fn(async () => { throw new Error('blocked by exit-gate enforcer: no verifier registered for a BINDING gate'); });
    const seedMissingArtifacts = vi.fn(async () => ({ seeded: [], source: 'canonical', blocked: false }));
    const r = await runBand({
      supabase: {}, journal, ventureId: 'v1', stage: 23, clock: { now: fixedClock },
      seams: { executeStage: vi.fn(async () => ({ output: {}, validation: { valid: true } })), advanceStage, seedMissingArtifacts },
      advancePolicy: 'fixture-artifact-seed',
    });
    expect(r).toMatchObject({ advanced: false, executed: true });
    expect(advanceStage).toHaveBeenCalledTimes(1); // no retry when nothing was seeded
    const events = journal.readAll();
    expect(events.find((e) => e.event.includes('not artifact-gate-satisfiable'))).toBeTruthy();
    expect(events.some((e) => e.event.includes('FORCED'))).toBe(false); // the raw-write hatch is gone
  });

  it('real-gates policy is byte-identical to before: block -> checkpoint, no seeding attempted', async () => {
    const journal = new RunJournal('t-policy-real', { baseDir: BASE, clock: fixedClock });
    const advanceStage = vi.fn(async () => { throw new Error('blocked'); });
    const seedMissingArtifacts = vi.fn(async () => ({ seeded: [], source: null, blocked: false }));
    const r = await runBand({
      supabase: {}, journal, ventureId: 'v1', stage: 20, clock: { now: fixedClock },
      seams: { executeStage: vi.fn(async () => ({ output: {}, validation: { valid: true } })), advanceStage, seedMissingArtifacts },
    });
    expect(r).toMatchObject({ advanced: false, executed: true });
    expect(seedMissingArtifacts).not.toHaveBeenCalled();
    expect(journal.readAll().some((e) => e.event.includes('FORCED'))).toBe(false);
  });

  it('pin: zero raw current_lifecycle_stage writes remain in the harness (the hatch is deleted)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../scripts/harness/s20-run.mjs', import.meta.url), 'utf8');
    // Functional surface only (a historical provenance comment may still NAME the old
    // hatch): no raw stage-pointer write, no forced-stage-set policy, no force seam.
    expect(src).not.toMatch(/update\(\s*\{\s*current_lifecycle_stage/);
    expect(ADVANCE_POLICIES).not.toContain('forced-stage-set');
    expect(src).not.toMatch(/seams\.forceStageSet/);
  });
});
