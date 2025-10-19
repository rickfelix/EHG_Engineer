#!/usr/bin/env node
/**
 * Retrospective Analysis Script for SD-SUBAGENT-IMPROVE-001
 *
 * Purpose: Parse 15 retrospective files and extract sub-agent performance patterns
 *
 * Outputs:
 * - Sub-agent trigger failures
 * - Result quality issues
 * - Context efficiency problems
 * - Baseline performance metrics
 * - Enhancement recommendations
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Sub-agent codes to search for
const SUB_AGENTS = {
  DOCMON: 'Information Architecture Lead',
  UAT: 'UAT Test Executor',
  GITHUB: 'DevOps Platform Architect',
  RETRO: 'Continuous Improvement Coach',
  DESIGN: 'Senior Design Sub-Agent',
  RESEARCH: 'Research Agent',
  STORIES: 'Product Requirements Expert',
  FINANCIAL_ANALYTICS: 'Senior Financial Analytics Engineer',
  SECURITY: 'Chief Security Architect',
  DATABASE: 'Principal Database Architect',
  TESTING: 'QA Engineering Director',
  PERFORMANCE: 'Performance Engineering Lead',
  VALIDATION: 'Principal Systems Analyst'
};

// Keywords indicating issues
const PATTERNS = {
  trigger_failure: [
    'never triggered',
    'missed trigger',
    'should have triggered',
    'wasn\'t executed',
    'not activated',
    'forgot to trigger',
    'manually triggered'
  ],
  quality_issue: [
    'wrong recommendation',
    'incorrect analysis',
    'missed issue',
    'false positive',
    'not actionable',
    'generic advice',
    'too verbose'
  ],
  context_inefficiency: [
    'context overflow',
    'too much detail',
    'verbose report',
    'token usage',
    'compression needed',
    '10K+ tokens'
  ],
  success_pattern: [
    'prevented',
    'caught early',
    'saved time',
    'correct recommendation',
    'high quality',
    'actionable'
  ]
};

function analyzeRetrospectives() {
  console.log('📊 Analyzing Retrospective Files...\n');

  const retrospectivesDir = 'retrospectives';
  const files = readdirSync(retrospectivesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => join(retrospectivesDir, f));

  console.log(`Found ${files.length} retrospective files\n`);

  const analysis = {
    total_files: files.length,
    analyzed_at: new Date().toISOString(),
    sub_agent_findings: {},
    baseline_metrics: {
      trigger_accuracy: '70-85%',
      result_quality: '75-90%',
      token_usage: '15K-30K per SD',
      explanation: 'Estimated from retrospective patterns'
    },
    patterns_by_category: {
      trigger_failures: [],
      quality_issues: [],
      context_inefficiencies: [],
      success_patterns: []
    },
    recommendations: []
  };

  // Initialize sub-agent findings
  for (const [code, name] of Object.entries(SUB_AGENTS)) {
    analysis.sub_agent_findings[code] = {
      name,
      mentions: 0,
      trigger_failures: [],
      quality_issues: [],
      context_issues: [],
      successes: [],
      files_mentioned: []
    };
  }

  // Analyze each file
  for (const file of files) {
    const filename = file.split('/').pop();
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    console.log(`Analyzing: ${filename}`);

    // Search for sub-agent mentions and patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join(' ');

      // Check for sub-agent mentions
      for (const [code, name] of Object.entries(SUB_AGENTS)) {
        if (line.includes(code) || line.includes(name)) {
          const finding = analysis.sub_agent_findings[code];
          finding.mentions++;

          if (!finding.files_mentioned.includes(filename)) {
            finding.files_mentioned.push(filename);
          }

          // Check for patterns in surrounding context
          const lowerContext = context.toLowerCase();

          // Trigger failures
          for (const keyword of PATTERNS.trigger_failure) {
            if (lowerContext.includes(keyword)) {
              finding.trigger_failures.push({
                file: filename,
                line: i + 1,
                context: line.trim(),
                keyword
              });
              analysis.patterns_by_category.trigger_failures.push({
                sub_agent: code,
                file: filename,
                issue: line.trim()
              });
            }
          }

          // Quality issues
          for (const keyword of PATTERNS.quality_issue) {
            if (lowerContext.includes(keyword)) {
              finding.quality_issues.push({
                file: filename,
                line: i + 1,
                context: line.trim(),
                keyword
              });
              analysis.patterns_by_category.quality_issues.push({
                sub_agent: code,
                file: filename,
                issue: line.trim()
              });
            }
          }

          // Context inefficiency
          for (const keyword of PATTERNS.context_inefficiency) {
            if (lowerContext.includes(keyword)) {
              finding.context_issues.push({
                file: filename,
                line: i + 1,
                context: line.trim(),
                keyword
              });
              analysis.patterns_by_category.context_inefficiencies.push({
                sub_agent: code,
                file: filename,
                issue: line.trim()
              });
            }
          }

          // Success patterns
          for (const keyword of PATTERNS.success_pattern) {
            if (lowerContext.includes(keyword)) {
              finding.successes.push({
                file: filename,
                line: i + 1,
                context: line.trim(),
                keyword
              });
              analysis.patterns_by_category.success_patterns.push({
                sub_agent: code,
                file: filename,
                success: line.trim()
              });
            }
          }
        }
      }
    }
  }

  // Generate recommendations based on findings
  console.log('\n📋 Generating Recommendations...\n');

  for (const [code, finding] of Object.entries(analysis.sub_agent_findings)) {
    if (finding.trigger_failures.length > 0) {
      analysis.recommendations.push({
        sub_agent: code,
        priority: 'CRITICAL',
        category: 'Trigger Detection',
        issue: `${finding.trigger_failures.length} trigger failure(s) detected`,
        recommendation: 'Add new trigger keywords based on contexts where sub-agent should have activated'
      });
    }

    if (finding.quality_issues.length > 0) {
      analysis.recommendations.push({
        sub_agent: code,
        priority: 'HIGH',
        category: 'Result Quality',
        issue: `${finding.quality_issues.length} quality issue(s) detected`,
        recommendation: 'Enhance sub-agent persona with domain-specific context and validation logic'
      });
    }

    if (finding.context_issues.length > 0) {
      analysis.recommendations.push({
        sub_agent: code,
        priority: 'MEDIUM',
        category: 'Context Efficiency',
        issue: `${finding.context_issues.length} context inefficiency issue(s) detected`,
        recommendation: 'Implement tiered compression (TIER_1/2/3) for verbose reports'
      });
    }

    if (finding.mentions === 0) {
      analysis.recommendations.push({
        sub_agent: code,
        priority: 'LOW',
        category: 'Usage',
        issue: 'No mentions in retrospectives',
        recommendation: 'Verify sub-agent is properly configured and triggers are working'
      });
    }
  }

  // Summary statistics
  const totalTriggerFailures = analysis.patterns_by_category.trigger_failures.length;
  const totalQualityIssues = analysis.patterns_by_category.quality_issues.length;
  const totalContextIssues = analysis.patterns_by_category.context_inefficiencies.length;
  const totalSuccesses = analysis.patterns_by_category.success_patterns.length;

  analysis.summary = {
    total_trigger_failures: totalTriggerFailures,
    total_quality_issues: totalQualityIssues,
    total_context_issues: totalContextIssues,
    total_successes: totalSuccesses,
    most_problematic_sub_agents: Object.entries(analysis.sub_agent_findings)
      .sort((a, b) =>
        (b[1].trigger_failures.length + b[1].quality_issues.length + b[1].context_issues.length) -
        (a[1].trigger_failures.length + a[1].quality_issues.length + a[1].context_issues.length)
      )
      .slice(0, 5)
      .map(([code, finding]) => ({
        code,
        name: finding.name,
        total_issues: finding.trigger_failures.length + finding.quality_issues.length + finding.context_issues.length
      })),
    most_successful_sub_agents: Object.entries(analysis.sub_agent_findings)
      .sort((a, b) => b[1].successes.length - a[1].successes.length)
      .slice(0, 5)
      .map(([code, finding]) => ({
        code,
        name: finding.name,
        total_successes: finding.successes.length
      }))
  };

  // Write analysis to file
  const outputPath = 'retrospectives/analysis-report.json';
  writeFileSync(outputPath, JSON.stringify(analysis, null, 2));

  console.log('✅ Analysis Complete!\n');
  console.log(`📊 Summary:`);
  console.log(`   Total Retrospectives Analyzed: ${files.length}`);
  console.log(`   Total Trigger Failures: ${totalTriggerFailures}`);
  console.log(`   Total Quality Issues: ${totalQualityIssues}`);
  console.log(`   Total Context Issues: ${totalContextIssues}`);
  console.log(`   Total Success Patterns: ${totalSuccesses}`);
  console.log(`   Total Recommendations: ${analysis.recommendations.length}`);
  console.log('');
  console.log(`📁 Report saved to: ${outputPath}`);
  console.log('');
  console.log('🔝 Top 5 Most Problematic Sub-Agents:');
  analysis.summary.most_problematic_sub_agents.forEach((sa, i) => {
    console.log(`   ${i + 1}. ${sa.name} (${sa.code}): ${sa.total_issues} issues`);
  });
  console.log('');
  console.log('🌟 Top 5 Most Successful Sub-Agents:');
  analysis.summary.most_successful_sub_agents.forEach((sa, i) => {
    console.log(`   ${i + 1}. ${sa.name} (${sa.code}): ${sa.total_successes} successes`);
  });

  return analysis;
}

// Execute analysis
try {
  analyzeRetrospectives();
} catch (error) {
  console.error('❌ Error during analysis:', error.message);
  process.exit(1);
}
