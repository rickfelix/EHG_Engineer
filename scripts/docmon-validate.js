#!/usr/bin/env node
/**
 * DOCMON Validation Orchestrator
 * Runs all DOCMON validators and produces a combined JSON report
 *
 * Exit codes:
 *   0 - All validators passed
 *   1 - Runtime error
 *   2 - One or more validators failed
 *   3 - Config/schema error
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  findRepoRoot,
  loadAllConfigs,
  EXIT_CODES
} from './modules/docmon/config-loader.js';
import {
  mergeReports,
  formatCombinedTextOutput,
  writeReport
} from './modules/docmon/reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    changedOnly: args.includes('--changed-only'),
    baseRef: args.find(a => a.startsWith('--base-ref='))?.split('=')[1] || 'origin/main',
    format: args.find(a => a.startsWith('--format='))?.split('=')[1] || 'text',
    output: args.find(a => a.startsWith('--output='))?.split('=')[1],
    validators: args.find(a => a.startsWith('--validators='))?.split('=')[1]?.split(',') || ['location', 'metadata', 'naming'],
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };
}

function showHelp() {
  console.log(`
DOCMON Validation Orchestrator

Usage: node docmon-validate.js [options]

Options:
  --changed-only           Only validate files changed since base ref
  --base-ref=<ref>         Git ref to compare against (default: origin/main)
  --format=<format>        Output format: text, json (default: text)
  --output=<path>          Write combined JSON report to file (default: docmon-report.json in CWD)
  --validators=<list>      Comma-separated list of validators (default: location,metadata,naming)
  --verbose, -v            Show detailed output from each validator
  --help, -h               Show this help message

Exit codes:
  0 - All validators passed
  1 - Runtime error
  2 - One or more validators failed
  3 - Config/schema error

Examples:
  # Run all validators on changed files
  node docmon-validate.js --changed-only

  # Run all validators with JSON output
  node docmon-validate.js --format=json --output=docmon-report.json

  # Run specific validators
  node docmon-validate.js --validators=location,naming

  # CI mode (changed files, JSON artifact)
  node docmon-validate.js --changed-only --base-ref=origin/main --format=json --output=docmon-report.json
`);
}

/**
 * Run a single validator and capture its JSON output
 */
async function runValidator(validatorName, args, repoRoot) {
  const scriptPath = path.join(__dirname, `validate-doc-${validatorName}.js`);

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `Validator script not found: ${scriptPath}`,
      report: null
    };
  }

  const validatorArgs = ['--format=json'];
  if (args.changedOnly) validatorArgs.push('--changed-only');
  if (args.baseRef) validatorArgs.push(`--base-ref=${args.baseRef}`);

  return new Promise((resolve) => {
    const proc = spawn('node', [scriptPath, ...validatorArgs], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      try {
        const report = JSON.parse(stdout);
        resolve({
          success: true,
          exitCode: code,
          report,
          stderr: stderr.trim()
        });
      } catch (error) {
        resolve({
          success: false,
          exitCode: code,
          error: `Failed to parse validator output: ${error.message}`,
          stdout,
          stderr
        });
      }
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to run validator: ${error.message}`,
        report: null
      });
    });
  });
}

async function main() {
  const startTime = Date.now();
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(EXIT_CODES.PASS);
  }

  const repoRoot = findRepoRoot();

  // Check configs exist
  const configCheck = loadAllConfigs(repoRoot);
  if (!configCheck.success) {
    if (args.format === 'json') {
      console.log(JSON.stringify({
        error: 'Config errors',
        errors: configCheck.errors,
        exit_code: EXIT_CODES.CONFIG_ERROR
      }));
    } else {
      console.error('Config Error:');
      for (const err of configCheck.errors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }

  if (args.format === 'text') {
    console.log('\nDOCMON Validation Starting...');
    console.log(`  Validators: ${args.validators.join(', ')}`);
    console.log(`  Changed only: ${args.changedOnly}`);
    if (args.changedOnly) {
      console.log(`  Base ref: ${args.baseRef}`);
    }
    console.log('');
  }

  // Run each validator
  const reports = [];
  const validatorResults = [];

  for (const validator of args.validators) {
    if (args.format === 'text' && args.verbose) {
      console.log(`Running ${validator} validator...`);
    }

    const result = await runValidator(validator, args, repoRoot);
    validatorResults.push({ name: validator, ...result });

    if (result.success && result.report) {
      reports.push(result.report);
    } else if (result.error) {
      if (args.format === 'text') {
        console.error(`  Error in ${validator}: ${result.error}`);
      }
    }
  }

  // Merge reports
  const combinedReport = mergeReports(reports, {
    executionTime: Date.now() - startTime,
    baseRef: args.changedOnly ? args.baseRef : null,
    changedOnly: args.changedOnly
  });

  // Add validator versions
  combinedReport.config_versions = configCheck.versions;

  // Determine output path
  const outputPath = args.output || path.join(repoRoot, 'docmon-report.json');

  // Write JSON report
  writeReport(combinedReport, outputPath);

  // Output
  if (args.format === 'json') {
    console.log(JSON.stringify(combinedReport, null, 2));
  } else {
    console.log(formatCombinedTextOutput(combinedReport));
    console.log(`Report written to: ${path.relative(repoRoot, outputPath)}`);
  }

  // Exit with appropriate code
  const exitCode = combinedReport.summary.total_violations > 0
    ? EXIT_CODES.VALIDATION_FAILED
    : EXIT_CODES.PASS;

  process.exit(exitCode);
}

main().catch(error => {
  console.error(`Runtime error: ${error.message}`);
  process.exit(EXIT_CODES.RUNTIME_ERROR);
});
