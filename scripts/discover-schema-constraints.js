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
 *
 * QF-20260913-767: SAFE TO RE-RUN BY HAND. parseCheckConstraint only derives an enumeration
 * from a definition that genuinely IS one (never partially, from a multi-branch OR/range
 * condition), and a row whose valid_values was hand-set to NULL for an unchanged
 * constraint_definition is never overwritten -- a re-run can neither invent a bogus
 * enumeration nor undo a documented manual NULL.
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import dotenv from 'dotenv';
import pg from 'pg';

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

// QF-20260903-935: DATABASE_URL (direct pg connection) isn't configured in every environment
// this script runs in. exec_sql is the RPC every other live-catalog audit in this repo already
// falls back to (see audit-enum-coverage.js) -- reuse it here so the fleet's canonical
// derive-from-catalog tool actually runs where DATABASE_URL is absent, instead of a doc row
// silently drifting from the live constraint until a write probe happens to catch it.
export async function discoverConstraintsViaSupabase(supabase, tableName) {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_text: `
      SELECT
        c.conname AS constraint_name,
        c.contype AS constraint_type,
        pg_get_constraintdef(c.oid) AS constraint_definition,
        a.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE t.relname = '${tableName}'
        AND n.nspname = 'public'
        AND c.contype = 'c'
      ORDER BY c.conname
    `.trim(),
  });
  if (error) throw new Error(`exec_sql error for ${tableName}: ${error.message}`);
  return data?.[0]?.result || [];
}

// QF-20260913-767: leo:discover is SAFE TO RE-RUN. parseCheckConstraint only ever derives an
// enumeration from a definition that IS one (a single ANY (ARRAY[...]) or IN (...) over the
// whole CHECK) -- it never partially-derives from a multi-branch OR/range condition, so a
// re-run can never resurrect a stale/wrong enumeration for a constraint that isn't one.
export function parseCheckConstraint(definition) {
  // Extract valid values from CHECK constraint definition
  // Examples:
  //   CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text])))
  //   CHECK (status IN ('active', 'superseded'))
  //
  // A multi-branch OR check (e.g. "x IS NULL OR status = 'blocked' OR (x >= 0 AND x <= 100)")
  // is NOT an enumeration -- it is a disjunction where one branch happens to reference a
  // string literal. The prior implementation declared ANY/IN patterns above but never actually
  // used them to gate extraction: it ran a bare quoted-string scan over the WHOLE definition
  // regardless of shape, so any CHECK containing a string literal anywhere (row 59 of
  // leo_schema_constraints: sd_phase_handoffs.validation_score's
  // chk_handoff_validation_threshold) became a bogus single-value enumeration. Disqualify the
  // whole definition (return []) rather than partially deriving, whenever it contains a
  // construct that only makes sense outside a pure enumeration.
  const isMultiConditionCheck =
    /\bOR\b/i.test(definition) ||
    /\bBETWEEN\b/i.test(definition) ||
    /\bIS\s+NULL\b/i.test(definition) ||
    /(>=|<=|<>|!=|<|>)/.test(definition);
  if (isMultiConditionCheck) return [];

  const values = new Set();
  const quotedPattern = /'([^']+)'/g;
  let match;
  while ((match = quotedPattern.exec(definition)) !== null) {
    // Filter out type casts like 'text'
    if (!['text', 'varchar', 'integer'].includes(match[1])) {
      values.add(match[1]);
    }
  }

  return Array.from(values);
}

function generateRemediation(tableName, columnName, validValues) {
  if (validValues.length === 0) return null;
  return `Use one of: ${validValues.join(', ')}`;
}

/**
 * Upserts one discovered constraint record. Exported so the "kept manual NULL" decision
 * (QF-20260913-767) is unit-testable against an injected fake supabase client, without a live
 * DB or exercising main()'s process.exit()/pg.Client wiring.
 * @returns {Promise<{action: 'inserted'|'updated'|'kept'|'failed', error?: string}>}
 */
export async function upsertConstraintRecord(supabase, record) {
  const { data: existing } = await supabase
    .from('leo_schema_constraints')
    .select('id, valid_values, constraint_definition')
    .eq('table_name', record.table_name)
    .eq('column_name', record.column_name)
    .eq('constraint_type', record.constraint_type)
    .single();

  if (!existing) {
    const { error } = await supabase.from('leo_schema_constraints').insert(record);
    return error ? { action: 'failed', error: error.message } : { action: 'inserted' };
  }

  // A row whose valid_values was hand-set to NULL is a documented decision (e.g.
  // SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E's 09-07 repair of
  // sd_phase_handoffs.validation_score -- the row's own documentation field records why), not
  // missing data. Never silently overwrite it for an UNCHANGED constraint_definition, even if
  // this run's derivation is non-empty.
  if (existing.valid_values === null && existing.constraint_definition === record.constraint_definition) {
    return { action: 'kept' };
  }

  const { error } = await supabase
    .from('leo_schema_constraints')
    .update({
      valid_values: record.valid_values,
      constraint_definition: record.constraint_definition,
      remediation_hint: record.remediation_hint,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  return error ? { action: 'failed', error: error.message } : { action: 'updated' };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tableIndex = args.indexOf('--table');
  const specificTable = tableIndex !== -1 ? args[tableIndex + 1] : null;

  console.log('🔍 Schema Constraint Auto-Discovery');
  console.log('='.repeat(50));
  if (dryRun) console.log('   Mode: DRY RUN (no changes will be made)\n');

  // Prefer a direct PostgreSQL connection when DATABASE_URL is configured; otherwise fall
  // back to the exec_sql RPC (QF-20260903-935) so this script runs anywhere the Supabase
  // service-role client already works.
  const useDirectPg = Boolean(process.env.DATABASE_URL);
  const client = useDirectPg ? new Client({ connectionString: process.env.DATABASE_URL }) : null;
  const supabase = createSupabaseServiceClient();

  try {
    if (useDirectPg) {
      await client.connect();
      console.log('✅ Connected to PostgreSQL\n');
    } else {
      console.log('ℹ️  DATABASE_URL not set — using exec_sql RPC via Supabase\n');
    }

    const tablesToScan = specificTable ? [specificTable] : TARGET_TABLES;
    const discovered = [];

    for (const table of tablesToScan) {
      const constraints = useDirectPg
        ? await discoverConstraints(client, table)
        : await discoverConstraintsViaSupabase(supabase, table);

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

    const tally = { inserted: 0, updated: 0, kept: 0, failed: 0 };
    for (const record of discovered) {
      const outcome = await upsertConstraintRecord(supabase, record);
      if (outcome.action === 'failed') {
        console.error(`   ❌ ${record.table_name}.${record.column_name}: ${outcome.error}`);
      } else if (outcome.action === 'kept') {
        console.log(`      🔒 ${record.table_name}.${record.column_name}: kept manual NULL (constraint_definition unchanged)`);
      }
      tally[outcome.action]++;
    }

    console.log(`\n✅ Complete: ${tally.inserted} inserted, ${tally.updated} updated, ${tally.kept} kept (manual NULL preserved)`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (useDirectPg) await client.end();
  }
}

if (isMainModule(import.meta.url)) main();
