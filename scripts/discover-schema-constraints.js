#!/usr/bin/env node
/**
 * Schema Constraint Auto-Discovery Script
 * SD: SD-LEO-4-3-2-AUTOMATION
 *
 * Scans PostgreSQL system catalogs to discover CHECK constraints
 * and populates leo_schema_constraints table.
 *
 * Usage: node scripts/discover-schema-constraints.js [--dry-run] [--table <name>]
 *   --dry-run: Show what would be inserted without actually inserting
 *   --table <name>: Only discover constraints for specific table
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const { Client } = pg;

// Tables to scan for constraints (EHG_Engineer LEO tables + key EHG tables)
const TARGET_TABLES = [
  // LEO Protocol tables
  'leo_protocols',
  'leo_protocol_sections',
  'leo_agents',
  'leo_sub_agents',
  'leo_handoff_templates',
  'leo_handoff_executions',
  'leo_validation_rules',
  'leo_schema_constraints',
  'leo_process_scripts',
  'leo_kb_generation_log',
  // SD Management tables
  'strategic_directives_v2',
  'sd_phase_handoffs',
  'retrospectives',
  // PRD & User Story tables
  'product_requirements_v2',
  'user_stories',
  'prd_deliverables',
  // Sub-agent tables
  'sub_agent_execution_results'
];

async function discoverConstraints(client, tableName) {
  const query = `
    SELECT
      c.conname AS constraint_name,
      c.contype AS constraint_type,
      pg_get_constraintdef(c.oid) AS constraint_definition,
      a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = $1
      AND n.nspname = 'public'
      AND c.contype = 'c'  -- CHECK constraints only
    ORDER BY c.conname;
  `;

  const result = await client.query(query, [tableName]);
  return result.rows;
}

function parseCheckConstraint(definition) {
  // Extract valid values from CHECK constraint definition
  // Examples:
  //   CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text])))
  //   CHECK (status IN ('active', 'superseded'))

  const patterns = [
    // ANY (ARRAY[...]) pattern
    /ANY\s*\(\s*ARRAY\s*\[\s*'([^']+)'(?:::text)?(?:\s*,\s*'([^']+)'(?:::text)?)*\s*\]/gi,
    // IN (...) pattern
    /IN\s*\(\s*'([^']+)'(?:\s*,\s*'([^']+)')*\s*\)/gi
  ];

  const values = new Set();

  for (const pattern of patterns) {
    let match;
    const _regex = new RegExp(pattern);
    const str = definition;

    // Extract all quoted strings
    const quotedPattern = /'([^']+)'/g;
    while ((match = quotedPattern.exec(str)) !== null) {
      // Filter out type casts like 'text'
      if (!['text', 'varchar', 'integer'].includes(match[1])) {
        values.add(match[1]);
      }
    }
  }

  return Array.from(values);
}

function generateRemediation(tableName, columnName, validValues) {
  if (validValues.length === 0) return null;
  return `Use one of: ${validValues.join(', ')}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tableIndex = args.indexOf('--table');
  const specificTable = tableIndex !== -1 ? args[tableIndex + 1] : null;

  console.log('🔍 Schema Constraint Auto-Discovery');
  console.log('='.repeat(50));
  if (dryRun) console.log('   Mode: DRY RUN (no changes will be made)\n');

  // Connect to PostgreSQL directly for system catalog queries
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Also connect to Supabase for inserts
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const tablesToScan = specificTable ? [specificTable] : TARGET_TABLES;
    const discovered = [];

    for (const table of tablesToScan) {
      const constraints = await discoverConstraints(client, table);

      if (constraints.length === 0) {
        console.log(`   ${table}: No CHECK constraints found`);
        continue;
      }

      console.log(`📋 ${table}: ${constraints.length} CHECK constraint(s)`);

      for (const constraint of constraints) {
        const validValues = parseCheckConstraint(constraint.constraint_definition);

        if (validValues.length === 0) {
          console.log(`      ⚠️  ${constraint.column_name}: Could not parse values`);
          continue;
        }

        const record = {
          table_name: table,
          column_name: constraint.column_name,
          constraint_type: 'check',
          constraint_definition: constraint.constraint_definition,
          valid_values: validValues,
          error_pattern: `violates check constraint.*${constraint.constraint_name}`,
          remediation_hint: generateRemediation(table, constraint.column_name, validValues),
          documentation: `Auto-discovered CHECK constraint for ${table}.${constraint.column_name}`
        };

        discovered.push(record);
        console.log(`      ✅ ${constraint.column_name}: [${validValues.join(', ')}]`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Total constraints discovered: ${discovered.length}`);

    if (dryRun) {
      console.log('\n🔸 DRY RUN - No changes made');
      console.log('   Run without --dry-run to insert into leo_schema_constraints');
      return;
    }

    if (discovered.length === 0) {
      console.log('\n✅ No new constraints to insert');
      return;
    }

    // Insert/update constraints
    console.log('\n📝 Upserting constraints...');

    let inserted = 0;
    let updated = 0;

    for (const record of discovered) {
      // Check if exists
      const { data: existing } = await supabase
        .from('leo_schema_constraints')
        .select('id')
        .eq('table_name', record.table_name)
        .eq('column_name', record.column_name)
        .eq('constraint_type', record.constraint_type)
        .single();

      if (existing) {
        // Update
        const { error } = await supabase
          .from('leo_schema_constraints')
          .update({
            valid_values: record.valid_values,
            constraint_definition: record.constraint_definition,
            remediation_hint: record.remediation_hint,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`   ❌ ${record.table_name}.${record.column_name}: ${error.message}`);
        } else {
          updated++;
        }
      } else {
        // Insert
        const { error } = await supabase
          .from('leo_schema_constraints')
          .insert(record);

        if (error) {
          console.error(`   ❌ ${record.table_name}.${record.column_name}: ${error.message}`);
        } else {
          inserted++;
        }
      }
    }

    console.log(`\n✅ Complete: ${inserted} inserted, ${updated} updated`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
