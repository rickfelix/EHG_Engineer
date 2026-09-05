/**
 * QF-20260829-936 -- a completion record can be internally consistent (status/current_phase
 * agree, per lib/quality/false-completion-predicate.js) AND substantively false: its own
 * evidence names a migration whose data never landed. ghost-completion-check.mjs only checks
 * for a missing canonical LEAD-FINAL-APPROVAL row; false-completion-predicate.js only checks
 * record consistency. Neither verifies the DELIVERABLE exists -- this module does.
 *
 * Table-name-agnostic: parses whatever table/column a simple single-table seed INSERT
 * migration names, not hardcoded to any one fixture's table.
 */
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION_PATH_RE = /database\/migrations\/[\w.-]+\.sql/g;

/**
 * Parse a single-table seed-insert migration and check whether its literal first-column
 * values are present in the live DB. Returns null when the migration doesn't match the
 * simple seed-insert shape (nonexistent file, no INSERT match, no literal values) -- this
 * IS the check's own genuine limitation and stays fail-open, on purpose.
 *
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: a query error against the exact table being verified
 * is NOT the same kind of limitation -- it is a failure to obtain the fact this check exists
 * to obtain. Sibling child A's withSchemaDriftDetection wrapper already throws before this
 * code ever sees a schema-drift error (missing table/column); the residual live swallow here
 * was the transient/infra error classes (timeout, network). Both now THROW, preserving the
 * original Supabase error (message + code) rather than a generic new Error, so a caller still
 * knows WHY verification failed.
 */
export async function checkMigrationDataPresent(supabase, migrationRelPath) {
  const absPath = path.join(REPO_ROOT, migrationRelPath);
  if (!existsSync(absPath)) return null;
  const sql = readFileSync(absPath, 'utf8');
  const insertMatch = sql.match(/INSERT INTO\s+(\w+)\s*\(\s*(\w+)/i);
  if (!insertMatch) return null;
  const [, table, column] = insertMatch;
  const valuesBlock = sql.slice(insertMatch.index);
  const literalValues = [...valuesBlock.matchAll(/\(\s*'([^']+)'/g)].map((m) => m[1]);
  if (literalValues.length === 0) return null;

  // count-truncation-diff-lint: bounded by a literal cap, not just literalValues.length being
  // small in practice -- a seed-insert migration this check parses is never remotely close to
  // 500 rows, so a real excess here would itself be a signal worth surfacing, not truncating.
  const { data, error } = await supabase.from(table).select(column).in(column, literalValues).limit(500);
  if (error) throw error;
  const present = new Set((data || []).map((r) => r[column]));
  const missing = literalValues.filter((v) => !present.has(v));
  return missing.length > 0 ? { table, column, expected: literalValues.length, missing } : null;
}

/** Regex-extract database/migrations/*.sql filenames named in an SD's handoff evidence text. */
export function extractMigrationPaths(text) {
  return [...new Set(text.match(MIGRATION_PATH_RE) || [])];
}

/**
 * For one SD, find every named migration whose evidence-claimed data is missing.
 *
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: the sd_phase_handoffs query below did not destructure
 * `error` at all -- a transient query error silently yielded `undefined` handoffs, which
 * flowed into `(handoffs || [])` as empty text and zero gaps found. sd_phase_handoffs itself
 * exists, so sibling child A's schema-drift throw never reached this call site. Now throws,
 * matching checkMigrationDataPresent()'s corrected behavior above -- the throw is intentionally
 * NOT caught inside this loop, so it propagates out of findEvidenceMigrationGaps() itself
 * rather than being silently reinstated as a swallow one layer up.
 */
export async function findEvidenceMigrationGaps(supabase, sdId) {
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('deliverables_manifest, completeness_report, executive_summary')
    .eq('sd_id', sdId)
    .limit(200);
  if (error) throw error;
  const text = (handoffs || [])
    .map((h) => `${h.deliverables_manifest || ''} ${h.completeness_report || ''} ${h.executive_summary || ''}`)
    .join(' ');

  const gaps = [];
  for (const migrationPath of extractMigrationPaths(text)) {
    const gap = await checkMigrationDataPresent(supabase, migrationPath);
    if (gap) gaps.push({ path: migrationPath, ...gap });
  }
  return gaps;
}
