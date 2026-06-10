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
 * Usage: npm run schema:snapshot:lint   (requires SUPABASE_POOLER_URL)
 * Run after applying migrations so the lint sees the new schema.
 */
import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
import { config } from 'dotenv';
config();

const OUT = 'database/schema-reference-snapshot.json';

const url = process.env.SUPABASE_POOLER_URL;
if (!url) {
  console.error('SUPABASE_POOLER_URL not set — cannot snapshot the live schema.');
  process.exitCode = 1;
} else {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT c.relkind AS kind, c.relname AS rel, array_agg(a.attname ORDER BY a.attnum) AS cols
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
      if (r.kind === 'v' || r.kind === 'm') views[r.rel] = r.cols;
      else tables[r.rel] = r.cols;
    }

    const snapshot = {
      generated_at: new Date().toISOString(),
      source: 'scripts/lint/schema-reference-snapshot.mjs (pg_attribute/pg_class, schema public)',
      table_count: Object.keys(tables).length,
      view_count: Object.keys(views).length,
      tables,
      views,
    };
    writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + '\n');
    console.log(`wrote ${OUT}: ${snapshot.table_count} tables, ${snapshot.view_count} views/matviews`);
  } finally {
    await c.end();
  }
}
