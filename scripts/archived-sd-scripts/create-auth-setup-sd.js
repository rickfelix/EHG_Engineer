#!/usr/bin/env node

/**
 * Create Strategic Directive for Authentication Test Setup Critical Failure
 * This addresses the root cause blocking all UAT tests with authentication
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createAuthSetupSD() {
  console.log('🔐 Creating Strategic Directive for Authentication Test Setup Issue');
  console.log('================================================================\n');

  const strategicDirective = {
    id: 'SD-AUTH-SETUP-2025-001',
    title: 'Critical Authentication Test Setup Failure Resolution',
    description: `CRITICAL: Authentication setup for UAT tests is completely broken, preventing all test suites from running.
    The global-auth.js setup fails with "Authentication failed - still on login page" error, blocking 100% of authenticated tests.
    This is a BLOCKER for all testing and must be resolved immediately.`,
    priority: 'critical',
    status: 'active',
    category: 'testing-infrastructure',
    rationale: 'Authentication failure blocks 100% of test execution, preventing quality assurance and deployment. Without fixing this, no testing can be performed, creating severe business risk.',
    scope: 'Fix authentication setup for UAT test suite to enable testing across all 5 browsers with 1455 tests',
    strategic_objectives: [
      'Fix authentication test setup to unblock all UAT testing',
      'Implement robust authentication state management for tests',
      'Create fallback authentication mechanisms',
      'Ensure test authentication works across all browsers',
      'Implement authentication state verification'
    ],
    success_criteria: [
      'Global authentication setup succeeds 100% of the time',
      'Authentication state persists across all test runs',
      'Tests can run with proper authentication context',
      'All 1455 tests can execute across 5 browsers',
      'Authentication works with both test and production credentials'
    ],
    metadata: {
      timeline: {
        start_date: new Date().toISOString(),
        target_completion: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days
        milestones: [
          'Day 1: Debug and fix authentication flow',
          'Day 1: Implement robust error handling',
          'Day 2: Test across all browsers',
          'Day 2: Deploy and verify fix'
        ]
      },
      business_impact: 'CRITICAL - Blocks all UAT testing, preventing quality assurance and deployment',
      technical_impact: 'Complete test suite failure - 0% of authenticated tests can run',
      resource_requirements: [
        'Senior developer for authentication implementation',
        'QA engineer for test framework updates',
        'DevOps for credential management',
        'Security review for test authentication approach'
      ],
      error_details: {
        error_message: 'Authentication failed - still on login page',
        error_location: 'tests/uat/setup/global-auth.js:178',
        failing_selector: '#signin-email, #signin-password',
        navigation_timeout: true,
        url_stuck_at: 'http://localhost:8080/login'
      },
      test_impact: {
        tests_blocked: 1455,
        browsers_affected: ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'],
        current_pass_rate: '0% (authentication blocks all)',
        target_pass_rate: '>85%'
      },
      related_sds: ['SD-UAT-2025-002'],
      root_cause_analysis: {
        immediate_cause: 'Login form not responding to automation',
        contributing_factors: [
          'Possible JavaScript errors on login page',
          'Race condition in form initialization',
          'Incorrect selectors or element IDs',
          'Missing wait conditions for form readiness',
          'Potential CORS or security policy blocking'
        ]
      }
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-AUTH-SETUP-2025-001')
      .single();

    if (existing) {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-AUTH-SETUP-2025-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('   ID: SD-AUTH-SETUP-2025-001');
    console.log('   Title: Critical Authentication Test Setup Failure Resolution');
    console.log('   Priority: CRITICAL');
    console.log('   Status: ACTIVE');
    console.log('   Impact: Blocking 1455 tests across 5 browsers');
    console.log('\n🚨 This is a CRITICAL BLOCKER for all testing');
    console.log('================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createAuthSetupSD };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createAuthSetupSD();
}