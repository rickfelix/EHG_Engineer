/**
 * Unit pins for scripts/harness/verify-s20-run.mjs's assertion logic
 * (SD-LEO-INFRA-S20-26-SIMULATED-RUN-001, FR-3). Pure-local: synthetic in-memory
 * payloads shaped like the real finalize-mirror row captured from a live run
 * (run_id s2026-hotel-0817). No DB, no network.
 *
 * @module tests/unit/harness/verify-s20-run.test
 */
import { describe, it, expect } from 'vitest';
import {
  STAGE_ZERO_TABLES,
  checkFinalizeMirrorRow,
  checkPerStageTelemetry,
  checkSpawnEnvFenceHeld,
  checkSyntheticFixtureConvention,
  checkStageZeroNonInterference,
  runAllChecks,
} from '../../../scripts/harness/verify-s20-run.mjs';

/** Minimal entries mirroring the real shape, one per traversed stage 20-26. */
function makeGoodEntries() {
  const entries = [
    { kind: 'lifecycle', event: 'run arc started (S20..S26)', detail: { venture_id: 'v-fixture' }, touched_tables: [] },
    { kind: 'fence_assertion', event: 'H5.1 spawn-env: STRIPE_SECRET_KEY carries no live key (unset/placeholder)', detail: { live_key_reachable: false }, touched_tables: [] },
  ];
  for (const s of [20, 21, 22, 23, 24, 25, 26]) {
    entries.push({ kind: 'observation', event: `S${s} executeStage ran (template=stage-${s}, valid=true)`, touched_tables: ['venture_artifacts', 'system_events'] });
    entries.push({ kind: 'checkpoint', event: `band S${s} checkpoint (advance blocked — drivability edge)`, touched_tables: [] });
  }
  entries.push({ kind: 'observation', event: 'allowed test-mode divergence: synthetic_fixture_venture', touched_tables: [] });
  entries.push({ kind: 'lifecycle', event: 'finalize-mirror snapshot sealed (system_events, harness_run_journal_finalized)', touched_tables: [] });
  return entries;
}

describe('checkFinalizeMirrorRow', () => {
  it('PASS: exactly one row with non-empty entries', () => {
    const rows = [{ payload: { run_id: 'r1', entries: makeGoodEntries() } }];
    const result = checkFinalizeMirrorRow(rows);
    expect(result.pass).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('FAIL: no row found (non-vacuous — proves the check inspects row count, not just truthiness)', () => {
    const result = checkFinalizeMirrorRow([]);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no harness_run_journal_finalized row/);
  });

  it('FAIL: more than one row (idempotency-key violation would never happen, but the check must still catch it)', () => {
    const rows = [{ payload: { entries: makeGoodEntries() } }, { payload: { entries: makeGoodEntries() } }];
    const result = checkFinalizeMirrorRow(rows);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/expected exactly 1/);
  });
});

describe('checkPerStageTelemetry', () => {
  it('PASS: every stage 20-26 mentioned', () => {
    const result = checkPerStageTelemetry(makeGoodEntries());
    expect(result.pass).toBe(true);
  });

  it('FAIL: a stage missing from the journal is named in the failure reason', () => {
    const entries = makeGoodEntries().filter((e) => !(typeof e.event === 'string' && e.event.includes('S24')));
    const result = checkPerStageTelemetry(entries);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('24');
  });
});

describe('checkSpawnEnvFenceHeld', () => {
  it('PASS: fence entry present with live_key_reachable=false', () => {
    const result = checkSpawnEnvFenceHeld(makeGoodEntries());
    expect(result.pass).toBe(true);
  });

  it('FAIL: fence entry missing entirely', () => {
    const entries = makeGoodEntries().filter((e) => !(e.kind === 'fence_assertion' && e.event.includes('spawn-env')));
    const result = checkSpawnEnvFenceHeld(entries);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no H5\.1 spawn-env/);
  });

  it('FAIL: a live key WAS reachable — the exact breach this fence exists to catch', () => {
    const entries = makeGoodEntries().map((e) =>
      e.event.includes('spawn-env') ? { ...e, detail: { live_key_reachable: true } } : e,
    );
    const result = checkSpawnEnvFenceHeld(entries);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('true');
  });
});

describe('checkSyntheticFixtureConvention', () => {
  it('PASS: synthetic_fixture_venture divergence observed', () => {
    const result = checkSyntheticFixtureConvention(makeGoodEntries());
    expect(result.pass).toBe(true);
  });

  it('FAIL: divergence entry absent', () => {
    const entries = makeGoodEntries().filter((e) => !e.event.includes('synthetic_fixture_venture'));
    const result = checkSyntheticFixtureConvention(entries);
    expect(result.pass).toBe(false);
  });
});

describe('checkStageZeroNonInterference', () => {
  it('PASS: touched_tables union contains zero Stage-Zero-namespace tables', () => {
    const result = checkStageZeroNonInterference(makeGoodEntries());
    expect(result.pass).toBe(true);
    expect(result.touched).toEqual(expect.arrayContaining(['venture_artifacts', 'system_events']));
  });

  it('FAIL: a Stage-Zero table appears in touched_tables (the exact interference this check exists to catch)', () => {
    const entries = makeGoodEntries();
    entries.push({ kind: 'observation', event: 'unexpected write', touched_tables: ['venture_nursery'] });
    const result = checkStageZeroNonInterference(entries);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('venture_nursery');
  });

  it('sanity: STAGE_ZERO_TABLES is non-empty and does not include the shared "ventures" table', () => {
    expect(STAGE_ZERO_TABLES.length).toBeGreaterThan(5);
    expect(STAGE_ZERO_TABLES).not.toContain('ventures');
  });
});

describe('runAllChecks (composition)', () => {
  it('PASS: a fully-correct payload passes every check', () => {
    const rows = [{ payload: { entries: makeGoodEntries() } }];
    const result = runAllChecks(rows);
    expect(result.pass).toBe(true);
    expect(Object.values(result.checks).every((c) => c.pass)).toBe(true);
  });

  it('FAIL: short-circuits cleanly when the mirror row itself is missing', () => {
    const result = runAllChecks([]);
    expect(result.pass).toBe(false);
    expect(result.checks.finalize_mirror_row.pass).toBe(false);
    expect(result.checks.per_stage_telemetry).toBeUndefined();
  });

  it('FAIL: one bad sub-check fails the whole composition without masking which one', () => {
    const entries = makeGoodEntries().filter((e) => !e.event.includes('synthetic_fixture_venture'));
    const rows = [{ payload: { entries } }];
    const result = runAllChecks(rows);
    expect(result.pass).toBe(false);
    expect(result.checks.synthetic_fixture_convention.pass).toBe(false);
    expect(result.checks.per_stage_telemetry.pass).toBe(true);
  });
});
