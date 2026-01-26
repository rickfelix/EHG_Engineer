/**
 * DOCMON Reporter
 * Standardized output formatting for DOCMON validators
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */

import fs from 'fs';
import path from 'path';
import { EXIT_CODES } from './config-loader.js';

/**
 * Create a validation result object
 */
export function createResult(filePath, status, details = {}) {
  return {
    path: filePath,
    status, // 'valid', 'invalid', 'skipped'
    ...details,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create a validator report
 */
export function createReport(validatorName, results, metadata = {}) {
  const valid = results.filter(r => r.status === 'valid');
  const invalid = results.filter(r => r.status === 'invalid');
  const skipped = results.filter(r => r.status === 'skipped');

  return {
    validator: validatorName,
    version: metadata.version || '1.0.0',
    timestamp: new Date().toISOString(),
    execution_time_ms: metadata.executionTime || 0,
    config_version: metadata.configVersion || null,
    summary: {
      total: results.length,
      valid: valid.length,
      invalid: invalid.length,
      skipped: skipped.length,
      pass_rate: results.length > 0
        ? Math.round((valid.length / (results.length - skipped.length)) * 100)
        : 100
    },
    results: {
      valid: valid.map(r => r.path),
      invalid: invalid.map(r => ({
        path: r.path,
        rule_id: r.rule_id || null,
        reason: r.reason || null,
        suggestion: r.suggestion || null
      })),
      skipped: skipped.map(r => ({
        path: r.path,
        reason: r.reason || 'skipped'
      }))
    }
  };
}

/**
 * Merge multiple validator reports into a combined report
 */
export function mergeReports(reports, metadata = {}) {
  const totalInvalid = reports.reduce(
    (sum, r) => sum + r.summary.invalid, 0
  );

  const violationTypes = {};
  for (const report of reports) {
    for (const inv of report.results.invalid) {
      const type = inv.rule_id || report.validator;
      violationTypes[type] = (violationTypes[type] || 0) + 1;
    }
  }

  // Sort violation types by count
  const topViolations = Object.entries(violationTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));

  return {
    docmon_version: '1.0.0',
    timestamp: new Date().toISOString(),
    execution_time_ms: metadata.executionTime || 0,
    base_ref: metadata.baseRef || null,
    changed_only: metadata.changedOnly || false,
    summary: {
      validators_run: reports.length,
      total_files_checked: Math.max(...reports.map(r => r.summary.total)),
      total_violations: totalInvalid,
      top_violations: topViolations,
      exit_code: totalInvalid > 0 ? EXIT_CODES.VALIDATION_FAILED : EXIT_CODES.PASS
    },
    validators: reports.reduce((acc, r) => {
      acc[r.validator] = {
        ...r.summary,
        config_version: r.config_version,
        execution_time_ms: r.execution_time_ms
      };
      return acc;
    }, {}),
    all_invalid: reports.flatMap(r =>
      r.results.invalid.map(inv => ({
        ...inv,
        validator: r.validator
      }))
    )
  };
}

/**
 * Format text output for console
 */
export function formatTextOutput(report, options = {}) {
  const { verbose = false, showValid = false } = options;
  const lines = [];

  lines.push(`\n${'='.repeat(60)}`);
  lines.push(`  DOCMON ${report.validator.toUpperCase()} VALIDATION`);
  lines.push(`${'='.repeat(60)}\n`);

  // Summary line (Chairman persona friendly)
  lines.push(`  Files: ${report.summary.total} checked | ${report.summary.valid} valid | ${report.summary.invalid} violations | ${report.summary.skipped} skipped`);
  lines.push('');

  // Invalid files
  if (report.summary.invalid > 0) {
    lines.push(`  VIOLATIONS (${report.summary.invalid}):`);
    for (const inv of report.results.invalid.slice(0, 10)) {
      lines.push(`    ${inv.path}`);
      if (inv.rule_id) lines.push(`      Rule: ${inv.rule_id}`);
      if (inv.reason) lines.push(`      Reason: ${inv.reason}`);
      if (inv.suggestion) lines.push(`      Suggestion: ${inv.suggestion}`);
    }
    if (report.results.invalid.length > 10) {
      lines.push(`    ... and ${report.results.invalid.length - 10} more`);
    }
    lines.push('');
  }

  // Valid files (if verbose)
  if (verbose && showValid && report.summary.valid > 0) {
    lines.push(`  VALID (${report.summary.valid}):`);
    for (const p of report.results.valid.slice(0, 5)) {
      lines.push(`    ${p}`);
    }
    if (report.results.valid.length > 5) {
      lines.push(`    ... and ${report.results.valid.length - 5} more`);
    }
    lines.push('');
  }

  // Execution info
  if (verbose) {
    lines.push(`  Execution time: ${report.execution_time_ms}ms`);
    if (report.config_version) {
      lines.push(`  Config version: ${report.config_version}`);
    }
    lines.push('');
  }

  // Result
  const status = report.summary.invalid === 0 ? 'PASS' : 'FAIL';
  const icon = status === 'PASS' ? '\u2705' : '\u274c';
  lines.push(`  ${icon} RESULT: ${status}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format combined report text output
 */
export function formatCombinedTextOutput(report) {
  const lines = [];

  lines.push(`\n${'='.repeat(60)}`);
  lines.push('  DOCMON VALIDATION SUMMARY');
  lines.push(`${'='.repeat(60)}\n`);

  // Summary line (Chairman persona friendly)
  lines.push(`  Files: ${report.summary.total_files_checked} | Violations: ${report.summary.total_violations} | Validators: ${report.summary.validators_run}`);
  lines.push('');

  // Top violations
  if (report.summary.top_violations.length > 0) {
    lines.push('  Top violation types:');
    for (const v of report.summary.top_violations) {
      lines.push(`    - ${v.type}: ${v.count}`);
    }
    lines.push('');
  }

  // Per-validator summary
  lines.push('  Validator Results:');
  for (const [name, data] of Object.entries(report.validators)) {
    const icon = data.invalid === 0 ? '\u2705' : '\u274c';
    lines.push(`    ${icon} ${name}: ${data.invalid} violations (${data.execution_time_ms}ms)`);
  }
  lines.push('');

  // Overall result
  const status = report.summary.total_violations === 0 ? 'PASS' : 'FAIL';
  const icon = status === 'PASS' ? '\u2705' : '\u274c';
  lines.push(`${'='.repeat(60)}`);
  lines.push(`  ${icon} OVERALL: ${status}`);
  lines.push(`${'='.repeat(60)}\n`);

  return lines.join('\n');
}

/**
 * Write report to file
 */
export function writeReport(report, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  return outputPath;
}
