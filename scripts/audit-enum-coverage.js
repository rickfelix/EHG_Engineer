#!/usr/bin/env node
/**
 * Enum Coverage Audit Tool
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-H
 *
 * Audits status-like fields to identify CHECK constraints that should
 * be converted to proper CREATE TYPE enums.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabase = createSupabaseServiceClient();

// Known status-like column patterns
const STATUS_PATTERNS = ['status', 'state', 'phase', 'priority', 'severity', 'category'];

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  console.log('\n=== Enum Coverage Audit ===\n');

  // exec_sql returns [{ result: [...] }] (canonical shape, mirrors leo-create-sd.js).

  // Get existing enum types
  const { data: enumsRaw, error: enumsError } = await supabase.rpc('exec_sql', {
    sql_text: `
      SELECT t.typname AS enum_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `.trim(),
  });
  if (enumsError) console.error('enum types: exec_sql error:', enumsError.message);
  const enums = enumsRaw?.[0]?.result;

  // Get columns that look like status fields
  const { data: columnsRaw, error: columnsError } = await supabase.rpc('exec_sql', {
    sql_text: `
      SELECT c.table_name, c.column_name, c.data_type, c.udt_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND (${STATUS_PATTERNS.map(p => `c.column_name LIKE '%${p}%'`).join(' OR ')})
      ORDER BY c.table_name, c.column_name
    `.trim(),
  });
  if (columnsError) console.error('status columns: exec_sql error:', columnsError.message);
  const columns = columnsRaw?.[0]?.result;

  // Get CHECK constraints
  const { data: checksRaw, error: checksError } = await supabase.rpc('exec_sql', {
    sql_text: `
      SELECT tc.table_name, cc.constraint_name, cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc
        ON cc.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public'
      ORDER BY tc.table_name
    `.trim(),
  });
  if (checksError) console.error('check constraints: exec_sql error:', checksError.message);
  const checks = checksRaw?.[0]?.result;

  // Analysis
  const enumNames = new Set((enums || []).map(e => e.enum_name));
  const usingEnum = (columns || []).filter(c => enumNames.has(c.udt_name));
  const usingCheck = (columns || []).filter(c => c.data_type === 'USER-DEFINED' ? false : c.data_type === 'text' || c.data_type === 'character varying');
  const usingEnumType = (columns || []).filter(c => c.data_type === 'USER-DEFINED' && enumNames.has(c.udt_name));

  console.log('Existing PostgreSQL enum types:');
  if (enums && enums.length > 0) {
    for (const e of enums) {
      console.log(`  ${e.enum_name}: [${e.values?.join(', ') || '?'}]`);
    }
  } else {
    console.log('  (none found or RPC not available)');
  }

  console.log(`\nStatus-like columns found: ${(columns || []).length}`);
  console.log(`  Using enum type: ${usingEnumType.length}`);
  console.log(`  Using text/varchar (potential CHECK): ${usingCheck.length}`);

  if (usingCheck.length > 0) {
    console.log('\n--- Columns Needing Enum Conversion ---\n');
    for (const c of usingCheck) {
      // Find matching CHECK constraint
      const related = (checks || []).filter(
        ch => ch.table_name === c.table_name &&
              ch.check_clause?.includes(c.column_name),
      );
      const hasCheck = related.length > 0;
      console.log(`  ${c.table_name}.${c.column_name} (${c.data_type})${hasCheck ? ' [has CHECK]' : ''}`);
      if (verbose && related.length > 0) {
        related.forEach(r => console.log(`    CHECK: ${r.check_clause?.substring(0, 80)}`));
      }
    }
  }

  // Summary
  const total = (columns || []).length;
  const enumCoverage = total > 0 ? ((usingEnumType.length / total) * 100).toFixed(1) : '0.0';
  console.log(`\nEnum coverage: ${enumCoverage}% (${usingEnumType.length}/${total} status-like columns)`);
  console.log(`CHECK constraints found: ${(checks || []).length}`);
  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
