#!/usr/bin/env node
/**
 * Schema Snapshot Tool
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-H
 *
 * Captures current database schema as a reference snapshot for CI validation.
 * Compares live schema against a stored reference to detect drift.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const SNAPSHOT_PATH = join(__dirname, '..', 'docs', 'database', 'schema-snapshot.json');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function captureSchema() {
  // Get all tables
  const { data: tables, error: tablesErr } = await supabase.rpc('exec_sql', {
    query: `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `,
  });

  if (tablesErr) {
    // Fallback: query pg_tables directly
    const { data: pgTables } = await supabase
      .from('pg_catalog.pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');

    return { tables: pgTables?.map(t => t.tablename).sort() || [], enums: [], checkConstraints: [] };
  }

  // Get all enum types
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

  // Get CHECK constraints on status-like fields
  const { data: checks } = await supabase.rpc('exec_sql', {
    query: `
      SELECT tc.table_name, cc.constraint_name, cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc
        ON cc.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public'
        AND (cc.check_clause LIKE '%status%' OR cc.check_clause LIKE '%state%'
             OR cc.check_clause LIKE '%phase%' OR cc.check_clause LIKE '%type%')
      ORDER BY tc.table_name
    `,
  });

  return {
    capturedAt: new Date().toISOString(),
    tableCount: tables?.length || 0,
    tables: tables?.map(t => ({ name: t.table_name, type: t.table_type })) || [],
    enumCount: enums?.length || 0,
    enums: enums || [],
    checkConstraintCount: checks?.length || 0,
    checkConstraints: checks || [],
  };
}

async function compareSnapshot(current) {
  if (!existsSync(SNAPSHOT_PATH)) {
    return { status: 'no_reference', message: 'No reference snapshot found. Run with --save to create one.' };
  }

  const reference = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const diffs = [];

  // Compare table counts
  if (current.tableCount !== reference.tableCount) {
    diffs.push(`Table count changed: ${reference.tableCount} → ${current.tableCount}`);
  }

  // Find added/removed tables
  const refTableNames = new Set(reference.tables.map(t => t.name));
  const curTableNames = new Set(current.tables.map(t => t.name));

  for (const name of curTableNames) {
    if (!refTableNames.has(name)) diffs.push(`+ Table added: ${name}`);
  }
  for (const name of refTableNames) {
    if (!curTableNames.has(name)) diffs.push(`- Table removed: ${name}`);
  }

  // Compare enum counts
  if (current.enumCount !== reference.enumCount) {
    diffs.push(`Enum count changed: ${reference.enumCount} → ${current.enumCount}`);
  }

  return {
    status: diffs.length === 0 ? 'match' : 'drift',
    diffs,
    referenceDate: reference.capturedAt,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'compare';

  console.log('\n=== Schema Snapshot Tool ===\n');

  try {
    const schema = await captureSchema();

    if (command === '--save' || command === 'save') {
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(schema, null, 2));
      console.log(`Schema snapshot saved to ${SNAPSHOT_PATH}`);
      console.log(`  Tables: ${schema.tableCount}`);
      console.log(`  Enums: ${schema.enumCount}`);
      console.log(`  CHECK constraints (status-like): ${schema.checkConstraintCount}`);
    } else if (command === 'compare' || command === '--compare') {
      const result = await compareSnapshot(schema);
      if (result.status === 'no_reference') {
        console.log(result.message);
        process.exit(1);
      } else if (result.status === 'match') {
        console.log('Schema matches reference snapshot.');
        console.log(`  Reference date: ${result.referenceDate}`);
      } else {
        console.log(`Schema drift detected (${result.diffs.length} differences):`);
        result.diffs.forEach(d => console.log(`  ${d}`));
        process.exit(1);
      }
    } else if (command === 'status') {
      console.log(`Current schema:`);
      console.log(`  Tables: ${schema.tableCount}`);
      console.log(`  Enums: ${schema.enumCount}`);
      console.log(`  CHECK constraints (status-like): ${schema.checkConstraintCount}`);

      if (schema.checkConstraintCount > 0) {
        console.log('\nStatus-like CHECK constraints (candidates for enum conversion):');
        for (const c of schema.checkConstraints) {
          console.log(`  ${c.table_name}.${c.constraint_name}`);
        }
      }

      if (existsSync(SNAPSHOT_PATH)) {
        const ref = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
        console.log(`\nReference snapshot: ${ref.capturedAt}`);
        console.log(`  Tables: ${ref.tableCount}, Enums: ${ref.enumCount}`);
      } else {
        console.log('\nNo reference snapshot. Run: node scripts/schema-snapshot.js save');
      }
    } else {
      console.log('Usage: node scripts/schema-snapshot.js [save|compare|status]');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
