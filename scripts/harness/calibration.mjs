#!/usr/bin/env node
/**
 * S20-26 harness SEEDED-DEFECT CALIBRATION — spec §H9 build-acceptance
 * (docs/design/s20-26-simulated-run-harness-spec.md).
 *
 * Before the real run: prove the instrument CANNOT be fooled — deliberately kill one ops
 * loop and break one gauge's source, then assert the journal machinery DETECTS both
 * (a DEAD_LOOP coverage finding + a NO_DATA_GAUGE provenance finding). An instrument that
 * returns green on a dead loop cannot audit a band suspected of dead loops.
 *
 * Calibration is PURE-LOCAL (no DB): it exercises the journal/coverage/provenance seams
 * with a synthetic planned-observation set. Green calibration = harness GO for the run.
 *
 * Usage: node scripts/harness/calibration.mjs [--keep]
 * Exit 0 = calibration PASSED (both seeded defects detected); 1 = instrument FAILED.
 */
import { rmSync } from 'node:fs';
import { RunJournal } from '../../lib/harness/run-journal.mjs';

export function runCalibration({ baseDir = '.harness-runs', clock } = {}) {
  const runId = `calibration-${process.pid}-${Math.floor(Math.random() * 1e6)}`;
  const journal = new RunJournal(runId, { baseDir, clock });
  const report = { runId, checks: [], pass: false };

  // ---- Seeded defect 1: a DEAD LOOP -------------------------------------------------
  // Plan three requirements; deliberately drive only two. The coverage matrix MUST
  // convert the un-driven one into a DEAD_LOOP finding — silence here fails calibration.
  const planned = ['O-CAL-1', 'O-CAL-2', 'O-CAL-3'];
  journal.append({ kind: 'observation', event: 'loop A fired (driven)', o_requirements: ['O-CAL-1'], touched_tables: ['cal_table_a'] });
  journal.append({ kind: 'observation', event: 'loop B fired (driven)', o_requirements: ['O-CAL-2'], touched_tables: ['cal_table_b'] });
  // O-CAL-3's loop is DELIBERATELY not driven (the seeded dead loop).
  const coverage = journal.checkCoverage(planned);
  const deadLoopDetected = coverage.uncovered.length === 1
    && coverage.uncovered[0] === 'O-CAL-3'
    && coverage.findings.length === 1
    && coverage.findings[0].finding_type === 'DEAD_LOOP';
  report.checks.push({ check: 'seeded_dead_loop_detected', pass: deadLoopDetected, detail: coverage });
  // Journal the coverage findings as first-class rows (the run protocol does the same).
  for (const f of coverage.findings) journal.finding(f.finding_type, f.event, { o_requirements: f.o_requirements });

  // ---- Seeded defect 2: a BROKEN GAUGE SOURCE ----------------------------------------
  // Point one gauge at a source that was never consulted; provenance verification MUST
  // journal a NO_DATA_GAUGE finding (O4: declared source actually consulted, or loud).
  journal.gaugeProvenance('cal_gauge_healthy', 'cal_table_a', true);
  const broken = journal.gaugeProvenance('cal_gauge_broken', 'nonexistent_source_table', false);
  const gaugeDetected = broken.kind === 'finding' && broken.finding_type === 'NO_DATA_GAUGE';
  report.checks.push({ check: 'seeded_broken_gauge_detected', pass: gaugeDetected, detail: { broken } });

  // ---- Instrument invariants ----------------------------------------------------------
  // Divergence seam: an unenumerated divergence must land as TEST_MODE_DIVERGENCE.
  const div = journal.assertDivergenceAllowed('unsanctioned_live_send', ['stripe_test_keys', 'preview_only_deploy']);
  const divergenceDetected = div.kind === 'finding' && div.finding_type === 'TEST_MODE_DIVERGENCE';
  report.checks.push({ check: 'unenumerated_divergence_detected', pass: divergenceDetected, detail: { div } });

  // Touched-tables generation (feeds §H6 teardown assertions) must reflect observations.
  const tables = journal.touchedTables();
  const tablesGenerated = tables.includes('cal_table_a') && tables.includes('cal_table_b');
  report.checks.push({ check: 'touched_tables_generated', pass: tablesGenerated, detail: { tables } });

  // Append-only + resume: a re-opened journal continues the sequence (§H7 checkpoint).
  const reopened = new RunJournal(runId, { baseDir, clock });
  const before = reopened.readAll().length;
  reopened.append({ kind: 'checkpoint', event: 'calibration resume probe' });
  const resumeWorks = reopened.readAll().length === before + 1 && reopened.readAll()[before].seq === before + 1;
  report.checks.push({ check: 'journal_resume_continues_sequence', pass: resumeWorks, detail: { before } });

  report.pass = report.checks.every((c) => c.pass);
  return { report, journalPath: journal.path, runId };
}

function main() {
  const keep = process.argv.includes('--keep');
  const { report, journalPath, runId } = runCalibration();
  for (const c of report.checks) {
    console.log(`HARNESS_CALIBRATION check=${c.check} pass=${c.pass}`);
  }
  console.log(`HARNESS_CALIBRATION_RESULT=${report.pass ? 'GO' : 'NO-GO'} run=${runId} journal=${journalPath}`);
  if (!keep) {
    try { rmSync(journalPath.replace(/journal\.jsonl$/, ''), { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  process.exit(report.pass ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main();
}
