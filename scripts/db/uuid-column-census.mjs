#!/usr/bin/env node
/**
 * QF-20260829-440 — read-only census of every uuid-typed column in the public schema, feeding
 * scripts/lint/ilike-on-uuid-lint.mjs's uuid-column list. NO migrations, no DDL, no table
 * changes — this only READS information_schema.columns and writes the result to a committed
 * JSON snapshot (database/uuid-columns-census.json), the same pattern
 * scripts/lint/schema-reference-snapshot.mjs already uses for the table/column-name snapshot.
 *
 * Regenerate: node scripts/db/uuid-column-census.mjs
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export async function censusUuidColumns(supabase) {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_text: "SELECT DISTINCT column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='uuid' ORDER BY column_name",
  });
  if (error) throw error;
  return data[0].result.map((r) => r.column_name);
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const columns = await censusUuidColumns(supabase);
  // Single-line columns array (not one-per-line) -- 300+ machine-generated entries would
  // otherwise dominate this QF's diff with pure data, not logic.
  writeFileSync('database/uuid-columns-census.json', JSON.stringify({
    generated_at: new Date().toISOString(),
    source: 'information_schema.columns WHERE table_schema=public AND data_type=uuid (read-only census, no DDL) via scripts/db/uuid-column-census.mjs',
    column_count: columns.length,
    columns,
  }) + '\n');
  console.log(`uuid-columns-census.json: ${columns.length} columns`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
