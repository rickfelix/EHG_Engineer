#!/usr/bin/env node

/**
 * Update PERFORMANCE Sub-Agent with Standardized Metadata and Comprehensive Capabilities
 * Based on performance metrics, optimization patterns, and regression detection
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updatePerformanceSubAgent() {
  console.log('🔧 Updating PERFORMANCE Sub-Agent with Standardized Metadata...\n');

  const updatedCapabilities = [
    'Proactive learning: Query performance patterns before starting',
    'Performance metrics collection (objective measurements)',
    'Load time optimization (<142ms targets)',
    'Bundle size analysis and optimization',
    'Database query optimization',
    'Caching strategy implementation',
    'Performance regression detection',
    'Memory leak detection',
    'Network optimization',
    'Lazy loading implementation',
    'Code splitting strategies',
    'Performance profiling'
  ];

  const updatedMetadata = {
    version: '2.1.0', // Bumped from 2.0.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'SD-RECONNECT-010: Objective metrics (142ms)',
      'Performance optimization patterns',
      'Early validation strategies'
    ],
    success_patterns: [
      'Objective metrics (142ms) enable regression detection',
      'Early performance validation prevents late rework',
      'Load time targets defined upfront',
      'Bundle size monitored continuously',
      'Database queries optimized with indexes',
      'Caching strategies reduce server load',
      'Code splitting reduces initial bundle',
      'Lazy loading improves perceived performance',
      'Performance profiling identifies bottlenecks',
      'Memory leak detection prevents degradation',
      'Network optimization reduces latency',
      'Performance budgets enforced in CI/CD'
    ],
    failure_patterns: [
      'No performance metrics = no regression detection',
      'Late-stage performance optimization = 40-60% rework',
      'No load time targets = arbitrary performance',
      'Bundle size not monitored = bloat over time',
      'Missing database indexes = slow queries',
      'No caching strategy = repeated work',
      'No code splitting = large initial bundle',
      'Eager loading everything = slow page loads',
      'No performance profiling = unknown bottlenecks',
      'Memory leaks undetected = degradation over time',
      'Network not optimized = high latency',
      'No performance budgets = gradual degradation'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      strategic_directives_analyzed: 1,
      target_load_time: '142ms',
      rework_prevented: '40-60% when done early',
      capabilities_count: 12
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'MEDIUM',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Query performance patterns before optimization'
      },
      {
        title: 'Objective Performance Metrics',
        impact: 'CRITICAL',
        source: 'SD-RECONNECT-010',
        benefit: 'Enables regression detection (142ms target)'
      },
      {
        title: 'Early Performance Validation',
        impact: 'HIGH',
        source: 'SD-RECONNECT-010',
        benefit: 'Prevents 40-60% rework by validating early'
      },
      {
        title: 'Bundle Size Optimization',
        impact: 'MEDIUM',
        source: 'Performance patterns',
        benefit: 'Reduces initial load time and improves UX'
      },
      {
        title: 'Database Query Optimization',
        impact: 'HIGH',
        source: 'Performance patterns',
        benefit: 'Reduces server load and response time'
      }
    ]
  };

  try {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        capabilities: updatedCapabilities,
        metadata: updatedMetadata
      })
      .eq('code', 'PERFORMANCE')
      .select();

    if (error) {
      console.error('❌ Error updating PERFORMANCE sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ PERFORMANCE Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 2.1.0 (from 2.0.0)');
    console.log('- Capabilities: 12 capabilities (from 0)');
    console.log('- Sources: 4 retrospectives/patterns');
    console.log('- Success Patterns: 12 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 5 major enhancements');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updatePerformanceSubAgent();
