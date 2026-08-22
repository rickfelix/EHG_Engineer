// SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 -- read-only pg_depend census of every view/matview
// (any schema) referencing the 15 timestamptz-rework target columns. Re-run this before any
// future ceremony attempt of database/chairman-gated/20260817_four_audit_critical_timestamptz.sql
// and re-stage that migration's DROP/CREATE envelope + census_generated_at MAX-AGE GUARD if the
// object list has changed -- this is exactly the check the 2026-08-22 ceremony attempt skipped,
// causing it to fail on public.v_plan_item_position (missing from the original 2026-08-17 list).
import { createDatabaseClient } from '../../lib/supabase-connection.js';

const TARGET_COLUMNS = [
  { table: 'quick_fixes', columns: ['completed_at', 'created_at', 'started_at'] },
  { table: 'sd_phase_handoffs', columns: ['accepted_at', 'created_at', 'rejected_at'] },
  { table: 'strategic_directives_v2', columns: ['approval_date', 'archived_at', 'created_at', 'effective_date', 'expiry_date', 'updated_at'] },
  { table: 'user_stories', columns: ['completed_at', 'created_at', 'updated_at'] },
];

async function main() {
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });
  try {
    const sql = `
      SELECT DISTINCT
        n.nspname AS schema_name,
        c.relname AS object_name,
        CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' ELSE c.relkind::text END AS kind,
        t.relname AS depends_on_table,
        a.attname AS depends_on_column
      FROM pg_depend d
      JOIN pg_rewrite r ON d.objid = r.oid
      JOIN pg_class c ON r.ev_class = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_attribute a ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
      JOIN pg_class t ON a.attrelid = t.oid
      WHERE d.deptype = 'n'
        AND t.relname = ANY($1::text[])
        AND a.attname = ANY($2::text[])
      ORDER BY 1, 2, 5;
    `;
    const allTables = TARGET_COLUMNS.map((t) => t.table);
    const allColumns = [...new Set(TARGET_COLUMNS.flatMap((t) => t.columns))];
    const { rows } = await client.query(sql, [allTables, allColumns]);
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\nTotal distinct dependent objects: ${new Set(rows.map((r) => `${r.schema_name}.${r.object_name}`)).size}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
