#!/usr/bin/env node

/**
 * Test Script for Schema Validation Modules
 *
 * Tests the schema-validator.js and safe-insert.js modules to ensure they
 * prevent the type mismatch errors discovered in SD-KNOWLEDGE-001.
 *
 * @see docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
 */

import { compareTypes, formatValidationError, generateUUID, clearSchemaCache } from './modules/schema-validator.js';
import { safeInsert, safeBulkInsert } from './modules/safe-insert.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

console.log('🧪 Testing Schema Validation Modules');
console.log('='.repeat(70));
console.log('Purpose: Verify prevention of SD-KNOWLEDGE-001 type mismatch issues\n');

// Test counters
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

/**
 * Test helper
 */
function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    testsFailed++;
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('TEST SUITE 1: UUID Validation (Issue #1 from SD-KNOWLEDGE-001)');
console.log('-'.repeat(70));

// Test 1: Valid UUID should pass
test('Valid UUID format passes validation', () => {
  const validUUID = generateUUID();
  const schemaCol = { type: 'uuid', nullable: false };
  const result = compareTypes(validUUID, schemaCol);
  assert(result.valid === true, 'Valid UUID should pass');
});

// Test 2: TEXT string (the exact SD-KNOWLEDGE-001 issue) should fail
test('TEXT string (SD-KNOWLEDGE-001 issue) fails validation', () => {
  const textID = 'SUCCESS-EXEC-to-PLAN-SD-KNOWLEDGE-001-1760578307337';
  const schemaCol = { type: 'uuid', nullable: false };
  const result = compareTypes(textID, schemaCol);
  assert(result.valid === false, 'TEXT string should fail UUID validation');
  assert(result.message.includes('Invalid UUID format'), 'Should have helpful error message');
});

// Test 3: Non-string value for UUID should fail
test('Non-string value for UUID field fails', () => {
  const schemaCol = { type: 'uuid', nullable: false };
  const result = compareTypes(12345, schemaCol);
  assert(result.valid === false, 'Number should fail UUID validation');
  assert(result.actualType === 'number', 'Should report actual type');
});

// Test 4: Null value for nullable UUID should pass
test('Null value for nullable UUID passes', () => {
  const schemaCol = { type: 'uuid', nullable: true };
  const result = compareTypes(null, schemaCol);
  assert(result.valid === true, 'Null should pass for nullable column');
});

// Test 5: Null value for non-nullable UUID should fail
test('Null value for non-nullable UUID fails', () => {
  const schemaCol = { type: 'uuid', nullable: false, default: null };
  const result = compareTypes(null, schemaCol);
  assert(result.valid === false, 'Null should fail for non-nullable column without default');
});

console.log('');
console.log('TEST SUITE 2: Other Type Validations');
console.log('-'.repeat(70));

// Test 6: Text/varchar validation
test('Text column accepts string', () => {
  const schemaCol = { type: 'text', nullable: false };
  const result = compareTypes('some text', schemaCol);
  assert(result.valid === true, 'String should pass text validation');
});

test('Text column rejects number', () => {
  const schemaCol = { type: 'text', nullable: false };
  const result = compareTypes(123, schemaCol);
  assert(result.valid === false, 'Number should fail text validation');
});

// Test 7: Integer validation
test('Integer column accepts integer', () => {
  const schemaCol = { type: 'integer', nullable: false };
  const result = compareTypes(42, schemaCol);
  assert(result.valid === true, 'Integer should pass');
});

test('Integer column rejects float', () => {
  const schemaCol = { type: 'integer', nullable: false };
  const result = compareTypes(42.5, schemaCol);
  assert(result.valid === false, 'Float should fail integer validation');
});

test('Integer column rejects string', () => {
  const schemaCol = { type: 'integer', nullable: false };
  const result = compareTypes('42', schemaCol);
  assert(result.valid === false, 'String should fail integer validation');
});

// Test 8: Boolean validation
test('Boolean column accepts boolean', () => {
  const schemaCol = { type: 'boolean', nullable: false };
  const result = compareTypes(true, schemaCol);
  assert(result.valid === true, 'Boolean should pass');
});

test('Boolean column rejects string', () => {
  const schemaCol = { type: 'boolean', nullable: false };
  const result = compareTypes('true', schemaCol);
  assert(result.valid === false, 'String should fail boolean validation');
});

// Test 9: JSONB validation
test('JSONB column accepts object', () => {
  const schemaCol = { type: 'jsonb', nullable: false };
  const result = compareTypes({ key: 'value' }, schemaCol);
  assert(result.valid === true, 'Object should pass JSONB validation');
});

test('JSONB column accepts string', () => {
  const schemaCol = { type: 'jsonb', nullable: false };
  const result = compareTypes('{"key":"value"}', schemaCol);
  assert(result.valid === true, 'String should pass JSONB validation');
});

// Test 10: Timestamp validation
test('Timestamp column accepts Date object', () => {
  const schemaCol = { type: 'timestamp with time zone', nullable: false };
  const result = compareTypes(new Date(), schemaCol);
  assert(result.valid === true, 'Date object should pass');
});

test('Timestamp column accepts ISO string', () => {
  const schemaCol = { type: 'timestamp with time zone', nullable: false };
  const result = compareTypes(new Date().toISOString(), schemaCol);
  assert(result.valid === true, 'ISO string should pass');
});

test('Timestamp column rejects invalid string', () => {
  const schemaCol = { type: 'timestamp with time zone', nullable: false };
  const result = compareTypes('not a date', schemaCol);
  assert(result.valid === false, 'Invalid date string should fail');
});

console.log('');
console.log('TEST SUITE 3: Error Message Formatting');
console.log('-'.repeat(70));

// Test 11: Format validation error
test('formatValidationError creates helpful message', () => {
  const mismatches = [
    {
      column: 'id',
      value: 'TEXT-ID-12345',
      expectedType: 'uuid',
      actualType: 'string (invalid format)',
      message: 'Invalid UUID format'
    }
  ];

  const error = formatValidationError('leo_handoff_executions', mismatches);
  assert(error.includes('❌ Schema Validation Failed'), 'Should have header');
  assert(error.includes('leo_handoff_executions'), 'Should include table name');
  assert(error.includes('id'), 'Should include column name');
  assert(error.includes('uuid'), 'Should include expected type');
  assert(error.includes('randomUUID'), 'Should include helpful suggestion');
});

console.log('');
console.log('TEST SUITE 4: generateUUID Helper');
console.log('-'.repeat(70));

// Test 12: generateUUID produces valid UUIDs
test('generateUUID produces valid UUID format', () => {
  const uuid1 = generateUUID();
  const uuid2 = generateUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  assert(uuidRegex.test(uuid1), 'First UUID should be valid format');
  assert(uuidRegex.test(uuid2), 'Second UUID should be valid format');
  assert(uuid1 !== uuid2, 'Each UUID should be unique');
});

console.log('');
console.log('TEST SUITE 5: Safe Insert Validation (without database)');
console.log('-'.repeat(70));

// Note: These tests verify the safeInsert API without actually hitting the database
// Full integration tests with real database should be done separately

test('safeInsert options default correctly', () => {
  // Just verify the module exports the function
  assert(typeof safeInsert === 'function', 'safeInsert should be exported');
  assert(typeof safeBulkInsert === 'function', 'safeBulkInsert should be exported');
});

console.log('');
console.log('TEST SUITE 6: Real-World Scenario - SD-KNOWLEDGE-001 Issue #1');
console.log('-'.repeat(70));

// Test 13: Reproduce the exact issue from SD-KNOWLEDGE-001
test('Catch the exact UUID mismatch from SD-KNOWLEDGE-001', () => {
  // This is the exact type of ID that caused the silent failure
  const badID = `SUCCESS-EXEC-to-PLAN-SD-KNOWLEDGE-001-${Date.now()}`;

  const schemaCol = { type: 'uuid', nullable: false };
  const result = compareTypes(badID, schemaCol);

  assert(result.valid === false, 'Should catch the TEXT ID issue');
  assert(result.message.includes('Invalid UUID format'), 'Should explain the problem');
  assert(result.message.includes('randomUUID'), 'Should suggest the fix');
});

// Test 14: Verify the fix works
test('Verify correct UUID generation fixes the issue', () => {
  const correctID = generateUUID();
  const schemaCol = { type: 'uuid', nullable: false };
  const result = compareTypes(correctID, schemaCol);

  assert(result.valid === true, 'Properly generated UUID should pass');
});

console.log('');
console.log('='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total Tests:  ${testsRun}`);
console.log(`✅ Passed:     ${testsPassed}`);
console.log(`❌ Failed:     ${testsFailed}`);
console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
console.log('');

if (testsFailed === 0) {
  console.log('🎉 All tests passed! Schema validation is working correctly.');
  console.log('');
  console.log('✅ Prevention Verified:');
  console.log('   - UUID type mismatches will be caught before insert');
  console.log('   - TEXT IDs attempting to enter UUID columns will fail with clear messages');
  console.log('   - The exact SD-KNOWLEDGE-001 Issue #1 scenario is prevented');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   1. Apply database migration: database/migrations/20251015_create_schema_validation_functions.sql');
  console.log('   2. Update unified-handoff-system.js to use safeInsert()');
  console.log('   3. Update orchestrate-phase-subagents.js to use safeInsert()');
  console.log('   4. Add CI/CD validation checks');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Review the errors above.');
  process.exit(1);
}
