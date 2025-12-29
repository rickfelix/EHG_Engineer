#!/usr/bin/env node

/**
 * Database-First Enforcement: Test Plans
 *
 * Validates that test plans are ONLY in database (leo_test_plans table),
 * not in markdown files.
 *
 * Pattern: Similar to SD/PRD validation enforcement
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function validateTestPlans() {
  console.log('🔍 Database-First Enforcement: Test Plans Validation');
  console.log('================================================================\n');

  const violations = {
    markdownFiles: [],
    missingFromDatabase: []
  };

  // Check 1: Look for test plan markdown files (VIOLATION)
  console.log('📋 Checking for test plan markdown files...');

  try {
    const { stdout } = await execAsync(
      'find /mnt/c/_EHG/EHG_Engineer -name "*test*plan*.md" -type f 2>/dev/null || true'
    );

    const testPlanFiles = stdout
      .trim()
      .split('\n')
      .filter(line => line && !line.includes('node_modules'));

    if (testPlanFiles.length > 0 && testPlanFiles[0]) {
      testPlanFiles.forEach(file => {
        violations.markdownFiles.push(file);
        console.log(`   ❌ VIOLATION: ${file}`);
      });
    } else {
      console.log('   ✅ No test plan markdown files found');
    }
  } catch (_error) {
    console.log('   ✅ No test plan markdown files found');
  }

  // Check 2: Verify test plans exist in database
  console.log('\n📊 Checking database for test plans...');

  const { data: testPlans, error } = await supabase
    .from('leo_test_plans')
    .select('id, prd_id, coverage_target, matrices');

  if (error) {
    console.error('   ❌ Error querying database:', error.message);
  } else {
    console.log(`   ✅ Found ${testPlans.length} test plans in database`);

    testPlans.forEach(plan => {
      console.log(`      - ${plan.prd_id} (coverage: ${plan.coverage_target}%)`);
    });
  }

  // Check 3: Verify PRDs have corresponding test plans
  console.log('\n🔗 Checking PRD → Test Plan linkage...');

  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('status', 'approved');

  if (!prdError && prds) {
    for (const prd of prds) {
      const testPlan = testPlans?.find(tp => tp.prd_id === prd.id);

      if (!testPlan) {
        violations.missingFromDatabase.push(prd.id);
        console.log(`   ⚠️  WARNING: PRD ${prd.id} has no test plan in database`);
      }
    }

    if (violations.missingFromDatabase.length === 0) {
      console.log('   ✅ All approved PRDs have test plans');
    }
  }

  // Summary
  console.log('\n================================================================');
  console.log('📊 Validation Summary:');
  console.log(`   - Markdown files (VIOLATIONS): ${violations.markdownFiles.length}`);
  console.log(`   - Missing test plans: ${violations.missingFromDatabase.length}`);

  if (violations.markdownFiles.length > 0) {
    console.log('\n❌ DATABASE-FIRST VIOLATION DETECTED');
    console.log('\n🚫 The following test plan markdown files must be deleted:');
    violations.markdownFiles.forEach(file => console.log(`   - ${file}`));
    console.log('\n✅ REQUIRED ACTION:');
    console.log('   1. Delete markdown files listed above');
    console.log('   2. Ensure test plans exist in leo_test_plans table');
    console.log('   3. Use scripts/create-test-plan-*.js to create test plans');
    console.log('\n📚 Reference: docs/reference/database-first-enforcement-expanded.md');
    process.exit(1);
  }

  if (violations.missingFromDatabase.length > 0) {
    console.log('\n⚠️  Some PRDs missing test plans (not blocking, but recommended)');
    console.log('   Create test plans using: node scripts/create-test-plan-*.js');
  }

  if (violations.markdownFiles.length === 0 && violations.missingFromDatabase.length === 0) {
    console.log('\n✅ All validations passed - Database-first enforcement compliant!');
  }

  console.log('================================================================');
}

validateTestPlans();
