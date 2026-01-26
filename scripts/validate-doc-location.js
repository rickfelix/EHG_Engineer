#!/usr/bin/env node
/**
 * DOCMON Location Validator
 * Validates documentation file locations against decision-tree rubric
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
  loadRulesConfig,
  findRepoRoot,
  EXIT_CODES
} from './modules/docmon/config-loader.js';
import { getChangedFiles } from './modules/docmon/git-changes.js';
import {
  findMdFiles,
  findRootMdFiles,
  isSymlink,
  isWithinRepoRoot,
  normalizePath
} from './modules/docmon/file-scanner.js';
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
    explain: args.includes('--explain'),
    output: args.find(a => a.startsWith('--output='))?.split('=')[1],
    help: args.includes('--help') || args.includes('-h')
  };
}

function showHelp() {
  console.log(`
DOCMON Location Validator

Usage: node validate-doc-location.js [options]

Options:
  --path=<path>       Validate a single file path
  --scan              Scan entire repository (default if no --path)
  --changed-only      Only validate files changed since base ref
  --base-ref=<ref>    Git ref to compare against (default: origin/main)
  --format=<format>   Output format: text, json (default: text)
  --explain           Show rule explanations for violations
  --output=<path>     Write JSON report to file
  --help, -h          Show this help message

Exit codes:
  0 - Validation passed
  1 - Runtime error
  2 - Validation failed
  3 - Config/schema error

Examples:
  node validate-doc-location.js --scan
  node validate-doc-location.js --path=docs/guide.md
  node validate-doc-location.js --changed-only --format=json
`);
}

function validateLocation(filePath, config, repoRoot) {
  const relativePath = normalizePath(path.relative(repoRoot, filePath));
  const fileName = path.basename(filePath);

  // Security check: symlinks
  if (isSymlink(filePath)) {
    return createResult(relativePath, 'invalid', {
      rule_id: 'SECURITY-SYMLINK',
      reason: 'Symlinks are not allowed for documentation files',
      suggestion: 'Remove symlink and place actual file in appropriate location'
    });
  }

  // Security check: outside repo root
  if (!isWithinRepoRoot(filePath, repoRoot)) {
    return createResult(relativePath, 'invalid', {
      rule_id: 'SECURITY-PATH-TRAVERSAL',
      reason: 'Path is outside repository root',
      suggestion: null
    });
  }

  // Check prohibited locations
  for (const rule of config.prohibited_locations) {
    const prohibitedPath = normalizePath(rule.path);
    if (relativePath.startsWith(prohibitedPath + '/') || relativePath.startsWith(prohibitedPath + '\\')) {
      return createResult(relativePath, 'invalid', {
        rule_id: rule.id,
        reason: rule.reason,
        suggestion: rule.suggestion
      });
    }
  }

  // Check root directory files
  if (!relativePath.includes('/') && !relativePath.includes('\\')) {
    // File is in root directory
    if (!config.root_allowlist.includes(fileName)) {
      return createResult(relativePath, 'invalid', {
        rule_id: 'RULE-ROOT-VIOLATION',
        reason: 'Unexpected file in root directory',
        suggestion: 'docs/'
      });
    }
  }

  return createResult(relativePath, 'valid');
}

function validateRootFileCount(rootFiles, config, _repoRoot) {
  const mdFiles = rootFiles.filter(f => f.name.endsWith('.md'));
  if (mdFiles.length > config.max_root_files) {
    return {
      type: 'warning',
      rule_id: 'RULE-ROOT-COUNT',
      message: `Root has ${mdFiles.length} .md files (max recommended: ${config.max_root_files})`,
      count: mdFiles.length,
      max: config.max_root_files
    };
  }
  return null;
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
  const configResult = loadRulesConfig(repoRoot);
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
      // No changed doc files - pass
      if (args.format === 'json') {
        const report = createReport('location', [], {
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
    const docsFiles = findMdFiles(docsDir, { relativeTo: repoRoot });
    const rootFiles = findRootMdFiles(repoRoot);

    // Also check prohibited locations
    for (const rule of config.prohibited_locations) {
      const prohibitedDir = path.join(repoRoot, rule.path);
      if (fs.existsSync(prohibitedDir)) {
        const prohibitedFiles = findMdFiles(prohibitedDir, { relativeTo: repoRoot });
        filesToValidate.push(...prohibitedFiles);
      }
    }

    filesToValidate.push(...docsFiles, ...rootFiles);

    // Check root file count
    const rootWarning = validateRootFileCount(rootFiles, config, repoRoot);
    if (rootWarning && args.format === 'text') {
      console.log(`Warning: ${rootWarning.message}\n`);
    }
  }

  // Validate each file
  const results = [];
  for (const file of filesToValidate) {
    const result = validateLocation(file.path, config, repoRoot);
    results.push(result);
  }

  // Create report
  const report = createReport('location', results, {
    version: '1.0.0',
    configVersion: config.version,
    executionTime: Date.now() - startTime
  });

  // Output
  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTextOutput(report, { verbose: args.explain }));
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
