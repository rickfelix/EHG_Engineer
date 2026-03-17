#!/usr/bin/env node

/**
 * Test Status Validation and Enforcement
 */

import StatusValidator from '../lib/dashboard/status-validator';

console.log('🧪 Testing Status Validation and Enforcement\n');

const validator = new StatusValidator();

// Test 1: Valid preferred status
console.log('Test 1: Valid preferred status');
let result = validator.validateStatusUpdate('SD', 'draft', 'active', 'LEAD');
console.log(`  SD draft → active (LEAD): ${result.valid ? '✅' : '❌'} ${result.error || ''}`);

// Test 2: Deprecated status gets normalized
console.log('\nTest 2: Deprecated status normalization');
result = validator.validateStatusUpdate('SD', 'active', 'completed', 'LEAD');
console.log(`  SD active → completed (LEAD): ${result.valid ? '✅' : '❌'}`);
console.log(`  Normalized to: ${result.normalizedStatus}`);
console.log(`  Warning: ${result.warning || 'none'}`);

// Test 3: Invalid transition
console.log('\nTest 3: Invalid transition');
result = validator.validateStatusUpdate('PRD', 'draft', 'approved', 'PLAN');
console.log(`  PRD draft → approved (PLAN): ${result.valid ? '✅' : '❌'}`);
console.log(`  Error: ${result.error}`);
console.log(`  Allowed: ${result.allowedTransitions?.join(', ')}`);

// Test 4: Agent permission check
console.log('\nTest 4: Agent permissions');
result = validator.validateStatusUpdate('SD', 'draft', 'active', 'EXEC');
console.log(`  SD draft → active (EXEC): ${result.valid ? '✅' : '❌'}`);
console.log(`  Error: ${result.error}`);

// Test 5: EES status (all preferred)
console.log('\nTest 5: EES statuses');
result = validator.validateStatusUpdate('EES', 'pending', 'in_progress', 'EXEC');
console.log(`  EES pending → in_progress (EXEC): ${result.valid ? '✅' : '❌'}`);

// Test 6: Get recommendations
console.log('\nTest 6: Status recommendations');
console.log('  SD scenarios:');
console.log(`    created: ${validator.getRecommendedStatus('SD', 'created')}`);
console.log(`    working: ${validator.getRecommendedStatus('SD', 'working')}`);
console.log(`    done: ${validator.getRecommendedStatus('SD', 'done')}`);

console.log('  PRD scenarios:');
console.log(`    ready_for_exec: ${validator.getRecommendedStatus('PRD', 'ready_for_exec')}`);
console.log(`    accepted: ${validator.getRecommendedStatus('PRD', 'accepted')}`);

// Test 7: Generate status report
console.log('\nTest 7: Status report generation');
const testDocs = [
  { id: 'SD-001', type: 'SD', status: 'active' },
  { id: 'SD-002', type: 'SD', status: 'completed' }, // deprecated
  { id: 'PRD-001', type: 'PRD', status: 'approved' },
  { id: 'PRD-002', type: 'PRD', status: 'complete' }, // deprecated
  { id: 'EES-001', type: 'EES', status: 'completed' }
];

const report = validator.generateStatusReport(testDocs);
console.log('  Status Report:');
console.log(`    Total: ${report.summary.total}`);
console.log(`    Using Preferred: ${report.summary.usingPreferred}`);
console.log(`    Using Deprecated: ${report.summary.usingDeprecated}`);
console.log(`    Recommendations: ${report.recommendations.join('; ')}`);

console.log('\n✅ All validation tests completed!');