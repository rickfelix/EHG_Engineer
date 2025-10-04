#!/usr/bin/env node

/**
 * Test Coverage Policy Verification
 *
 * Tests the LOC-based test coverage policy enforcement per SD-QUALITY-002
 */

import { getCoverageRequirement, validateCoverage, getPolicySummary } from '../lib/test-coverage-policy.js';
import fs from 'fs/promises';

console.log('🧪 TEST COVERAGE POLICY VERIFICATION');
console.log('═'.repeat(70));
console.log('');

// Display policy summary
console.log('📊 Current Policy Tiers:');
console.log('-'.repeat(70));

const policies = await getPolicySummary();
policies.forEach((p, i) => {
  console.log(`${i + 1}. ${p.tier_name}`);
  console.log(`   LOC Range: ${p.loc_min}-${p.loc_max}`);
  console.log(`   Requirement: ${p.requirement_level}`);
  console.log(`   ${p.description}`);
  console.log('');
});

// Create test files with different LOC counts
console.log('🔍 Testing Policy Enforcement:');
console.log('-'.repeat(70));
console.log('');

const testFiles = [
  { path: '/tmp/test-minimal.js', loc: 15, name: 'Minimal File (15 LOC)' },
  { path: '/tmp/test-standard.js', loc: 35, name: 'Standard File (35 LOC)' },
  { path: '/tmp/test-complex.js', loc: 75, name: 'Complex File (75 LOC)' }
];

// Create test files
for (const test of testFiles) {
  const lines = Array.from({ length: test.loc }, (_, i) => `console.log('Line ${i + 1}');`);
  await fs.writeFile(test.path, lines.join('\n'));
}

// Test each file
for (const test of testFiles) {
  const req = await getCoverageRequirement(test.path);

  console.log(`📄 ${test.name}`);
  console.log(`   Tier: ${req.tier}`);
  console.log(`   Requirement Level: ${req.level}`);
  console.log(`   LOC Detected: ${req.loc}`);

  // Test with different coverage levels
  const coverageLevels = [30, 60, 90];
  console.log('   Coverage Validation:');

  for (const coverage of coverageLevels) {
    const validation = await validateCoverage(test.path, coverage);
    const icon = validation.passes ? '✅' : '❌';
    console.log(`      ${icon} ${coverage}% coverage: ${validation.passes ? 'PASS' : 'FAIL'} (min: ${validation.minRequired}%)`);
  }

  console.log('');
}

// Clean up test files
for (const test of testFiles) {
  await fs.unlink(test.path);
}

console.log('═'.repeat(70));
console.log('✅ TEST COMPLETE');
console.log('');
console.log('📋 Summary:');
console.log('   - Tier 1 (0-19 LOC): OPTIONAL (no minimum)');
console.log('   - Tier 2 (20-50 LOC): RECOMMENDED (50% minimum)');
console.log('   - Tier 3 (51+ LOC): REQUIRED (80% minimum)');
console.log('');
console.log('📚 Usage:');
console.log('   import { getCoverageRequirement } from "./lib/test-coverage-policy.js";');
console.log('   const req = await getCoverageRequirement(filePath);');
console.log('   console.log(req.level); // "OPTIONAL" | "RECOMMENDED" | "REQUIRED"');
