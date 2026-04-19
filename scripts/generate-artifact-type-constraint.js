#!/usr/bin/env node
/**
 * Generate the canonical venture_artifacts artifact_type CHECK constraint
 * from artifact-types.js (the single source of truth in code).
 *
 * Also queries the DB for any types in existing rows not in the registry
 * (backward compat) and includes them.
 *
 * Usage:
 *   node scripts/generate-artifact-type-constraint.js          # Print SQL
 *   node scripts/generate-artifact-type-constraint.js --apply  # Apply to DB
 *   node scripts/generate-artifact-type-constraint.js --validate # Check sync
 *
 * SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: Prevent dual-constraint recurrence.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ARTIFACT_TYPES } from '../lib/eva/artifact-types.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// All types from code registry
const codeTypes = new Set(Object.values(ARTIFACT_TYPES));

// Stage analysis types (stage_0_analysis through stage_26_analysis)
for (let i = 0; i <= 26; i++) codeTypes.add(`stage_${i}_analysis`);

// Legacy stitch types (kept for backward compat with historical data)
['stitch_project', 'stitch_curation', 'stitch_budget', 'stitch_design_export', 'stitch_qa_report'].forEach(t => codeTypes.add(t));

// S17 additional types
['s17_fill_screen', 's17_qa_report'].forEach(t => codeTypes.add(t));

async function getDbTypes() {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_type')
    .limit(10000);
  return new Set((data ?? []).map(r => r.artifact_type));
}

async function getConstraintCount() {
  const { data } = await supabase.rpc('get_table_constraints', { p_table_name: 'venture_artifacts' });
  const artTypeConstraints = (data ?? []).filter(c =>
    c.constraint_type === 'CHECK' && (c.check_clause ?? '').includes('artifact_type')
  );
  return artTypeConstraints;
}

function generateSQL(allTypes) {
  const sorted = [...allTypes].sort();
  const typeList = sorted.map(t => `    '${t}'::text`).join(',\n');
  return `-- Auto-generated from artifact-types.js — DO NOT EDIT MANUALLY
-- Generated: ${new Date().toISOString()}
-- Types: ${sorted.length}

BEGIN;

-- Drop ALL artifact_type CHECK constraints (prevents dual-constraint issue)
ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS artifact_type_check;
ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;

-- Create ONE canonical constraint from code registry
ALTER TABLE venture_artifacts
  ADD CONSTRAINT venture_artifacts_artifact_type_check
  CHECK (((artifact_type)::text = ANY (ARRAY[
${typeList}
  ])));

COMMIT;
`;
}

async function main() {
  const mode = process.argv[2];

  // Merge code types with any existing DB types (backward compat)
  const dbTypes = await getDbTypes();
  const allTypes = new Set([...codeTypes, ...dbTypes]);

  if (mode === '--validate') {
    const constraints = await getConstraintCount();
    console.log(`CHECK constraints on artifact_type: ${constraints.length}`);
    constraints.forEach(c => console.log(`  ${c.constraint_name}`));

    if (constraints.length > 1) {
      console.error('\n❌ FAIL: Multiple CHECK constraints detected! Run with --apply to consolidate.');
      process.exit(1);
    }

    // Check for code types missing from constraint
    // (Would need to parse the constraint SQL — simplified check here)
    const missingFromDb = [...codeTypes].filter(t => !dbTypes.has(t));
    if (missingFromDb.length > 0) {
      console.log(`\n⚠️  ${missingFromDb.length} code types have no existing rows (may be unused):`);
      missingFromDb.slice(0, 10).forEach(t => console.log(`  ${t}`));
    }

    console.log(`\n✅ Constraint count: ${constraints.length} (expected: 1)`);
    console.log(`Code types: ${codeTypes.size} | DB types in use: ${dbTypes.size} | Total in constraint: ${allTypes.size}`);
    process.exit(constraints.length === 1 ? 0 : 1);
  }

  const sql = generateSQL(allTypes);

  if (mode === '--apply') {
    console.log('Applying consolidated constraint...');
    // Split into statements and execute
    const statements = sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
    for (const stmt of statements) {
      if (stmt === 'BEGIN' || stmt === 'COMMIT') continue;
      const { error } = await supabase.rpc('exec_sql', { sql_text: stmt });
      if (error) {
        console.error('SQL error:', error.message);
        console.error('Statement:', stmt.slice(0, 100));
        process.exit(1);
      }
    }
    console.log(`✅ Consolidated to 1 constraint with ${allTypes.size} types`);
  } else {
    // Default: print SQL
    console.log(sql);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
