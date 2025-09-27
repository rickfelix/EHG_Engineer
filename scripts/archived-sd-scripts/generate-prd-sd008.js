#!/usr/bin/env node

/**
 * Generate PRD for SD-008: Integrations Consolidated
 * PLAN Phase execution
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function generatePRDForSD008() {
  console.log('📐 PLAN Phase: Generating PRD for SD-008');

  // Check if PRD already exists
  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('directive_id', 'SD-008')
    .single();

  if (existingPrd) {
    console.log(`✅ PRD already exists: ${existingPrd.title}`);
    return existingPrd;
  }

  // Get SD details
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-008')
    .single();

  if (!sd) {
    throw new Error('SD-008 not found');
  }

  console.log(`Found SD: ${sd.title}`);
  console.log(`Status: ${sd.status}, Priority: ${sd.priority}`);

  // Generate PRD content structure
  const prdContent = {
    version: '1.0.0',
    product_overview: {
      name: 'Integrations Management System',
      description: 'Consolidated integration management system for handling external service connections, API integrations, and data synchronization across the platform.',
      target_users: ['System administrators', 'Integration developers', 'Operations team'],
      business_value: 'Streamline integration management, reduce redundancy, improve reliability of external connections'
    },

    // User Stories
    user_stories: [
      {
        id: 'US-008-001',
        title: 'Centralized Integration Dashboard',
        description: 'As a system administrator, I want a centralized dashboard to view all integrations so that I can monitor their status and health',
        acceptance_criteria: [
          'Dashboard displays all active integrations',
          'Real-time status indicators for each integration',
          'Quick access to integration logs and metrics',
          'Ability to enable/disable integrations'
        ],
        priority: 'HIGH'
      },
      {
        id: 'US-008-002',
        title: 'Integration Configuration Management',
        description: 'As an integration developer, I want to manage integration configurations in one place so that I can easily update settings',
        acceptance_criteria: [
          'Centralized configuration storage',
          'Version control for configuration changes',
          'Environment-specific configuration support',
          'Validation of configuration parameters'
        ],
        priority: 'HIGH'
      },
      {
        id: 'US-008-003',
        title: 'Error Handling and Retry Logic',
        description: 'As an operations team member, I want robust error handling for integrations so that temporary failures are automatically recovered',
        acceptance_criteria: [
          'Automatic retry with exponential backoff',
          'Dead letter queue for failed messages',
          'Detailed error logging and alerting',
          'Manual retry capability'
        ],
        priority: 'HIGH'
      },
      {
        id: 'US-008-004',
        title: 'Integration Monitoring and Metrics',
        description: 'As a system administrator, I want comprehensive monitoring of integrations so that I can track performance and usage',
        acceptance_criteria: [
          'Request/response metrics per integration',
          'Latency and throughput tracking',
          'Error rate monitoring',
          'Usage analytics and reporting'
        ],
        priority: 'MEDIUM'
      },
      {
        id: 'US-008-005',
        title: 'API Rate Limiting Management',
        description: 'As an integration developer, I want automatic rate limit handling so that integrations respect external API limits',
        acceptance_criteria: [
          'Configurable rate limits per integration',
          'Automatic request throttling',
          'Queue management for rate-limited requests',
          'Rate limit status visibility'
        ],
        priority: 'MEDIUM'
      }
    ],

    // Technical Requirements
    technical_requirements: {
      architecture: 'Microservices-based integration layer',
      technology_stack: [
        'Node.js for integration services',
        'Redis for caching and queuing',
        'PostgreSQL for configuration storage',
        'React for dashboard UI'
      ],
      integrations: [
        'External API connections',
        'Webhook management',
        'Event streaming',
        'Database synchronization'
      ],
      performance_requirements: {
        response_time: '< 500ms for API calls',
        availability: '99.9% uptime',
        throughput: '1000 requests/second',
        concurrent_integrations: '50+'
      }
    },

    // Acceptance Criteria
    acceptance_criteria: [
      'All existing integrations consolidated into new system',
      'Zero downtime migration from current integration setup',
      'All user stories implemented and tested',
      'Performance requirements met under load testing',
      'Documentation complete for all integrations',
      'Monitoring and alerting configured',
      'Security audit passed',
      'Integration testing with external services complete'
    ],

    // Test Plan
    test_plan: {
      unit_tests: 'Minimum 80% code coverage for integration logic',
      integration_tests: 'End-to-end testing for each external integration',
      performance_tests: 'Load testing with simulated traffic',
      security_tests: 'Authentication, authorization, and data encryption validation',
      user_acceptance_tests: 'Admin dashboard usability testing'
    },

    metadata: {
      generated_by: 'LEO Protocol PLAN Phase',
      generation_method: 'automated_from_sd',
      sd_priority: sd.priority || 'high',
      estimated_effort: '4-6 weeks',
      dependencies: ['Authentication system', 'Logging infrastructure', 'Monitoring platform']
    }
  };

  // Create PRD record with content as JSON string
  const prd = {
    id: `PRD-SD-008-${Date.now()}`,
    strategic_directive_id: 'SD-008',
    title: 'PRD: Integrations Consolidation and Management',
    content: JSON.stringify(prdContent, null, 2),
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      generated_by: 'LEO Protocol PLAN Phase',
      sd_priority: sd.priority || 'high'
    }
  };

  // Save PRD to database
  const { data: newPrd, error } = await supabase
    .from('product_requirements_v2')
    .insert({
      ...prd,
      directive_id: prd.strategic_directive_id
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create PRD:', error);
    throw error;
  }

  console.log(`✅ PRD created successfully: ${newPrd.title}`);
  console.log(`   ID: ${newPrd.id}`);
  console.log(`   Status: ${newPrd.status}`);
  console.log(`   User Stories: ${prdContent.user_stories.length}`);

  return newPrd;
}

// Execute
generatePRDForSD008()
  .then(prd => {
    console.log('\n📋 Next Steps:');
    console.log('1. Review PRD for completeness');
    console.log('2. Create PLAN→EXEC handoff');
    console.log('3. Begin EXEC phase implementation');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });