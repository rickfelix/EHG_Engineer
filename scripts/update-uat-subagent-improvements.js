#!/usr/bin/env node

/**
 * Update UAT Sub-Agent with Standardized Metadata and Comprehensive Capabilities
 * Based on structured testing, screenshot evidence, and interactive prompts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateUatSubAgent() {
  console.log('🔧 Updating UAT Sub-Agent with Standardized Metadata...\n');

  const updatedCapabilities = [
    'Proactive learning: Query UAT patterns before testing',
    'Structured test ID execution',
    'Screenshot evidence collection',
    'Interactive prompt guidance',
    'User journey validation',
    'Acceptance criteria verification',
    'Manual test case execution',
    'Exploratory testing',
    'User experience validation',
    'Business requirement verification',
    'Regression testing (manual)',
    'Stakeholder approval evidence'
  ];

  const updatedMetadata = {
    version: '2.1.0', // Bumped from 2.0.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'SD-UAT-002: Structured test execution',
      'SD-UAT-003: Screenshot evidence patterns',
      'SD-UAT-020: Interactive prompt requirements',
      'Manual testing best practices'
    ],
    success_patterns: [
      'Structured test IDs enable consistent execution',
      'Screenshot evidence for approval',
      'Interactive prompts prevent skipped steps',
      'User journey validation ensures end-to-end flows',
      'Acceptance criteria verified systematically',
      'Manual test cases documented and tracked',
      'Exploratory testing finds edge cases',
      'User experience validated by real users',
      'Business requirements verified before deployment',
      'Regression testing catches unintended changes',
      'Stakeholder approval with evidence',
      'UAT execution results stored in database'
    ],
    failure_patterns: [
      'Unstructured manual testing = inconsistent results',
      'No screenshots = no approval evidence',
      'Missing prompts = skipped test steps',
      'No user journey validation = broken flows',
      'Acceptance criteria not verified = incomplete features',
      'Manual tests not documented = lost knowledge',
      'No exploratory testing = missed edge cases',
      'UX not validated = poor user experience',
      'Business requirements not verified = wrong implementation',
      'No regression testing = unintended breakage',
      'No stakeholder sign-off = deployment delays',
      'UAT results not stored = no traceability'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      strategic_directives_analyzed: 3,
      capabilities_count: 12,
      evidence_requirement: 'screenshots mandatory',
      execution_model: 'structured test IDs',
      guidance_model: 'interactive prompts'
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'MEDIUM',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Query UAT patterns before testing'
      },
      {
        title: 'Structured Test ID Execution',
        impact: 'HIGH',
        source: 'SD-UAT-002',
        benefit: 'Enables consistent, repeatable manual testing'
      },
      {
        title: 'Screenshot Evidence Collection',
        impact: 'CRITICAL',
        source: 'SD-UAT-003',
        benefit: 'Provides approval evidence and traceability'
      },
      {
        title: 'Interactive Prompt Guidance',
        impact: 'MEDIUM',
        source: 'SD-UAT-020',
        benefit: 'Prevents skipped test steps'
      },
      {
        title: 'User Journey Validation',
        impact: 'HIGH',
        source: 'Manual testing patterns',
        benefit: 'Ensures end-to-end flows work correctly'
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
      .eq('code', 'UAT')
      .select();

    if (error) {
      console.error('❌ Error updating UAT sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ UAT Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 2.1.0 (from 2.0.0)');
    console.log('- Capabilities: 12 capabilities (from 0)');
    console.log('- Sources: 5 retrospectives/patterns');
    console.log('- Success Patterns: 12 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 5 major enhancements');

  } catch (_err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateUatSubAgent();
