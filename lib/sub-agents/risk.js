#!/usr/bin/env node
/**
 * 🛡️ RISK Assessment Sub-Agent
 *
 * BMAD Enhancement: Multi-domain risk assessment for Strategic Directives
 *
 * Risk Domains:
 * 1. Technical Complexity - Code complexity, refactoring needs, technical debt
 * 2. Security Risk - Auth, data exposure, RLS policies, vulnerabilities
 * 3. Performance Risk - Query optimization, caching, scaling concerns
 * 4. Integration Risk - Third-party APIs, service dependencies
 * 5. Data Migration Risk - Schema changes, data integrity, rollback complexity
 * 6. UI/UX Risk - Component complexity, accessibility, responsive design
 *
 * Activation: LEAD Pre-Approval, PLAN PRD Creation
 * Blocking: HIGH or CRITICAL risk without mitigation plan
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Execute Risk Assessment for a Strategic Directive
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration from database
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Assessment results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🛡️ RISK ASSESSMENT SUB-AGENT - Executing for ${sdId}\n`);

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const phase = options.phase || 'LEAD_PRE_APPROVAL';
  const results = {
    sd_id: sdId,
    phase,
    timestamp: new Date().toISOString(),
    risk_domains: {},
    critical_issues: [],
    warnings: [],
    recommendations: [],
    verdict: 'PASS',
    confidence: 0
  };

  try {
    // ============================================
    // 1. FETCH STRATEGIC DIRECTIVE
    // ============================================
    console.log('📋 Step 1: Fetching Strategic Directive...');
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'SD not found'}`);
    }

    console.log(`   ✓ SD fetched: ${sd.title}`);
    console.log(`   Status: ${sd.status}, Priority: ${sd.priority_score}`);

    // ============================================
    // 2. FETCH RELATED DATA
    // ============================================
    console.log('\n📦 Step 2: Fetching related data...');

    // PRD (if exists)
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('strategic_directive_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // User Stories (if exist)
    const { data: userStories } = await supabase
      .from('user_stories')
      .select('*')
      .eq('strategic_directive_id', sdId);

    // Backlog Items
    const { data: backlogItems } = await supabase
      .from('sd_backlog_map')
      .select('*')
      .eq('sd_id', sdId);

    console.log(`   ✓ PRD: ${prd ? 'Found' : 'Not yet created'}`);
    console.log(`   ✓ User Stories: ${userStories?.length || 0}`);
    console.log(`   ✓ Backlog Items: ${backlogItems?.length || 0}`);

    // ============================================
    // 3. ASSESS RISK DOMAINS
    // ============================================
    console.log('\n🔍 Step 3: Assessing risk domains...\n');

    // Domain 1: Technical Complexity
    const technicalComplexity = assessTechnicalComplexity(sd, prd, userStories);
    results.risk_domains.technical_complexity = technicalComplexity;
    console.log(`   1. Technical Complexity: ${technicalComplexity.score}/10 (${technicalComplexity.level})`);
    console.log(`      ${technicalComplexity.rationale}`);

    // Domain 2: Security Risk
    const securityRisk = assessSecurityRisk(sd, prd);
    results.risk_domains.security_risk = securityRisk;
    console.log(`   2. Security Risk: ${securityRisk.score}/10 (${securityRisk.level})`);
    console.log(`      ${securityRisk.rationale}`);

    // Domain 3: Performance Risk
    const performanceRisk = assessPerformanceRisk(sd, prd);
    results.risk_domains.performance_risk = performanceRisk;
    console.log(`   3. Performance Risk: ${performanceRisk.score}/10 (${performanceRisk.level})`);
    console.log(`      ${performanceRisk.rationale}`);

    // Domain 4: Integration Risk
    const integrationRisk = assessIntegrationRisk(sd, prd);
    results.risk_domains.integration_risk = integrationRisk;
    console.log(`   4. Integration Risk: ${integrationRisk.score}/10 (${integrationRisk.level})`);
    console.log(`      ${integrationRisk.rationale}`);

    // Domain 5: Data Migration Risk
    const dataMigrationRisk = assessDataMigrationRisk(sd, prd);
    results.risk_domains.data_migration_risk = dataMigrationRisk;
    console.log(`   5. Data Migration Risk: ${dataMigrationRisk.score}/10 (${dataMigrationRisk.level})`);
    console.log(`      ${dataMigrationRisk.rationale}`);

    // Domain 6: UI/UX Risk
    const uiUxRisk = assessUIUXRisk(sd, prd, userStories);
    results.risk_domains.ui_ux_risk = uiUxRisk;
    console.log(`   6. UI/UX Risk: ${uiUxRisk.score}/10 (${uiUxRisk.level})`);
    console.log(`      ${uiUxRisk.rationale}`);

    // ============================================
    // 4. CALCULATE OVERALL RISK
    // ============================================
    console.log('\n📊 Step 4: Calculating overall risk...');

    const riskScores = [
      technicalComplexity.score,
      securityRisk.score,
      performanceRisk.score,
      integrationRisk.score,
      dataMigrationRisk.score,
      uiUxRisk.score
    ];

    const overallRiskScore = (riskScores.reduce((a, b) => a + b, 0) / riskScores.length).toFixed(2);
    const riskLevel = determineRiskLevel(parseFloat(overallRiskScore));

    results.overall_risk_score = parseFloat(overallRiskScore);
    results.risk_level = riskLevel;

    console.log(`   Overall Risk Score: ${overallRiskScore}/10`);
    console.log(`   Risk Level: ${riskLevel}`);

    // ============================================
    // 5. IDENTIFY CRITICAL ISSUES & WARNINGS
    // ============================================
    console.log('\n⚠️ Step 5: Identifying issues...');

    Object.values(results.risk_domains).forEach(domain => {
      if (domain.score >= 8) {
        results.critical_issues.push({
          domain: domain.domain,
          score: domain.score,
          issue: domain.rationale,
          mitigation_required: true
        });
      } else if (domain.score >= 6) {
        results.warnings.push({
          domain: domain.domain,
          score: domain.score,
          issue: domain.rationale,
          monitoring_recommended: true
        });
      }
    });

    console.log(`   Critical Issues: ${results.critical_issues.length}`);
    console.log(`   Warnings: ${results.warnings.length}`);

    // ============================================
    // 6. GENERATE RECOMMENDATIONS
    // ============================================
    console.log('\n💡 Step 6: Generating recommendations...');

    results.recommendations = generateRecommendations(results);

    results.recommendations.forEach((rec, idx) => {
      console.log(`   ${idx + 1}. ${rec.title}`);
      console.log(`      ${rec.description}`);
    });

    // ============================================
    // 7. DETERMINE VERDICT
    // ============================================
    console.log('\n🎯 Step 7: Determining verdict...');

    const { verdict, confidence, rationale } = determineVerdict(results);
    results.verdict = verdict;
    results.confidence = confidence;
    results.rationale = rationale;

    console.log(`   Verdict: ${verdict}`);
    console.log(`   Confidence: ${confidence}%`);
    console.log(`   Rationale: ${rationale}`);

    // ============================================
    // 8. STORE ASSESSMENT IN DATABASE
    // ============================================
    console.log('\n💾 Step 8: Storing assessment in database...');

    const { data: assessment, error: insertError } = await supabase
      .from('risk_assessments')
      .insert({
        sd_id: sdId,
        phase,
        assessed_by: 'RISK',
        technical_complexity: technicalComplexity.score,
        security_risk: securityRisk.score,
        performance_risk: performanceRisk.score,
        integration_risk: integrationRisk.score,
        data_migration_risk: dataMigrationRisk.score,
        ui_ux_risk: uiUxRisk.score,
        overall_risk_score: parseFloat(overallRiskScore),
        risk_level: riskLevel,
        critical_issues: results.critical_issues,
        warnings: results.warnings,
        recommendations: results.recommendations,
        verdict,
        confidence
      })
      .select()
      .single();

    if (insertError) {
      console.error(`   ⚠️ Failed to store assessment: ${insertError.message}`);
      console.log('   (Assessment will be returned but not persisted)');
    } else {
      console.log(`   ✓ Assessment stored with ID: ${assessment.id}`);
      results.assessment_id = assessment.id;
    }

    // ============================================
    // 9. FINAL SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('🛡️ RISK ASSESSMENT COMPLETE');
    console.log('='.repeat(60));
    console.log(`SD: ${sd.title}`);
    console.log(`Overall Risk: ${overallRiskScore}/10 (${riskLevel})`);
    console.log(`Verdict: ${verdict} (${confidence}% confidence)`);
    console.log(`Critical Issues: ${results.critical_issues.length}`);
    console.log(`Warnings: ${results.warnings.length}`);
    console.log(`Recommendations: ${results.recommendations.length}`);
    console.log('='.repeat(60) + '\n');

    return results;

  } catch (error) {
    console.error('❌ Risk Assessment Failed:', error.message);
    return {
      ...results,
      verdict: 'ESCALATE',
      confidence: 0,
      critical_issues: [{
        domain: 'EXECUTION',
        issue: `Risk assessment failed: ${error.message}`,
        mitigation_required: true
      }]
    };
  }
}

// ============================================
// RISK ASSESSMENT FUNCTIONS
// ============================================

function assessTechnicalComplexity(sd, prd, userStories) {
  const indicators = [];
  let score = 1; // Start at low risk

  // Check for complexity indicators in title/description
  const complexityKeywords = [
    'refactor', 'architecture', 'migration', 'redesign', 'overhaul',
    'restructure', 'complex', 'advanced', 'sophisticated'
  ];
  const content = `${sd.title} ${sd.description || ''}`.toLowerCase();

  const foundKeywords = complexityKeywords.filter(kw => content.includes(kw));
  if (foundKeywords.length > 0) {
    score += Math.min(foundKeywords.length * 1.5, 4);
    indicators.push(`Complexity keywords found: ${foundKeywords.join(', ')}`);
  }

  // Number of user stories
  const storyCount = userStories?.length || 0;
  if (storyCount > 12) {
    score += 3;
    indicators.push(`High user story count: ${storyCount} stories`);
  } else if (storyCount > 8) {
    score += 2;
    indicators.push(`Moderate user story count: ${storyCount} stories`);
  } else if (storyCount > 0) {
    score += 1;
    indicators.push(`Standard user story count: ${storyCount} stories`);
  }

  // PRD complexity (estimated lines of code)
  if (prd?.estimated_lines_of_code) {
    const loc = prd.estimated_lines_of_code;
    if (loc > 1500) {
      score += 2;
      indicators.push(`Very large implementation: ${loc} LOC`);
    } else if (loc > 800) {
      score += 1;
      indicators.push(`Large implementation: ${loc} LOC`);
    }
  }

  // Cap at 10
  score = Math.min(Math.round(score), 10);
  const level = determineRiskLevel(score);

  return {
    domain: 'Technical Complexity',
    score,
    level,
    rationale: indicators.length > 0
      ? indicators.join('. ')
      : 'Low complexity implementation with minimal technical debt risk'
  };
}

function assessSecurityRisk(sd, prd) {
  const indicators = [];
  let score = 1;

  const securityKeywords = [
    'auth', 'authentication', 'authorization', 'permission', 'role',
    'security', 'rls', 'policy', 'access control', 'token', 'session',
    'password', 'credential', 'encrypt', 'decrypt', 'sensitive data'
  ];
  const content = `${sd.title} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const foundKeywords = securityKeywords.filter(kw => content.includes(kw));
  if (foundKeywords.length > 0) {
    score += Math.min(foundKeywords.length * 2, 6);
    indicators.push(`Security-related: ${foundKeywords.slice(0, 3).join(', ')}`);
  }

  // Check if authentication/authorization mentioned
  if (content.includes('auth')) {
    score += 2;
    indicators.push('Authentication/authorization changes');
  }

  // Check for data exposure risks
  if (content.includes('data') && (content.includes('export') || content.includes('download') || content.includes('share'))) {
    score += 1;
    indicators.push('Data exposure potential');
  }

  score = Math.min(Math.round(score), 10);
  const level = determineRiskLevel(score);

  return {
    domain: 'Security',
    score,
    level,
    rationale: indicators.length > 0
      ? indicators.join('. ')
      : 'Low security risk - standard CRUD operations'
  };
}

function assessPerformanceRisk(sd, prd) {
  const indicators = [];
  let score = 1;

  const performanceKeywords = [
    'performance', 'optimization', 'cache', 'slow', 'latency',
    'query', 'index', 'pagination', 'load time', 'scalability',
    'real-time', 'websocket', 'large dataset', 'bulk operation'
  ];
  const content = `${sd.title} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const foundKeywords = performanceKeywords.filter(kw => content.includes(kw));
  if (foundKeywords.length > 0) {
    score += Math.min(foundKeywords.length * 1.5, 5);
    indicators.push(`Performance concerns: ${foundKeywords.slice(0, 3).join(', ')}`);
  }

  // Real-time features are higher risk
  if (content.includes('real-time') || content.includes('websocket')) {
    score += 2;
    indicators.push('Real-time features require performance optimization');
  }

  // Large datasets
  if (content.includes('large') || content.includes('bulk') || content.includes('report')) {
    score += 1;
    indicators.push('Large dataset handling');
  }

  score = Math.min(Math.round(score), 10);
  const level = determineRiskLevel(score);

  return {
    domain: 'Performance',
    score,
    level,
    rationale: indicators.length > 0
      ? indicators.join('. ')
      : 'Standard performance profile - no special optimization needed'
  };
}

function assessIntegrationRisk(sd, prd) {
  const indicators = [];
  let score = 1;

  const integrationKeywords = [
    'api', 'integration', 'third-party', 'external', 'webhook',
    'service', 'microservice', 'rest', 'graphql', 'socket',
    'openai', 'stripe', 'twilio', 'sendgrid', 'aws', 'google'
  ];
  const content = `${sd.title} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const foundKeywords = integrationKeywords.filter(kw => content.includes(kw));
  if (foundKeywords.length > 0) {
    score += Math.min(foundKeywords.length * 2, 6);
    indicators.push(`External integrations: ${foundKeywords.slice(0, 3).join(', ')}`);
  }

  // Third-party services are higher risk
  if (content.includes('third-party') || content.includes('external')) {
    score += 2;
    indicators.push('Third-party service dependencies');
  }

  // API integration
  if (content.includes('api')) {
    score += 1;
    indicators.push('API integration required');
  }

  score = Math.min(Math.round(score), 10);
  const level = determineRiskLevel(score);

  return {
    domain: 'Integration',
    score,
    level,
    rationale: indicators.length > 0
      ? indicators.join('. ')
      : 'Self-contained feature - no external dependencies'
  };
}

function assessDataMigrationRisk(sd, prd) {
  const indicators = [];
  let score = 1;

  const migrationKeywords = [
    'migration', 'schema', 'table', 'column', 'alter', 'database',
    'postgres', 'sql', 'create table', 'drop', 'rename', 'foreign key',
    'constraint', 'index', 'trigger', 'function', 'view'
  ];
  const content = `${sd.title} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const foundKeywords = migrationKeywords.filter(kw => content.includes(kw));
  if (foundKeywords.length > 0) {
    score += Math.min(foundKeywords.length * 2, 6);
    indicators.push(`Database changes: ${foundKeywords.slice(0, 3).join(', ')}`);
  }

  // Schema changes are higher risk
  if (content.includes('schema') || content.includes('migration')) {
    score += 2;
    indicators.push('Schema migration required');
  }

  // Altering existing tables is risky
  if (content.includes('alter') || content.includes('modify')) {
    score += 1;
    indicators.push('Modifying existing database structures');
  }

  score = Math.min(Math.round(score), 10);
  const level = determineRiskLevel(score);

  return {
    domain: 'Data Migration',
    score,
    level,
    rationale: indicators.length > 0
      ? indicators.join('. ')
      : 'No database changes - UI or logic only'
  };
}

function assessUIUXRisk(sd, prd, _userStories) {
  const indicators = [];
  let score = 1;

  const uiKeywords = [
    'ui', 'ux', 'design', 'component', 'interface', 'layout',
    'responsive', 'accessibility', 'a11y', 'mobile', 'dashboard',
    'form', 'modal', 'dialog', 'navigation', 'menu'
  ];
  const content = `${sd.title} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const foundKeywords = uiKeywords.filter(kw => content.includes(kw));
  if (foundKeywords.length > 0) {
    score += Math.min(foundKeywords.length * 1.5, 5);
    indicators.push(`UI changes: ${foundKeywords.slice(0, 3).join(', ')}`);
  }

  // Complex UI components
  if (content.includes('dashboard') || content.includes('complex')) {
    score += 2;
    indicators.push('Complex UI components');
  }

  // Responsive design
  if (content.includes('responsive') || content.includes('mobile')) {
    score += 1;
    indicators.push('Responsive design requirements');
  }

  // Accessibility requirements
  if (content.includes('accessibility') || content.includes('a11y')) {
    score += 1;
    indicators.push('Accessibility compliance required');
  }

  score = Math.min(Math.round(score), 10);
  const level = determineRiskLevel(score);

  return {
    domain: 'UI/UX',
    score,
    level,
    rationale: indicators.length > 0
      ? indicators.join('. ')
      : 'Backend-only feature - no UI changes'
  };
}

function determineRiskLevel(score) {
  if (score >= 8) return 'CRITICAL';
  if (score >= 6) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

function generateRecommendations(results) {
  const recommendations = [];

  // Critical risk recommendations
  if (results.critical_issues.length > 0) {
    recommendations.push({
      title: 'Critical Risk Mitigation Required',
      description: `${results.critical_issues.length} critical risk(s) identified. Develop mitigation plan before proceeding to EXEC phase. Consider: additional research, proof of concept, architecture review.`,
      priority: 'CRITICAL'
    });
  }

  // High-risk domains
  Object.values(results.risk_domains).forEach(domain => {
    if (domain.score >= 7) {
      recommendations.push({
        title: `${domain.domain} Risk Management`,
        description: `High risk in ${domain.domain.toLowerCase()}. Recommendations: Engage specialist sub-agent, add checkpoint validation, include fallback plan.`,
        priority: 'HIGH'
      });
    }
  });

  // Large SD recommendations
  const storyCount = results.user_story_count || 0;
  if (storyCount > 8) {
    recommendations.push({
      title: 'Checkpoint Pattern Recommended',
      description: `${storyCount} user stories detected. Use checkpoint pattern: Break into 3-4 checkpoints with interim validation to reduce context consumption and enable early error detection.`,
      priority: 'MEDIUM'
    });
  }

  // Performance recommendations
  if (results.risk_domains.performance_risk?.score >= 6) {
    recommendations.push({
      title: 'Performance Testing Required',
      description: 'Include performance testing in test plan. Define load targets, response time thresholds, and concurrency requirements.',
      priority: 'MEDIUM'
    });
  }

  // Security recommendations
  if (results.risk_domains.security_risk?.score >= 6) {
    recommendations.push({
      title: 'Security Review Required',
      description: 'Engage Chief Security Architect sub-agent for review. Validate: RLS policies, authentication flows, data exposure risks, input validation.',
      priority: 'HIGH'
    });
  }

  // Default recommendation if no risks
  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Standard Implementation Approach',
      description: 'Low risk profile. Proceed with standard LEO workflow. Maintain test coverage and follow existing patterns.',
      priority: 'LOW'
    });
  }

  return recommendations;
}

function determineVerdict(results) {
  const criticalCount = results.critical_issues.length;
  const warningCount = results.warnings.length;
  const riskLevel = results.risk_level;

  // FAIL: Critical risk without mitigation
  if (criticalCount > 0 && riskLevel === 'CRITICAL') {
    return {
      verdict: 'FAIL',
      confidence: 90,
      rationale: `${criticalCount} critical risk(s) identified. Mitigation plan required before proceeding.`
    };
  }

  // CONDITIONAL_PASS: High risk with warnings
  if (riskLevel === 'HIGH' || (riskLevel === 'MEDIUM' && warningCount > 2)) {
    return {
      verdict: 'CONDITIONAL_PASS',
      confidence: 75,
      rationale: 'Moderate to high risk detected. Proceed with caution. Follow recommendations and engage specialist sub-agents.'
    };
  }

  // ESCALATE: Unable to assess
  if (results.overall_risk_score === 0) {
    return {
      verdict: 'ESCALATE',
      confidence: 0,
      rationale: 'Insufficient data for risk assessment. Human review required.'
    };
  }

  // PASS: Low to medium risk
  return {
    verdict: 'PASS',
    confidence: 85,
    rationale: `Low to medium risk profile (${results.overall_risk_score}/10). Standard LEO workflow appropriate.`
  };
}

// ============================================
// CLI EXECUTION
// ============================================
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const sdId = process.argv[2];
  const phase = process.argv[3] || 'LEAD_PRE_APPROVAL';

  if (!sdId) {
    console.error('Usage: node risk.js <SD-ID> [phase]');
    console.error('Example: node risk.js SD-EXPORT-001 LEAD_PRE_APPROVAL');
    process.exit(1);
  }

  execute(sdId, { code: 'RISK', name: 'Risk Assessment Sub-Agent' }, { phase })
    .then(results => {
      const exitCode = results.verdict === 'PASS' || results.verdict === 'CONDITIONAL_PASS' ? 0 : 1;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
