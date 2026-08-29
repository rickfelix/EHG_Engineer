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
 * simple seed-insert shape, or when the DB check itself errors (fails open -- this check's
 * job is to catch a real gap, not to flag its own limitations as one).
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

  const { data, error } = await supabase.from(table).select(column).in(column, literalValues);
  if (error) return null;
  const present = new Set((data || []).map((r) => r[column]));
  const missing = literalValues.filter((v) => !present.has(v));
  return missing.length > 0 ? { table, column, expected: literalValues.length, missing } : null;
}

/** Regex-extract database/migrations/*.sql filenames named in an SD's handoff evidence text. */
export function extractMigrationPaths(text) {
  return [...new Set(text.match(MIGRATION_PATH_RE) || [])];
}

/** For one SD, find every named migration whose evidence-claimed data is missing. */
export async function findEvidenceMigrationGaps(supabase, sdId) {
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('deliverables_manifest, completeness_report, executive_summary')
    .eq('sd_id', sdId);
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
