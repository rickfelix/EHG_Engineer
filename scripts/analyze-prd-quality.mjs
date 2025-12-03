#!/usr/bin/env node
/**
 * ANALYZE PRD QUALITY
 * Identifies boilerplate, placeholder text, and quality issues in existing PRDs
 *
 * @see SD-CAPABILITY-LIFECYCLE-001 - LEO Protocol quality improvements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Boilerplate patterns (from prd-quality-validation.js)
const PLACEHOLDER_PATTERNS = [
  'to be defined',
  'to be determined',
  'tbd',
  'needs definition',
  'will be defined',
  'placeholder',
  'during planning',
  'during technical analysis',
  'based on sd objectives',
  'based on success metrics'
];

const BOILERPLATE_AC = [
  'all functional requirements implemented',
  'all tests passing',
  'no regressions introduced',
  'code review completed',
  'documentation updated'
];

const BOILERPLATE_REQS = [
  'to be defined based on sd objectives',
  'to be defined during planning',
  'to be defined during technical analysis'
];

function containsPlaceholder(text) {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(p => normalized.includes(p));
}

function isBoilerplate(text, patterns) {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return patterns.some(p => normalized.includes(p.toLowerCase()));
}

async function main() {
  // Get all PRDs
  const { data: prds, error } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, title, executive_summary, functional_requirements, acceptance_criteria, test_scenarios, implementation_approach, system_architecture, content, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== PRD QUALITY ANALYSIS ===');
  console.log(`Total PRDs analyzed: ${prds.length}\n`);

  let totalScore = 0;
  const issuesByType = {
    executive_summary: 0,
    functional_requirements: 0,
    acceptance_criteria: 0,
    test_scenarios: 0,
    implementation_approach: 0,
    content_placeholders: 0
  };

  const prdScores = [];

  for (const prd of prds) {
    let score = 100;
    const issues = [];

    // 1. Executive Summary
    if (!prd.executive_summary || prd.executive_summary.trim().length < 50) {
      score -= 15;
      issues.push('Short/missing executive summary');
      issuesByType.executive_summary++;
    } else if (containsPlaceholder(prd.executive_summary)) {
      score -= 10;
      issues.push('Placeholder in executive summary');
      issuesByType.executive_summary++;
    }

    // 2. Functional Requirements
    if (prd.functional_requirements) {
      const reqs = Array.isArray(prd.functional_requirements) ? prd.functional_requirements : [];
      const placeholderReqs = reqs.filter(r => {
        const text = typeof r === 'string' ? r : (r.requirement || '');
        return containsPlaceholder(text) || isBoilerplate(text, BOILERPLATE_REQS);
      });

      if (placeholderReqs.length > 0) {
        score -= placeholderReqs.length * 5;
        issues.push(`${placeholderReqs.length}/${reqs.length} placeholder requirements`);
        issuesByType.functional_requirements++;
      }
    }

    // 3. Acceptance Criteria
    if (prd.acceptance_criteria) {
      const acs = Array.isArray(prd.acceptance_criteria) ? prd.acceptance_criteria : [];
      const boilerplateAC = acs.filter(ac => {
        const text = typeof ac === 'string' ? ac : (ac.criterion || '');
        return isBoilerplate(text, BOILERPLATE_AC);
      });

      if (boilerplateAC.length > 0) {
        score -= boilerplateAC.length * 3;
        issues.push(`${boilerplateAC.length}/${acs.length} boilerplate AC`);
        issuesByType.acceptance_criteria++;
      }
    }

    // 4. Test Scenarios
    if (prd.test_scenarios) {
      const scenarios = Array.isArray(prd.test_scenarios) ? prd.test_scenarios : [];
      const placeholderScenarios = scenarios.filter(ts => {
        const text = typeof ts === 'string' ? ts : (ts.scenario || '');
        return containsPlaceholder(text);
      });

      if (placeholderScenarios.length > 0) {
        score -= placeholderScenarios.length * 5;
        issues.push(`${placeholderScenarios.length}/${scenarios.length} placeholder test scenarios`);
        issuesByType.test_scenarios++;
      }
    }

    // 5. Implementation Approach
    if (!prd.implementation_approach || prd.implementation_approach.trim().length < 100) {
      score -= 5;
      issues.push('Short/missing implementation approach');
      issuesByType.implementation_approach++;
    } else if (containsPlaceholder(prd.implementation_approach)) {
      score -= 10;
      issues.push('Placeholder in implementation approach');
      issuesByType.implementation_approach++;
    }

    // 6. Content field (markdown)
    if (prd.content) {
      const contentLower = prd.content.toLowerCase();
      const matches = PLACEHOLDER_PATTERNS.filter(p => contentLower.includes(p));
      if (matches.length > 0) {
        score -= matches.length * 2;
        issues.push(`${matches.length} placeholder patterns in content`);
        issuesByType.content_placeholders++;
      }
    }

    score = Math.max(0, score);
    totalScore += score;
    prdScores.push({ id: prd.id, score, issues, status: prd.status });
  }

  // Calculate statistics
  const avgScore = Math.round(totalScore / prds.length);
  const passingPRDs = prdScores.filter(p => p.score >= 70).length;
  const failingPRDs = prdScores.filter(p => p.score < 70).length;

  console.log('=== SUMMARY ===');
  console.log(`Average Quality Score: ${avgScore}%`);
  console.log(`Passing (≥70%): ${passingPRDs} (${Math.round(passingPRDs / prds.length * 100)}%)`);
  console.log(`Failing (<70%): ${failingPRDs} (${Math.round(failingPRDs / prds.length * 100)}%)`);

  console.log('\n=== ISSUES BY TYPE ===');
  console.log(`Executive Summary issues: ${issuesByType.executive_summary}`);
  console.log(`Functional Requirements issues: ${issuesByType.functional_requirements}`);
  console.log(`Acceptance Criteria issues: ${issuesByType.acceptance_criteria}`);
  console.log(`Test Scenarios issues: ${issuesByType.test_scenarios}`);
  console.log(`Implementation Approach issues: ${issuesByType.implementation_approach}`);
  console.log(`Content Placeholder issues: ${issuesByType.content_placeholders}`);

  console.log('\n=== SCORE DISTRIBUTION ===');
  const excellent = prdScores.filter(p => p.score >= 90).length;
  const good = prdScores.filter(p => p.score >= 80 && p.score < 90).length;
  const acceptable = prdScores.filter(p => p.score >= 70 && p.score < 80).length;
  const poor = prdScores.filter(p => p.score < 70).length;

  console.log(`Excellent (90-100): ${excellent}`);
  console.log(`Good (80-89): ${good}`);
  console.log(`Acceptable (70-79): ${acceptable}`);
  console.log(`Poor (<70): ${poor}`);

  console.log('\n=== LOWEST SCORING PRDs ===');
  const worstPRDs = prdScores.sort((a, b) => a.score - b.score).slice(0, 10);
  worstPRDs.forEach((prd, i) => {
    console.log(`\n${i + 1}. ${prd.id} (Score: ${prd.score}%)`);
    console.log(`   Status: ${prd.status}`);
    console.log(`   Issues: ${prd.issues.join(', ')}`);
  });

  // Show PRDs that would fail new validation
  console.log('\n=== PRDs THAT WOULD FAIL NEW VALIDATION ===');
  const wouldFail = prdScores.filter(p => p.score < 70);
  if (wouldFail.length === 0) {
    console.log('All PRDs would pass the new 70% threshold!');
  } else {
    console.log(`${wouldFail.length} PRDs would fail:\n`);
    wouldFail.slice(0, 15).forEach(prd => {
      console.log(`  ${prd.id}: ${prd.score}% - ${prd.issues.slice(0, 2).join(', ')}`);
    });
    if (wouldFail.length > 15) {
      console.log(`  ... and ${wouldFail.length - 15} more`);
    }
  }
}

main().catch(console.error);
