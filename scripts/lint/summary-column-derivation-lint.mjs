#!/usr/bin/env node
/**
 * Summary Column Derivation Lint
 * SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-1/FR-2
 *
 * Widens the original ask (flag a new undereived boolean *_evaluated/*_passed/*_verified
 * column) to the 3 shapes that actually caused a summary-vs-detail drift incident:
 *
 *  (a) BOOLEAN  — a new *_evaluated/*_passed/*_verified column with no GENERATED
 *      expression on the same clause. Exempts the 7 real, pre-existing baseline
 *      column NAMES (measured live across the schema; several exist on multiple
 *      tables under the same name, so the exemption is name-based, not a single
 *      table.column pair) — see BASELINE_BOOLEAN_COLUMNS below.
 *  (b) JSONB KEY — an UPDATE ... SET clause that writes a summary-shaped jsonb key
 *      (status, verdict, evaluated, passed, verified, cleared) via jsonb_set(...) or
 *      jsonb_build_object(...) concatenation, with no CREATE TRIGGER in the SAME
 *      file to keep that key derived going forward. Deliberately scoped to
 *      UPDATE ... SET (a write to an EXISTING, persisted column) -- an
 *      INSERT INTO ... VALUES (...) using the same functions (audit-log rows,
 *      one-time seed data, a function's RETURN payload) is a different, out-of-
 *      scope shape; an earlier version matched both and found 10/10 false
 *      positives on the live corpus (EXEC-phase TESTING, evidence cf40b474).
 *  (c) CROSS-TABLE — a new column that is BOTH a foreign key (REFERENCES another
 *      table) and matches the summary-name heuristic. This predicate cannot be
 *      fully mechanical (a status-shaped FK is sometimes exactly the right
 *      design), so it is flagged MANUAL REVIEW REQUIRED, never auto-failed.
 *
 * Only (a) and (b) fail CI; (c) is advisory-only (exit code unaffected by it alone).
 *
 * SCOPE: scans database/migrations/**\/*.sql only. database/chairman-gated/ (135+ files,
 * including this SD's own FR-3 migration) is NOT scanned -- those migrations are staged,
 * not auto-applied, and go through their own chairman apply-ceremony review; widening this
 * lint to cover them is a deliberate future decision, not an oversight.
 *
 * Usage:
 *   node scripts/lint/summary-column-derivation-lint.mjs [--json] [--root <dir>]
 *   npm run lint:summary-column-derivation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'database', 'migrations');

// Measured live (2026-09-13) across the whole schema via information_schema.columns:
// several of these names exist on MULTIPLE tables (e.g. validation_passed on 6),
// so the baseline exemption is by column NAME, not a single (table, column) pair.
// LEAD-phase VALIDATION corrected an earlier 14-name grep hit down to these 7 --
// the other 3 were PL/pgSQL local variables, not live columns.
export const BASELINE_BOOLEAN_COLUMNS = new Set([
  'conformance_passed',
  'content_lint_passed',
  'gate_passed',
  'subagent_verified',
  'test_passed',
  'uat_verified',
  'validation_passed',
]);

const BOOLEAN_SUFFIX_RE = /(_evaluated|_passed|_verified)$/i;
const SUMMARY_KEY_NAME_RE = /(status|verdict|evaluated|passed|verified|cleared)/i;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

// ── (a) BOOLEAN: undereived new column ───────────────────────────────────────

/**
 * Find `ADD COLUMN <name> boolean ...` clauses (case-insensitive) whose name
 * matches the *_evaluated/*_passed/*_verified suffix, is not in the baseline,
 * and has no GENERATED ALWAYS ... STORED on the same clause.
 * @returns {Array<{table, column, hasGenerated, clause}>}
 */
export function findUndereivedBooleanColumns(src) {
  const code = stripComments(src);
  const out = [];
  const alterRe = /\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\b([\s\S]*?);/gi;
  let s;
  while ((s = alterRe.exec(code))) {
    const table = s[1].toLowerCase();
    const body = s[2];
    const addColRe = /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s+boolean\b([\s\S]*?)(?=,\s*\b(?:ADD|ALTER|DROP)\b|$)/gi;
    let c;
    while ((c = addColRe.exec(body))) {
      const column = c[1].toLowerCase();
      const clause = c[2];
      if (!BOOLEAN_SUFFIX_RE.test(column)) continue;
      if (BASELINE_BOOLEAN_COLUMNS.has(column)) continue;
      const hasGenerated = /GENERATED\s+ALWAYS\s+AS\s*\([\s\S]*?\)\s+STORED/i.test(clause);
      if (!hasGenerated) out.push({ table, column, hasGenerated, clause: clause.trim().slice(0, 120) });
    }
  }
  // CREATE TABLE ... (col boolean ...) is co-created with its writer -- out of scope,
  // matching the ALTER-only convention this SD's sibling lint (alter-default-override) uses.
  return out;
}

// ── (b) JSONB KEY: summary key with no paired trigger in-file ────────────────

/**
 * Extract the SET-clause body of every `UPDATE t SET ... (WHERE|;)` statement --
 * the only shape that overwrites an EXISTING, persisted column/jsonb-blob in place.
 * An INSERT INTO ... VALUES (...) (audit-log rows, one-time seed data, function
 * RETURN payloads) is a different, out-of-scope shape: EXEC-phase TESTING (evidence
 * cf40b474, MEDIUM-3) found 10/10 live jsonb_build_object findings were exactly this
 * -- audit-log/history-table inserts, never a persisted summary column.
 * @returns {string[]}
 */
function extractUpdateSetClauses(code) {
  const clauses = [];
  const updateRe = /\bUPDATE\s+(?:ONLY\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|;)/gi;
  let m;
  while ((m = updateRe.exec(code))) clauses.push(m[1]);
  return clauses;
}

/**
 * Find summary-shaped jsonb key writes (jsonb_set, or jsonb_build_object via
 * concatenation) inside an UPDATE ... SET clause specifically, in a migration file
 * that has no CREATE TRIGGER anywhere in it.
 * @returns {Array<{key, mechanism}>}
 */
export function findUnpairedJsonbSummaryKeys(src) {
  const code = stripComments(src);
  const hasTrigger = /\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i.test(code);
  if (hasTrigger) return [];

  const found = new Map();
  const setClauses = extractUpdateSetClauses(code);
  const jsonbSetRe = /jsonb_set\s*\([^,]+,\s*'\{([a-z_][a-z0-9_]*)\}'/gi;
  const buildObjectRe = /jsonb_build_object\s*\(\s*'([a-z_][a-z0-9_]*)'/gi;
  for (const clause of setClauses) {
    let m;
    jsonbSetRe.lastIndex = 0;
    while ((m = jsonbSetRe.exec(clause))) {
      const key = m[1].toLowerCase();
      if (SUMMARY_KEY_NAME_RE.test(key)) found.set(key, 'jsonb_set');
    }
    // A jsonb key can also be written via concatenation with jsonb_build_object(...)
    // (`metadata = metadata || jsonb_build_object('key', ...)`), a real alternate
    // shape to jsonb_set that raw hand-written UPDATEs sometimes use.
    buildObjectRe.lastIndex = 0;
    while ((m = buildObjectRe.exec(clause))) {
      const key = m[1].toLowerCase();
      if (SUMMARY_KEY_NAME_RE.test(key)) found.set(key, 'jsonb_build_object');
    }
  }
  return [...found.entries()].map(([key, mechanism]) => ({ key, mechanism }));
}

// ── (c) CROSS-TABLE: FK column with a summary-shaped name (advisory only) ────

/**
 * Find `ADD COLUMN <name> ... REFERENCES` clauses whose name also matches the
 * summary-name heuristic. Cannot be auto-failed (a status-shaped FK is
 * sometimes correct design) -- callers should surface this as MANUAL REVIEW.
 * @returns {Array<{table, column, clause}>}
 */
export function findForeignKeySummaryColumns(src) {
  const code = stripComments(src);
  const out = [];
  const alterRe = /\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\b([\s\S]*?);/gi;
  let s;
  while ((s = alterRe.exec(code))) {
    const table = s[1].toLowerCase();
    const body = s[2];
    const addColRe = /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s+([\s\S]*?)(?=,\s*\b(?:ADD|ALTER|DROP)\b|$)/gi;
    let c;
    while ((c = addColRe.exec(body))) {
      const column = c[1].toLowerCase();
      const clause = c[2];
      if (!SUMMARY_KEY_NAME_RE.test(column)) continue;
      if (!/\bREFERENCES\b/i.test(clause)) continue;
      out.push({ table, column, clause: clause.trim().slice(0, 120) });
    }
  }
  return out;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Recursively list every .sql file under dir (relative paths, sorted). The CI
 * workflow triggers on `database/migrations/**\/*.sql` (recursive) -- SECURITY
 * (EXEC-phase review, evidence 62384ee7) found the scanner was non-recursive,
 * silently missing database/migrations/rollback/ (a real, populated subdirectory)
 * while still reporting a green check for any PR that touched only that path.
 */
function listSqlFilesRecursive(dir, base = dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  let out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out = out.concat(listSqlFilesRecursive(full, base));
    } else if (e.name.endsWith('.sql')) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

export function scanMigrations(dir = MIGRATIONS_DIR) {
  const files = listSqlFilesRecursive(dir);
  const results = [];
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const undereivedBooleans = findUndereivedBooleanColumns(src);
    const unpairedJsonbKeys = findUnpairedJsonbSummaryKeys(src);
    const fkSummaryColumns = findForeignKeySummaryColumns(src);
    if (undereivedBooleans.length || unpairedJsonbKeys.length || fkSummaryColumns.length) {
      results.push({ file: f, undereivedBooleans, unpairedJsonbKeys, fkSummaryColumns });
    }
  }
  return results;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? path.resolve(args[rootArg + 1]) : REPO_ROOT;
  const migrationsDir = path.join(root, 'database', 'migrations');

  const results = scanMigrations(migrationsDir);
  const failingFiles = results.filter((r) => r.undereivedBooleans.length || r.unpairedJsonbKeys.length);
  const manualReviewFiles = results.filter((r) => r.fkSummaryColumns.length);

  if (asJson) {
    console.log(JSON.stringify({ results, failing: failingFiles.map((r) => r.file), manualReview: manualReviewFiles.map((r) => r.file) }, null, 2));
  } else {
    console.log('Summary Column Derivation Lint\n' + '─'.repeat(72));
    for (const r of results) {
      console.log(`  ${r.file}`);
      for (const b of r.undereivedBooleans) {
        console.log(`      ❌ BOOLEAN: ${r.file} adds ${b.table}.${b.column} (boolean, no GENERATED expression)`);
      }
      for (const k of r.unpairedJsonbKeys) {
        console.log(`      ❌ JSONB KEY: summary-shaped key '${k.key}' (via ${k.mechanism}) written with no paired CREATE TRIGGER in this file`);
      }
      for (const fk of r.fkSummaryColumns) {
        console.log(`      ⚠️  MANUAL REVIEW: ${fk.table}.${fk.column} is a foreign key with a summary-shaped name -- verify this isn't a derivable summary of the referenced row`);
      }
    }
    console.log('─'.repeat(72));
    if (failingFiles.length) {
      console.log(`\n❌ ${failingFiles.length} migration(s) with undereived summary column(s).`);
      console.log('   Add a GENERATED expression, pair the jsonb key write with a CREATE TRIGGER in the same file, or use the existing baseline exemption if this is one of the 7 known pre-existing columns.');
    } else {
      console.log('\n✅ No undereived summary columns found.');
    }
    if (manualReviewFiles.length) {
      console.log(`⚠️  ${manualReviewFiles.length} file(s) need manual review for a foreign-key summary column (non-blocking).`);
    }
  }
  process.exit(failingFiles.length > 0 ? 1 : 0);
}

if (isMainModule(import.meta.url)) {
  main();
}
