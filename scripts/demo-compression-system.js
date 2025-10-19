#!/usr/bin/env node

/**
 * Demo Sub-Agent Compression System
 *
 * Demonstrates compression with synthetic reports to show how the system works
 * Use this if you don't have real sub-agent reports in the database yet
 *
 * Usage: node scripts/demo-compression-system.js
 */

import { getCompressionTier, compressSubAgentReport, calculateTokenSavings, compressBatch } from '../lib/context/sub-agent-compressor.js';

/**
 * Generate synthetic sub-agent reports for demo
 */
function generateSyntheticReports() {
  return [
    // TIER 1: Critical - Security vulnerability
    {
      agent: 'Chief Security Architect',
      sub_agent_code: 'SECURITY',
      verdict: 'BLOCKED',
      confidence: 95,
      critical_issues: [
        {
          severity: 'CRITICAL',
          issue: 'SQL injection vulnerability in user input',
          location: 'src/services/userService.ts:127',
          recommendation: 'Use parameterized queries instead of string concatenation',
          code_snippet: "db.query('SELECT * FROM users WHERE id = ' + userId)",
          cve_reference: 'CWE-89',
          attack_vector: 'Direct input manipulation'
        },
        {
          severity: 'CRITICAL',
          issue: 'Stored XSS vulnerability in comment system',
          location: 'src/components/CommentBox.tsx:45',
          recommendation: 'Sanitize user input and use DOMPurify',
          code_snippet: "dangerouslySetInnerHTML={{ __html: comment.text }}",
          cve_reference: 'CWE-79',
          attack_vector: 'User-supplied content'
        }
      ],
      warnings: [],
      recommendations: [
        'Implement input validation library (e.g., Joi, Yup)',
        'Add Content Security Policy headers',
        'Enable SQL injection detection in WAF',
        'Conduct security code review',
        'Add automated security testing to CI/CD'
      ],
      vulnerabilities: 2,
      critical_vulnerabilities: 2,
      detailed_analysis: 'Full security audit revealed critical vulnerabilities that must be addressed before deployment. SQL injection in user service allows unauthorized data access. XSS vulnerability enables session hijacking attacks. Both vulnerabilities are actively exploitable and pose significant risk to user data security.',
      execution_time: 45
    },

    // TIER 2: Important - Database migration warnings
    {
      agent: 'Principal Database Architect',
      sub_agent_code: 'DATABASE',
      verdict: 'CONDITIONAL_PASS',
      confidence: 85,
      critical_issues: [],
      warnings: [
        {
          issue: 'Migration adds non-nullable column without default value',
          severity: 'MEDIUM',
          recommendation: 'Add default value or make column nullable',
          location: 'database/migrations/007_add_user_preferences.sql:12',
          impact: 'Deployment will fail if users table has existing rows'
        },
        {
          issue: 'Foreign key constraint may cause deadlocks',
          severity: 'MEDIUM',
          recommendation: 'Review transaction isolation level',
          location: 'database/migrations/007_add_user_preferences.sql:45',
          impact: 'High-concurrency scenarios may experience performance degradation'
        },
        {
          issue: 'Missing index on frequently queried column',
          severity: 'LOW',
          recommendation: 'Add index on preferences.user_id',
          location: 'database/migrations/007_add_user_preferences.sql',
          impact: 'Queries will be slower than optimal'
        }
      ],
      recommendations: [
        'Add default value for user_preferences column',
        'Review foreign key cascade behavior',
        'Add composite index on (user_id, preference_key)',
        'Test migration on production-sized dataset',
        'Document rollback procedure'
      ],
      tables_validated: 12,
      schema_compliance: 'partial',
      detailed_analysis: 'Database schema migration is mostly sound but has three areas requiring attention. The non-nullable column without default will block deployment if users table is non-empty. Foreign key relationship needs review for deadlock prevention. Missing index will cause slow queries but is not blocking.',
      execution_time: 23
    },

    // TIER 3: Informational - QA passed all tests
    {
      agent: 'QA Engineering Director',
      sub_agent_code: 'QA',
      verdict: 'PASS',
      confidence: 95,
      critical_issues: [],
      warnings: [],
      recommendations: [
        'Consider adding edge case tests for large datasets',
        'Increase E2E test coverage for error scenarios',
        'Add visual regression testing'
      ],
      tests_passed: 127,
      tests_total: 127,
      coverage: 78,
      detailed_analysis: 'All 127 tests passed successfully. Unit test coverage at 78% exceeds minimum threshold of 50%. E2E tests cover all critical user paths. Integration tests validated database operations. Performance tests show acceptable load times. No blockers identified. Code quality metrics are within acceptable ranges. Ready for deployment.',
      execution_time: 89
    },

    // TIER 3: Informational - Performance passed
    {
      agent: 'Performance Engineering Lead',
      sub_agent_code: 'PERFORMANCE',
      verdict: 'PASS',
      confidence: 90,
      critical_issues: [],
      warnings: [],
      recommendations: [
        'Consider implementing lazy loading for images',
        'Optimize bundle size with code splitting',
        'Add service worker for offline capability'
      ],
      load_time: 1420,
      response_time: 85,
      time_to_interactive: 2100,
      detailed_analysis: 'Performance metrics are within acceptable ranges. Initial load time of 1.42s is well under 2s target. Time to interactive of 2.1s meets requirement. API response times average 85ms, comfortably under 200ms threshold. Lighthouse score: 92/100. Core Web Vitals all pass. No performance blockers detected.',
      execution_time: 34
    },

    // TIER 2: Important - Design has minor issues
    {
      agent: 'Senior Design Sub-Agent',
      sub_agent_code: 'DESIGN',
      verdict: 'CONDITIONAL_PASS',
      confidence: 80,
      critical_issues: [],
      warnings: [
        {
          issue: 'Color contrast ratio below WCAG AA standard',
          severity: 'MEDIUM',
          recommendation: 'Increase contrast for secondary button text',
          location: 'src/styles/buttons.css:45',
          impact: 'Accessibility issue for users with visual impairments'
        },
        {
          issue: 'Mobile breakpoint shows horizontal scrollbar',
          severity: 'LOW',
          recommendation: 'Review width calculations for 320px viewport',
          location: 'src/components/Dashboard.tsx',
          impact: 'Poor UX on small mobile devices'
        }
      ],
      recommendations: [
        'Update button text color to meet WCAG AA',
        'Fix mobile responsive overflow',
        'Add focus indicators for keyboard navigation',
        'Test with screen readers',
        'Document design system components'
      ],
      components_reviewed: 23,
      accessibility_score: 88,
      detailed_analysis: 'Design implementation is generally solid. Two accessibility issues identified that should be addressed before production. Color contrast issue is minor but important for WCAG compliance. Mobile scrollbar is cosmetic but affects user experience. Overall design system is consistent and follows best practices.',
      execution_time: 56
    }
  ];
}

/**
 * Demonstrate compression system
 */
function demonstrateCompression() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎬 SUB-AGENT COMPRESSION SYSTEM DEMO');
  console.log('═'.repeat(70));
  console.log('   Demonstrating 3-tier priority-based compression');
  console.log('═'.repeat(70) + '\n');

  const reports = generateSyntheticReports();

  console.log('📊 Generated 5 synthetic sub-agent reports:\n');
  for (const report of reports) {
    console.log(`   - ${report.agent}: ${report.verdict} (${report.confidence}% confidence)`);
  }
  console.log('');

  // Test different phases
  const phases = ['EXEC', 'PLAN_VERIFICATION', 'LEAD_APPROVAL'];

  for (const phase of phases) {
    console.log('\n' + '─'.repeat(70));
    console.log(`📍 PHASE: ${phase}`);
    console.log('─'.repeat(70) + '\n');

    const result = compressBatch(reports, phase);

    console.log(`   Reports: ${result.statistics.total_reports}`);
    console.log(`   Original: ${result.statistics.original_tokens.toLocaleString()} tokens`);
    console.log(`   Compressed: ${result.statistics.compressed_tokens.toLocaleString()} tokens`);
    console.log(`   Saved: ${result.statistics.tokens_saved.toLocaleString()} tokens (${result.statistics.percentage_saved}%)`);
    console.log('');

    // Show tier distribution
    const tierCounts = { TIER_1: 0, TIER_2: 0, TIER_3: 0 };
    for (const compressed of result.compressed_reports) {
      if (compressed._compression_tier === 'TIER_1_CRITICAL') tierCounts.TIER_1++;
      else if (compressed._compression_tier === 'TIER_2_IMPORTANT') tierCounts.TIER_2++;
      else tierCounts.TIER_3++;
    }

    console.log('   Tier Distribution:');
    console.log(`      TIER 1 (Critical): ${tierCounts.TIER_1} reports (no compression)`);
    console.log(`      TIER 2 (Important): ${tierCounts.TIER_2} reports (structured summary)`);
    console.log(`      TIER 3 (Informational): ${tierCounts.TIER_3} reports (reference only)`);
    console.log('');
  }

  // Show detailed example
  console.log('\n' + '═'.repeat(70));
  console.log('📄 DETAILED COMPRESSION EXAMPLE');
  console.log('═'.repeat(70) + '\n');

  // Show TIER 3 compression (most dramatic)
  const qaReport = reports[2]; // QA report (PASS)
  console.log('TIER 3: QA Engineering Director (PASS)\n');

  console.log('BEFORE COMPRESSION:');
  console.log('─'.repeat(70));
  const beforeStr = JSON.stringify(qaReport, null, 2);
  console.log(beforeStr);
  console.log(`\nToken Count: ${Math.ceil(beforeStr.length / 4)}`);

  const tier = getCompressionTier(qaReport, 'EXEC');
  const compressed = compressSubAgentReport(qaReport, tier);
  const savings = calculateTokenSavings(qaReport, compressed);

  console.log('\n\nAFTER COMPRESSION:');
  console.log('─'.repeat(70));
  const afterStr = JSON.stringify(compressed, null, 2);
  console.log(afterStr);
  console.log(`\nToken Count: ${Math.ceil(afterStr.length / 4)}`);

  console.log('\n\nSAVINGS:');
  console.log('─'.repeat(70));
  console.log(`   Original: ${savings.original_tokens} tokens`);
  console.log(`   Compressed: ${savings.compressed_tokens} tokens`);
  console.log(`   Saved: ${savings.tokens_saved} tokens (${savings.percentage_saved}%)`);
  console.log('─'.repeat(70) + '\n');

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📋 COMPRESSION SYSTEM SUMMARY');
  console.log('═'.repeat(70));
  console.log('\n✅ TIER 1 (CRITICAL):');
  console.log('   - Security vulnerabilities → Full detail preserved');
  console.log('   - Database blockers → Complete analysis available');
  console.log('   - Test failures → All failure details retained');
  console.log('   - Compression: 0% (critical context never lost)');

  console.log('\n⚠️  TIER 2 (IMPORTANT):');
  console.log('   - Warnings present → Structured summary');
  console.log('   - Conditional passes → Key findings preserved');
  console.log('   - Phase-relevant → Context-aware importance');
  console.log('   - Compression: 50-70% (balance of detail and efficiency)');

  console.log('\n📝 TIER 3 (INFORMATIONAL):');
  console.log('   - All tests passed → One-line summary');
  console.log('   - No warnings → Reference only');
  console.log('   - Not phase-critical → Minimal context needed');
  console.log('   - Compression: 85-95% (maximum efficiency)');

  console.log('\n💡 KEY BENEFITS:');
  console.log('   - Preserves critical context 100%');
  console.log('   - Reduces verbosity by 70-90%');
  console.log('   - Phase-aware compression');
  console.log('   - Full reports always in database');
  console.log('   - Automatic retrieval when needed');

  console.log('\n═'.repeat(70));
  console.log('✅ DEMO COMPLETE');
  console.log('═'.repeat(70) + '\n');
}

// Run demo
demonstrateCompression();
