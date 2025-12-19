#!/usr/bin/env node

/**
 * UAT Report Generator
 *
 * Generates comprehensive structured JSON reports from Playwright test results
 * Provides executive summaries, failure analysis, and quality gate compliance
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UATReportGenerator {
  constructor() {
    this.supabase = createSupabaseServiceClient();
    this.reportId = `UAT-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}`;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Parse Playwright JSON results
   */
  parsePlaywrightResults(resultsPath) {
    try {
      const rawResults = fs.readFileSync(resultsPath, 'utf8');
      return JSON.parse(rawResults);
    } catch (error) {
      console.error(`Failed to parse results from ${resultsPath}:`, error.message);
      return null;
    }
  }

  /**
   * Analyze test failures and categorize them
   */
  analyzeFailures(tests) {
    const failures = tests.filter(test => test.outcome === 'unexpected');

    const categories = {
      authentication: [],
      ui_elements: [],
      timeouts: [],
      network: [],
      assertions: [],
      other: []
    };

    failures.forEach(test => {
      const error = test.errors?.[0]?.message || '';
      const title = test.title || '';

      if (error.includes('login') || error.includes('auth') || title.includes('redirect')) {
        categories.authentication.push(test);
      } else if (error.includes('toBeVisible') || error.includes('not found')) {
        categories.ui_elements.push(test);
      } else if (error.includes('timeout') || error.includes('Timeout')) {
        categories.timeouts.push(test);
      } else if (error.includes('network') || error.includes('502') || error.includes('503')) {
        categories.network.push(test);
      } else if (error.includes('expect') || error.includes('toHaveURL')) {
        categories.assertions.push(test);
      } else {
        categories.other.push(test);
      }
    });

    return categories;
  }

  /**
   * Calculate quality gates compliance
   */
  calculateQualityGates(stats, failureCategories) {
    const totalTests = stats.expected + stats.unexpected + stats.flaky;
    const passRate = (stats.expected / totalTests) * 100;

    const gates = {
      overall_pass_rate: {
        current: passRate,
        target: 85,
        status: passRate >= 85 ? 'PASS' : 'FAIL',
        critical: true
      },
      authentication_failures: {
        current: failureCategories.authentication.length,
        target: 0,
        status: failureCategories.authentication.length === 0 ? 'PASS' : 'FAIL',
        critical: true
      },
      timeout_failures: {
        current: failureCategories.timeouts.length,
        target: Math.floor(totalTests * 0.05), // 5% threshold
        status: failureCategories.timeouts.length <= Math.floor(totalTests * 0.05) ? 'PASS' : 'FAIL',
        critical: false
      },
      ui_element_failures: {
        current: failureCategories.ui_elements.length,
        target: Math.floor(totalTests * 0.1), // 10% threshold
        status: failureCategories.ui_elements.length <= Math.floor(totalTests * 0.1) ? 'PASS' : 'FAIL',
        critical: false
      }
    };

    const criticalGatesFailed = Object.values(gates).filter(gate => gate.critical && gate.status === 'FAIL').length;
    const overallGateStatus = criticalGatesFailed === 0 ? 'PASS' : 'FAIL';

    return { gates, overallGateStatus, criticalGatesFailed };
  }

  /**
   * Generate recommendations based on failure analysis
   */
  generateRecommendations(failureCategories, qualityGates) {
    const recommendations = [];

    if (failureCategories.authentication.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Authentication',
        issue: `${failureCategories.authentication.length} authentication-related failures`,
        action: 'Review authentication setup and user session management',
        impact: 'Blocks all protected route testing'
      });
    }

    if (failureCategories.ui_elements.length > qualityGates.gates.ui_element_failures.target) {
      recommendations.push({
        priority: 'HIGH',
        category: 'UI Elements',
        issue: `${failureCategories.ui_elements.length} UI element selection failures`,
        action: 'Update test selectors to match actual application UI',
        impact: 'Prevents functional testing of user interactions'
      });
    }

    if (failureCategories.timeouts.length > qualityGates.gates.timeout_failures.target) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Performance',
        issue: `${failureCategories.timeouts.length} timeout failures`,
        action: 'Increase wait times or implement intelligent wait strategies',
        impact: 'Tests may fail due to slow loading rather than actual issues'
      });
    }

    if (qualityGates.gates.overall_pass_rate.current < 70) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Test Quality',
        issue: `Overall pass rate ${qualityGates.gates.overall_pass_rate.current.toFixed(1)}% is below 70%`,
        action: 'Major test suite revision required - review test design and application readiness',
        impact: 'Test suite may not be suitable for quality assurance'
      });
    }

    return recommendations;
  }

  /**
   * Create executive summary
   */
  createExecutiveSummary(stats, qualityGates, recommendations) {
    const totalTests = stats.expected + stats.unexpected + stats.flaky;
    const passRate = (stats.expected / totalTests) * 100;

    const criticalIssues = recommendations.filter(r => r.priority === 'CRITICAL').length;
    const highIssues = recommendations.filter(r => r.priority === 'HIGH').length;

    let overallStatus = 'PASS';
    let summary = 'UAT execution completed successfully with acceptable quality metrics.';

    if (qualityGates.criticalGatesFailed > 0) {
      overallStatus = 'FAIL';
      summary = `UAT execution failed with ${qualityGates.criticalGatesFailed} critical quality gate violations.`;
    } else if (passRate < 85) {
      overallStatus = 'WARNING';
      summary = `UAT execution completed with warnings. Pass rate ${passRate.toFixed(1)}% is below target 85%.`;
    }

    return {
      status: overallStatus,
      summary,
      metrics: {
        total_tests: totalTests,
        passed: stats.expected,
        failed: stats.unexpected,
        flaky: stats.flaky,
        pass_rate: Math.round(passRate * 100) / 100
      },
      quality_gates: {
        overall_status: qualityGates.overallGateStatus,
        critical_failures: qualityGates.criticalGatesFailed,
        gates_passed: Object.values(qualityGates.gates).filter(g => g.status === 'PASS').length,
        gates_total: Object.keys(qualityGates.gates).length
      },
      issues: {
        critical: criticalIssues,
        high: highIssues,
        total_recommendations: recommendations.length
      }
    };
  }

  /**
   * Generate comprehensive UAT report
   */
  async generateReport(resultsPath) {
    console.log(`🔍 Generating UAT Report: ${this.reportId}`);

    const results = this.parsePlaywrightResults(resultsPath);
    if (!results) {
      throw new Error('Failed to parse test results');
    }

    // Extract test data
    const tests = results.suites?.flatMap(suite => suite.specs?.flatMap(spec => spec.tests)) || [];
    const stats = results.stats || {};

    // Analyze failures
    const failureCategories = this.analyzeFailures(tests);

    // Calculate quality gates
    const qualityGates = this.calculateQualityGates(stats, failureCategories);

    // Generate recommendations
    const recommendations = this.generateRecommendations(failureCategories, qualityGates);

    // Create executive summary
    const executiveSummary = this.createExecutiveSummary(stats, qualityGates, recommendations);

    // Build comprehensive report
    const report = {
      metadata: {
        report_id: this.reportId,
        timestamp: this.timestamp,
        version: '1.0.0',
        generator: 'UAT Report Generator',
        test_framework: 'Playwright'
      },
      executive_summary: executiveSummary,
      quality_gates: qualityGates,
      test_results: {
        statistics: stats,
        total_tests: tests.length,
        duration_ms: results.stats?.duration || 0,
        by_outcome: {
          passed: tests.filter(t => t.outcome === 'expected').length,
          failed: tests.filter(t => t.outcome === 'unexpected').length,
          flaky: tests.filter(t => t.outcome === 'flaky').length,
          skipped: tests.filter(t => t.outcome === 'skipped').length
        }
      },
      failure_analysis: {
        categories: failureCategories,
        total_failures: Object.values(failureCategories).reduce((sum, cat) => sum + cat.length, 0),
        failure_rate: ((stats.unexpected || 0) / (tests.length || 1)) * 100
      },
      recommendations: recommendations,
      detailed_failures: tests
        .filter(test => test.outcome === 'unexpected')
        .map(test => ({
          title: test.title,
          file: test.location?.file || 'unknown',
          line: test.location?.line || 0,
          error: test.errors?.[0]?.message || 'Unknown error',
          duration: test.results?.[0]?.duration || 0,
          category: this.categorizeFailure(test, failureCategories)
        }))
    };

    return report;
  }

  /**
   * Categorize a single failure
   */
  categorizeFailure(test, categories) {
    for (const [category, tests] of Object.entries(categories)) {
      if (tests.includes(test)) {
        return category;
      }
    }
    return 'other';
  }

  /**
   * Save report to file system
   */
  async saveReport(report, outputDir = './test-results') {
    const reportPath = path.join(outputDir, `${this.reportId}.json`);
    const summaryPath = path.join(outputDir, `${this.reportId}-summary.json`);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Save full report
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Save executive summary
    fs.writeFileSync(summaryPath, JSON.stringify({
      report_id: this.reportId,
      timestamp: this.timestamp,
      executive_summary: report.executive_summary,
      quality_gates: {
        overall_status: report.quality_gates.overallGateStatus,
        critical_failures: report.quality_gates.criticalGatesFailed
      },
      recommendations: report.recommendations.filter(r => r.priority === 'CRITICAL')
    }, null, 2));

    console.log(`📄 Report saved: ${reportPath}`);
    console.log(`📄 Summary saved: ${summaryPath}`);

    return { reportPath, summaryPath };
  }

  /**
   * Store report in database using the comprehensive schema
   */
  async storeInDatabase(report) {
    try {
      // First, try to find or create a test run record
      let runId = null;

      // Try to find existing run based on timestamp (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: existingRuns } = await this.supabase
        .from('uat_test_runs')
        .select('id')
        .gte('started_at', oneHourAgo)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1);

      if (existingRuns && existingRuns.length > 0) {
        runId = existingRuns[0].id;
      } else {
        // Create a new test run record
        const { data: newRun, error: runError } = await this.supabase
          .from('uat_test_runs')
          .insert({
            run_id: this.reportId,
            environment: 'dev',
            browser: 'chromium',
            status: 'completed',
            total_tests: report.executive_summary.metrics.total_tests,
            passed_tests: report.executive_summary.metrics.passed,
            failed_tests: report.executive_summary.metrics.failed,
            pass_rate: report.executive_summary.metrics.pass_rate,
            started_at: this.timestamp,
            completed_at: this.timestamp,
            duration_ms: report.test_results.duration_ms || 0,
            triggered_by: 'uat-report-generator'
          })
          .select('id')
          .single();

        if (runError) {
          console.warn('⚠️ Could not create test run record:', runError.message);
        } else {
          runId = newRun.id;
        }
      }

      // Store the comprehensive report
      const { data, error } = await this.supabase
        .from('uat_reports')
        .insert({
          report_id: this.reportId,
          run_id: runId,
          timestamp: this.timestamp,
          executive_summary: report.executive_summary,
          quality_gates: report.quality_gates,
          test_statistics: report.test_results,
          failure_analysis: report.failure_analysis,
          recommendations: report.recommendations,
          full_report: report,
          total_tests: report.executive_summary.metrics.total_tests,
          passed_tests: report.executive_summary.metrics.passed,
          failed_tests: report.executive_summary.metrics.failed,
          flaky_tests: report.executive_summary.metrics.flaky || 0,
          pass_rate: report.executive_summary.metrics.pass_rate,
          duration_ms: report.test_results.duration_ms || 0,
          overall_gate_status: report.quality_gates.overallGateStatus,
          critical_gate_failures: report.quality_gates.criticalGatesFailed,
          gates_passed: report.executive_summary.quality_gates.gates_passed,
          gates_total: report.executive_summary.quality_gates.gates_total,
          critical_issues: report.executive_summary.issues.critical,
          high_issues: report.executive_summary.issues.high,
          total_recommendations: report.recommendations.length
        });

      if (error) {
        console.error('❌ Failed to store report in database:', error.message);
        return false;
      }

      console.log(`💾 Report stored in database: ${this.reportId}`);

      // Store individual recommendations if report was saved successfully
      if (data && report.recommendations.length > 0) {
        await this.storeRecommendations(data[0]?.id || null, report.recommendations);
      }

      return true;
    } catch (error) {
      console.error('❌ Database storage error:', error.message);
      return false;
    }
  }

  /**
   * Store individual recommendations in the database
   */
  async storeRecommendations(reportId, recommendations) {
    if (!reportId) return;

    try {
      const recommendationRecords = recommendations.map((rec, index) => ({
        report_id: reportId,
        priority: rec.priority,
        category: rec.category,
        issue: rec.issue,
        action: rec.action,
        impact: rec.impact,
        recommendation_order: index + 1
      }));

      const { error } = await this.supabase
        .from('uat_report_recommendations')
        .insert(recommendationRecords);

      if (error) {
        console.warn('⚠️ Could not store recommendations:', error.message);
      } else {
        console.log(`📋 Stored ${recommendations.length} recommendations`);
      }
    } catch (error) {
      console.warn('⚠️ Error storing recommendations:', error.message);
    }
  }

  /**
   * Print summary to console
   */
  printSummary(report) {
    const summary = report.executive_summary;

    console.log('\n' + '='.repeat(80));
    console.log(`🎯 UAT EXECUTION REPORT - ${summary.status}`);
    console.log('='.repeat(80));

    console.log('\n📊 Test Results:');
    console.log(`   Total Tests: ${summary.metrics.total_tests}`);
    console.log(`   Passed: ${summary.metrics.passed} (${summary.metrics.pass_rate}%)`);
    console.log(`   Failed: ${summary.metrics.failed}`);
    console.log(`   Flaky: ${summary.metrics.flaky}`);

    console.log('\n🚪 Quality Gates:');
    console.log(`   Status: ${summary.quality_gates.overall_status}`);
    console.log(`   Passed: ${summary.quality_gates.gates_passed}/${summary.quality_gates.gates_total}`);
    console.log(`   Critical Failures: ${summary.quality_gates.critical_failures}`);

    console.log('\n🔧 Issues:');
    console.log(`   Critical: ${summary.issues.critical}`);
    console.log(`   High: ${summary.issues.high}`);
    console.log(`   Recommendations: ${summary.issues.total_recommendations}`);

    if (report.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      report.recommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`   ${i + 1}. [${rec.priority}] ${rec.action}`);
      });
    }

    console.log('\n' + '='.repeat(80));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const resultsPath = args[0] || './test-results/results.json';
  const outputDir = args[1] || './test-results';

  if (!fs.existsSync(resultsPath)) {
    console.error(`❌ Results file not found: ${resultsPath}`);
    console.log('Usage: node uat-report-generator.js <results.json> [output-dir]');
    process.exit(1);
  }

  try {
    const generator = new UATReportGenerator();
    const report = await generator.generateReport(resultsPath);

    // Save to file system
    await generator.saveReport(report, outputDir);

    // Store in database
    await generator.storeInDatabase(report);

    // Print summary
    generator.printSummary(report);

    // Set exit code based on quality gates
    const exitCode = report.quality_gates.overallGateStatus === 'PASS' ? 0 : 1;
    process.exit(exitCode);

  } catch (error) {
    console.error('❌ Report generation failed:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
export { UATReportGenerator };

// Run if called directly
if (process.argv[1] === __filename) {
  main();
}