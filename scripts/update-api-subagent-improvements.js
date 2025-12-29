#!/usr/bin/env node

/**
 * Update API Sub-Agent with Standardized Metadata
 * Based on Express best practices, API design patterns, and validation strategies
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateApiSubAgent() {
  console.log('🔧 Updating API Sub-Agent with Standardized Metadata...\n');

  const updatedCapabilities = [
    'Proactive learning: Query API patterns before starting',
    'REST API design and architecture',
    'Zod schema validation',
    'Feature flag integration (environment-based)',
    'Rate limiting (express-rate-limit)',
    'Structured error handling',
    'API endpoint security',
    'Request/response validation',
    'API documentation generation',
    'GraphQL API design',
    'API versioning strategies',
    'Middleware architecture'
  ];

  const updatedMetadata = {
    version: '1.1.0', // Bumped from 1.0.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'src/api/stories/index.js: Express patterns',
      'Express ecosystem best practices',
      'Zod schema validation patterns',
      'Feature flag implementation strategies',
      'Rate limiting security patterns'
    ],
    success_patterns: [
      'Zod schema validation prevents invalid data',
      'Environment-based feature flags enable safe rollouts',
      'Rate limiting prevents abuse and DoS',
      'Structured error responses improve debugging',
      'Middleware architecture enables reusable patterns',
      'API documentation auto-generated from schemas',
      'Request validation before business logic',
      'Response validation before sending',
      'Security middleware applied consistently',
      'API versioning prevents breaking changes',
      'GraphQL for complex data requirements',
      'REST for simple CRUD operations'
    ],
    failure_patterns: [
      'No input validation = security vulnerabilities',
      'Missing rate limiting = DoS attacks possible',
      'Unstructured errors = difficult debugging',
      'No feature flags = risky deployments',
      'Missing API documentation = poor DX',
      'No response validation = data leaks',
      'Inconsistent error handling across endpoints',
      'No API versioning = breaking changes',
      'Security middleware not applied = vulnerabilities',
      'GraphQL over-fetching without optimization',
      'REST for complex queries = N+1 problems',
      'No request size limits = memory exhaustion'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      capabilities_count: 12,
      version_evolution: 'v1.0 → v1.1',
      validation_pattern: 'Zod schema validation',
      rate_limiting_pattern: 'express-rate-limit',
      evaluation_criteria: {
        security: 3,
        performance: 4,
        documentation: 4,
        design_quality: 4
      }
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'MEDIUM',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Query API patterns before starting work'
      },
      {
        title: 'Zod Schema Validation',
        impact: 'HIGH',
        source: 'Express best practices',
        benefit: 'Prevents invalid data and improves type safety'
      },
      {
        title: 'Feature Flag Integration',
        impact: 'MEDIUM',
        source: 'Environment-based patterns',
        benefit: 'Enables safe rollouts and gradual feature adoption'
      },
      {
        title: 'Rate Limiting',
        impact: 'HIGH',
        source: 'Security patterns',
        benefit: 'Prevents abuse and DoS attacks'
      },
      {
        title: 'Structured Error Handling',
        impact: 'MEDIUM',
        source: 'Express patterns',
        benefit: 'Improves debugging and client-side error handling'
      }
    ]
  };

  try {
    const { data: _data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        capabilities: updatedCapabilities,
        metadata: updatedMetadata
      })
      .eq('code', 'API')
      .select();

    if (error) {
      console.error('❌ Error updating API sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ API Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 1.1.0 (from 1.0.0)');
    console.log('- Capabilities: 12 capabilities');
    console.log('- Sources: 6 retrospectives/patterns');
    console.log('- Success Patterns: 12 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 5 major enhancements');

  } catch (_err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateApiSubAgent();
