#!/usr/bin/env node
/**
 * SD-LEO-INFRA-REALIZE-GATE-CALIBRATION-001 (FR-3)
 *
 * Runs the named live reader (lib/discovery/calibration-cohort-reader.js) over the
 * opportunity-blueprint calibration cohort and prints a human-readable aggregate report:
 * cohort size, per-check pass/fail counts, and score distribution. Informs the future
 * SD-MAN-INFRA-GATE-BAR-REGIME-001 threshold decision -- this script only measures and
 * reports; it never sets or enforces a bar.
 *
 * --stamp marks each consumed row's metadata.calibration_read_at (metadata-only write, no
 * schema migration), which is what the vision-gauge probe flip (lib/vision/vdr-registry.js,
 * "Calibrate the gates") reads to distinguish a realized, consumed cohort from a merely-
 * computed, unread one.
 *
 * OUT OF SCOPE / DOCUMENTED, NOT SILENTLY DROPPED: the four 2026-08-29 venture-lifecycle
 * gate incidents (reject-path kill, stale kill array, vacuous UAT declination, direction-
 * blind check) are NOT usable fixtures for this cohort. They are chairman_decisions /
 * venture_stage_transitions rows, not opportunity_blueprints rows with an intake_bar score --
 * a structurally different record shape this reader has no adapter for. See
 * lib/discovery/calibration-cohort-reader.js's header for the full census.
 *
 * Usage:
 *   node scripts/discovery/calibration-cohort-report.mjs [--stamp]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { readCalibrationCohort } from '../../lib/discovery/calibration-cohort-reader.js';

function parseArgs(argv) {
  return { stamp: argv.includes('--stamp') };
}

function printReport(report) {
  console.log('=== Calibration Cohort Report (opportunity_blueprints intake_bar) ===');
  console.log(`Cohort size: ${report.cohort_size}`);
  if (report.cohort_size === 0) {
    console.log('(empty cohort -- nothing discovered has been stamped calibration_cohort=true yet)');
    return;
  }
  console.log('\nPer-check pass/fail:');
  for (const [id, c] of Object.entries(report.checks)) {
    const total = c.pass + c.fail;
    const rate = total > 0 ? Math.round((c.pass / total) * 100) : 0;
    console.log(`  ${id}: ${c.pass}/${total} pass (${rate}%) -- "${c.label}"`);
  }
  console.log('\nScore histogram:');
  for (const [score, count] of Object.entries(report.score_histogram).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    console.log(`  ${score}/7: ${count} blueprint(s)`);
  }
  if (report.stamped > 0) {
    console.log(`\nStamped calibration_read_at on ${report.stamped} row(s).`);
  }
}

async function main() {
  const { stamp } = parseArgs(process.argv.slice(2));
  const supabase = createSupabaseServiceClient();
  const report = await readCalibrationCohort({ supabase, stamp });
  printReport(report);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('calibration-cohort-report failed:', err.message);
    process.exitCode = 1;
  });
}
