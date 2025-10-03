#!/usr/bin/env node

/**
 * UAT Quality Gate Checker
 *
 * Enforces quality gates for UAT test results
 * Can be used in CI/CD pipelines to fail builds that don't meet quality standards
 * Integrates with the UAT report generator and database tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseClient } from '../lib/supabase-client.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class QualityGateChecker {
  constructor(options = {}) {
    this.supabase = createSupabaseClient();
    this.options = {
      strictMode: options.strictMode || false,
      exitOnFailure: options.exitOnFailure !== false, // Default true
      logLevel: options.logLevel || 'info', // info, warn, error, debug
      ...options
    };

    // Quality gate thresholds (configurable)
    this.thresholds = {
      overall_pass_rate: {
        target: 85,
        critical: true,
        description: 'Overall test pass rate must be >= 85%'
      },
      authentication_failures: {
        target: 0,
        critical: true,
        description: 'Zero authentication failures allowed'
      },
      timeout_failures_pct: {
        target: 5,
        critical: false,
        description: 'Timeout failures must be <= 5% of total tests'
      },
      ui_element_failures_pct: {
        target: 10,
        critical: false,
        description: 'UI element failures must be <= 10% of total tests'
      },
      critical_issues: {
        target: 0,
        critical: true,
        description: 'Zero critical issues allowed'
      },
      high_issues: {
        target: 2,
        critical: false,
        description: 'High priority issues must be <= 2'
      },
      flaky_test_rate: {
        target: 3,
        critical: false,
        description: 'Flaky test rate must be <= 3%'
      },
      performance_budget_violations: {
        target: 0,
        critical: false,
        description: 'Performance budget violations must be zero'
      }
    };
  }

  /**
   * Load quality gate thresholds from configuration file
   */
  loadConfiguration(configPath) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.quality_gates) {
          this.thresholds = { ...this.thresholds, ...config.quality_gates };
          this.log('info', `✅ Loaded quality gate configuration from ${configPath}`);
        }
      }
    } catch (error) {
      this.log('warn', `⚠️ Could not load configuration from ${configPath}: ${error.message}`);
    }
  }

  /**
   * Check quality gates for a specific test report
   */
  async checkReport(reportPath) {
    this.log('info', `🔍 Checking quality gates for report: ${reportPath}`);

    let report;
    try {
      const reportData = fs.readFileSync(reportPath, 'utf8');
      report = JSON.parse(reportData);
    } catch (error) {
      this.logError(`❌ Failed to load report: ${error.message}`);
      return this.createResult(false, [], `Failed to load report: ${error.message}`);
    }

    return this.evaluateReport(report);
  }

  /**
   * Check quality gates for the latest database report
   */
  async checkLatestReport() {
    this.log('info', '🔍 Checking quality gates for latest database report');

    try {
      const { data: latestReport, error } = await this.supabase
        .from('uat_reports')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        this.logError(`❌ Failed to fetch latest report: ${error.message}`);
        return this.createResult(false, [], `Database error: ${error.message}`);
      }

      if (!latestReport) {
        this.logError('❌ No UAT reports found in database');
        return this.createResult(false, [], 'No reports available for quality gate checking');
      }

      return this.evaluateReport(latestReport.full_report);
    } catch (error) {
      this.logError(`❌ Database connection error: ${error.message}`);
      return this.createResult(false, [], `Database connection error: ${error.message}`);
    }
  }

  /**
   * Evaluate report against quality gates
   */
  evaluateReport(report) {
    const results = [];
    let overallPass = true;
    let criticalFailures = 0;

    // Extract metrics from report
    const metrics = this.extractMetrics(report);
    this.log('debug', 'Extracted metrics:', metrics);

    // Evaluate each quality gate
    for (const [gateName, threshold] of Object.entries(this.thresholds)) {
      const result = this.evaluateGate(gateName, threshold, metrics);
      results.push(result);

      if (!result.passed) {
        if (threshold.critical) {
          criticalFailures++;
          overallPass = false;
        } else if (this.options.strictMode) {
          overallPass = false;
        }
      }
    }

    const summary = {
      overall_pass: overallPass,
      critical_failures: criticalFailures,
      total_gates: results.length,
      gates_passed: results.filter(r => r.passed).length,
      gates_failed: results.filter(r => !r.passed).length
    };

    this.printResults(summary, results);

    return this.createResult(overallPass, results, null, summary);
  }

  /**
   * Extract metrics from report for gate evaluation
   */
  extractMetrics(report) {
    const executive = report.executive_summary || {};
    const metrics = executive.metrics || {};
    const failureAnalysis = report.failure_analysis || {};
    const categories = failureAnalysis.categories || {};

    return {
      total_tests: metrics.total_tests || 0,
      passed_tests: metrics.passed || 0,
      failed_tests: metrics.failed || 0,
      flaky_tests: metrics.flaky || 0,
      pass_rate: metrics.pass_rate || 0,

      // Failure categories
      authentication_failures: categories.authentication?.length || 0,
      ui_element_failures: categories.ui_elements?.length || 0,
      timeout_failures: categories.timeouts?.length || 0,
      network_failures: categories.network?.length || 0,

      // Issues
      critical_issues: executive.issues?.critical || 0,
      high_issues: executive.issues?.high || 0,
      medium_issues: executive.issues?.medium || 0,

      // Performance (if available)
      performance_violations: 0, // TODO: Extract from performance metrics

      // Quality gates status
      quality_gates_status: report.quality_gates?.overallGateStatus || 'UNKNOWN'
    };
  }

  /**
   * Evaluate a single quality gate
   */
  evaluateGate(gateName, threshold, metrics) {
    let currentValue;
    let passed = false;

    switch (gateName) {
      case 'overall_pass_rate':
        currentValue = metrics.pass_rate;
        passed = currentValue >= threshold.target;
        break;

      case 'authentication_failures':
        currentValue = metrics.authentication_failures;
        passed = currentValue <= threshold.target;
        break;

      case 'timeout_failures_pct':
        currentValue = metrics.total_tests > 0
          ? (metrics.timeout_failures / metrics.total_tests) * 100
          : 0;
        passed = currentValue <= threshold.target;
        break;

      case 'ui_element_failures_pct':
        currentValue = metrics.total_tests > 0
          ? (metrics.ui_element_failures / metrics.total_tests) * 100
          : 0;
        passed = currentValue <= threshold.target;
        break;

      case 'critical_issues':
        currentValue = metrics.critical_issues;
        passed = currentValue <= threshold.target;
        break;

      case 'high_issues':
        currentValue = metrics.high_issues;
        passed = currentValue <= threshold.target;
        break;

      case 'flaky_test_rate':
        currentValue = metrics.total_tests > 0
          ? (metrics.flaky_tests / metrics.total_tests) * 100
          : 0;
        passed = currentValue <= threshold.target;
        break;

      case 'performance_budget_violations':
        currentValue = metrics.performance_violations;
        passed = currentValue <= threshold.target;
        break;

      default:
        currentValue = 'UNKNOWN';
        passed = false;
        break;
    }

    return {
      gate_name: gateName,
      description: threshold.description,
      current_value: currentValue,
      target_value: threshold.target,
      passed: passed,
      critical: threshold.critical,
      variance: this.calculateVariance(currentValue, threshold.target)
    };
  }

  /**
   * Calculate percentage variance from target
   */
  calculateVariance(current, target) {
    if (typeof current !== 'number' || typeof target !== 'number') return null;
    if (target === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - target) / target) * 100);
  }

  /**
   * Print quality gate results to console
   */
  printResults(summary, results) {
    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold(`🚪 QUALITY GATE EVALUATION - ${summary.overall_pass ? chalk.green('PASS') : chalk.red('FAIL')}`));
    console.log('='.repeat(80));

    console.log(`\n📊 Summary:`);
    console.log(`   Total Gates: ${summary.total_gates}`);
    console.log(`   Passed: ${chalk.green(summary.gates_passed)}`);
    console.log(`   Failed: ${chalk.red(summary.gates_failed)}`);
    console.log(`   Critical Failures: ${chalk.red(summary.critical_failures)}`);

    console.log(`\n🔍 Gate Details:`);
    results.forEach(result => {
      const status = result.passed ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      const critical = result.critical ? chalk.red('[CRITICAL]') : chalk.yellow('[NON-CRITICAL]');
      const variance = result.variance !== null ? ` (${result.variance > 0 ? '+' : ''}${result.variance}%)` : '';

      console.log(`   ${status} ${critical} ${result.gate_name}`);
      console.log(`       Current: ${result.current_value} | Target: ${result.target_value}${variance}`);
      console.log(`       ${chalk.gray(result.description)}`);
    });

    console.log('\n' + '='.repeat(80));
  }

  /**
   * Store quality gate results in database
   */
  async storeResults(results, reportId = null) {
    if (!reportId) return;

    try {
      const gateRecords = results.map(result => ({
        report_id: reportId,
        gate_name: result.gate_name,
        gate_type: result.gate_name,
        current_value: typeof result.current_value === 'number' ? result.current_value : 0,
        target_value: result.target_value,
        status: result.passed ? 'PASS' : 'FAIL',
        is_critical: result.critical,
        variance_pct: result.variance
      }));

      const { error } = await this.supabase
        .from('uat_quality_gates_history')
        .insert(gateRecords);

      if (error) {
        this.log('warn', `⚠️ Could not store quality gate results: ${error.message}`);
      } else {
        this.log('info', `💾 Stored ${gateRecords.length} quality gate results`);
      }
    } catch (error) {
      this.log('warn', `⚠️ Error storing quality gate results: ${error.message}`);
    }
  }

  /**
   * Create standardized result object
   */
  createResult(passed, gates, error = null, summary = null) {
    return {
      timestamp: new Date().toISOString(),
      overall_pass: passed,
      gates: gates,
      error: error,
      summary: summary
    };
  }

  /**
   * Logging utility
   */
  log(level, message, data = null) {
    if (this.shouldLog(level)) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
      if (data && this.options.logLevel === 'debug') {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * Error logging
   */
  logError(message) {
    console.error(chalk.red(message));
  }

  /**
   * Check if should log at level
   */
  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.options.logLevel] || 1;
    const messageLevel = levels[level] || 1;
    return messageLevel >= currentLevel;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const options = {};
  let reportPath = null;
  let configPath = './uat-quality-gates.json';
  let useLatest = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--strict':
        options.strictMode = true;
        break;
      case '--no-exit':
        options.exitOnFailure = false;
        break;
      case '--config':
        configPath = args[++i];
        break;
      case '--latest':
        useLatest = true;
        break;
      case '--log-level':
        options.logLevel = args[++i];
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (!reportPath && !args[i].startsWith('--')) {
          reportPath = args[i];
        }
        break;
    }
  }

  // Validate arguments
  if (!useLatest && !reportPath) {
    console.error('❌ Either provide a report file path or use --latest flag');
    printUsage();
    process.exit(1);
  }

  if (reportPath && !fs.existsSync(reportPath)) {
    console.error(`❌ Report file not found: ${reportPath}`);
    process.exit(1);
  }

  try {
    const checker = new QualityGateChecker(options);

    // Load configuration if exists
    checker.loadConfiguration(configPath);

    // Run quality gate check
    const result = useLatest
      ? await checker.checkLatestReport()
      : await checker.checkReport(reportPath);

    // Handle results
    if (result.error) {
      console.error(`❌ Quality gate check failed: ${result.error}`);
      if (options.exitOnFailure) {
        process.exit(1);
      }
    }

    // Exit with appropriate code
    if (options.exitOnFailure) {
      const exitCode = result.overall_pass ? 0 : 1;
      console.log(`\n🎯 Quality Gate Check ${result.overall_pass ? 'PASSED' : 'FAILED'} - Exit Code: ${exitCode}`);
      process.exit(exitCode);
    }

  } catch (error) {
    console.error('❌ Quality gate checker error:', error.message);
    if (options.exitOnFailure) {
      process.exit(1);
    }
  }
}

function printUsage() {
  console.log(`
Usage: node uat-quality-gate-checker.js [OPTIONS] [REPORT_FILE]

Options:
  --latest              Check the latest report from database instead of file
  --strict              Fail on any gate failure (not just critical ones)
  --no-exit             Don't exit process on failure (for programmatic use)
  --config <path>       Path to quality gates configuration file
  --log-level <level>   Logging level: debug, info, warn, error (default: info)
  --help                Show this help message

Examples:
  node uat-quality-gate-checker.js ./test-results/UAT-2024-01-01T10-00-00.json
  node uat-quality-gate-checker.js --latest --strict
  node uat-quality-gate-checker.js --config ./custom-gates.json --latest

Configuration File (uat-quality-gates.json):
{
  "quality_gates": {
    "overall_pass_rate": { "target": 90, "critical": true },
    "authentication_failures": { "target": 0, "critical": true }
  }
}
`);
}

// Export for programmatic use
export { QualityGateChecker };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}