#!/usr/bin/env node

/**
 * Create PRD for SD-UAT-2025-003: Infrastructure Port Configuration Standardization
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPortConfigPRD() {
  console.log('📋 Creating PRD for SD-UAT-2025-003: Infrastructure Port Configuration Standardization');
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
    id: 'PRD-SD-UAT-2025-003',
    title: 'Infrastructure Port Configuration Standardization',
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: 'US-PORT-001',
        title: 'Standardize Application Port to 8080',
        description: 'As a DevOps engineer, I need all environments to use port 8080 consistently to avoid configuration mismatches',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All environments configured to use port 8080',
          'Docker containers expose port 8080',
          'Development server defaults to 8080',
          'Production deployments use 8080',
          'No hardcoded port references in code'
        ],
        test_requirements: [
          'Port availability checks',
          'Environment startup validation',
          'Container port mapping tests',
          'Load balancer configuration tests'
        ]
      },
      {
        id: 'US-PORT-002',
        title: 'Update Test Configuration Files',
        description: 'As a QA engineer, I need all test configurations to use the correct port to avoid connection refused errors',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Playwright config uses port 8080',
          'Jest config references correct port',
          'E2E tests connect to right port',
          'Integration tests use proper URLs',
          'No test timeouts due to wrong ports'
        ],
        test_requirements: [
          'Test configuration validation',
          'Connection establishment tests',
          'Parallel test execution validation',
          'Cross-environment test runs'
        ]
      },
      {
        id: 'US-PORT-003',
        title: 'Configure Environment Variables',
        description: 'As a developer, I need environment variables properly configured for port settings',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'PORT env variable documented',
          '.env.example includes PORT=8080',
          'Environment validation on startup',
          'Clear error messages for misconfig',
          'Fallback to 8080 if not specified'
        ],
        test_requirements: [
          'Environment variable loading tests',
          'Configuration validation tests',
          'Fallback mechanism tests',
          'Error handling tests'
        ]
      },
      {
        id: 'US-PORT-004',
        title: 'Document Port Configuration Standards',
        description: 'As a team member, I need clear documentation on port configuration standards',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'README updated with port info',
          'Docker documentation includes ports',
          'Deployment guide specifies ports',
          'Troubleshooting guide for port issues',
          'Architecture diagram shows port flows'
        ],
        test_requirements: [
          'Documentation completeness checks',
          'Example validation',
          'Configuration file templates',
          'Port conflict resolution guide'
        ]
      },
      {
        id: 'US-PORT-005',
        title: 'Implement Port Configuration Validation',
        description: 'As a system administrator, I need automated validation of port configurations',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Startup script validates port availability',
          'Health check endpoint on correct port',
          'Port conflict detection and reporting',
          'Automatic port allocation fallback',
          'Monitoring of port usage metrics'
        ],
        test_requirements: [
          'Port availability tests',
          'Health check validation',
          'Conflict detection tests',
          'Fallback mechanism tests',
          'Monitoring integration tests'
        ]
      }
    ],
    technical_requirements: {
      infrastructure: [
        'Standardize all services to port 8080',
        'Update Docker compose configurations',
        'Configure reverse proxy/load balancer',
        'Set up port forwarding rules'
      ],
      configuration: [
        'Update all config files to use PORT env var',
        'Remove hardcoded port references',
        'Create centralized port configuration',
        'Implement configuration validation'
      ],
      testing: [
        'Update Playwright config to use 8080',
        'Fix test environment URLs',
        'Configure test containers properly',
        'Validate parallel test execution'
      ],
      deployment: [
        'Update CI/CD pipelines',
        'Configure production load balancers',
        'Update Kubernetes services',
        'Set proper health check endpoints'
      ]
    },
    // FIX: success_metrics moved to metadata
    // success_metrics: {
      connectivity: 'Zero connection refused errors',
      consistency: '100% environments on port 8080',
      testing: 'All tests pass with correct port',
      deployment: 'Zero deployment failures due to ports',
      documentation: '100% port configuration documented'
    }
  };

  const prd = {
    id: 'PRD-SD-UAT-2025-003',
    directive_id: 'SD-UAT-2025-003',
    title: 'Infrastructure Port Configuration Standardization',
    version: '1.0',
    status: 'draft',
    content: prdContent,
    metadata: {
      test_failures_addressed: 20,
      issues_resolved: [
        'ERR_CONNECTION_REFUSED at http://localhost:8082/',
        'NS_ERROR_CONNECTION_REFUSED',
        'Port mismatch between 8080 and 8082',
        'Test environment connection failures'
      ],
      priority: 'CRITICAL',
      business_impact: 'Application inaccessible in certain configurations',
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
      .eq('directive_id', 'SD-UAT-2025-003')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('directive_id', 'SD-UAT-2025-003')
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

    console.log('   ID: PRD-SD-UAT-2025-003');
    console.log('   Title: Infrastructure Port Configuration Standardization');
    console.log('   User Stories: 5 CRITICAL');
    console.log('   Test Failures Addressed: 20');
    console.log('\n🎯 Ready for orchestrator execution');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }
}

// Execute
createPortConfigPRD();