#!/usr/bin/env node

/**
 * Test Script for plan_presentation Validation
 * SD-PLAN-PRESENT-001 - Test Scenarios TS1, TS2, TS3
 */

import PlanToExecVerifier from './verify-handoff-plan-to-exec.js';

const verifier = new PlanToExecVerifier();

console.log('🧪 Testing plan_presentation Validation\n');
console.log('='.repeat(60));

// TS1: Valid Plan Presentation (PASS)
console.log('\n📋 TS1: Valid Plan Presentation (PASS)');
console.log('-'.repeat(60));

const validMetadata = {
  plan_presentation: {
    goal_summary: 'Add plan_presentation template to leo_handoff_templates table with JSONB validation structure',
    file_scope: {
      create: [],
      modify: ['scripts/verify-handoff-plan-to-exec.js'],
      delete: []
    },
    execution_plan: [
      {
        step: 1,
        action: 'Add validatePlanPresentation() method to PlanToExecVerifier class',
        files: ['scripts/verify-handoff-plan-to-exec.js']
      },
      {
        step: 2,
        action: 'Integrate validation into verifyHandoff() method',
        files: ['scripts/verify-handoff-plan-to-exec.js']
      }
    ],
    dependency_impacts: {
      npm_packages: [],
      internal_modules: ['handoff-validator.js'],
      database_changes: 'None (reads from leo_handoff_templates)'
    },
    testing_strategy: {
      unit_tests: 'Test validatePlanPresentation() with valid, missing, and invalid structures',
      e2e_tests: 'Create PLAN→EXEC handoff and verify validation enforcement',
      verification_steps: [
        'Run test script with 3 scenarios',
        'Verify validation passes for complete plan_presentation',
        'Verify validation fails with clear errors for incomplete/invalid structures'
      ]
    }
  }
};

const ts1Result = verifier.validatePlanPresentation(validMetadata);
console.log('Result:', ts1Result.valid ? '✅ PASS' : '❌ FAIL');
console.log('Errors:', ts1Result.errors.length === 0 ? 'None' : ts1Result.errors);

// TS2: Missing Required Fields (FAIL)
console.log('\n📋 TS2: Missing Required Fields (FAIL)');
console.log('-'.repeat(60));

const missingFieldsMetadata = {
  plan_presentation: {
    // Missing goal_summary
    file_scope: {
      modify: ['scripts/verify-handoff-plan-to-exec.js']
    },
    execution_plan: [
      { step: 1, action: 'Add validation', files: ['verify-handoff-plan-to-exec.js'] }
    ]
    // Missing testing_strategy
  }
};

const ts2Result = verifier.validatePlanPresentation(missingFieldsMetadata);
console.log('Result:', ts2Result.valid ? '✅ PASS (Unexpected!)' : '❌ FAIL (Expected)');
console.log('Errors:');
ts2Result.errors.forEach(err => console.log(`  • ${err}`));

// TS3: Invalid Structure (FAIL)
console.log('\n📋 TS3: Invalid Structure (FAIL)');
console.log('-'.repeat(60));

const invalidStructureMetadata = {
  plan_presentation: {
    goal_summary: 'Test invalid structure',
    file_scope: {
      // No files in any category
    },
    execution_plan: 'This should be an array, not a string', // Invalid type
    testing_strategy: {
      unit_tests: 'Test validation'
      // Missing e2e_tests
    }
  }
};

const ts3Result = verifier.validatePlanPresentation(invalidStructureMetadata);
console.log('Result:', ts3Result.valid ? '✅ PASS (Unexpected!)' : '❌ FAIL (Expected)');
console.log('Errors:');
ts3Result.errors.forEach(err => console.log(`  • ${err}`));

// TS4: Missing plan_presentation entirely (FAIL)
console.log('\n📋 TS4: Missing plan_presentation entirely (FAIL)');
console.log('-'.repeat(60));

const missingPlanPresentation = {
  // No plan_presentation field
  other_metadata: 'some value'
};

const ts4Result = verifier.validatePlanPresentation(missingPlanPresentation);
console.log('Result:', ts4Result.valid ? '✅ PASS (Unexpected!)' : '❌ FAIL (Expected)');
console.log('Errors:');
ts4Result.errors.forEach(err => console.log(`  • ${err}`));

// TS5: goal_summary exceeds 300 characters (FAIL)
console.log('\n📋 TS5: goal_summary exceeds 300 characters (FAIL)');
console.log('-'.repeat(60));

const longGoalSummary = {
  plan_presentation: {
    goal_summary: 'A'.repeat(350), // 350 characters
    file_scope: {
      modify: ['test.js']
    },
    execution_plan: [
      { step: 1, action: 'Test', files: ['test.js'] }
    ],
    testing_strategy: {
      unit_tests: 'Test',
      e2e_tests: 'Test'
    }
  }
};

const ts5Result = verifier.validatePlanPresentation(longGoalSummary);
console.log('Result:', ts5Result.valid ? '✅ PASS (Unexpected!)' : '❌ FAIL (Expected)');
console.log('Errors:');
ts5Result.errors.forEach(err => console.log(`  • ${err}`));

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));

const results = [
  { name: 'TS1: Valid Plan Presentation', expected: true, actual: ts1Result.valid },
  { name: 'TS2: Missing Required Fields', expected: false, actual: ts2Result.valid },
  { name: 'TS3: Invalid Structure', expected: false, actual: ts3Result.valid },
  { name: 'TS4: Missing plan_presentation', expected: false, actual: ts4Result.valid },
  { name: 'TS5: goal_summary too long', expected: false, actual: ts5Result.valid }
];

let passed = 0;
let failed = 0;

results.forEach(result => {
  const testPassed = result.expected === result.actual;
  if (testPassed) passed++;
  else failed++;

  console.log(`${testPassed ? '✅' : '❌'} ${result.name}`);
  console.log(`   Expected: ${result.expected ? 'PASS' : 'FAIL'}, Actual: ${result.actual ? 'PASS' : 'FAIL'}`);
});

console.log('\n' + '='.repeat(60));
console.log(`Total: ${passed}/${results.length} tests passed`);
console.log('='.repeat(60));

if (failed === 0) {
  console.log('\n✅ ALL TESTS PASSED - plan_presentation validation working correctly!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} TEST(S) FAILED - Review validation logic`);
  process.exit(1);
}
