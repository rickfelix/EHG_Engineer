#!/usr/bin/env node
/**
 * Audit File Validator
 *
 * Validates audit markdown files against the audit format specification.
 * Must pass validation before ingestion into audit_finding_sd_mapping table.
 *
 * Usage:
 *   node scripts/validate-audit-file.mjs --file docs/audits/2025-12-26-navigation-audit.md
 *   node scripts/validate-audit-file.mjs --file docs/audits/2025-12-26-navigation-audit.md --verbose
 *
 * @see docs/reference/audit-format-spec.md
 */

import fs from 'fs';
import path from 'path';

// Valid enum values from format spec
const VALID_TYPES = ['Bug', 'UX', 'Brainstorm', 'Theme', 'Question', 'Observation'];
const VALID_SEVERITIES = ['Critical', 'Major', 'Minor', 'Idea'];

// ID pattern: 2-5 uppercase letters, hyphen, 2+ digits
const ID_PATTERN = /^[A-Z]{2,5}-\d{2,}$/;

// Filename pattern: YYYY-MM-DD-*.md
const FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

// Required columns (case-insensitive matching)
const REQUIRED_COLUMNS = ['id', 'route', 'type', 'severity', 'description'];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

function validateFilename(filePath) {
  const filename = path.basename(filePath);
  const errors = [];
  const warnings = [];

  // Check extension
  if (!filename.endsWith('.md')) {
    errors.push(`File must be a markdown file (.md extension)`);
  }

  // Check filename format
  if (!FILENAME_PATTERN.test(filename)) {
    errors.push(`Filename must match format: YYYY-MM-DD-{audit-name}.md (got: ${filename})`);
  }

  // Check directory
  if (!filePath.includes('docs/audits')) {
    warnings.push(`File should be in docs/audits/ directory`);
  }

  return { errors, warnings };
}

function parseMarkdownTable(lines, startIndex) {
  const table = {
    headers: [],
    rows: [],
    startLine: startIndex + 1, // 1-indexed
    headerRow: null,
    separatorRow: null
  };

  // Parse header row
  const headerLine = lines[startIndex];
  if (!headerLine || !headerLine.includes('|')) {
    return null;
  }

  table.headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  table.headerRow = startIndex + 1;

  // Check for separator row (---|---|---)
  if (startIndex + 1 < lines.length) {
    const separatorLine = lines[startIndex + 1];
    if (separatorLine && /^\|?[\s\-:|]+\|?$/.test(separatorLine)) {
      table.separatorRow = startIndex + 2;
    } else {
      return null; // Not a valid markdown table
    }
  }

  // Parse data rows
  for (let i = startIndex + 2; i < lines.length; i++) {
    const line = lines[i];

    // Stop at empty line or non-table line
    if (!line || !line.includes('|')) {
      break;
    }

    const cells = line
      .split('|')
      .map(c => c.trim())
      .filter((c, idx, arr) => {
        // Filter out empty first/last cells from leading/trailing pipes
        if (idx === 0 && c === '') return false;
        if (idx === arr.length - 1 && c === '') return false;
        return true;
      });

    // Re-split properly to handle edge cases
    const properCells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());

    if (properCells.length > 0) {
      table.rows.push({
        cells: properCells,
        lineNumber: i + 1 // 1-indexed
      });
    }
  }

  return table;
}

function findTables(content) {
  const lines = content.split('\n');
  const tables = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for potential table header (contains | and text)
    if (line.includes('|') && !line.match(/^\|?[\s\-:|]+\|?$/)) {
      // Check if next line is separator
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine && /^\|?[\s\-:|]+\|?$/.test(nextLine)) {
          const table = parseMarkdownTable(lines, i);
          if (table && table.rows.length > 0) {
            tables.push(table);
            // Skip to end of table
            i += table.rows.length + 2;
          }
        }
      }
    }
  }

  return tables;
}

function getColumnIndex(headers, columnName) {
  return headers.findIndex(h => h.toLowerCase() === columnName.toLowerCase());
}

function isIssueTable(table) {
  // Check if this table has the required columns for an issue table
  const headerLower = table.headers.map(h => h.toLowerCase());
  const hasId = headerLower.includes('id');
  const hasDescription = headerLower.includes('description');
  // Must have at least ID and Description to be considered an issue table
  return hasId && hasDescription;
}

function validateTable(table, seenIds) {
  const errors = [];
  const warnings = [];
  const issues = [];

  // Skip tables that don't look like issue tables (e.g., summary tables)
  if (!isIssueTable(table)) {
    return { errors: [], warnings: [], issues: [], skipped: true };
  }

  // Check for required columns
  const headerLower = table.headers.map(h => h.toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!headerLower.includes(required)) {
      errors.push(`Line ${table.headerRow}: Missing required column "${required}"`);
    }
  }

  // Get column indices
  const idIdx = getColumnIndex(table.headers, 'id');
  const typeIdx = getColumnIndex(table.headers, 'type');
  const severityIdx = getColumnIndex(table.headers, 'severity');
  const descIdx = getColumnIndex(table.headers, 'description');
  const routeIdx = getColumnIndex(table.headers, 'route');

  // Validate each row
  for (const row of table.rows) {
    const lineNum = row.lineNumber;

    // Validate ID
    if (idIdx >= 0 && idIdx < row.cells.length) {
      const id = row.cells[idIdx];

      if (!id || id.trim() === '') {
        errors.push(`Line ${lineNum}: Empty ID field`);
      } else if (!ID_PATTERN.test(id)) {
        errors.push(`Line ${lineNum}: ID "${id}" does not match required format {PREFIX}-{NN} (e.g., NAV-01)`);
      } else if (seenIds.has(id)) {
        errors.push(`Line ${lineNum}: Duplicate ID "${id}" (first seen at line ${seenIds.get(id)})`);
      } else {
        seenIds.set(id, lineNum);
        issues.push({
          id,
          lineNumber: lineNum,
          type: typeIdx >= 0 ? row.cells[typeIdx] : null,
          severity: severityIdx >= 0 ? row.cells[severityIdx] : null,
          description: descIdx >= 0 ? row.cells[descIdx] : null,
          route: routeIdx >= 0 ? row.cells[routeIdx] : null
        });
      }
    }

    // Validate Type
    if (typeIdx >= 0 && typeIdx < row.cells.length) {
      const type = row.cells[typeIdx];
      if (type && !VALID_TYPES.includes(type)) {
        // Check for case issues
        const matchingType = VALID_TYPES.find(t => t.toLowerCase() === type.toLowerCase());
        if (matchingType) {
          errors.push(`Line ${lineNum}: Type "${type}" should be "${matchingType}" (case-sensitive)`);
        } else {
          errors.push(`Line ${lineNum}: Invalid Type "${type}". Valid values: ${VALID_TYPES.join(', ')}`);
        }
      }
    }

    // Validate Severity
    if (severityIdx >= 0 && severityIdx < row.cells.length) {
      const severity = row.cells[severityIdx];
      if (severity && !VALID_SEVERITIES.includes(severity)) {
        // Check for case issues
        const matchingSeverity = VALID_SEVERITIES.find(s => s.toLowerCase() === severity.toLowerCase());
        if (matchingSeverity) {
          errors.push(`Line ${lineNum}: Severity "${severity}" should be "${matchingSeverity}" (case-sensitive)`);
        } else {
          errors.push(`Line ${lineNum}: Invalid Severity "${severity}". Valid values: ${VALID_SEVERITIES.join(', ')}`);
        }
      }
    }

    // Validate Description (not empty)
    if (descIdx >= 0 && descIdx < row.cells.length) {
      const desc = row.cells[descIdx];
      if (!desc || desc.trim() === '') {
        warnings.push(`Line ${lineNum}: Empty Description field`);
      } else if (desc.length < 10) {
        warnings.push(`Line ${lineNum}: Description very short (${desc.length} chars) - ensure verbatim preservation`);
      }
    }
  }

  return { errors, warnings, issues, skipped: false };
}

function validateAuditFile(filePath, verbose = false) {
  const result = {
    valid: false,
    filePath,
    errors: [],
    warnings: [],
    tablesFound: 0,
    issueCount: 0,
    issues: [],
    idPrefix: null
  };

  // Check file exists
  if (!fs.existsSync(filePath)) {
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  // Validate filename
  const filenameValidation = validateFilename(filePath);
  result.errors.push(...filenameValidation.errors);
  result.warnings.push(...filenameValidation.warnings);

  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    result.errors.push(`Failed to read file: ${err.message}`);
    return result;
  }

  // Check for H1 title
  if (!content.match(/^#\s+.+/m)) {
    result.warnings.push('No H1 title found at start of file');
  }

  // Find and validate tables
  const tables = findTables(content);
  result.tablesFound = tables.length;

  if (tables.length === 0) {
    result.errors.push('No valid markdown tables found in file');
    return result;
  }

  // Track all seen IDs across tables
  const seenIds = new Map();

  let issueTablesFound = 0;
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const tableValidation = validateTable(table, seenIds);

    // Skip non-issue tables (e.g., summary tables)
    if (tableValidation.skipped) {
      continue;
    }

    issueTablesFound++;
    result.errors.push(...tableValidation.errors);
    result.warnings.push(...tableValidation.warnings);
    result.issues.push(...tableValidation.issues);
  }

  // Update tables found to only count issue tables
  result.tablesFound = issueTablesFound;

  result.issueCount = result.issues.length;

  // Extract ID prefix
  if (result.issues.length > 0) {
    const firstId = result.issues[0].id;
    const match = firstId.match(/^([A-Z]+)-/);
    if (match) {
      result.idPrefix = match[1];
    }
  }

  // Determine validity
  result.valid = result.errors.length === 0;

  return result;
}

function printResult(result, verbose) {
  console.log('='.repeat(70));
  console.log('AUDIT FILE VALIDATION');
  console.log('='.repeat(70));
  console.log(`\nFile: ${result.filePath}`);
  console.log(`Tables found: ${result.tablesFound}`);
  console.log(`Issues found: ${result.issueCount}`);
  if (result.idPrefix) {
    console.log(`ID prefix: ${result.idPrefix}`);
  }

  if (result.errors.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('ERRORS:');
    console.log('-'.repeat(70));
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('WARNINGS:');
    console.log('-'.repeat(70));
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (verbose && result.issues.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('ISSUES PARSED:');
    console.log('-'.repeat(70));
    for (const issue of result.issues) {
      console.log(`  ${issue.id} (line ${issue.lineNumber})`);
      console.log(`    Type: ${issue.type || 'N/A'}`);
      console.log(`    Severity: ${issue.severity || 'N/A'}`);
      console.log(`    Route: ${issue.route || 'N/A'}`);
      if (issue.description) {
        const desc = issue.description.length > 60
          ? issue.description.substring(0, 60) + '...'
          : issue.description;
        console.log(`    Description: ${desc}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  if (result.valid) {
    console.log('Result: PASSED');
    console.log(`File is valid for ingestion (${result.issueCount} issues)`);
  } else {
    console.log(`Result: FAILED (${result.errors.length} errors, ${result.warnings.length} warnings)`);
  }
  console.log('='.repeat(70));
}

// Main execution
async function main() {
  const options = parseArgs();

  if (!options.file) {
    console.error('Usage: node scripts/validate-audit-file.mjs --file <path-to-audit-file>');
    console.error('');
    console.error('Options:');
    console.error('  --file <path>   Path to audit markdown file (required)');
    console.error('  --verbose, -v   Show detailed issue information');
    process.exit(1);
  }

  const result = validateAuditFile(options.file, options.verbose);
  printResult(result, options.verbose);

  process.exit(result.valid ? 0 : 1);
}

// Only run main if this is the entry point
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename || process.argv[1]?.endsWith('validate-audit-file.mjs');

if (isMainModule) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

// Export for testing
export { validateAuditFile, validateFilename, parseMarkdownTable, findTables };
