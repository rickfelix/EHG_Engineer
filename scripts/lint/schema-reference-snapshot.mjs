/**
 * Schema-reference snapshot generator.
 * SD-LEO-INFRA-SCHEMA-REFERENCE-LINT-001 (FR-2).
 *
 * Regenerates database/schema-reference-snapshot.json — the committed
 * tables/views → column-name map the schema-reference lint compares code
 * against (offline in CI; no CI DB dependency).
 *
 * DISTINCT from scripts/schema-snapshot.js (docs/database/schema-snapshot.json,
 * the drift-comparison artifact) — different consumer, different shape; the
 * names are deliberately different so the two never compete.
 *
 * SD-LEO-FIX-VENTURE-ARTIFACTS-ARTIFACT-001: also captures CHECK constraint
 * definitions (public schema) under `checks`, keyed "<table>.<constraint>" ->
 * definition text. Additive-only (existing `tables`/`views` consumers are
 * unaffected) — lets a template/constraint parity test assert every literal
 * enum-like value a caller emits (e.g. stage-template artifactType strings)
 * is present in the live CHECK constraint, offline, no CI DB dependency.
 *
 * Usage: npm run schema:snapshot:lint   (requires SUPABASE_POOLER_URL)
 * Run after applying migrations so the lint sees the new schema.
 *
 * QF-20260904-619: pg_catalog's `name` type (e.g. a.attname) has no node-postgres array parser,
 * so array_agg(a.attname) silently returned raw Postgres array-literal TEXT instead of a JS
 * array. schema-reference-extract.mjs's findViolations() then called cols.includes(ref.column)
 * expecting Array.prototype.includes (exact membership) but got String.prototype.includes
 * (substring match) instead -- 'deliverables' silently matched inside 'deliverables_manifest',
 * hiding 33 live phantom column refs across 18 tables. The query below casts to ::text (an OID
 * node-postgres DOES parse into a real array) AND assertParsedColumnArray() below enforces the
 * invariant at runtime, so a DIFFERENT unparsed-array OID introduced by a future edit to this
 * query fails loudly instead of reproducing the identical silent failure mode.
 *
 * KNOWN LIMITATION: assertParsedColumnArray() only proves the aggregate arrived as a JS array
 * (Array.isArray) -- it does not validate that every element is a string, or that the array is
 * non-empty. A relation whose column list somehow aggregates to an array of non-string values
 * would pass this guard and could still defeat downstream cols.includes(ref.column) checks in a
 * different, unenforced way.
 */
import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const OUT = 'database/schema-reference-snapshot.json';

/**
 * QF-20260904-619: pure, exported so it is directly unit-testable without a live DB connection.
 * Throws when `cols` did not arrive as a parsed JS array -- the exact failure mode a future
 * unparsed-array OID (any pg type without a node-postgres array parser) would reproduce.
 *
 * @param {unknown} cols - the aggregated column-list value from a query row
 * @param {string} relName - the relation name, for a useful error message
 * @returns {string[]} cols, unchanged, when it is a real array
 */
export function assertParsedColumnArray(cols, relName) {
  if (!Array.isArray(cols)) {
    throw new Error(
      `schema-reference-snapshot: expected a parsed array of columns for relation "${relName}" ` +
      `but got ${typeof cols} (value: ${JSON.stringify(cols)}). The aggregating query must ` +
      'explicitly cast the aggregated column to a type node-postgres has an array parser for ' +
      "(e.g. ::text) -- pg_catalog's `name` type does not have one, and a silently-unparsed " +
      'array-literal string here turns every downstream cols.includes(column) membership check ' +
      'into a substring test instead.'
    );
  }
  return cols;
}

async function main() {
  config();
  const url = process.env.SUPABASE_POOLER_URL;
  if (!url) {
    console.error('SUPABASE_POOLER_URL not set — cannot snapshot the live schema.');
    process.exitCode = 1;
    return;
  }
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT c.relkind AS kind, c.relname AS rel, array_agg(a.attname::text ORDER BY a.attnum) AS cols
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r','p','v','m')
         AND a.attnum > 0
         AND NOT a.attisdropped
       GROUP BY 1, 2
       ORDER BY 2`);

    const tables = {};
    const views = {};
    for (const r of rows) {
      const cols = assertParsedColumnArray(r.cols, r.rel);
      if (r.kind === 'v' || r.kind === 'm') views[r.rel] = cols;
      else tables[r.rel] = cols;
    }

    const { rows: checkRows } = await c.query(`
      SELECT rel.relname AS table_name, con.conname AS constraint_name,
             pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
       WHERE n.nspname = 'public' AND con.contype = 'c'
       ORDER BY 1, 2`);
    const checks = {};
    for (const r of checkRows) checks[`${r.table_name}.${r.constraint_name}`] = r.definition;

    const snapshot = {
      generated_at: new Date().toISOString(),
      source: 'scripts/lint/schema-reference-snapshot.mjs (pg_attribute/pg_class, schema public)',
      table_count: Object.keys(tables).length,
      view_count: Object.keys(views).length,
      check_count: Object.keys(checks).length,
      tables,
      views,
      checks,
    };
    writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + '\n');
    console.log(`wrote ${OUT}: ${snapshot.table_count} tables, ${snapshot.view_count} views/matviews, ${snapshot.check_count} check constraints`);
  } finally {
    await c.end();
  }
}

if (isMainModule(import.meta.url)) {
  await main();
}
