#!/usr/bin/env node

/**
 * Update RISK Sub-Agent with Standardized Metadata
 * Based on BMAD Method, issue patterns, and risk assessment frameworks
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateRiskSubAgent() {
  console.log('🔧 Updating RISK Sub-Agent with Standardized Metadata...\n');

  const updatedCapabilities = [
    'Proactive learning: Query risk patterns before assessment',
    'BMAD Method risk assessment (6 domains)',
    'Risk scoring (1-10 scale per domain)',
    'Issue pattern integration (11 patterns)',
    'Build risk analysis (3 patterns)',
    'Database risk assessment',
    'Security risk evaluation',
    'Performance risk analysis',
    'Critical risk blocking (requires mitigation)',
    'High risk mitigation planning',
    'Risk prevention (4-6 hours per SD)',
    'Cross-SD dependency risk tracking'
  ];

  const updatedMetadata = {
    version: '1.1.0', // Bumped from 1.0.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'docs/guides/bmad-user-guide.md',
      'LEO Protocol v4.2.0',
      '11 issue patterns integrated',
      '3 build patterns',
      '1 database pattern',
      '1 security pattern',
      '1 performance pattern'
    ],
    success_patterns: [
      'BMAD Method provides structured risk assessment',
      '6 domains ensure comprehensive coverage',
      'Risk scoring (1-10) enables prioritization',
      'Issue pattern integration prevents known risks',
      'Critical risks block approval (require mitigation)',
      'High risks require documented mitigation plans',
      'Early risk assessment prevents 4-6 hours rework',
      'Build risk patterns prevent CI/CD failures',
      'Database risk assessment prevents schema issues',
      'Security risk evaluation prevents vulnerabilities',
      'Performance risk analysis prevents regressions',
      'Cross-SD dependency tracking prevents conflicts'
    ],
    failure_patterns: [
      'No risk assessment = unexpected failures',
      'Late risk identification = costly rework (4-6 hours)',
      'No mitigation plans for high/critical risks',
      'Ignoring issue patterns = repeat mistakes',
      'No build risk analysis = CI/CD failures',
      'Skipping database risk assessment = schema conflicts',
      'No security risk evaluation = vulnerabilities',
      'Missing performance risk analysis = regressions',
      'No cross-SD dependency check = conflicts',
      'Subjective risk assessment = inconsistent decisions',
      'No risk tracking = lost lessons',
      'Critical risks not blocking = production incidents'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      bmad_domains: 6,
      scoring_scale: '1-10 per domain',
      issue_patterns_integrated: 11,
      time_saved_per_sd: '4-6 hours',
      risk_levels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      capabilities_count: 12
    },
    improvements: [
      {
        title: 'Proactive Learning Integration',
        impact: 'MEDIUM',
        source: 'SD-LEO-LEARN-001',
        benefit: 'Query risk patterns before assessment'
      },
      {
        title: 'BMAD Method Framework',
        impact: 'CRITICAL',
        source: 'BMAD user guide',
        benefit: 'Structured risk assessment across 6 domains'
      },
      {
        title: 'Issue Pattern Integration',
        impact: 'HIGH',
        source: '11 issue patterns',
        benefit: 'Prevents known risks, saves 4-6 hours per SD'
      },
      {
        title: 'Risk Scoring System',
        impact: 'HIGH',
        source: 'LEO Protocol v4.2.0',
        benefit: 'Objective prioritization (1-10 scale)'
      },
      {
        title: 'Critical Risk Blocking',
        impact: 'CRITICAL',
        source: 'BMAD Method',
        benefit: 'Prevents production incidents by blocking critical risks'
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
      .eq('code', 'RISK')
      .select();

    if (error) {
      console.error('❌ Error updating RISK sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ RISK Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 1.1.0 (from 1.0.0)');
    console.log('- Capabilities: 12 capabilities');
    console.log('- Sources: 8 retrospectives/patterns');
    console.log('- Success Patterns: 12 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 5 major enhancements');

  } catch (_err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateRiskSubAgent();
