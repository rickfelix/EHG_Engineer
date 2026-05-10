/**
 * Canonical-write-paths registry parser.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-4.
 *
 * Reads docs/reference/canonical-write-paths.md and emits a JSON sidecar
 * (canonical-write-paths.json) consumed by FR-5 bypass-guard test.
 *
 * Markdown table format (one row per registry entry):
 *
 * | table | canonical_helper | exempt_writers | rationale |
 * |-------|------------------|----------------|-----------|
 * | feedback | lib/governance/emit-feedback.js | scripts/log-harness-bug.js, scripts/lib/lead-precheck-helpers.js | dedup-hash co-emitter |
 *
 * Each cell:
 *  - table: bare table name (alphanumeric + underscore)
 *  - canonical_helper: repo-relative path
 *  - exempt_writers: comma-separated repo-relative paths (or empty)
 *  - rationale: prose
 *
 * @module scripts/lib/registry-parser
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLE_NAME_RE = /^[a-z][a-z0-9_]*$/i;

/**
 * Parse canonical-write-paths.md into structured rows.
 * Picks the FIRST markdown table whose header row contains all 4 expected columns.
 *
 * @param {string} src - Markdown source
 * @returns {{rows: Array, errors: string[]}}
 */
export function parseRegistry(src) {
  const lines = src.split(/\r?\n/);
  const errors = [];
  const rows = [];

  // Find header line: row containing | table | canonical_helper | exempt_writers | rationale |
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells && cells.length >= 4 && cells[0].trim() === 'table' && cells[1].trim() === 'canonical_helper' && cells[2].trim() === 'exempt_writers' && cells[3].trim() === 'rationale') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    errors.push('No registry table header found (expected: | table | canonical_helper | exempt_writers | rationale |)');
    return { rows, errors };
  }

  // Skip header and divider line
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (!cells) break; // blank line or non-table line ends the table
    if (cells.length < 4) continue;
    const [tableRaw, helperRaw, exemptsRaw, rationaleRaw] = cells.map((c) => c.trim());
    if (!tableRaw) continue;
    const row = {
      table: tableRaw,
      canonical_helper: helperRaw,
      exempt_writers: exemptsRaw ? exemptsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [],
      rationale: rationaleRaw,
    };
    if (!TABLE_NAME_RE.test(row.table)) {
      errors.push(`Invalid table name: ${row.table}`);
      continue;
    }
    if (!row.canonical_helper.endsWith('.js') && !row.canonical_helper.endsWith('.mjs') && !row.canonical_helper.endsWith('.cjs')) {
      errors.push(`Canonical helper for ${row.table} not a .js/.mjs/.cjs file: ${row.canonical_helper}`);
      continue;
    }
    if (!row.rationale) {
      errors.push(`Missing rationale for ${row.table}`);
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

function parseRow(line) {
  if (!line || !line.trim().startsWith('|')) return null;
  if (/^\|\s*[-:]+\s*\|/.test(line.trim())) return null; // divider line
  // Strip leading + trailing pipe, split on |
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|');
}

/**
 * Generate JSON sidecar from markdown registry. Returns the parsed structure.
 *
 * @param {string} mdPath - Repo-relative path to canonical-write-paths.md
 * @param {string} jsonPath - Repo-relative path to canonical-write-paths.json
 * @param {string} repoRoot - Absolute repo root
 * @returns {{rows: Array, errors: string[]}}
 */
export function generateSidecar(mdPath, jsonPath, repoRoot) {
  const mdAbs = resolve(repoRoot, mdPath);
  const jsonAbs = resolve(repoRoot, jsonPath);
  const src = readFileSync(mdAbs, 'utf8');
  const result = parseRegistry(src);
  const sidecar = {
    generated_from: mdPath,
    generated_at: new Date().toISOString(),
    rows: result.rows,
    schema_version: 1,
  };
  writeFileSync(jsonAbs, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
  return result;
}

// CLI entry: regenerate the sidecar from the canonical .md
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  const repoRoot = resolve(dirname(__filename), '..', '..');
  const result = generateSidecar(
    'docs/reference/canonical-write-paths.md',
    'docs/reference/canonical-write-paths.json',
    repoRoot,
  );
  if (result.errors.length > 0) {
    console.error('[registry-parser] ERRORS:');
    for (const e of result.errors) console.error('  -', e);
    process.exit(1);
  }
  console.log(`[registry-parser] OK — ${result.rows.length} entries written to canonical-write-paths.json`);
}
