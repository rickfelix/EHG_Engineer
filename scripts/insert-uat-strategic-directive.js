#!/usr/bin/env node

/**
 * Insert UAT Strategic Directive into Database
 * SD-UAT-2025-001: Critical UAT Test Suite Remediation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function insertUATStrategicDirective() {
  console.log('📋 Inserting Strategic Directive SD-UAT-2025-001 into database...');
  console.log('================================================================');

  try {
    // Read the Strategic Directive JSON file
    const sdFilePath = path.join(process.cwd(), 'test-results/strategic-directive-uat-2025-001.json');
    const sdData = JSON.parse(fs.readFileSync(sdFilePath, 'utf-8'));

    // Format for database insertion
    const strategicDirective = {
      id: sdData.id,
      title: sdData.title,
      version: '1.0',
      status: sdData.status,
      category: sdData.category,
      priority: sdData.priority.toLowerCase(), // Convert CRITICAL to critical
      description: sdData.description,
      strategic_intent: sdData.business_impact,
      rationale: `UAT test suite has failed with only ${sdData.metadata.test_results.pass_rate}% pass rate. ${sdData.metadata.test_results.failed} out of ${sdData.metadata.test_results.total_tests} tests failed, indicating the application is not ready for production deployment.`,
      scope: sdData.technical_scope,

      // JSONB columns
      strategic_objectives: [
        'Achieve >85% UAT test pass rate to meet quality gates',
        'Fix all authentication-related test failures',
        'Resolve UI component visibility issues',
        'Standardize port configuration (8080 vs 8082)',
        'Ensure cross-browser compatibility'
      ],

      success_criteria: sdData.acceptance_criteria,

      key_changes: sdData.recommended_actions,

      key_principles: [
        'Fix critical authentication issues first',
        'Ensure consistent port configuration',
        'Test across all supported browsers',
        'Document all fixes for audit trail',
        'Re-run full UAT suite after each fix batch'
      ],

      metadata: {
        ...sdData.metadata,
        identified_issues: sdData.identified_issues,
        quality_gate_status: 'FAILED',
        created_by: 'UAT_COMPREHENSIVE_ANALYSIS'
      },

      created_by: 'UAT_ANALYSIS',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Check if SD already exists
    const { data: existing, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      // Update existing SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Strategic Directive updated successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Priority:', data.priority);
      console.log('   Status:', data.status);
    } else {
      // Insert new SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Strategic Directive inserted successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Priority:', data.priority);
      console.log('   Status:', data.status);
    }

    console.log('\n📊 Summary:');
    console.log('   - Test Results: ' + sdData.metadata.test_results.passed + ' passed / ' + sdData.metadata.test_results.failed + ' failed');
    console.log('   - Pass Rate: ' + sdData.metadata.test_results.pass_rate + '%');
    console.log('   - Quality Gate: FAILED');
    console.log('\n🌐 View in Dashboard: http://localhost:3000/strategic-directives');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error inserting Strategic Directive:', error.message);
    if (error.code === 'PGRST116') {
      console.log('⚠️  Table strategic_directives_v2 does not exist');
      console.log('   Run: npm run setup-db-supabase to create tables');
    } else if (error.code === '23505') {
      console.log('⚠️  Strategic Directive with this ID already exists');
    }
    process.exit(1);
  }
}

// Execute
insertUATStrategicDirective();