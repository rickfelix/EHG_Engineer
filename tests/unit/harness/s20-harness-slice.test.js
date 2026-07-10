/**
 * S20-26 simulated-run harness — Bravo slice (§H1 fixture + §H2 journal seam + §H9
 * calibration) per docs/design/s20-26-simulated-run-harness-spec.md.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunJournal, FINDING_TYPES } from '../../../lib/harness/run-journal.mjs';
import { buildFixtureVentureRow, FIXTURE_NAME_PREFIX, CORE_FIXTURE_TABLES, requiredArtifactsForStages } from '../../../scripts/harness/s20-fixture.mjs';
import { runCalibration } from '../../../scripts/harness/calibration.mjs';
import { isFixtureVenture } from '../../../lib/eva/chairman-decision-watcher.js';

const TMP = mkdtempSync(join(tmpdir(), 'harness-test-'));
afterAll(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ } });

const fixedClock = () => '2026-07-12T00:00:00.000Z';

describe('§H1: fixture venture row contract', () => {
  const row = buildFixtureVentureRow('run1');

  it('trips the CANONICAL fixture discriminant (isFixtureVenture) — never reaches the chairman queue', () => {
    expect(isFixtureVenture(row)).toBe(true);
    expect(row.is_demo).toBe(true);
  });

  it('carries every exclusion marker: is_synthetic, TEST- family name, metadata.is_fixture/synthetic', () => {
    expect(row.is_synthetic).toBe(true);
    expect(row.name.startsWith(FIXTURE_NAME_PREFIX)).toBe(true);
    expect(row.name.startsWith('TEST-')).toBe(true);
    expect(row.metadata.is_fixture).toBe(true);
    expect(row.metadata.synthetic).toBe(true);
    expect(row.metadata.harness.run_id).toBe('run1');
    expect(row.metadata.harness.spec).toContain('s20-26-simulated-run-harness-spec');
  });

  it('enters at S20 by default (band under audit starts the run; earlier stages are history)', () => {
    expect(row.current_lifecycle_stage).toBe(20);
    expect(buildFixtureVentureRow('r', { entryStage: 21 }).current_lifecycle_stage).toBe(21);
  });

  it('core teardown tables include the §H5 fence-6 ghost-venture residue classes', () => {
    expect(CORE_FIXTURE_TABLES).toContain('eva_scheduler_queue');
    expect(CORE_FIXTURE_TABLES).toContain('eva_scheduler_metrics');
  });
});

describe('§H1: data-driven pre-S20 artifact requirements (same sources as the real gate)', () => {
  function mockSb({ canonical = [], legacy = [] }) {
    return { from: (table) => {
      const c = {
        select: () => c, gte: () => c, lte: () => c, eq: () => c,
        then: (res) => Promise.resolve({ data: table === 'venture_stages' ? canonical : legacy, error: null }).then(res),
      };
      return c;
    } };
  }

  it('unions canonical venture_stages.required_artifacts with blocking legacy rows, first-stage-wins', async () => {
    const sb = mockSb({
      canonical: [
        { stage_number: 3, required_artifacts: ['stage_analysis'] },
        { stage_number: 17, required_artifacts: ['locked_prompt_snapshot', 'stage_analysis'] },
      ],
      legacy: [{ stage_number: 11, artifact_type: 'identity_brand_name' }],
    });
    const req = await requiredArtifactsForStages(sb, 1, 19);
    expect(req.get('stage_analysis')).toBe(3);           // first stage requiring it wins
    expect(req.get('locked_prompt_snapshot')).toBe(17);
    expect(req.get('identity_brand_name')).toBe(11);     // legacy fallback included
    expect(req.size).toBe(3);
  });
});

describe('§H2/§H3: run journal seam', () => {
  it('is append-only with a continuing sequence across reopen (§H7 checkpoint-resume)', () => {
    const j1 = new RunJournal('resume-run', { baseDir: TMP, clock: fixedClock });
    j1.append({ kind: 'observation', event: 'a', o_requirements: ['O1'] });
    j1.append({ kind: 'checkpoint', event: 'cap boundary' });
    const j2 = new RunJournal('resume-run', { baseDir: TMP, clock: fixedClock });
    const e = j2.append({ kind: 'observation', event: 'b', o_requirements: ['O2'] });
    expect(e.seq).toBe(3);
    expect(j2.readAll().map((x) => x.seq)).toEqual([1, 2, 3]);
  });

  it('coverage matrix: every planned requirement is observed OR becomes a DEAD_LOOP finding', () => {
    const j = new RunJournal('coverage-run', { baseDir: TMP, clock: fixedClock });
    j.append({ kind: 'observation', event: 'x', o_requirements: ['O1'] });
    j.finding('CANNOT_DRIVE', 'O3 not synthetically drivable', {});
    // findings count as coverage only when they name the requirement:
    const j2 = new RunJournal('coverage-run2', { baseDir: TMP, clock: fixedClock });
    j2.append({ kind: 'observation', event: 'x', o_requirements: ['O1'] });
    j2.append({ kind: 'finding', finding_type: 'CANNOT_DRIVE', event: 'O3 undrivable', o_requirements: ['O3'] });
    const cov = j2.checkCoverage(['O1', 'O2', 'O3']);
    expect(cov.covered.sort()).toEqual(['O1', 'O3']);
    expect(cov.uncovered).toEqual(['O2']);
    expect(cov.findings[0].finding_type).toBe('DEAD_LOOP');
  });

  it('unenumerated divergence journals as TEST_MODE_DIVERGENCE; enumerated ones as observations', () => {
    const j = new RunJournal('div-run', { baseDir: TMP, clock: fixedClock });
    const allowed = j.assertDivergenceAllowed('stripe_test_keys', ['stripe_test_keys']);
    expect(allowed.kind).toBe('observation');
    const rogue = j.assertDivergenceAllowed('live_email_send', ['stripe_test_keys']);
    expect(rogue.finding_type).toBe('TEST_MODE_DIVERGENCE');
  });

  it('gauge provenance: unreached declared source is a NO_DATA_GAUGE finding, never swallowed', () => {
    const j = new RunJournal('gauge-run', { baseDir: TMP, clock: fixedClock });
    expect(j.gaugeProvenance('g1', 'tbl', true).kind).toBe('gauge_provenance');
    expect(j.gaugeProvenance('g2', 'missing_tbl', false).finding_type).toBe('NO_DATA_GAUGE');
  });

  it('touched-tables set is generated from events (feeds §H6 teardown assertions)', () => {
    const j = new RunJournal('tables-run', { baseDir: TMP, clock: fixedClock });
    j.append({ kind: 'observation', event: 'a', touched_tables: ['t_b', 't_a'] });
    j.append({ kind: 'observation', event: 'b', touched_tables: ['t_a', 't_c'] });
    expect(j.touchedTables()).toEqual(['t_a', 't_b', 't_c']);
  });

  it('rejects unknown kinds and untyped findings (contract is closed, not stringly)', () => {
    const j = new RunJournal('strict-run', { baseDir: TMP, clock: fixedClock });
    expect(() => j.append({ kind: 'vibes', event: 'x' })).toThrow(/unknown journal kind/);
    expect(() => j.append({ kind: 'finding', event: 'x', finding_type: 'SOMETHING' })).toThrow(/finding_type/);
    expect(FINDING_TYPES).toContain('TEST_MODE_DIVERGENCE');
  });
});

describe('§H9: seeded-defect calibration (the instrument cannot be fooled)', () => {
  it('detects BOTH seeded defects (dead loop + broken gauge) plus divergence and resume invariants', () => {
    const { report } = runCalibration({ baseDir: TMP, clock: fixedClock });
    const byCheck = Object.fromEntries(report.checks.map((c) => [c.check, c.pass]));
    expect(byCheck.seeded_dead_loop_detected).toBe(true);
    expect(byCheck.seeded_broken_gauge_detected).toBe(true);
    expect(byCheck.unenumerated_divergence_detected).toBe(true);
    expect(byCheck.touched_tables_generated).toBe(true);
    expect(byCheck.journal_resume_continues_sequence).toBe(true);
    expect(report.pass).toBe(true);
  });
});
