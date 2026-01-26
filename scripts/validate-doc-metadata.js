#!/usr/bin/env node
/**
 * DOCMON Metadata Validator
 * Validates documentation YAML frontmatter metadata
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
  loadMetadataSchema,
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

// Files to skip (auto-generated or special)
const SKIP_PATTERNS = [
  /^CLAUDE.*\.md$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /session-state\.md$/,
  /compaction-snapshot\.md$/
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    path: args.find(a => a.startsWith('--path='))?.split('=')[1],
    scan: args.includes('--scan'),
    changedOnly: args.includes('--changed-only'),
    baseRef: args.find(a => a.startsWith('--base-ref='))?.split('=')[1] || 'origin/main',
    format: args.find(a => a.startsWith('--format='))?.split('=')[1] || 'text',
    fix: args.includes('--fix'),
    output: args.find(a => a.startsWith('--output='))?.split('=')[1],
    help: args.includes('--help') || args.includes('-h')
  };
}

function showHelp() {
  console.log(`
DOCMON Metadata Validator

Usage: node validate-doc-metadata.js [options]

Options:
  --path=<path>       Validate a single file path
  --scan              Scan docs/ directory (default if no --path)
  --changed-only      Only validate files changed since base ref
  --base-ref=<ref>    Git ref to compare against (default: origin/main)
  --format=<format>   Output format: text, json (default: text)
  --fix               Print normalized metadata to stdout (non-destructive)
  --output=<path>     Write JSON report to file
  --help, -h          Show this help message

Exit codes:
  0 - Validation passed
  1 - Runtime error
  2 - Validation failed
  3 - Config/schema error

Required metadata fields: Category, Status, Version, Author, Last Updated, Tags
`);
}

function shouldSkipFile(filename) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
  // Check for YAML frontmatter (--- ... ---)
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const yaml = yamlMatch[1];
    const metadata = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Handle quoted strings
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Handle arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON array
          }
        }

        metadata[key] = value;
      }
    }

    return { type: 'yaml', metadata, raw: yamlMatch[1] };
  }

  // Check for markdown metadata section (## Metadata)
  const mdMatch = content.match(/##\s*Metadata\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/i);
  if (mdMatch) {
    const section = mdMatch[1];
    const metadata = {};
    const fieldPattern = /[-*]\s*\*\*([^:*]+)\*\*:\s*(.+)/g;
    let match;

    while ((match = fieldPattern.exec(section)) !== null) {
      metadata[match[1].trim()] = match[2].trim();
    }

    return { type: 'markdown', metadata, raw: mdMatch[1] };
  }

  return { type: null, metadata: null, raw: null };
}

/**
 * Validate metadata against schema
 */
function validateMetadata(filePath, content, schema, repoRoot) {
  const relativePath = normalizePath(path.relative(repoRoot, filePath));
  const fileName = path.basename(filePath);

  // Skip special files
  if (shouldSkipFile(fileName)) {
    return createResult(relativePath, 'skipped', {
      reason: 'File in skip list'
    });
  }

  const { type, metadata } = parseFrontmatter(content);

  if (!metadata) {
    return createResult(relativePath, 'invalid', {
      rule_id: 'META-MISSING',
      reason: 'Missing metadata section (YAML frontmatter or ## Metadata)',
      suggestion: 'Add YAML frontmatter with required fields at top of file'
    });
  }

  const errors = [];
  const requiredFields = schema.required || ['Category', 'Status', 'Version', 'Author', 'Last Updated', 'Tags'];

  // Check required fields
  for (const field of requiredFields) {
    if (!metadata[field]) {
      errors.push({
        field,
        error: 'missing',
        message: `Missing required field: ${field}`
      });
    }
  }

  // Validate Category
  if (metadata.Category) {
    const validCategories = schema.properties?.Category?.enum || [];
    if (validCategories.length > 0 && !validCategories.includes(metadata.Category)) {
      errors.push({
        field: 'Category',
        error: 'invalid_value',
        message: `Invalid Category: "${metadata.Category}"`,
        allowed: validCategories
      });
    }
  }

  // Validate Status
  if (metadata.Status) {
    const validStatuses = schema.properties?.Status?.enum || [];
    if (validStatuses.length > 0 && !validStatuses.includes(metadata.Status)) {
      errors.push({
        field: 'Status',
        error: 'invalid_value',
        message: `Invalid Status: "${metadata.Status}"`,
        allowed: validStatuses
      });
    }
  }

  // Validate Version (semver)
  if (metadata.Version) {
    const versionPattern = schema.properties?.Version?.pattern || '^\\d+\\.\\d+\\.\\d+$';
    if (!new RegExp(versionPattern).test(metadata.Version)) {
      errors.push({
        field: 'Version',
        error: 'invalid_format',
        message: `Version should follow semver (X.Y.Z): "${metadata.Version}"`
      });
    }
  }

  // Validate Last Updated (date format)
  const lastUpdated = metadata['Last Updated'];
  if (lastUpdated) {
    const datePattern = schema.properties?.['Last Updated']?.pattern || '^\\d{4}-\\d{2}-\\d{2}$';
    if (!new RegExp(datePattern).test(lastUpdated)) {
      errors.push({
        field: 'Last Updated',
        error: 'invalid_format',
        message: `Last Updated should be YYYY-MM-DD format: "${lastUpdated}"`
      });
    }
  }

  // Validate Tags (at least 1)
  if (metadata.Tags) {
    let tags = metadata.Tags;
    if (typeof tags === 'string') {
      tags = tags.split(',').map(t => t.trim()).filter(t => t);
    }
    if (!Array.isArray(tags) || tags.length < 1) {
      errors.push({
        field: 'Tags',
        error: 'invalid_value',
        message: 'Tags should have at least 1 entry'
      });
    }
  }

  // Validate Author
  if (metadata.Author && metadata.Author.trim().length === 0) {
    errors.push({
      field: 'Author',
      error: 'invalid_value',
      message: 'Author cannot be empty'
    });
  }

  if (errors.length > 0) {
    return createResult(relativePath, 'invalid', {
      rule_id: 'META-VALIDATION',
      reason: errors.map(e => e.message).join('; '),
      errors,
      metadata_type: type
    });
  }

  return createResult(relativePath, 'valid', {
    metadata_type: type
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

  // Load schema
  const schemaResult = loadMetadataSchema(repoRoot);
  if (!schemaResult.success) {
    if (args.format === 'json') {
      console.log(JSON.stringify({
        error: schemaResult.error,
        exit_code: EXIT_CODES.CONFIG_ERROR
      }));
    } else {
      console.error(`Schema Error: ${schemaResult.error}`);
    }
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }

  const schema = schemaResult.config;
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
        const report = createReport('metadata', [], {
          version: '1.0.0',
          configVersion: schema.version,
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
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const result = validateMetadata(file.path, content, schema, repoRoot);
      results.push(result);
    } catch (error) {
      results.push(createResult(file.relativePath, 'invalid', {
        rule_id: 'META-READ-ERROR',
        reason: `Failed to read file: ${error.message}`
      }));
    }
  }

  // Create report
  const report = createReport('metadata', results, {
    version: '1.0.0',
    configVersion: schema.version,
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
