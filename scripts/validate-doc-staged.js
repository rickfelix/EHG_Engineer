#!/usr/bin/env node
/**
 * DOCMON Staged Files Validator
 * Validates only staged (git diff --cached) .md files
 *
 * Used by pre-commit hook to validate only files being committed,
 * not the entire documentation tree.
 *
 * Exit codes:
 *   0 - Validation passed (or no staged .md files)
 *   1 - Runtime error
 *   2 - Validation failed
 *
 * Usage:
 *   node scripts/validate-doc-staged.js                    # Run all validators
 *   node scripts/validate-doc-staged.js --validator=location  # Run specific validator
 *   node scripts/validate-doc-staged.js --validator=naming
 *   node scripts/validate-doc-staged.js --validator=metadata
 *   node scripts/validate-doc-staged.js --format=json      # JSON output
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-D
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Exit codes matching DOCMON convention
const EXIT_CODES = {
  PASS: 0,
  RUNTIME_ERROR: 1,
  VALIDATION_FAILED: 2
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    validator: args.find(a => a.startsWith('--validator='))?.split('=')[1],
    format: args.find(a => a.startsWith('--format='))?.split('=')[1] || 'text',
    help: args.includes('--help') || args.includes('-h')
  };
}

function showHelp() {
  console.log(`
DOCMON Staged Files Validator

Validates only staged .md files (git diff --cached)

Usage:
  node scripts/validate-doc-staged.js [options]

Options:
  --validator=<name>   Run specific validator: location, naming, metadata
  --format=<format>    Output format: text, json (default: text)
  --help, -h           Show this help message

Exit codes:
  0 - Validation passed (or no staged files)
  1 - Runtime error
  2 - Validation failed

Examples:
  node scripts/validate-doc-staged.js                     # All validators
  node scripts/validate-doc-staged.js --validator=location
  npm run docs:validate:staged -- --validator=naming
`);
}

function getStagedMdFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    });
    return output
      .split('\n')
      .filter(f => f.endsWith('.md'))
      .map(f => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function runValidator(validatorName, files, _format) {
  if (files.length === 0) {
    return { passed: true, message: 'No staged .md files' };
  }

  const startTime = Date.now();
  const results = {
    validator: validatorName,
    files_checked: files.length,
    passed: true,
    violations: [],
    warnings: []
  };

  // Dynamically import and run the appropriate validator logic
  // For now, we'll call the existing validators with --path for each file
  // or use --changed-only which already exists

  try {
    const scriptMap = {
      location: 'validate-doc-location.js',
      naming: 'validate-doc-naming.js',
      metadata: 'validate-doc-metadata.js'
    };

    const script = scriptMap[validatorName];
    if (!script) {
      throw new Error(`Unknown validator: ${validatorName}`);
    }

    // Run validator in changed-only mode (uses git diff)
    // But we need staged files, so we pass each file individually
    for (const file of files) {
      try {
        execSync(`node scripts/${script} --path="${file}" --format=json`, {
          cwd: ROOT_DIR,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (err) {
        // Non-zero exit means validation failed
        if (err.status === 2) {
          results.passed = false;
          try {
            const output = JSON.parse(err.stdout || '{}');
            if (output.results?.invalid) {
              results.violations.push(...output.results.invalid);
            }
          } catch {
            results.violations.push({ path: file, reason: 'Validation failed' });
          }
        } else if (err.status === 1) {
          // Runtime error
          throw err;
        }
      }
    }
  } catch (err) {
    if (err.status === 1) {
      throw err;
    }
  }

  results.execution_time_ms = Date.now() - startTime;
  return results;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(EXIT_CODES.PASS);
  }

  const stagedFiles = getStagedMdFiles();

  if (stagedFiles.length === 0) {
    if (args.format === 'json') {
      console.log(JSON.stringify({
        staged_files: 0,
        message: 'No staged .md files',
        passed: true
      }));
    }
    // No staged files = pass (nothing to validate)
    process.exit(EXIT_CODES.PASS);
  }

  const startTime = Date.now();
  let overallPassed = true;
  const allResults = [];

  // Determine which validators to run
  const validators = args.validator
    ? [args.validator]
    : ['location', 'naming', 'metadata'];

  for (const validator of validators) {
    const result = runValidator(validator, stagedFiles, args.format);
    allResults.push(result);

    // Only location and naming are blocking
    if (validator !== 'metadata' && !result.passed) {
      overallPassed = false;
    }
  }

  const combinedResults = {
    staged_files: stagedFiles.length,
    files: stagedFiles,
    validators: allResults,
    overall_passed: overallPassed,
    execution_time_ms: Date.now() - startTime
  };

  if (args.format === 'json') {
    console.log(JSON.stringify(combinedResults, null, 2));
  } else {
    // Text output with DOCMON_ERROR format
    console.log('');
    for (const result of allResults) {
      if (!result.passed && result.validator !== 'metadata') {
        console.log(`DOCMON_ERROR: ${result.validator.toUpperCase()}_VALIDATION_FAILED`);
        console.log(`  Files: ${result.files_checked} | Violations: ${result.violations.length}`);
        for (const v of result.violations.slice(0, 3)) {
          console.log(`    - ${v.path}`);
        }
      }
    }
    console.log(`  Total elapsed: ${combinedResults.execution_time_ms}ms`);
  }

  process.exit(overallPassed ? EXIT_CODES.PASS : EXIT_CODES.VALIDATION_FAILED);
}

main().catch(err => {
  console.error(`Runtime error: ${err.message}`);
  process.exit(EXIT_CODES.RUNTIME_ERROR);
});
