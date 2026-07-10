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
  allowedDivergencesFor, FORCED_STAGE_SET_DIVERGENCE, ADVANCE_POLICIES,
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
    // O10 (acceptance) has no band/driver — must end as a DEAD_LOOP coverage finding, proving the matrix bites.
    expect(res.coverage.uncovered).toContain('O10');
    const journal = new RunJournal(runId, { baseDir: BASE, clock: fixedClock });
    expect(journal.readAll().some((e) => e.kind === 'finding' && (e.detail.o_requirements || e.o_requirements || []).includes('O10'))).toBe(true);
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
    expect(residue[0].event).toMatch(/ghost-venture class/);
    expect(res.ventureId).toBe('v-fixture');
  });
});

describe('advance policy (smoke-decode follow-up: unresolvable S20/S23 gates)', () => {

  it('real-gates (default) excludes forced_stage_set; forced-stage-set enumerates it', () => {
    expect(ADVANCE_POLICIES).toEqual(['real-gates', 'forced-stage-set']);
    expect(allowedDivergencesFor('real-gates')).not.toContain(FORCED_STAGE_SET_DIVERGENCE);
    expect(allowedDivergencesFor('forced-stage-set')).toContain(FORCED_STAGE_SET_DIVERGENCE);
  });

  it('forced-stage-set: journals the REAL block first, then the sanctioned forced set, and the band completes', async () => {
    const journal = new RunJournal('t-policy-forced', { baseDir: BASE, clock: fixedClock });
    const executeStage = vi.fn(async () => ({ artifactId: 'a', validation: { valid: true }, output: {} }));
    const advanceStage = vi.fn(async () => { throw new Error('blocked by exit-gate enforcer: no verifier registered for a BINDING gate'); });
    const forceStageSet = vi.fn(async () => {});
    const r = await runBand({
      supabase: {}, journal, ventureId: 'v1', stage: 20, clock: { now: fixedClock },
      seams: { executeStage, advanceStage, forceStageSet }, advancePolicy: 'forced-stage-set',
    });
    expect(r).toMatchObject({ advanced: true, forced: true });
    const events = journal.readAll();
    expect(events.some((e) => e.event.includes('BLOCKED by live gates'))).toBe(true); // drivability evidence preserved
    expect(events.find((e) => e.event.includes('allowed test-mode divergence: forced_stage_set'))).toBeTruthy();
    expect(events.find((e) => e.event.includes('FORCED stage set'))).toBeTruthy();
    expect(events.find((e) => e.kind === 'checkpoint').detail.band_complete).toBe(20);
  });

  it('real-gates policy is byte-identical to before: block -> checkpoint, no forced set', async () => {
    const journal = new RunJournal('t-policy-real', { baseDir: BASE, clock: fixedClock });
    const advanceStage = vi.fn(async () => { throw new Error('blocked'); });
    const forceStageSet = vi.fn(async () => {});
    const r = await runBand({
      supabase: {}, journal, ventureId: 'v1', stage: 20, clock: { now: fixedClock },
      seams: { executeStage: vi.fn(async () => ({ output: {}, validation: { valid: true } })), advanceStage, forceStageSet },
    });
    expect(r).toMatchObject({ advanced: false, executed: true });
    expect(forceStageSet).not.toHaveBeenCalled();
    expect(journal.readAll().some((e) => e.event.includes('FORCED'))).toBe(false);
  });
});
