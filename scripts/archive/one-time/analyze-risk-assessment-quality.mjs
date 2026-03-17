#!/usr/bin/env node
/**
 * Risk Assessment Quality Analysis Script
 *
 * Analyzes existing risk assessments for boilerplate/default rationale usage.
 * Used to retroactively flag low-quality assessments.
 *
 * @see SD-CAPABILITY-LIFECYCLE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validateRiskAssessmentQuality } from './modules/risk-assessment-quality-validation.js';

// Load .env first, then .env.test.local for overrides
dotenv.config();
dotenv.config({ path: '.env.test.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeRiskAssessments() {
  console.log('='.repeat(70));
  console.log('RISK ASSESSMENT QUALITY ANALYSIS');
  console.log('SD-CAPABILITY-LIFECYCLE-001 - Boilerplate Detection');
  console.log('='.repeat(70));

  // Fetch all risk assessments (using correct column names from schema)
  const { data: assessments, error } = await supabase
    .from('risk_assessments')
    .select(`
      id,
      sd_id,
      phase,
      risk_level,
      overall_risk_score,
      technical_complexity,
      security_risk,
      performance_risk,
      integration_risk,
      data_migration_risk,
      ui_ux_risk,
      critical_issues,
      warnings,
      recommendations,
      verdict,
      confidence,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching risk assessments:', error.message);
    process.exit(1);
  }

  console.log(`\nFound ${assessments.length} risk assessments\n`);

  const results = {
    total: assessments.length,
    passing: 0,
    failing: 0,
    byScore: {
      excellent: 0,  // 90-100
      good: 0,       // 80-89
      acceptable: 0, // 70-79
      poor: 0        // <70
    },
    byBoilerplatePercent: {
      none: 0,       // 0%
      low: 0,        // 1-25%
      medium: 0,     // 26-50%
      high: 0,       // 51-75%
      critical: 0    // >75%
    },
    failingAssessments: [],
    scoreDistribution: [],
    domainBoilerplate: {
      technical_complexity: 0,
      security: 0,
      performance: 0,
      integration: 0,
      data_migration: 0,
      ui_ux: 0
    }
  };

  for (const assessment of assessments) {
    // Build assessment object for validation (matching actual schema)
    const assessmentForQuality = {
      id: assessment.id,
      sd_id: assessment.sd_id,
      technical_complexity: assessment.technical_complexity,
      security_risk: assessment.security_risk,
      performance_risk: assessment.performance_risk,
      integration_risk: assessment.integration_risk,
      data_migration_risk: assessment.data_migration_risk,
      ui_ux_risk: assessment.ui_ux_risk,
      critical_issues: assessment.critical_issues || [],
      warnings: assessment.warnings || [],
      recommendations: assessment.recommendations || [],
      risk_level: assessment.risk_level,
      verdict: assessment.verdict,
      confidence: assessment.confidence
    };

    const result = validateRiskAssessmentQuality(assessmentForQuality);
    results.scoreDistribution.push(result.score);

    // Score distribution
    if (result.score >= 90) results.byScore.excellent++;
    else if (result.score >= 80) results.byScore.good++;
    else if (result.score >= 70) results.byScore.acceptable++;
    else results.byScore.poor++;

    // Boilerplate percentage distribution
    const boilerplatePercent = result.boilerplateDetails?.boilerplate_percentage || 0;
    if (boilerplatePercent === 0) results.byBoilerplatePercent.none++;
    else if (boilerplatePercent <= 25) results.byBoilerplatePercent.low++;
    else if (boilerplatePercent <= 50) results.byBoilerplatePercent.medium++;
    else if (boilerplatePercent <= 75) results.byBoilerplatePercent.high++;
    else results.byBoilerplatePercent.critical++;

    // Track domain-specific boilerplate
    if (result.boilerplateDetails?.domain_results) {
      for (const [domain, data] of Object.entries(result.boilerplateDetails.domain_results)) {
        if (data.isDefault) {
          results.domainBoilerplate[domain]++;
        }
      }
    }

    // Pass/fail
    if (result.score >= 70 && boilerplatePercent <= 50) {
      results.passing++;
    } else {
      results.failing++;
      results.failingAssessments.push({
        sd_id: assessment.sd_id,
        risk_level: assessment.risk_level,
        score: result.score,
        boilerplate_percent: boilerplatePercent,
        issues: result.issues,
        warnings: result.warnings.slice(0, 3) // First 3 warnings
      });
    }
  }

  // Calculate average score
  const avgScore = results.scoreDistribution.length > 0
    ? Math.round(results.scoreDistribution.reduce((a, b) => a + b, 0) / results.scoreDistribution.length)
    : 0;

  // Print results
  console.log('=== SUMMARY ===');
  console.log(`Total Risk Assessments: ${results.total}`);
  console.log(`Average Quality Score: ${avgScore}%`);
  console.log(`Passing (score>=70, boilerplate<=50%): ${results.passing} (${Math.round(results.passing / results.total * 100)}%)`);
  console.log(`Failing: ${results.failing} (${Math.round(results.failing / results.total * 100)}%)`);

  console.log('\n=== SCORE DISTRIBUTION ===');
  console.log(`Excellent (90-100): ${results.byScore.excellent}`);
  console.log(`Good (80-89): ${results.byScore.good}`);
  console.log(`Acceptable (70-79): ${results.byScore.acceptable}`);
  console.log(`Poor (<70): ${results.byScore.poor}`);

  console.log('\n=== BOILERPLATE PERCENTAGE DISTRIBUTION ===');
  console.log(`None (0%): ${results.byBoilerplatePercent.none}`);
  console.log(`Low (1-25%): ${results.byBoilerplatePercent.low}`);
  console.log(`Medium (26-50%): ${results.byBoilerplatePercent.medium}`);
  console.log(`High (51-75%): ${results.byBoilerplatePercent.high}`);
  console.log(`Critical (>75%): ${results.byBoilerplatePercent.critical}`);

  console.log('\n=== BOILERPLATE BY DOMAIN ===');
  for (const [domain, count] of Object.entries(results.domainBoilerplate)) {
    if (count > 0) {
      console.log(`${domain}: ${count} assessments with default rationale`);
    }
  }

  if (results.failingAssessments.length > 0) {
    console.log('\n=== ASSESSMENTS THAT WOULD FAIL NEW VALIDATION ===');
    // Sort by score (worst first)
    results.failingAssessments.sort((a, b) => a.score - b.score);

    for (const assessment of results.failingAssessments.slice(0, 15)) {
      console.log(`\n${assessment.sd_id}: ${assessment.score}% (${assessment.boilerplate_percent}% boilerplate)`);
      console.log(`  Risk Level: ${assessment.risk_level}`);
      if (assessment.issues.length > 0) {
        console.log(`  Issues:`);
        for (const issue of assessment.issues.slice(0, 2)) {
          console.log(`    - ${issue}`);
        }
      }
    }

    if (results.failingAssessments.length > 15) {
      console.log(`\n... and ${results.failingAssessments.length - 15} more failing assessments`);
    }
  }

  console.log('\n=== RECOMMENDATION ===');
  if (results.failing > results.total * 0.2) {
    console.log('WARNING: >20% of risk assessments would fail new validation.');
    console.log('Consider:');
    console.log('  1. Re-running RISK sub-agent for SDs with 100% boilerplate');
    console.log('  2. Updating lib/sub-agents/risk.js to generate evidence-based rationales');
    console.log('  3. Manual review of critical SDs with high boilerplate');
  } else {
    console.log('Quality level acceptable. New validation will block future boilerplate assessments.');
  }

  console.log('\n' + '='.repeat(70));
}

analyzeRiskAssessments().catch(console.error);
