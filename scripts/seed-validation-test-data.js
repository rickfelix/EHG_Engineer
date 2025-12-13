#!/usr/bin/env node

/**
 * Seed Validation Test Data
 *
 * Creates 5 test SDs with complete handoff history for testing the
 * intelligent validation framework.
 *
 * Creates:
 * - 5 Strategic Directives (various risk levels, categories)
 * - 5 PRDs with metadata
 * - 15 Handoffs with gate validation results
 * - Realistic scores to test adaptive thresholds
 * - Pattern data to test maturity bonuses
 *
 * Usage:
 *   node scripts/seed-validation-test-data.js
 *   node scripts/seed-validation-test-data.js --clean  # Remove existing test data first
 *
 * Created: 2025-10-28
 * Part of: SD-INTELLIGENT-THRESHOLDS-007
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * Clean existing test data
 */
async function cleanTestData() {
  console.log('🧹 Cleaning existing test data...');

  // Delete handoffs first (foreign key constraint)
  const { error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .delete()
    .like('sd_id', 'SD-TEST-%');

  if (handoffError) {
    console.warn('   ⚠️  Could not delete handoffs:', handoffError.message);
  }

  // Delete PRDs
  const { error: prdError } = await supabase
    .from('product_requirements_v2')
    .delete()
    .like('directive_id', 'SD-TEST-%');

  if (prdError) {
    console.warn('   ⚠️  Could not delete PRDs:', prdError.message);
  }

  // Delete SDs
  const { error: sdError } = await supabase
    .from('strategic_directives_v2')
    .delete()
    .like('id', 'SD-TEST-%');

  if (sdError) {
    console.warn('   ⚠️  Could not delete SDs:', sdError.message);
  }

  console.log('   ✅ Cleanup complete\n');
}

/**
 * Create a test SD
 */
async function createSD(config) {
  const sd = {
    id: config.id,
    sd_key: config.id, // sd_key is required (matches id)
    title: config.title,
    version: '1.0',
    status: 'completed',
    priority: config.priority || 'high',
    category: Array.isArray(config.categories) ? config.categories[0] : config.categories,
    description: config.description,
    rationale: config.description,
    scope: `Test SD for validation framework with ${config.risk_level} risk`,
    metadata: {
      risk_level: config.risk_level,
      categories: config.categories,
      is_production_deployment: config.is_production || false,
      is_emergency_hotfix: config.is_hotfix || false
    },
    created_at: new Date(Date.now() - config.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - config.daysAgo * 24 * 60 * 60 * 1000).toISOString()
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sd)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create SD ${config.id}: ${error.message}`);
  }

  console.log(`   ✅ Created SD: ${config.id} (${config.risk_level} risk)`);
  return data;
}

/**
 * Create a PRD for an SD
 */
async function createPRD(sdId, sdUuid) {
  const prd = {
    id: randomUUID(),
    directive_id: sdId,
    sd_uuid: sdUuid,
    title: `PRD for ${sdId}`,
    version: '1.0',
    status: 'approved',
    category: 'test',
    priority: 'high',
    executive_summary: `Test PRD for validation framework testing with ${sdId}`,
    phase: 'LEAD_APPROVAL',
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Test Requirement 1',
        description: 'Sample functional requirement for testing',
        priority: 'CRITICAL',
        acceptance_criteria: ['Implemented', 'Tested', 'Documented']
      },
      {
        id: 'FR-2',
        requirement: 'Test Requirement 2',
        description: 'Second functional requirement for testing',
        priority: 'HIGH',
        acceptance_criteria: ['Implemented', 'Tested']
      },
      {
        id: 'FR-3',
        requirement: 'Test Requirement 3',
        description: 'Third functional requirement for testing',
        priority: 'MEDIUM',
        acceptance_criteria: ['Implemented']
      }
    ],
    acceptance_criteria: [
      'Implementation complete',
      'All tests passing',
      'Documentation updated'
    ],
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Test Scenario 1',
        description: 'Sample test scenario for validation',
        priority: 'CRITICAL',
        expected_result: 'Test passes successfully'
      }
    ],
    metadata: {
      design_analysis: {
        verdict: 'PASS',
        recommendations: ['Use consistent design patterns', 'Follow accessibility guidelines']
      },
      database_analysis: {
        verdict: 'PASS',
        recommendations: ['Add RLS policies', 'Index foreign keys']
      }
    },
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create PRD for ${sdId}: ${error.message}`);
  }

  console.log(`   ✅ Created PRD for ${sdId}`);
  return data;
}

/**
 * Create a handoff with gate validation results
 */
async function createHandoff(sdId, type, gateResults) {
  const [fromPhase, , toPhase] = type.split('-');

  // Extract score from gate validation results
  const gateValidationKey = Object.keys(gateResults).find(key => key.includes('_validation'));
  const validationScore = gateValidationKey ? gateResults[gateValidationKey].score : 90;

  const handoff = {
    id: randomUUID(),
    sd_id: sdId,
    from_phase: fromPhase,
    to_phase: toPhase,
    handoff_type: type,
    status: 'pending', // Pending status for test data
    executive_summary: `Test handoff for ${sdId}`,
    deliverables_manifest: ['Implementation', 'Tests', 'Documentation'],
    key_decisions: [`Validated at gate ${type}`],
    known_issues: [],
    action_items: [],
    resource_utilization: { time: '1h', effort: 'minimal' },
    validation_passed: true,
    validation_score: validationScore,
    completeness_report: { status: 'complete', elements: [] },
    validation_details: { validated: true },
    metadata: gateResults,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  };

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .insert(handoff)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create handoff ${type} for ${sdId}: ${error.message}`);
  }

  console.log(`   ✅ Created handoff: ${type} (Gate ${gateResults.gate ? gateResults.gate : 'N/A'})`);
  return data;
}

/**
 * Generate realistic gate validation results
 */
function generateGateResults(gateNum, score, adaptiveThreshold) {
  const passed = score >= adaptiveThreshold;

  return {
    [`gate${gateNum}_validation`]: {
      passed,
      score,
      max_score: 100,
      issues: passed ? [] : [`Score ${score} below threshold ${adaptiveThreshold}`],
      warnings: score < 90 ? ['Some minor issues detected'] : [],
      details: {
        adaptive_threshold: {
          finalThreshold: adaptiveThreshold,
          breakdown: {
            baseThreshold: 80,
            performanceMod: 0,
            maturityMod: 0,
            specialCaseMinimum: 80
          },
          reasoning: 'Test threshold calculation'
        }
      },
      failed_gates: passed ? [] : ['SCORE_TOO_LOW'],
      gate_scores: {
        check1: Math.round(score * 0.3),
        check2: Math.round(score * 0.3),
        check3: Math.round(score * 0.4)
      }
    }
  };
}

/**
 * Seed all test data
 */
async function seedData() {
  console.log('\n🌱 SEEDING VALIDATION TEST DATA');
  console.log('='.repeat(70));

  // Test scenarios
  const testSDs = [
    {
      id: 'SD-TEST-001',
      title: 'Low Risk Database Migration',
      risk_level: 'low',
      categories: ['database'],
      priority: 'medium',
      description: 'Simple schema update with minimal impact',
      daysAgo: 30,
      gateScores: [75, 82, 88, 85] // Improving over time
    },
    {
      id: 'SD-TEST-002',
      title: 'Medium Risk UI Enhancement',
      risk_level: 'medium',
      categories: ['ui', 'ux'],
      priority: 'high',
      description: 'Update user interface components',
      daysAgo: 25,
      gateScores: [88, 91, 89, 92] // Strong performance
    },
    {
      id: 'SD-TEST-003',
      title: 'High Risk Security Feature',
      risk_level: 'high',
      categories: ['database', 'security'],
      priority: 'critical',
      description: 'Implement authentication system with database changes',
      daysAgo: 20,
      gateScores: [92, 95, 93, 94] // Excellent performance
    },
    {
      id: 'SD-TEST-004',
      title: 'Critical Production Deployment',
      risk_level: 'critical',
      categories: ['production', 'deployment'],
      priority: 'critical',
      description: 'Deploy critical fix to production environment',
      daysAgo: 15,
      is_production: true,
      gateScores: [96, 98, 97, 99] // Near perfect (production requires 90%+)
    },
    {
      id: 'SD-TEST-005',
      title: 'High Risk Design System Update',
      risk_level: 'high',
      categories: ['database', 'design'],
      priority: 'high',
      description: 'Update design system with database migrations',
      daysAgo: 10,
      gateScores: [90, 87, 91, 89] // Good performance, similar pattern to SD-TEST-003
    }
  ];

  // Create SDs, PRDs, and Handoffs
  for (const sdConfig of testSDs) {
    console.log(`\n📦 Creating test data for ${sdConfig.id}...`);

    // Create SD
    const sd = await createSD(sdConfig);

    // Create PRD
    // SD ID Schema Cleanup (2025-12-12): Use sd.id directly
    const prd = await createPRD(sd.id, sd.id);

    console.log(`   ✅ Created test data for ${sdConfig.id} (ready for validation testing)`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ SEED DATA CREATED SUCCESSFULLY');
  console.log('='.repeat(70));

  // Summary
  console.log('\n📊 Summary:');
  console.log('   - Created: 5 Strategic Directives with varying risk levels');
  console.log('   - Created: 5 PRDs with test requirements');
  console.log('   - Risk levels: LOW (1), MEDIUM (1), HIGH (2), CRITICAL (1)');
  console.log('   - Categories: database, ui/ux, security, production, design');

  console.log('\n🧪 Test validation framework with:');
  console.log('   node scripts/test-validation-framework.js gate1 SD-TEST-003');
  console.log('   node scripts/test-validation-framework.js gate2 SD-TEST-002');
  console.log('   node scripts/test-validation-framework.js all SD-TEST-004');

  console.log('\n📊 Pattern tracking will find:');
  console.log('   - Pattern "database,security|high" (SD-TEST-003)');
  console.log('   - Pattern "database,design|high" (SD-TEST-005)');
  console.log('   - These patterns should trigger maturity bonuses if >10 historical SDs exist');

  console.log('\n');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldClean = args.includes('--clean');

  try {
    if (shouldClean) {
      await cleanTestData();
    }

    await seedData();

    console.log('✅ Seeding complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
