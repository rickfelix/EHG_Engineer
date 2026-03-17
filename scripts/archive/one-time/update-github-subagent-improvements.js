#!/usr/bin/env node

/**
 * Update GITHUB Sub-Agent with Standardized Metadata
 * Based on CI/CD patterns, refactoring safety, and GitHub Actions expertise
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateGithubSubAgent() {
  console.log('🔧 Updating GITHUB Sub-Agent with Standardized Metadata...\n');

  const updatedMetadata = {
    version: '2.1.0', // Bumped from 2.0.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'PAT-002: CI/CD pipeline failures',
      'PAT-008: Dependency management in CI',
      'PAT-010: Refactoring safety patterns',
      'SD-SUBAGENT-IMPROVE-001: DevOps platform integration',
      'browse-button-2025-10-26: Incident lessons',
      'disconnected-dialog-2025-10-26: Incident lessons',
      'GitHub Actions expertise and best practices'
    ],
    success_patterns: [
      'CI/CD pipeline verification prevents production failures',
      'Pre-refactoring checklist ensures E2E tests exist',
      'Post-refactoring validation catches regressions',
      'Feature inventory creation tracks all functionality',
      'Cross-SD dependency tracking prevents conflicts',
      'E2E test enforcement for refactoring (MANDATORY)',
      'Feature parity validation ensures nothing lost',
      'GitHub Actions automation reduces manual work',
      'Pull request automation streamlines reviews',
      'Pipeline status checking before deployment',
      'Release automation ensures consistent deployments',
      'Deployment workflow management prevents errors'
    ],
    failure_patterns: [
      'Refactoring without pre-existing E2E tests (PAT-010)',
      'No feature inventory before refactoring (lost functionality)',
      'Skipping CI/CD verification (deploy broken code)',
      'Missing post-refactoring validation (regressions)',
      'No cross-SD dependency checks (conflicts)',
      'Manual deployments without automation (errors)',
      'Pull requests without automated checks (quality issues)',
      'Pipeline failures ignored (cascading issues)',
      'No release automation (inconsistent deploys)',
      'Deployment workflows not tested (production failures)',
      'GitHub Actions misconfigured (failed builds)',
      'Status checks not required (merge broken code)'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      issue_patterns_integrated: 'PAT-002, PAT-008, PAT-010',
      capabilities_count: 11,
      version_evolution: 'v2.0 → v2.1',
      roi_ratio: '120:1',
      time_saved_per_incident: '10-20 hours',
      wait_time_seconds: 180
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'MEDIUM',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Query issue_patterns before CI/CD work'
      },
      {
        title: 'Refactoring Safety Protocol',
        impact: 'CRITICAL',
        source: 'PAT-010, browse-button-2025-10-26',
        benefit: 'Prevents functionality loss during refactoring (10-20 hours saved)'
      },
      {
        title: 'CI/CD Pipeline Verification',
        impact: 'HIGH',
        source: 'PAT-002, SD-SUBAGENT-IMPROVE-001',
        benefit: 'Prevents production failures, 120:1 ROI'
      },
      {
        title: 'Feature Inventory Creation',
        impact: 'HIGH',
        source: 'PAT-010, incident lessons',
        benefit: 'Tracks all functionality before refactoring'
      },
      {
        title: 'E2E Test Enforcement',
        impact: 'HIGH',
        source: 'PAT-010, refactoring safety protocol',
        benefit: 'MANDATORY pre-refactoring requirement'
      },
      {
        title: 'GitHub Actions Expertise',
        impact: 'MEDIUM',
        source: 'GitHub Actions best practices',
        benefit: 'Automation reduces manual work'
      }
    ]
  };

  try {
    const { data: _data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        metadata: updatedMetadata
      })
      .eq('code', 'GITHUB')
      .select();

    if (error) {
      console.error('❌ Error updating GITHUB sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ GITHUB Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 2.1.0 (from 2.0.0)');
    console.log('- Sources: 8 retrospectives/patterns');
    console.log('- Success Patterns: 12 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 6 major enhancements');
    console.log('\nEvidence Base:');
    console.log('- 74+ retrospectives analyzed');
    console.log('- PAT-002, PAT-008, PAT-010 integrated');
    console.log('- ROI: 120:1 ratio');
    console.log('- Time saved: 10-20 hours per incident');

  } catch (_err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateGithubSubAgent();
