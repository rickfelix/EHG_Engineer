#!/usr/bin/env node
/**
 * Enum Coverage Audit Tool
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-H
 *
 * Audits status-like fields to identify CHECK constraints that should
 * be converted to proper CREATE TYPE enums.
 */

import { createClient } from '@supabase/supabase-js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Known status-like column patterns
const STATUS_PATTERNS = ['status', 'state', 'phase', 'priority', 'severity', 'category'];

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  console.log('\n=== Enum Coverage Audit ===\n');

  // Get existing enum types
  const { data: enums } = await supabase.rpc('exec_sql', {
    query: `
      SELECT t.typname AS enum_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `,
  });

  // Get columns that look like status fields
  const { data: columns } = await supabase.rpc('exec_sql', {
    query: `
      SELECT c.table_name, c.column_name, c.data_type, c.udt_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND (${STATUS_PATTERNS.map(p => `c.column_name LIKE '%${p}%'`).join(' OR ')})
      ORDER BY c.table_name, c.column_name
    `,
  });

  // Get CHECK constraints
  const { data: checks } = await supabase.rpc('exec_sql', {
    query: `
      SELECT tc.table_name, cc.constraint_name, cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc
        ON cc.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public'
      ORDER BY tc.table_name
    `,
  });

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
