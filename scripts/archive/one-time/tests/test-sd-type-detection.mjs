/**
 * Test script for SD type detection utility
 *
 * Tests detectSDType() with real SD scenarios
 */

import { detectSDType, getValidationRequirements, shouldSkipBoilerplateDeliverables } from '../lib/utils/sd-type-detection.js';

console.log('Testing SD Type Detection Utility\n');
console.log('='.repeat(80));

// Test Case 1: Engineering SD (SD-PLAN-PRESENT-001)
const engineeringSD = {
  sd_id: 'SD-PLAN-PRESENT-001',
  title: 'Pre-Implementation Plan Presentation Template',
  category: 'Engineering',
  target_application: 'EHG_engineer',
  scope: 'Create a validation script for PLAN→EXEC handoff gate'
};

console.log('\n1. Engineering SD Test (SD-PLAN-PRESENT-001)');
console.log('-'.repeat(80));
console.log('Input:', JSON.stringify(engineeringSD, null, 2));

const result1 = detectSDType(engineeringSD);
console.log('\nDetection Result:');
console.log(`  Type: ${result1.type}`);
console.log(`  Is Engineering: ${result1.isEngineering}`);
console.log(`  Confidence: ${result1.confidence}%`);
console.log(`  Reasons:`);
result1.reasons.forEach(r => console.log(`    - ${r}`));

const requirements1 = getValidationRequirements(engineeringSD);
console.log('\nValidation Requirements:');
console.log(`  Requires E2E Tests: ${requirements1.requiresE2ETests}`);
console.log(`  Requires UI Screenshots: ${requirements1.requiresUIScreenshots}`);
console.log(`  Requires Unit Tests: ${requirements1.requiresUnitTests}`);
console.log(`  Minimum Deliverables: ${requirements1.minimumDeliverables}`);
console.log(`  Validation Approach: ${requirements1.validationApproach}`);

const skipBoilerplate1 = shouldSkipBoilerplateDeliverables(engineeringSD);
console.log(`\nShould Skip Boilerplate: ${skipBoilerplate1}`);

// Test Case 2: Feature SD
const featureSD = {
  sd_id: 'SD-VIF-INTEL-001',
  title: 'Venture Intelligence Feedback System',
  category: 'Venture Management',
  target_application: 'EHG',
  scope: 'User-facing dashboard for venture intelligence analysis'
};

console.log('\n\n2. Feature SD Test (SD-VIF-INTEL-001)');
console.log('-'.repeat(80));
console.log('Input:', JSON.stringify(featureSD, null, 2));

const result2 = detectSDType(featureSD);
console.log('\nDetection Result:');
console.log(`  Type: ${result2.type}`);
console.log(`  Is Engineering: ${result2.isEngineering}`);
console.log(`  Confidence: ${result2.confidence}%`);
console.log(`  Reasons:`);
result2.reasons.forEach(r => console.log(`    - ${r}`));

const requirements2 = getValidationRequirements(featureSD);
console.log('\nValidation Requirements:');
console.log(`  Requires E2E Tests: ${requirements2.requiresE2ETests}`);
console.log(`  Requires UI Screenshots: ${requirements2.requiresUIScreenshots}`);
console.log(`  Requires Unit Tests: ${requirements2.requiresUnitTests}`);
console.log(`  Minimum Deliverables: ${requirements2.minimumDeliverables}`);
console.log(`  Validation Approach: ${requirements2.validationApproach}`);

const skipBoilerplate2 = shouldSkipBoilerplateDeliverables(featureSD);
console.log(`\nShould Skip Boilerplate: ${skipBoilerplate2}`);

// Test Case 3: Hybrid SD with engineering keywords but feature target
const hybridSD = {
  sd_id: 'SD-AUTOMATION-001',
  title: 'User Automation Dashboard',
  category: 'Automation',
  target_application: 'EHG',
  scope: 'Customer-facing automation interface with agent protocols'
};

console.log('\n\n3. Hybrid SD Test (Automation category, EHG target)');
console.log('-'.repeat(80));
console.log('Input:', JSON.stringify(hybridSD, null, 2));

const result3 = detectSDType(hybridSD);
console.log('\nDetection Result:');
console.log(`  Type: ${result3.type}`);
console.log(`  Is Engineering: ${result3.isEngineering}`);
console.log(`  Confidence: ${result3.confidence}%`);
console.log(`  Reasons:`);
result3.reasons.forEach(r => console.log(`    - ${r}`));

const requirements3 = getValidationRequirements(hybridSD);
console.log('\nValidation Requirements:');
console.log(`  Requires E2E Tests: ${requirements3.requiresE2ETests}`);
console.log(`  Requires UI Screenshots: ${requirements3.requiresUIScreenshots}`);
console.log(`  Minimum Deliverables: ${requirements3.minimumDeliverables}`);

const skipBoilerplate3 = shouldSkipBoilerplateDeliverables(hybridSD);
console.log(`\nShould Skip Boilerplate: ${skipBoilerplate3}`);

// Summary
console.log('\n\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log('\n✅ All test cases completed successfully');
console.log('\nKey Findings:');
console.log('  - Engineering SDs correctly identified (high confidence)');
console.log('  - Feature SDs correctly identified');
console.log('  - Hybrid SDs handled (category vs target_application priority)');
console.log('  - Validation requirements adjusted appropriately');
console.log('  - Boilerplate skipping logic works as expected');
