#!/usr/bin/env node

/**
 * Create PRD for SD-UAT-2025-002: Authentication System Critical Failures
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createAuthPRD() {
  console.log('📋 Creating PRD for SD-UAT-2025-002: Authentication System Critical Failures');
  console.log('================================================================\n');

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdContent = {
    id: 'PRD-SD-UAT-2025-002',
    title: 'Authentication System Critical Failures',
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: 'US-AUTH-001',
        title: 'Fix Login Form Detection and Rendering',
        description: 'As a user, I need the login form to be consistently detected and rendered so I can access the application',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Login form renders within 2 seconds on all pages',
          'Form elements are properly identified by test selectors',
          'Login button is always clickable and visible',
          'Form validation messages display correctly',
          'Auto-focus works on username field'
        ],
        test_requirements: [
          'Unit tests for login form component',
          'Integration tests for form rendering',
          'E2E tests for login flow',
          'Visual regression tests for form appearance'
        ]
      },
      {
        id: 'US-AUTH-002',
        title: 'Fix Protected Route Redirects',
        description: 'As a developer, I need protected routes to properly redirect unauthenticated users to the login page',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All protected routes check authentication status',
          'Unauthenticated users redirect to /login',
          'Redirect preserves original destination URL',
          'No infinite redirect loops occur',
          'Proper HTTP status codes returned (401/302)'
        ],
        test_requirements: [
          'Route guard middleware tests',
          'Redirect flow integration tests',
          'Authorization header validation tests',
          'Session token verification tests'
        ]
      },
      {
        id: 'US-AUTH-003',
        title: 'Implement Reliable Session Persistence',
        description: 'As a user, I need my session to persist across browser refreshes and tabs',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Session persists for configured duration',
          'Session survives browser refresh',
          'Session shared across browser tabs',
          'Remember me functionality works',
          'Proper session cleanup on logout'
        ],
        test_requirements: [
          'Session storage tests',
          'Cookie persistence tests',
          'Multi-tab session tests',
          'Session expiry tests'
        ]
      },
      {
        id: 'US-AUTH-004',
        title: 'Optimize Password Reset Flow',
        description: 'As a user, I need the password reset process to complete within 30 seconds',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Password reset email sent within 5 seconds',
          'Reset link validation completes quickly',
          'New password saved without timeout',
          'Clear success/error messages displayed',
          'No duplicate reset emails sent'
        ],
        test_requirements: [
          'Password reset flow E2E tests',
          'Email delivery timing tests',
          'Database update performance tests',
          'Error handling tests'
        ]
      },
      {
        id: 'US-AUTH-005',
        title: 'Fix CSRF Token Validation',
        description: 'As a security engineer, I need CSRF tokens to be properly validated on all forms',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'CSRF token generated for each session',
          'Token included in all form submissions',
          'Server validates token on every request',
          'Token refreshes appropriately',
          'Clear error on token mismatch'
        ],
        test_requirements: [
          'CSRF token generation tests',
          'Token validation middleware tests',
          'Form submission security tests',
          'Token refresh logic tests'
        ]
      }
    ],
    technical_requirements: {
      frontend: [
        'Fix React component lifecycle issues in login form',
        'Implement proper loading states for auth operations',
        'Add retry logic for failed auth requests',
        'Ensure proper error boundary implementation'
      ],
      backend: [
        'Optimize session storage queries',
        'Implement proper JWT token validation',
        'Add rate limiting to auth endpoints',
        'Fix async/await in password reset flow'
      ],
      infrastructure: [
        'Configure session storage (Redis/Database)',
        'Set proper CORS headers for auth',
        'Implement proper SSL/TLS for auth endpoints',
        'Configure proper session timeout values'
      ],
      testing: [
        'Create comprehensive auth test suite',
        'Add performance benchmarks for auth operations',
        'Implement security testing for auth flows',
        'Add cross-browser auth testing'
      ]
    },
    // FIX: success_metrics moved to metadata
    // success_metrics: {
      authentication: 'Zero auth-related test failures',
      performance: 'Login completes in <2 seconds',
      security: '100% CSRF protection coverage',
      reliability: '99.9% auth service uptime',
      user_experience: '<1% failed login attempts due to bugs'
    }
  };

  const prd = {
    id: 'PRD-SD-UAT-2025-002',
    directive_id: 'SD-UAT-2025-002',
    title: 'Authentication System Critical Failures',
    version: '1.0',
    status: 'draft',
    content: prdContent,
    metadata: {
      test_failures_addressed: 18,
      issues_resolved: [
        'Login form not found on page',
        'Protected route redirect failures',
        'Session persistence check failures',
        'Password reset timeouts',
        'CSRF protection errors'
      ],
      priority: 'CRITICAL',
      created_by: 'LEO_PLAN_AGENT'
    },
    created_by: 'LEO_PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  sd_uuid: sdUuid, // FIX: Added for handoff validation
  };

  try {
    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('directive_id', 'SD-UAT-2025-002')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('directive_id', 'SD-UAT-2025-002')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD updated successfully!');
    } else {
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .insert(prd)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD created successfully!');
    }

    console.log('   ID: PRD-SD-UAT-2025-002');
    console.log('   Title: Authentication System Critical Failures');
    console.log('   User Stories: 5 CRITICAL');
    console.log('   Test Failures Addressed: 18');
    console.log('\n🎯 Ready for EXEC phase implementation');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }
}

// Execute
createAuthPRD();