#!/usr/bin/env node
/**
 * DOCMON Naming Validator
 * Validates documentation filename conventions (kebab-case with exceptions)
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Runtime error
 *   2 - Validation failed (violations found)
 *   3 - Config/schema error
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadNamingExceptions,
  findRepoRoot,
  EXIT_CODES
} from './modules/docmon/config-loader.js';
import { getChangedFiles } from './modules/docmon/git-changes.js';
import { findMdFiles, normalizePath } from './modules/docmon/file-scanner.js';
import {
  createResult,
  createReport,
  formatTextOutput,
  writeReport
} from './modules/docmon/reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    path: args.find(a => a.startsWith('--path='))?.split('=')[1],
    scan: args.includes('--scan'),
    changedOnly: args.includes('--changed-only'),
    baseRef: args.find(a => a.startsWith('--base-ref='))?.split('=')[1] || 'origin/main',
    format: args.find(a => a.startsWith('--format='))?.split('=')[1] || 'text',
    output: args.find(a => a.startsWith('--output='))?.split('=')[1],
    help: args.includes('--help') || args.includes('-h')
  };
}

function showHelp() {
  console.log(`
DOCMON Naming Validator

Usage: node validate-doc-naming.js [options]

Options:
  --path=<path>       Validate a single file path
  --scan              Scan docs/ directory (default if no --path)
  --changed-only      Only validate files changed since base ref
  --base-ref=<ref>    Git ref to compare against (default: origin/main)
  --format=<format>   Output format: text, json (default: text)
  --output=<path>     Write JSON report to file
  --help, -h          Show this help message

Exit codes:
  0 - Validation passed
  1 - Runtime error
  2 - Validation failed
  3 - Config/schema error

Valid naming: kebab-case (lowercase letters, numbers, hyphens) with .md extension
Exceptions: UPPERCASE standards (README.md, CLAUDE.md, etc.)
`);
}

/**
 * Check if filename matches any exception pattern
 */
function isException(filename, exceptions) {
  for (const exc of exceptions) {
    try {
      const pattern = new RegExp(exc.pattern);
      if (pattern.test(filename)) {
        return { matched: true, reason: exc.reason };
      }
    } catch {
      // Invalid regex pattern, skip
    }
  }
  return { matched: false };
}

/**
 * Generate suggested rename for invalid filename
 */
function suggestRename(filename, invalidPatterns) {
  let suggested = filename;

  // Remove numeric prefix
  const numericPrefixPattern = invalidPatterns.find(p => p.type === 'numeric_prefix');
  if (numericPrefixPattern) {
    const regex = new RegExp(numericPrefixPattern.regex);
    if (regex.test(suggested)) {
      suggested = suggested.replace(regex, '');
    }
  }

  // Replace underscores with hyphens
  suggested = suggested.replace(/_/g, '-');

  // Convert to lowercase
  suggested = suggested.toLowerCase();

  // Replace spaces with hyphens
  suggested = suggested.replace(/\s+/g, '-');

  // Remove multiple consecutive hyphens
  suggested = suggested.replace(/-+/g, '-');

  // Remove leading/trailing hyphens
  suggested = suggested.replace(/^-+|-+$/g, '');

  // Ensure .md extension
  if (!suggested.endsWith('.md')) {
    suggested = suggested.replace(/\.[^.]+$/, '') + '.md';
  }

  return suggested;
}

/**
 * Validate filename against naming conventions
 */
function validateNaming(filePath, config, repoRoot) {
  const relativePath = normalizePath(path.relative(repoRoot, filePath));
  const fileName = path.basename(filePath);

  // Check if file is an exception
  const exceptionCheck = isException(fileName, config.exceptions);
  if (exceptionCheck.matched) {
    return createResult(relativePath, 'valid', {
      exception_applied: true,
      exception_reason: exceptionCheck.reason
    });
  }

  // Check if file matches valid kebab-case pattern
  const validPattern = new RegExp(config.valid_pattern.regex);
  if (validPattern.test(fileName)) {
    return createResult(relativePath, 'valid');
  }

  // File is invalid - determine the violation type
  const invalidPatterns = config.invalid_patterns || [];
  let violationType = 'unknown';
  let violationMessage = 'Does not match kebab-case pattern';

  for (const inv of invalidPatterns) {
    try {
      const regex = new RegExp(inv.regex);
      if (regex.test(fileName)) {
        violationType = inv.type;
        violationMessage = inv.description;
        break;
      }
    } catch {
      // Invalid regex, skip
    }
  }

  const suggested = suggestRename(fileName, invalidPatterns);

  return createResult(relativePath, 'invalid', {
    rule_id: `NAMING-${violationType.toUpperCase()}`,
    reason: violationMessage,
    suggestion: suggested !== fileName ? suggested : null,
    original: fileName
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

  // Load config
  const configResult = loadNamingExceptions(repoRoot);
  if (!configResult.success) {
    if (args.format === 'json') {
      console.log(JSON.stringify({
        error: configResult.error,
        exit_code: EXIT_CODES.CONFIG_ERROR
      }));
    } else {
      console.error(`Config Error: ${configResult.error}`);
    }
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }

  const config = configResult.config;
  let filesToValidate = [];

  // Determine files to validate
  if (args.path) {
    // Single file mode
    const fullPath = path.resolve(repoRoot, args.path);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${args.path}`);
      process.exit(EXIT_CODES.RUNTIME_ERROR);
    }
    filesToValidate = [{ path: fullPath, relativePath: args.path, name: path.basename(args.path) }];
  } else if (args.changedOnly) {
    // Changed files only
    const changes = getChangedFiles(args.baseRef);
    if (!changes.success && changes.files.length === 0) {
      if (args.format === 'json') {
        const report = createReport('naming', [], {
          version: '1.0.0',
          configVersion: config.version,
          executionTime: Date.now() - startTime
        });
        report.note = 'No documentation files changed';
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('No documentation files changed since ' + args.baseRef);
      }
      process.exit(EXIT_CODES.PASS);
    }
    filesToValidate = changes.files.map(f => ({
      path: f,
      relativePath: path.relative(repoRoot, f),
      name: path.basename(f)
    }));
  } else {
    // Full scan mode
    const docsDir = path.join(repoRoot, 'docs');
    filesToValidate = findMdFiles(docsDir, { relativeTo: repoRoot });
  }

  // Validate each file
  const results = [];
  for (const file of filesToValidate) {
    const result = validateNaming(file.path, config, repoRoot);
    results.push(result);
  }

  // Create report
  const report = createReport('naming', results, {
    version: '1.0.0',
    configVersion: config.version,
    executionTime: Date.now() - startTime
  });

  // Output
  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTextOutput(report, { verbose: true }));
  }

  // Write to file if requested
  if (args.output) {
    writeReport(report, args.output);
    if (args.format !== 'json') {
      console.log(`Report written to: ${args.output}`);
    }
  }

  // Exit with appropriate code
  process.exit(report.summary.invalid > 0 ? EXIT_CODES.VALIDATION_FAILED : EXIT_CODES.PASS);
}

main().catch(error => {
  console.error(`Runtime error: ${error.message}`);
  process.exit(EXIT_CODES.RUNTIME_ERROR);
});
