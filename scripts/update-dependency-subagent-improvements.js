#!/usr/bin/env node

/**
 * Update DEPENDENCY Sub-Agent with Standardized Metadata
 * Based on PAT-008 and CI/CD dependency failure patterns
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateDependencySubAgent() {
  console.log('🔧 Updating DEPENDENCY Sub-Agent with Standardized Metadata...\n');

  const updatedMetadata = {
    version: '2.1.0', // Bumped from 2.0.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'PAT-008: Dependency vulnerability management',
      'Project package.json and lock file analysis',
      'npm audit and npm outdated evidence',
      'CI/CD dependency failure resolution patterns',
      'Security override strategies',
      'Supply chain security best practices'
    ],
    success_patterns: [
      'Proactive vulnerability scanning prevents security issues',
      'CVSS score assessment prioritizes patches correctly',
      'Security overrides strategy for transitive vulnerabilities',
      'Version conflict resolution via lock file integrity',
      'Semantic versioning guidance prevents breaking changes',
      'Bundle size optimization reduces load times',
      'CI/CD integration catches dependency issues early',
      'Transitive dependency analysis identifies hidden risks',
      'Supply chain security analysis prevents compromised packages',
      'npm overrides for vulnerabilities without direct patches',
      'Lock file integrity validation prevents drift',
      'Dependency health assessment before major updates'
    ],
    failure_patterns: [
      'Ignoring npm audit warnings (security debt accumulation)',
      'Upgrading dependencies without testing (breaking changes)',
      'Not using lock files (inconsistent environments)',
      'Allowing vulnerable transitive dependencies',
      'Bundle size not monitored (performance degradation)',
      'No semantic versioning strategy (unexpected breaking changes)',
      'Skipping CI/CD dependency checks (production failures)',
      'Using deprecated packages without migration plan',
      'Not reviewing security advisories (CVE exposure)',
      'Automatic dependency updates without review',
      'Conflicting version requirements unresolved',
      'Supply chain attacks via compromised packages'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      issue_patterns_integrated: 'PAT-008',
      capabilities_count: 12,
      version_evolution: 'v2.0 → v2.1',
      security_focus: 'CVE detection, CVSS assessment, patch management',
      ci_cd_integration: 'Automated dependency failure diagnosis'
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'MEDIUM',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Query issue_patterns before dependency work'
      },
      {
        title: 'CVE Vulnerability Detection',
        impact: 'HIGH',
        source: 'PAT-008, npm audit integration',
        benefit: 'Early detection of security vulnerabilities'
      },
      {
        title: 'Security Overrides Strategy',
        impact: 'HIGH',
        source: 'CI/CD dependency failure patterns',
        benefit: 'Resolve transitive vulnerabilities without direct patches'
      },
      {
        title: 'Bundle Size Optimization',
        impact: 'MEDIUM',
        source: 'Project package.json analysis',
        benefit: 'Reduced load times and improved performance'
      },
      {
        title: 'Semantic Versioning Guidance',
        impact: 'MEDIUM',
        source: 'Version conflict resolution patterns',
        benefit: 'Prevents breaking changes in production'
      }
    ]
  };

  try {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        metadata: updatedMetadata
      })
      .eq('code', 'DEPENDENCY')
      .select();

    if (error) {
      console.error('❌ Error updating DEPENDENCY sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ DEPENDENCY Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 2.1.0 (from 2.0.0)');
    console.log('- Sources: 7 retrospectives/patterns');
    console.log('- Success Patterns: 12 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 5 major enhancements');
    console.log('\nEvidence Base:');
    console.log('- 74+ retrospectives analyzed');
    console.log('- PAT-008: Dependency vulnerability management');
    console.log('- CI/CD integration: Automated failure diagnosis');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateDependencySubAgent();
