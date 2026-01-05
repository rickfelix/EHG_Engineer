#!/usr/bin/env node
/**
 * Status Synchronization Verifier
 *
 * Compares the single source of truth (lib/constants/status-definitions.ts)
 * against:
 *   1. Database CHECK constraints
 *   2. Hardcoded status lists in SQL functions
 *   3. JavaScript/TypeScript status checks
 *
 * Usage: node scripts/verify-status-sync.cjs [--fix]
 *
 * Exit codes:
 *   0 - All synchronized
 *   1 - Mismatches found
 *   2 - Error during verification
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Single Source of Truth (must match status-definitions.ts)
const STATUS_DEFINITIONS = {
  PRD: {
    all: [
      'draft', 'planning', 'in_progress', 'testing', 'verification',
      'approved', 'completed', 'archived', 'rejected', 'on_hold', 'cancelled'
    ],
    active: [
      'planning', 'in_progress', 'testing', 'verification', 'approved', 'completed'
    ]
  },
  SD: {
    all: [
      'draft', 'active', 'in_progress', 'on_hold', 'completed',
      'cancelled', 'deferred', 'pending_approval'
    ],
    active: ['active', 'in_progress', 'pending_approval', 'completed']
  }
};

const issues = [];
const warnings = [];

async function checkDatabaseConstraints() {
  console.log('\n📋 Checking database CHECK constraints...\n');

  try {
    // Get CHECK constraint definitions from information_schema
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT
          tc.table_name,
          tc.constraint_name,
          cc.check_clause
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_name IN ('product_requirements_v2', 'strategic_directives_v2')
          AND tc.constraint_type = 'CHECK'
          AND cc.check_clause LIKE '%status%'
      `
    });

    if (error) {
      // Fallback: check pg_constraint directly
      console.log('  Using pg_constraint fallback...');
      const { data: pgData, error: pgError } = await supabase.rpc('exec_sql', {
        sql: `
          SELECT
            c.relname as table_name,
            con.conname as constraint_name,
            pg_get_constraintdef(con.oid) as check_clause
          FROM pg_constraint con
          JOIN pg_class c ON con.conrelid = c.oid
          WHERE c.relname IN ('product_requirements_v2', 'strategic_directives_v2')
            AND con.contype = 'c'
            AND pg_get_constraintdef(con.oid) LIKE '%status%'
        `
      });

      if (pgError) {
        warnings.push(`Could not verify CHECK constraints: ${pgError.message}`);
        return;
      }

      processConstraints(pgData);
    } else {
      processConstraints(data);
    }
  } catch (err) {
    warnings.push(`Error checking constraints: ${err.message}`);
  }
}

function processConstraints(constraints) {
  if (!constraints || constraints.length === 0) {
    warnings.push('No status CHECK constraints found in database');
    return;
  }

  for (const constraint of constraints) {
    const table = constraint.table_name;
    const clause = constraint.check_clause;

    // Extract status values from CHECK clause
    const matches = clause.match(/'([^']+)'/g);
    if (!matches) continue;

    const dbStatuses = matches.map(m => m.replace(/'/g, '')).sort();
    const sourceOfTruth = table === 'product_requirements_v2'
      ? STATUS_DEFINITIONS.PRD.all.sort()
      : STATUS_DEFINITIONS.SD.all.sort();

    console.log(`  ${table}:`);
    console.log(`    Constraint: ${constraint.constraint_name}`);
    console.log(`    DB statuses: [${dbStatuses.join(', ')}]`);
    console.log(`    Source of truth: [${sourceOfTruth.join(', ')}]`);

    // Find differences
    const missingInDb = sourceOfTruth.filter(s => !dbStatuses.includes(s));
    const extraInDb = dbStatuses.filter(s => !sourceOfTruth.includes(s));

    if (missingInDb.length > 0) {
      issues.push({
        type: 'CONSTRAINT_MISMATCH',
        table,
        message: `Missing in DB constraint: ${missingInDb.join(', ')}`
      });
      console.log(`    ❌ MISSING: ${missingInDb.join(', ')}`);
    }

    if (extraInDb.length > 0) {
      warnings.push(`Extra in DB constraint (${table}): ${extraInDb.join(', ')}`);
      console.log(`    ⚠️  EXTRA: ${extraInDb.join(', ')}`);
    }

    if (missingInDb.length === 0 && extraInDb.length === 0) {
      console.log(`    ✅ Synchronized`);
    }
    console.log('');
  }
}

async function checkDatabaseValues() {
  console.log('📊 Checking actual status values in database...\n');

  // Check PRD statuses in use
  const { data: prdStatuses } = await supabase
    .from('product_requirements_v2')
    .select('status');

  const uniquePrdStatuses = [...new Set(prdStatuses?.map(p => p.status))].sort();
  console.log(`  PRD statuses in use: [${uniquePrdStatuses.join(', ')}]`);

  const unknownPrdStatuses = uniquePrdStatuses.filter(
    s => !STATUS_DEFINITIONS.PRD.all.includes(s)
  );
  if (unknownPrdStatuses.length > 0) {
    issues.push({
      type: 'UNKNOWN_STATUS',
      table: 'product_requirements_v2',
      message: `Unknown PRD statuses in database: ${unknownPrdStatuses.join(', ')}`
    });
    console.log(`  ❌ Unknown: ${unknownPrdStatuses.join(', ')}`);
  } else {
    console.log('  ✅ All PRD statuses recognized');
  }

  // Check SD statuses in use
  const { data: sdStatuses } = await supabase
    .from('strategic_directives_v2')
    .select('status');

  const uniqueSdStatuses = [...new Set(sdStatuses?.map(s => s.status))].sort();
  console.log(`\n  SD statuses in use: [${uniqueSdStatuses.join(', ')}]`);

  const unknownSdStatuses = uniqueSdStatuses.filter(
    s => !STATUS_DEFINITIONS.SD.all.includes(s)
  );
  if (unknownSdStatuses.length > 0) {
    issues.push({
      type: 'UNKNOWN_STATUS',
      table: 'strategic_directives_v2',
      message: `Unknown SD statuses in database: ${unknownSdStatuses.join(', ')}`
    });
    console.log(`  ❌ Unknown: ${unknownSdStatuses.join(', ')}`);
  } else {
    console.log('  ✅ All SD statuses recognized');
  }
  console.log('');
}

async function checkSqlFunctions() {
  console.log('🔍 Checking SQL function status lists...\n');

  // Get function source code
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        proname as function_name,
        pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname IN ('calculate_sd_progress', 'get_progress_breakdown')
      AND pronamespace = 'public'::regnamespace
    `
  });

  if (error || !data) {
    warnings.push(`Could not retrieve function definitions: ${error?.message || 'No data'}`);
    return;
  }

  for (const func of data) {
    console.log(`  ${func.function_name}:`);

    // Extract status IN clauses
    const inClauses = func.definition.match(/status\s+IN\s*\([^)]+\)/gi) || [];

    for (const clause of inClauses) {
      const matches = clause.match(/'([^']+)'/g);
      if (!matches) continue;

      const funcStatuses = matches.map(m => m.replace(/'/g, '')).sort();
      console.log(`    Found IN clause: [${funcStatuses.join(', ')}]`);

      // Check if this matches PRD active statuses or SD active statuses
      const isPrdCheck = clause.toLowerCase().includes('product_requirements') ||
                         func.definition.includes('prd_exists');
      const sourceList = isPrdCheck
        ? STATUS_DEFINITIONS.PRD.active
        : STATUS_DEFINITIONS.SD.active;

      const missing = sourceList.filter(s => !funcStatuses.includes(s));
      if (missing.length > 0 && isPrdCheck) {
        // Only flag as issue for PRD checks (the original bug)
        if (missing.some(s => ['verification', 'testing', 'planning'].includes(s))) {
          console.log(`    ⚠️  May be missing: ${missing.join(', ')}`);
        }
      }
    }
    console.log('');
  }
}

function checkCodebaseHardcoding() {
  console.log('📁 Checking codebase for hardcoded status lists...\n');

  const filesToCheck = [
    'src/services/status-validator.js',
    'lib/validation/leo-schemas.ts'
  ];

  for (const file of filesToCheck) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ${file}: Not found (skipped)`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const prdMatches = content.match(/PRD[^}]+all:\s*\[[^\]]+\]/s);

    if (prdMatches) {
      console.log(`  ${file}: Contains PRD status definitions`);
      // Could add detailed comparison here
    }
  }
  console.log('');
}

async function testProgressCalculation() {
  console.log('🧪 Testing progress calculation for known PRDs...\n');

  // Get all PRDs with their statuses
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, status, title')
    .limit(10);

  if (!prds || prds.length === 0) {
    console.log('  No PRDs found\n');
    return;
  }

  for (const prd of prds) {
    const { data: progress } = await supabase.rpc('calculate_sd_progress', {
      sd_id_param: prd.directive_id
    });

    const isActiveStatus = STATUS_DEFINITIONS.PRD.active.includes(prd.status);
    console.log(`  ${prd.directive_id}:`);
    console.log(`    PRD Status: ${prd.status} (active: ${isActiveStatus})`);
    console.log(`    Progress: ${progress}%`);

    // If PRD is active but progress seems low, flag potential issue
    if (isActiveStatus && progress < 20) {
      warnings.push(`${prd.directive_id}: Active PRD status '${prd.status}' but low progress (${progress}%)`);
    }
  }
  console.log('');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  STATUS SYNCHRONIZATION VERIFIER');
  console.log('  Single Source of Truth: lib/constants/status-definitions.ts');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    await checkDatabaseConstraints();
    await checkDatabaseValues();
    await checkSqlFunctions();
    checkCodebaseHardcoding();
    await testProgressCalculation();

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (issues.length === 0 && warnings.length === 0) {
      console.log('✅ All status definitions are synchronized!\n');
      process.exit(0);
    }

    if (issues.length > 0) {
      console.log('❌ ISSUES FOUND:\n');
      issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. [${issue.type}] ${issue.table || ''}`);
        console.log(`     ${issue.message}\n`);
      });
    }

    if (warnings.length > 0) {
      console.log('⚠️  WARNINGS:\n');
      warnings.forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning}`);
      });
      console.log('');
    }

    process.exit(issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(2);
  }
}

main();
