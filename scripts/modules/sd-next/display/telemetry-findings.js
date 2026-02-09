/**
 * Telemetry Findings Display for SD-Next
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C
 *
 * Renders latest bottleneck analysis findings in the sd:next output.
 */

import { colors } from '../colors.js';

/**
 * Display telemetry findings section in sd:next output.
 *
 * @param {object} findings - Result from getLatestFindings()
 * @param {object} [opts={}]
 * @param {boolean} [opts.verbose=false] - Show detailed bottleneck data
 */
export function displayTelemetryFindings(findings, opts = {}) {
  if (!findings) return;

  console.log(`${colors.bold}${colors.cyan}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold} WORKFLOW TELEMETRY${colors.reset}`);
  console.log(`${colors.cyan}───────────────────────────────────────────────────────────────────${colors.reset}`);

  if (!findings.hasFreshFindings) {
    const msg = 'No workflow telemetry analysis available yet';
    if (findings.activeRun) {
      const status = findings.activeRun.status === 'RUNNING' ? 'running' : 'queued';
      console.log(`  ${colors.dim}${msg} (analysis ${status})${colors.reset}`);
    } else {
      console.log(`  ${colors.dim}${msg}${colors.reset}`);
    }
    console.log('');
    return;
  }

  const run = findings.run;
  const age = findings.ageInDays;
  const ageLabel = age === 0 ? 'today' : age === 1 ? '1 day ago' : `${age} days ago`;
  const finishedDate = new Date(run.finished_at).toLocaleDateString();

  console.log(`  ${colors.dim}Last analysis: ${finishedDate} (${ageLabel})${colors.reset}`);

  if (run.reason_code === 'INSUFFICIENT_DATA') {
    console.log(`  ${colors.dim}Insufficient trace data for analysis${colors.reset}`);
    console.log('');
    return;
  }

  if (run.findings_count === 0) {
    console.log(`  ${colors.green}No bottlenecks detected${colors.reset}`);
    console.log('');
    return;
  }

  console.log(`  ${colors.yellow}${run.findings_count} bottleneck(s) detected${colors.reset}`);

  // Compact summary (max 5 lines per FR-5)
  const bottlenecks = run.output_ref?.bottlenecks || [];
  const summaryItems = bottlenecks.slice(0, 5);

  for (const b of summaryItems) {
    const ratioColor = b.ratio >= 5 ? colors.red : colors.yellow;
    console.log(
      `  ${ratioColor}${b.ratio}x${colors.reset} ${b.dimension_type}:${b.dimension_key} ` +
      `${colors.dim}(p50=${b.observed_p50_ms}ms vs baseline=${b.baseline_p50_ms}ms)${colors.reset}`
    );
  }

  if (bottlenecks.length > 5) {
    console.log(`  ${colors.dim}... and ${bottlenecks.length - 5} more${colors.reset}`);
  }

  // Verbose: full details
  if (opts.verbose && bottlenecks.length > 0) {
    console.log(`\n  ${colors.bold}Details:${colors.reset}`);
    for (const b of bottlenecks) {
      console.log(`  ${colors.bold}${b.dimension_type}:${b.dimension_key}${colors.reset}`);
      console.log(`    Observed P50: ${b.observed_p50_ms}ms | Baseline P50: ${b.baseline_p50_ms}ms | Ratio: ${b.ratio}x`);
      console.log(`    Samples: ${b.sample_count} | Exceedances: ${b.exceedance_count}`);
      if (b.improvement_id) {
        console.log(`    Improvement: ${b.improvement_id}`);
      }
    }
  }

  // Metadata line
  const meta = run.output_ref || {};
  if (meta.traces_scanned) {
    console.log(`  ${colors.dim}(${meta.traces_scanned} traces, ${meta.dimensions_evaluated} dimensions, ${run.duration_ms}ms)${colors.reset}`);
  }

  console.log('');
}
