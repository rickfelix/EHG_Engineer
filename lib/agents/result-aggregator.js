#!/usr/bin/env node

/**
 * Result Aggregator for Parallel Sub-Agent Execution
 *
 * Aggregates results from multiple sub-agents with:
 * - Conflict resolution (Security > Database > Testing > Performance > Design)
 * - Confidence scoring
 * - Final verdict calculation (PASS/FAIL/CONDITIONAL_PASS/ESCALATE)
 * - Unified verification report generation
 *
 * Usage:
 *   import ResultAggregator from './lib/agents/result-aggregator.js';
 *   const aggregator = new ResultAggregator();
 *   const report = await aggregator.aggregate(results, context);
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class ResultAggregator {
  constructor() {
    // SD-VENTURE-STAGE0-UI-001: Use SERVICE_ROLE_KEY to bypass RLS on sub_agent_execution_batches
    // The table has RLS policies that only allow service_role for INSERT/UPDATE
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Priority order for conflict resolution
    this.priorityOrder = {
      'SECURITY': 100,
      'DATABASE': 90,
      'TESTING': 80,
      'PERFORMANCE': 70,
      'DESIGN': 60,
      'API': 50,
      'DOCUMENTATION': 40,
      'COST': 30,
      'DEPENDENCY': 20,
      'VALIDATION': 85  // High priority for systems analyst
    };

    // Minimum confidence thresholds
    this.confidenceThresholds = {
      PASS: 85,
      CONDITIONAL_PASS: 70,
      FAIL: 0
    };
  }

  /**
   * Aggregate results from multiple sub-agents
   */
  async aggregate(results, context = {}) {
    console.log(`\n📊 Result Aggregator: Processing ${results.length} sub-agent results`);

    // Separate successful and failed executions
    const successful = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status !== 'completed');

    console.log(`   ✅ Successful: ${successful.length}`);
    console.log(`   ❌ Failed: ${failed.length}\n`);

    // Extract results data
    const resultsData = successful.map(r => ({
      agentCode: r.agentCode,
      agentId: r.agentId,
      priority: this.priorityOrder[r.agentCode] || 50,
      ...r.results
    }));

    // Check for critical agent failures
    const criticalFailures = this.checkCriticalFailures(failed);
    if (criticalFailures.length > 0) {
      return this.createFailureReport(criticalFailures, results, context);
    }

    // Resolve conflicts
    const resolvedResults = this.resolveConflicts(resultsData);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(resolvedResults);

    // Determine verdict
    const verdict = this.determineVerdict(resolvedResults, confidence, failed);

    // Extract key findings
    const keyFindings = this.extractKeyFindings(resolvedResults);

    // Generate unified report
    const report = {
      verdict,
      confidence,
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(resolvedResults, verdict, confidence),
      statistics: {
        totalAgents: results.length,
        successfulAgents: successful.length,
        failedAgents: failed.length,
        criticalIssues: keyFindings.critical.length,
        warnings: keyFindings.warnings.length
      },
      keyFindings,
      resolvedResults,
      failedAgents: failed.map(f => ({ code: f.agentCode, reason: f.error })),
      recommendations: this.generateRecommendations(resolvedResults, verdict),
      metadata: {
        context,
        aggregatedAt: new Date().toISOString(),
        conflictsResolved: resolvedResults.filter(r => r.conflictResolved).length
      }
    };

    // Store in database
    if (context.batchId) {
      await this.updateBatchWithResults(context.batchId, report);
    }

    console.log('\n📋 Aggregation Complete:');
    console.log(`   Verdict: ${verdict}`);
    console.log(`   Confidence: ${confidence}%`);
    console.log(`   Critical Issues: ${keyFindings.critical.length}`);
    console.log(`   Warnings: ${keyFindings.warnings.length}\n`);

    return report;
  }

  /**
   * Check for critical agent failures
   */
  checkCriticalFailures(failed) {
    const criticalAgents = ['SECURITY', 'DATABASE'];
    return failed.filter(f => criticalAgents.includes(f.agentCode));
  }

  /**
   * Resolve conflicts between sub-agent results
   */
  resolveConflicts(resultsData) {
    // Group results by topic/area
    const byTopic = this.groupByTopic(resultsData);

    const resolved = [];

    for (const [topic, agentResults] of Object.entries(byTopic)) {
      if (agentResults.length === 1) {
        // No conflict
        resolved.push(agentResults[0]);
      } else {
        // Conflict - use priority order
        const sorted = agentResults.sort((a, b) => b.priority - a.priority);
        const winner = sorted[0];

        winner.conflictResolved = true;
        winner.conflictDetails = {
          topic,
          conflictingAgents: sorted.slice(1).map(a => a.agentCode),
          reason: `${winner.agentCode} has higher priority (${winner.priority})`
        };

        resolved.push(winner);
      }
    }

    return resolved;
  }

  /**
   * Group results by topic (heuristic based on content)
   */
  groupByTopic(resultsData) {
    // Simple grouping: all results go to 'verification' topic
    // In production, this would be more sophisticated
    return {
      'verification': resultsData
    };
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(resolvedResults) {
    if (resolvedResults.length === 0) return 0;

    // Weighted average based on priority
    const totalWeight = resolvedResults.reduce((sum, r) => sum + r.priority, 0);
    const weightedSum = resolvedResults.reduce((sum, r) => {
      const confidence = r.confidence || 80; // Default 80% if not provided
      return sum + (confidence * r.priority);
    }, 0);

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Determine final verdict
   */
  determineVerdict(resolvedResults, confidence, failed) {
    // Check for critical issues
    const hasCriticalIssues = resolvedResults.some(r =>
      r.critical_issues && r.critical_issues.length > 0
    );

    // Check for failed critical agents
    const criticalAgentsFailed = failed.some(f =>
      ['SECURITY', 'DATABASE'].includes(f.agentCode)
    );

    if (criticalAgentsFailed) {
      return 'ESCALATE';
    }

    if (hasCriticalIssues) {
      return 'FAIL';
    }

    if (confidence >= this.confidenceThresholds.PASS && failed.length === 0) {
      return 'PASS';
    }

    if (confidence >= this.confidenceThresholds.CONDITIONAL_PASS) {
      return 'CONDITIONAL_PASS';
    }

    if (failed.length > resolvedResults.length * 0.3) {
      // More than 30% failed
      return 'ESCALATE';
    }

    return 'FAIL';
  }

  /**
   * Extract key findings from results
   */
  extractKeyFindings(resolvedResults) {
    const critical = [];
    const warnings = [];
    const passed = [];

    for (const result of resolvedResults) {
      // Extract critical issues
      if (result.critical_issues && result.critical_issues.length > 0) {
        critical.push(...result.critical_issues.map(issue => ({
          agent: result.agentCode,
          issue: issue.issue || issue,
          severity: issue.severity || 'critical'
        })));
      }

      // Extract warnings
      if (result.status === 'warning' || result.status === 'warn') {
        warnings.push({
          agent: result.agentCode,
          message: result.message || 'Warning detected',
          recommendations: result.recommendations || []
        });
      }

      // Track passes
      if (result.status === 'passed' || result.status === 'pass') {
        passed.push({
          agent: result.agentCode,
          confidence: result.confidence || 80
        });
      }
    }

    return { critical, warnings, passed };
  }

  /**
   * Generate natural language summary
   */
  generateSummary(resolvedResults, verdict, confidence) {
    const passCount = resolvedResults.filter(r => r.status === 'passed' || r.status === 'pass').length;
    const failCount = resolvedResults.filter(r => r.status === 'failed' || r.status === 'fail').length;
    const warnCount = resolvedResults.filter(r => r.status === 'warning' || r.status === 'warn').length;

    let summary = `Parallel verification completed with ${passCount} passed, ${failCount} failed, and ${warnCount} warnings. `;

    switch (verdict) {
      case 'PASS':
        summary += `All requirements met with ${confidence}% confidence. Ready for approval.`;
        break;
      case 'CONDITIONAL_PASS':
        summary += `Most requirements met (${confidence}% confidence), but manual review recommended for warnings.`;
        break;
      case 'FAIL':
        summary += 'Critical issues detected. Implementation does not meet requirements.';
        break;
      case 'ESCALATE':
        summary += 'Unable to determine completion status. Escalating to LEAD for decision.';
        break;
    }

    return summary;
  }

  /**
   * Generate recommendations based on results
   */
  generateRecommendations(resolvedResults, verdict) {
    const recommendations = [];

    // Aggregate all recommendations from sub-agents
    for (const result of resolvedResults) {
      if (result.recommendations && result.recommendations.length > 0) {
        recommendations.push({
          agent: result.agentCode,
          priority: result.priority,
          items: result.recommendations
        });
      }
    }

    // Sort by priority
    recommendations.sort((a, b) => b.priority - a.priority);

    // Add verdict-specific recommendations
    if (verdict === 'FAIL') {
      recommendations.unshift({
        agent: 'AGGREGATOR',
        priority: 100,
        items: ['Address all critical issues before proceeding', 'Re-run verification after fixes']
      });
    } else if (verdict === 'CONDITIONAL_PASS') {
      recommendations.unshift({
        agent: 'AGGREGATOR',
        priority: 90,
        items: ['Review warnings with LEAD', 'Document accepted risks if proceeding']
      });
    } else if (verdict === 'ESCALATE') {
      recommendations.unshift({
        agent: 'AGGREGATOR',
        priority: 100,
        items: ['LEAD review required', 'Investigate failed critical agents']
      });
    }

    return recommendations;
  }

  /**
   * Create failure report for critical agent failures
   */
  createFailureReport(criticalFailures, allResults, context) {
    return {
      verdict: 'ESCALATE',
      confidence: 0,
      timestamp: new Date().toISOString(),
      summary: `Critical agent failures detected: ${criticalFailures.map(f => f.agentCode).join(', ')}. Unable to complete verification.`,
      statistics: {
        totalAgents: allResults.length,
        successfulAgents: allResults.filter(r => r.status === 'completed').length,
        failedAgents: allResults.filter(r => r.status !== 'completed').length,
        criticalIssues: criticalFailures.length,
        warnings: 0
      },
      keyFindings: {
        critical: criticalFailures.map(f => ({
          agent: f.agentCode,
          issue: `Agent execution failed: ${f.error}`,
          severity: 'critical'
        })),
        warnings: [],
        passed: []
      },
      resolvedResults: [],
      failedAgents: allResults.filter(r => r.status !== 'completed').map(f => ({
        code: f.agentCode,
        reason: f.error
      })),
      recommendations: [
        {
          agent: 'AGGREGATOR',
          priority: 100,
          items: [
            'Investigate critical agent failures',
            'Check sub-agent configuration',
            'Retry verification after fixing issues',
            'Escalate to LEAD if issues persist'
          ]
        }
      ],
      metadata: {
        context,
        aggregatedAt: new Date().toISOString(),
        criticalFailure: true
      }
    };
  }

  /**
   * Update execution batch with aggregated results
   */
  async updateBatchWithResults(batchId, report) {
    const { error } = await this.supabase
      .from('sub_agent_execution_batches')
      .update({
        aggregated_results: report,
        confidence_score: report.confidence,
        final_verdict: report.verdict
      })
      .eq('id', batchId);

    if (error) {
      console.error('Failed to update batch with results:', error);
    }
  }
}

export default ResultAggregator;