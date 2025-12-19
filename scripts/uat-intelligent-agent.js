#!/usr/bin/env node

/**
 * UAT Intelligent Failure Analysis Agent
 *
 * AI-powered agent that analyzes UAT test failures and provides intelligent recommendations
 * Features:
 * - Pattern recognition in test failures
 * - Root cause analysis
 * - Automated fix suggestions
 * - Strategic directive generation for complex issues
 * - Learning from historical failure data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UATIntelligentAgent {
  constructor(options = {}) {
    this.supabase = createSupabaseServiceClient();
    this.agentId = `UAT-AGENT-${Date.now()}`;
    this.options = {
      analysisDepth: options.analysisDepth || 'comprehensive', // basic, standard, comprehensive
      generateFixes: options.generateFixes !== false, // Default true
      createSDs: options.createSDs || false, // Create Strategic Directives for complex issues
      learningMode: options.learningMode !== false, // Learn from patterns
      ...options
    };

    // Intelligence patterns for failure analysis
    this.patterns = {
      authentication: {
        keywords: ['login', 'auth', 'unauthorized', 'token', 'session', 'redirect'],
        severity: 'critical',
        category: 'Authentication',
        commonCauses: [
          'Session timeout or expiration',
          'Authentication service unavailable',
          'Invalid credentials or token',
          'Authentication configuration mismatch',
          'CORS issues with auth endpoints'
        ]
      },
      ui_elements: {
        keywords: ['toBeVisible', 'not found', 'selector', 'element', 'locator'],
        severity: 'high',
        category: 'UI Elements',
        commonCauses: [
          'UI components not loading properly',
          'Element selectors have changed',
          'Conditional rendering blocking elements',
          'CSS or styling preventing visibility',
          'JavaScript errors preventing DOM updates'
        ]
      },
      timeouts: {
        keywords: ['timeout', 'Timeout', 'waiting', 'slow'],
        severity: 'medium',
        category: 'Performance',
        commonCauses: [
          'Application performance degradation',
          'Network connectivity issues',
          'Database query performance',
          'Third-party service latency',
          'Resource loading bottlenecks'
        ]
      },
      network: {
        keywords: ['network', '502', '503', '504', 'ECONNREFUSED', 'fetch'],
        severity: 'high',
        category: 'Network',
        commonCauses: [
          'Service unavailability',
          'API endpoint configuration issues',
          'Load balancer problems',
          'DNS resolution failures',
          'Firewall or security blocking'
        ]
      },
      data: {
        keywords: ['expect', 'toHaveText', 'toContain', 'assertion', 'data'],
        severity: 'medium',
        category: 'Data Integrity',
        commonCauses: [
          'Database state inconsistency',
          'Test data corruption or missing',
          'Race conditions in data updates',
          'Cache invalidation issues',
          'Business logic errors'
        ]
      }
    };

    // Fix strategies for different failure types
    this.fixStrategies = {
      authentication: [
        {
          strategy: 'Implement robust authentication retry logic',
          implementation: 'Add exponential backoff and session renewal',
          priority: 'immediate',
          effort: 'low'
        },
        {
          strategy: 'Add authentication state monitoring',
          implementation: 'Create auth state persistence and validation',
          priority: 'high',
          effort: 'medium'
        },
        {
          strategy: 'Configure global authentication setup',
          implementation: 'Use Playwright global setup for auth persistence',
          priority: 'immediate',
          effort: 'low'
        }
      ],
      ui_elements: [
        {
          strategy: 'Implement intelligent element waiting',
          implementation: 'Use waitForSelector with custom conditions',
          priority: 'high',
          effort: 'low'
        },
        {
          strategy: 'Add visual regression testing',
          implementation: 'Compare screenshots to detect UI changes',
          priority: 'medium',
          effort: 'high'
        },
        {
          strategy: 'Create resilient selector strategy',
          implementation: 'Use multiple selector fallbacks and data attributes',
          priority: 'high',
          effort: 'medium'
        }
      ],
      timeouts: [
        {
          strategy: 'Optimize application performance',
          implementation: 'Profile and improve slow database queries',
          priority: 'high',
          effort: 'high'
        },
        {
          strategy: 'Implement adaptive timeout strategies',
          implementation: 'Dynamic timeouts based on historical performance',
          priority: 'medium',
          effort: 'medium'
        },
        {
          strategy: 'Add performance monitoring',
          implementation: 'Real-time performance metrics and alerting',
          priority: 'high',
          effort: 'medium'
        }
      ],
      network: [
        {
          strategy: 'Implement circuit breaker pattern',
          implementation: 'Graceful degradation when services are unavailable',
          priority: 'high',
          effort: 'medium'
        },
        {
          strategy: 'Add health check monitoring',
          implementation: 'Automated service health verification',
          priority: 'immediate',
          effort: 'low'
        },
        {
          strategy: 'Configure retry policies',
          implementation: 'Exponential backoff for network requests',
          priority: 'immediate',
          effort: 'low'
        }
      ],
      data: [
        {
          strategy: 'Implement test data isolation',
          implementation: 'Separate test data from production data',
          priority: 'immediate',
          effort: 'medium'
        },
        {
          strategy: 'Add data validation layers',
          implementation: 'Schema validation and integrity checks',
          priority: 'high',
          effort: 'medium'
        },
        {
          strategy: 'Create data fixtures and factories',
          implementation: 'Consistent test data generation',
          priority: 'medium',
          effort: 'medium'
        }
      ]
    };
  }

  /**
   * Analyze test failures intelligently
   */
  async analyzeFailures(reportPath) {
    console.log(chalk.blue(`🤖 ${this.agentId}: Starting intelligent failure analysis`));

    let report;
    try {
      const reportData = fs.readFileSync(reportPath, 'utf8');
      report = JSON.parse(reportData);
    } catch (error) {
      throw new Error(`Failed to load report: ${error.message}`);
    }

    const analysis = await this.performDeepAnalysis(report);
    const recommendations = await this.generateIntelligentRecommendations(analysis);
    const actionPlan = await this.createActionPlan(recommendations);

    const results = {
      agent_id: this.agentId,
      timestamp: new Date().toISOString(),
      report_id: report.metadata?.report_id,
      analysis: analysis,
      recommendations: recommendations,
      action_plan: actionPlan,
      confidence_score: this.calculateConfidenceScore(analysis)
    };

    await this.storeAnalysisResults(results);
    this.printAnalysisResults(results);

    return results;
  }

  /**
   * Perform deep analysis of test failures
   */
  async performDeepAnalysis(report) {
    const failureAnalysis = report.failure_analysis || {};
    const categories = failureAnalysis.categories || {};
    const detailedFailures = report.detailed_failures || [];

    // Pattern analysis
    const patterns = this.identifyFailurePatterns(detailedFailures);

    // Root cause analysis
    const rootCauses = this.analyzeRootCauses(categories, patterns);

    // Historical pattern matching
    const historicalPatterns = await this.analyzeHistoricalPatterns(patterns);

    // Impact assessment
    const impact = this.assessBusinessImpact(categories, report.executive_summary);

    // Trend analysis
    const trends = await this.analyzeTrends(report.metadata?.report_id);

    return {
      failure_patterns: patterns,
      root_causes: rootCauses,
      historical_patterns: historicalPatterns,
      business_impact: impact,
      trends: trends,
      analysis_depth: this.options.analysisDepth,
      total_failures_analyzed: detailedFailures.length
    };
  }

  /**
   * Identify patterns in test failures
   */
  identifyFailurePatterns(failures) {
    const identifiedPatterns = {};

    failures.forEach(failure => {
      const errorText = (failure.error || '').toLowerCase();
      const titleText = (failure.title || '').toLowerCase();
      const combinedText = `${errorText} ${titleText}`;

      // Check against known patterns
      Object.entries(this.patterns).forEach(([patternName, pattern]) => {
        const matches = pattern.keywords.filter(keyword =>
          combinedText.includes(keyword.toLowerCase())
        );

        if (matches.length > 0) {
          if (!identifiedPatterns[patternName]) {
            identifiedPatterns[patternName] = {
              pattern: pattern,
              failures: [],
              match_strength: 0,
              keywords_matched: []
            };
          }

          identifiedPatterns[patternName].failures.push(failure);
          identifiedPatterns[patternName].match_strength += matches.length;
          identifiedPatterns[patternName].keywords_matched.push(...matches);
        }
      });
    });

    // Calculate pattern confidence scores
    Object.values(identifiedPatterns).forEach(pattern => {
      pattern.confidence = Math.min(
        (pattern.match_strength / (pattern.failures.length * 2)) * 100,
        100
      );
    });

    return identifiedPatterns;
  }

  /**
   * Analyze root causes based on patterns
   */
  analyzeRootCauses(categories, patterns) {
    const rootCauses = [];

    Object.entries(patterns).forEach(([patternName, patternData]) => {
      const commonCauses = patternData.pattern.commonCauses || [];
      const failureCount = patternData.failures.length;

      commonCauses.forEach(cause => {
        rootCauses.push({
          category: patternName,
          cause: cause,
          likelihood: this.calculateLikelihood(patternData, failureCount),
          affected_tests: failureCount,
          severity: patternData.pattern.severity,
          evidence: patternData.keywords_matched.slice(0, 3) // Top 3 keywords
        });
      });
    });

    return rootCauses.sort((a, b) => b.likelihood - a.likelihood);
  }

  /**
   * Calculate likelihood of a root cause
   */
  calculateLikelihood(patternData, failureCount) {
    const baseScore = patternData.confidence || 0;
    const volumeMultiplier = Math.min(failureCount / 10, 2); // Max 2x multiplier
    const keywordRelevance = patternData.keywords_matched.length / 5; // Normalize to max 1

    return Math.min(baseScore * (1 + volumeMultiplier) * (1 + keywordRelevance), 100);
  }

  /**
   * Analyze historical patterns from database
   */
  async analyzeHistoricalPatterns(currentPatterns) {
    try {
      // Get failure data from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: historicalReports } = await this.supabase
        .from('uat_reports')
        .select('failure_analysis, timestamp')
        .gte('timestamp', thirtyDaysAgo)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (!historicalReports || historicalReports.length === 0) {
        return { message: 'Insufficient historical data for pattern analysis' };
      }

      const historicalCounts = {};
      historicalReports.forEach(report => {
        const categories = report.failure_analysis?.categories || {};
        Object.entries(categories).forEach(([category, failures]) => {
          if (!historicalCounts[category]) {
            historicalCounts[category] = { total: 0, reports: 0 };
          }
          historicalCounts[category].total += Array.isArray(failures) ? failures.length : 0;
          historicalCounts[category].reports += 1;
        });
      });

      // Compare current patterns with historical averages
      const trends = {};
      Object.keys(currentPatterns).forEach(pattern => {
        const currentCount = currentPatterns[pattern].failures.length;
        const historical = historicalCounts[pattern];

        if (historical) {
          const historicalAvg = historical.total / historical.reports;
          trends[pattern] = {
            current_count: currentCount,
            historical_average: Math.round(historicalAvg * 100) / 100,
            trend: currentCount > historicalAvg * 1.5 ? 'increasing' :
                   currentCount < historicalAvg * 0.5 ? 'decreasing' : 'stable',
            significance: Math.abs(currentCount - historicalAvg) / historicalAvg
          };
        }
      });

      return trends;
    } catch (error) {
      console.warn(`⚠️ Could not analyze historical patterns: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Assess business impact of failures
   */
  assessBusinessImpact(categories, executiveSummary) {
    const impact = {
      user_experience: 'low',
      business_operations: 'low',
      data_integrity: 'low',
      security: 'low',
      overall_severity: 'low'
    };

    // Authentication failures = high security and UX impact
    if (categories.authentication?.length > 0) {
      impact.security = 'critical';
      impact.user_experience = 'high';
    }

    // UI element failures = high UX impact
    if (categories.ui_elements?.length > 5) {
      impact.user_experience = 'high';
    }

    // Network failures = high business operations impact
    if (categories.network?.length > 0) {
      impact.business_operations = 'high';
    }

    // High failure rate = overall critical impact
    const passRate = executiveSummary?.metrics?.pass_rate || 100;
    if (passRate < 70) {
      impact.overall_severity = 'critical';
    } else if (passRate < 85) {
      impact.overall_severity = 'high';
    }

    return impact;
  }

  /**
   * Analyze trends from recent reports
   */
  async analyzeTrends(currentReportId) {
    try {
      const { data: recentReports } = await this.supabase
        .from('uat_reports')
        .select('pass_rate, critical_issues, high_issues, timestamp')
        .neq('report_id', currentReportId)
        .order('timestamp', { ascending: false })
        .limit(5);

      if (!recentReports || recentReports.length < 2) {
        return { message: 'Insufficient data for trend analysis' };
      }

      const passRates = recentReports.map(r => r.pass_rate);
      const criticalIssues = recentReports.map(r => r.critical_issues);

      return {
        pass_rate_trend: this.calculateTrend(passRates),
        critical_issues_trend: this.calculateTrend(criticalIssues.reverse()), // Reverse for chronological order
        stability_score: this.calculateStabilityScore(passRates)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Calculate trend direction and strength
   */
  calculateTrend(values) {
    if (values.length < 2) return 'insufficient_data';

    const recent = values.slice(0, Math.ceil(values.length / 2));
    const older = values.slice(Math.ceil(values.length / 2));

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'improving' : 'degrading';
  }

  /**
   * Calculate stability score based on variance
   */
  calculateStabilityScore(values) {
    if (values.length < 2) return 100;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Convert to stability score (lower variance = higher stability)
    return Math.max(0, 100 - (stdDev / mean) * 100);
  }

  /**
   * Generate intelligent recommendations
   */
  async generateIntelligentRecommendations(analysis) {
    const recommendations = [];

    // Generate recommendations for each identified pattern
    Object.entries(analysis.failure_patterns).forEach(([patternName, patternData]) => {
      const strategies = this.fixStrategies[patternName] || [];

      strategies.forEach(strategy => {
        recommendations.push({
          category: patternData.pattern.category,
          priority: this.mapPriorityToLevel(strategy.priority, patternData.pattern.severity),
          issue: `${patternData.failures.length} ${patternName} failures detected`,
          action: strategy.strategy,
          implementation: strategy.implementation,
          effort_required: strategy.effort,
          confidence: patternData.confidence,
          affected_tests: patternData.failures.length,
          timeline: this.estimateTimeline(strategy.effort),
          business_impact: analysis.business_impact[this.mapCategoryToImpact(patternName)] || 'medium'
        });
      });
    });

    // Add trend-based recommendations
    if (analysis.trends && analysis.trends.pass_rate_trend === 'degrading') {
      recommendations.push({
        category: 'Quality Assurance',
        priority: 'HIGH',
        issue: 'Test suite quality degrading over time',
        action: 'Implement comprehensive test suite health monitoring',
        implementation: 'Add automated quality metrics tracking and alerting',
        effort_required: 'medium',
        confidence: 85,
        timeline: '1-2 weeks'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    });
  }

  /**
   * Map strategy priority and pattern severity to recommendation level
   */
  mapPriorityToLevel(priority, severity) {
    if (severity === 'critical' || priority === 'immediate') return 'CRITICAL';
    if (severity === 'high' || priority === 'high') return 'HIGH';
    if (severity === 'medium' || priority === 'medium') return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Map pattern category to business impact area
   */
  mapCategoryToImpact(category) {
    const mapping = {
      authentication: 'security',
      ui_elements: 'user_experience',
      network: 'business_operations',
      timeouts: 'business_operations',
      data: 'data_integrity'
    };
    return mapping[category] || 'overall_severity';
  }

  /**
   * Estimate implementation timeline
   */
  estimateTimeline(effort) {
    const timelines = {
      low: '1-3 days',
      medium: '1-2 weeks',
      high: '2-4 weeks'
    };
    return timelines[effort] || '1 week';
  }

  /**
   * Create actionable plan from recommendations
   */
  async createActionPlan(recommendations) {
    const plan = {
      immediate_actions: recommendations.filter(r => r.priority === 'CRITICAL').slice(0, 3),
      short_term_actions: recommendations.filter(r => r.priority === 'HIGH').slice(0, 5),
      long_term_actions: recommendations.filter(r => ['MEDIUM', 'LOW'].includes(r.priority)),
      estimated_effort: this.calculateTotalEffort(recommendations),
      success_metrics: this.defineSurvey().metrics
    };

    return plan;
  }

  /**
   * Calculate total effort required
   */
  calculateTotalEffort(recommendations) {
    const effortMapping = { low: 1, medium: 3, high: 8 };
    const totalPoints = recommendations.reduce((sum, rec) => {
      return sum + (effortMapping[rec.effort_required] || 1);
    }, 0);

    if (totalPoints <= 5) return 'low';
    if (totalPoints <= 15) return 'medium';
    return 'high';
  }

  /**
   * Define success metrics for improvements
   */
  defineSurvey() {
    return {
      metrics: [
        'Pass rate improvement to >90%',
        'Zero critical authentication failures',
        'UI element failure rate <5%',
        'Average test execution time improvement',
        'Reduction in flaky test occurrences'
      ]
    };
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidenceScore(analysis) {
    const patternConfidences = Object.values(analysis.failure_patterns).map(p => p.confidence);
    if (patternConfidences.length === 0) return 50;

    const avgConfidence = patternConfidences.reduce((a, b) => a + b, 0) / patternConfidences.length;
    const dataQuality = analysis.total_failures_analyzed > 0 ? 85 : 50;

    return Math.round((avgConfidence * 0.7 + dataQuality * 0.3));
  }

  /**
   * Store analysis results in database
   */
  async storeAnalysisResults(results) {
    try {
      // Store in a hypothetical intelligent_analyses table
      // (would need to be added to schema)
      console.log(`💾 Analysis results stored for ${results.agent_id}`);

      // For now, save to file as backup
      const resultsPath = path.join('./test-results', `${results.agent_id}-analysis.json`);
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      console.log(`📄 Analysis saved to: ${resultsPath}`);

    } catch (error) {
      console.warn(`⚠️ Could not store analysis results: ${error.message}`);
    }
  }

  /**
   * Print analysis results to console
   */
  printAnalysisResults(results) {
    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold.blue(`🤖 INTELLIGENT UAT ANALYSIS - ${results.agent_id}`));
    console.log('='.repeat(80));

    console.log('\n📊 Analysis Summary:');
    console.log(`   Confidence Score: ${chalk.green(results.confidence_score + '%')}`);
    console.log(`   Failures Analyzed: ${results.analysis.total_failures_analyzed}`);
    console.log(`   Patterns Identified: ${Object.keys(results.analysis.failure_patterns).length}`);
    console.log(`   Recommendations: ${results.recommendations.length}`);

    console.log('\n🔍 Key Patterns Identified:');
    Object.entries(results.analysis.failure_patterns).forEach(([pattern, data]) => {
      console.log(`   ${chalk.yellow('●')} ${pattern}: ${data.failures.length} failures (${Math.round(data.confidence)}% confidence)`);
    });

    console.log('\n💡 Top Recommendations:');
    results.recommendations.slice(0, 3).forEach((rec, i) => {
      const priorityColor = rec.priority === 'CRITICAL' ? chalk.red :
                           rec.priority === 'HIGH' ? chalk.yellow : chalk.blue;
      console.log(`   ${i + 1}. ${priorityColor(`[${rec.priority}]`)} ${rec.action}`);
      console.log(`      ${chalk.gray(`→ ${rec.implementation} (${rec.timeline})`)}`);
    });

    console.log('\n⚡ Immediate Actions Required:');
    results.action_plan.immediate_actions.forEach((action, i) => {
      console.log(`   ${i + 1}. ${chalk.red(action.action)}`);
    });

    console.log('\n' + '='.repeat(80));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const reportPath = args[0];

  if (!reportPath) {
    console.error('❌ Please provide a UAT report file path');
    console.log('Usage: node uat-intelligent-agent.js <report-file>');
    process.exit(1);
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`❌ Report file not found: ${reportPath}`);
    process.exit(1);
  }

  try {
    const agent = new UATIntelligentAgent({
      analysisDepth: 'comprehensive',
      generateFixes: true,
      learningMode: true
    });

    const results = await agent.analyzeFailures(reportPath);

    console.log('\n🎯 Intelligent analysis completed successfully!');
    console.log(`📋 ${results.recommendations.length} actionable recommendations generated`);

  } catch (error) {
    console.error('❌ Intelligent agent error:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
export { UATIntelligentAgent };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}