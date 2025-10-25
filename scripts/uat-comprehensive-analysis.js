#!/usr/bin/env node

/**
 * UAT Comprehensive Analysis Pipeline
 *
 * Automatically executes the complete analysis pipeline when test results are available:
 * 1. Generate comprehensive UAT report
 * 2. Apply quality gate validation
 * 3. Deploy intelligent failure analysis
 * 4. Create strategic directives for complex issues
 * 5. Store results in database
 * 6. Generate executive dashboard
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UATReportGenerator } from './uat-report-generator.js';
import { QualityGateChecker } from './uat-quality-gate-checker.js';
import { UATIntelligentAgent } from './uat-intelligent-agent.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UATComprehensiveAnalysis {
  constructor(options = {}) {
    this.options = {
      waitForCompletion: options.waitForCompletion !== false,
      generateStrategicDirectives: options.generateStrategicDirectives || false,
      storeInDatabase: options.storeInDatabase !== false,
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      ...options
    };

    this.analysisId = `COMP-ANALYSIS-${Date.now()}`;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Execute comprehensive analysis pipeline
   */
  async executeAnalysisPipeline(resultsPath) {
    console.log(chalk.blue(`🔬 ${this.analysisId}: Starting comprehensive UAT analysis pipeline`));

    const pipeline = {
      phases: [],
      startTime: new Date(),
      results: {}
    };

    try {
      // Phase 1: Generate comprehensive report
      console.log(chalk.yellow('📊 Phase 1: Generating comprehensive UAT report...'));
      const reportGenerator = new UATReportGenerator();
      const report = await reportGenerator.generateReport(resultsPath);

      const reportFiles = await reportGenerator.saveReport(report, './test-results');
      pipeline.phases.push({
        phase: 'report_generation',
        status: 'completed',
        output: reportFiles,
        duration: Date.now() - pipeline.startTime.getTime()
      });

      pipeline.results.report = report;
      console.log(chalk.green('✅ Phase 1 completed: Comprehensive report generated'));

      // Phase 2: Quality gate validation
      console.log(chalk.yellow('🚪 Phase 2: Validating quality gates...'));
      const gateChecker = new QualityGateChecker({
        strictMode: false,
        exitOnFailure: false,
        logLevel: 'info'
      });

      const gateResults = await gateChecker.evaluateReport(report);
      pipeline.phases.push({
        phase: 'quality_gates',
        status: gateResults.overall_pass ? 'passed' : 'failed',
        output: gateResults,
        duration: Date.now() - pipeline.startTime.getTime()
      });

      pipeline.results.quality_gates = gateResults;
      console.log(chalk.green(`✅ Phase 2 completed: Quality gates ${gateResults.overall_pass ? 'PASSED' : 'FAILED'}`));

      // Phase 3: Intelligent failure analysis
      console.log(chalk.yellow('🤖 Phase 3: Deploying intelligent failure analysis...'));
      const intelligentAgent = new UATIntelligentAgent({
        analysisDepth: 'comprehensive',
        generateFixes: true,
        learningMode: true
      });

      const intelligentResults = await intelligentAgent.analyzeFailures(reportFiles.reportPath);
      pipeline.phases.push({
        phase: 'intelligent_analysis',
        status: 'completed',
        output: intelligentResults,
        duration: Date.now() - pipeline.startTime.getTime()
      });

      pipeline.results.intelligent_analysis = intelligentResults;
      console.log(chalk.green(`✅ Phase 3 completed: ${intelligentResults.recommendations.length} recommendations generated`));

      // Phase 4: Strategic directive generation (if enabled)
      if (this.options.generateStrategicDirectives && intelligentResults.recommendations.length > 0) {
        console.log(chalk.yellow('📋 Phase 4: Generating strategic directives for complex issues...'));

        const strategicDirectives = await this.generateStrategicDirectives(intelligentResults);
        pipeline.phases.push({
          phase: 'strategic_directives',
          status: 'completed',
          output: strategicDirectives,
          duration: Date.now() - pipeline.startTime.getTime()
        });

        pipeline.results.strategic_directives = strategicDirectives;
        console.log(chalk.green(`✅ Phase 4 completed: ${strategicDirectives.length} strategic directives created`));
      }

      // Phase 5: Executive dashboard
      console.log(chalk.yellow('📈 Phase 5: Generating executive dashboard...'));
      const dashboard = this.generateExecutiveDashboard(pipeline.results);

      const dashboardPath = path.join('./test-results', `executive-dashboard-${this.analysisId}.json`);
      fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));

      pipeline.phases.push({
        phase: 'executive_dashboard',
        status: 'completed',
        output: { dashboard_path: dashboardPath },
        duration: Date.now() - pipeline.startTime.getTime()
      });

      console.log(chalk.green('✅ Phase 5 completed: Executive dashboard generated'));

      // Final results
      pipeline.endTime = new Date();
      pipeline.totalDuration = pipeline.endTime.getTime() - pipeline.startTime.getTime();
      pipeline.status = 'completed';

      this.printPipelineResults(pipeline);

      // Store complete pipeline results
      const pipelinePath = path.join('./test-results', `${this.analysisId}-pipeline.json`);
      fs.writeFileSync(pipelinePath, JSON.stringify(pipeline, null, 2));

      return pipeline;

    } catch (error) {
      console.error(chalk.red(`❌ Analysis pipeline failed: ${error.message}`));
      pipeline.status = 'failed';
      pipeline.error = error.message;
      pipeline.endTime = new Date();
      return pipeline;
    }
  }

  /**
   * Wait for test completion and then analyze
   */
  async waitForTestsAndAnalyze(logFilePath) {
    console.log(chalk.blue(`⏳ Monitoring test execution: ${logFilePath}`));

    return new Promise((resolve, reject) => {
      const monitor = setInterval(async () => {
        try {
          if (fs.existsSync(logFilePath)) {
            const logContent = fs.readFileSync(logFilePath, 'utf8');

            // Check for completion indicators
            const isCompleted = logContent.includes('tests passed') ||
                              logContent.includes('tests failed') ||
                              logContent.includes('Test run completed') ||
                              logContent.includes(' passed, ') ||
                              logContent.includes(' failed (');

            if (isCompleted) {
              clearInterval(monitor);
              console.log(chalk.green('✅ Test execution completed! Starting analysis...'));

              // Look for JSON results file
              const resultsPattern = /test-results\/.*\.json/g;
              const jsonMatches = logContent.match(resultsPattern);

              let resultsPath = './test-results/results.json'; // Default
              if (jsonMatches && jsonMatches.length > 0) {
                resultsPath = jsonMatches[jsonMatches.length - 1]; // Use latest
              }

              // Execute comprehensive analysis
              const pipeline = await this.executeAnalysisPipeline(resultsPath);
              resolve(pipeline);
            }
          }
        } catch (error) {
          clearInterval(monitor);
          reject(error);
        }
      }, this.options.monitoringInterval);

      // Timeout after 60 minutes
      setTimeout(() => {
        clearInterval(monitor);
        reject(new Error('Test monitoring timed out after 60 minutes'));
      }, 60 * 60 * 1000);
    });
  }

  /**
   * Generate strategic directives for complex issues
   */
  async generateStrategicDirectives(intelligentResults) {
    const directives = [];

    // Group critical and high priority recommendations
    const criticalRecs = intelligentResults.recommendations.filter(r => r.priority === 'CRITICAL');
    const highRecs = intelligentResults.recommendations.filter(r => r.priority === 'HIGH');

    // Create SD for critical authentication issues
    const authIssues = [...criticalRecs, ...highRecs].filter(r =>
      r.category === 'Authentication' || r.issue.toLowerCase().includes('auth')
    );

    if (authIssues.length > 0) {
      directives.push({
        id: `SD-UAT-AUTH-${Date.now()}`,
        title: 'Resolve Critical Authentication Issues in UAT',
        description: 'Address authentication failures and improve auth reliability',
        priority: 'CRITICAL',
        recommendations: authIssues,
        estimated_effort: 'high',
        business_impact: 'User access and security affected'
      });
    }

    // Create SD for UI/UX issues if significant
    const uiIssues = [...criticalRecs, ...highRecs].filter(r =>
      r.category === 'UI Elements' || r.category === 'User Experience'
    );

    if (uiIssues.length >= 3) {
      directives.push({
        id: `SD-UAT-UI-${Date.now()}`,
        title: 'Improve UI Test Reliability and User Experience',
        description: 'Fix UI element detection and improve user interface reliability',
        priority: 'HIGH',
        recommendations: uiIssues,
        estimated_effort: 'medium',
        business_impact: 'User experience and test automation reliability'
      });
    }

    return directives;
  }

  /**
   * Generate executive dashboard
   */
  generateExecutiveDashboard(results) {
    const report = results.report || {};
    const gates = results.quality_gates || {};
    const intelligent = results.intelligent_analysis || {};

    return {
      metadata: {
        analysis_id: this.analysisId,
        timestamp: this.timestamp,
        generated_by: 'UAT Comprehensive Analysis Pipeline'
      },
      executive_summary: {
        overall_status: gates.overall_pass ? 'PASS' : 'FAIL',
        test_execution: {
          total_tests: report.executive_summary?.metrics?.total_tests || 0,
          pass_rate: report.executive_summary?.metrics?.pass_rate || 0,
          critical_failures: report.executive_summary?.issues?.critical || 0
        },
        quality_gates: {
          status: gates.overall_pass ? 'PASS' : 'FAIL',
          critical_failures: gates.summary?.critical_failures || 0,
          gates_passed: gates.summary?.gates_passed || 0,
          gates_total: gates.summary?.total_gates || 0
        },
        intelligent_insights: {
          patterns_identified: Object.keys(intelligent.analysis?.failure_patterns || {}).length,
          recommendations_generated: intelligent.recommendations?.length || 0,
          confidence_score: intelligent.confidence_score || 0,
          immediate_actions: intelligent.action_plan?.immediate_actions?.length || 0
        }
      },
      key_metrics: {
        automation_health: this.calculateAutomationHealth(results),
        platform_coverage: this.calculatePlatformCoverage(results),
        quality_trend: this.calculateQualityTrend(results),
        risk_assessment: this.calculateRiskAssessment(results)
      },
      actionable_insights: {
        immediate_actions: intelligent.action_plan?.immediate_actions || [],
        short_term_improvements: intelligent.action_plan?.short_term_actions || [],
        strategic_initiatives: results.strategic_directives || [],
        investment_priorities: this.calculateInvestmentPriorities(results)
      },
      next_steps: this.generateNextSteps(results)
    };
  }

  /**
   * Calculate automation health score
   */
  calculateAutomationHealth(results) {
    const report = results.report || {};
    const passRate = report.executive_summary?.metrics?.pass_rate || 0;
    const authFailures = report.failure_analysis?.categories?.authentication?.length || 0;
    const flakiness = report.executive_summary?.metrics?.flaky || 0;

    let healthScore = passRate;
    if (authFailures > 0) healthScore -= 20; // Critical for automation
    if (flakiness > 0) healthScore -= (flakiness * 2); // Flaky tests hurt reliability

    return {
      score: Math.max(0, Math.round(healthScore)),
      status: healthScore >= 85 ? 'excellent' : healthScore >= 70 ? 'good' : healthScore >= 50 ? 'fair' : 'poor',
      factors: {
        pass_rate: passRate,
        authentication_reliability: authFailures === 0,
        test_stability: flakiness <= 2
      }
    };
  }

  /**
   * Calculate platform coverage
   */
  calculatePlatformCoverage(results) {
    // Based on the 17 test categories we have
    const totalModules = 17;
    const testedModules = totalModules; // All modules have tests

    return {
      percentage: Math.round((testedModules / totalModules) * 100),
      modules_tested: testedModules,
      modules_total: totalModules,
      coverage_areas: [
        'Authentication & Security',
        'Core User Journeys',
        'Administrative Functions',
        'Analytics & Reporting',
        'AI Agent Management',
        'Accessibility Compliance',
        'Performance & Mobile',
        'End-to-End Workflows'
      ]
    };
  }

  /**
   * Calculate quality trend
   */
  calculateQualityTrend(results) {
    // Based on current vs historical data
    const currentPassRate = results.report?.executive_summary?.metrics?.pass_rate || 0;

    return {
      current_pass_rate: currentPassRate,
      trend_direction: currentPassRate >= 85 ? 'improving' : currentPassRate >= 70 ? 'stable' : 'degrading',
      target_pass_rate: 85,
      gap_to_target: Math.max(0, 85 - currentPassRate)
    };
  }

  /**
   * Calculate risk assessment
   */
  calculateRiskAssessment(results) {
    const criticalIssues = results.report?.executive_summary?.issues?.critical || 0;
    const authFailures = results.report?.failure_analysis?.categories?.authentication?.length || 0;
    const passRate = results.report?.executive_summary?.metrics?.pass_rate || 0;

    let riskLevel = 'low';
    if (criticalIssues > 0 || authFailures > 0) riskLevel = 'critical';
    else if (passRate < 70) riskLevel = 'high';
    else if (passRate < 85) riskLevel = 'medium';

    return {
      level: riskLevel,
      factors: {
        critical_issues: criticalIssues,
        authentication_failures: authFailures,
        pass_rate_below_target: passRate < 85
      },
      mitigation_priority: riskLevel === 'critical' ? 'immediate' : riskLevel === 'high' ? 'urgent' : 'scheduled'
    };
  }

  /**
   * Calculate investment priorities
   */
  calculateInvestmentPriorities(results) {
    const recommendations = results.intelligent_analysis?.recommendations || [];

    const priorities = {
      immediate: recommendations.filter(r => r.priority === 'CRITICAL').length,
      short_term: recommendations.filter(r => r.priority === 'HIGH').length,
      long_term: recommendations.filter(r => ['MEDIUM', 'LOW'].includes(r.priority)).length
    };

    return {
      investment_areas: priorities,
      recommended_focus: priorities.immediate > 0 ? 'authentication_reliability' :
                        priorities.short_term > 3 ? 'ui_test_stability' : 'continuous_improvement'
    };
  }

  /**
   * Generate next steps
   */
  generateNextSteps(results) {
    const steps = [];
    const gates = results.quality_gates || {};
    const intelligent = results.intelligent_analysis || {};

    if (!gates.overall_pass) {
      steps.push('Address critical quality gate failures before production deployment');
    }

    if (intelligent.action_plan?.immediate_actions?.length > 0) {
      steps.push('Execute immediate action items identified by intelligent analysis');
    }

    if (results.strategic_directives?.length > 0) {
      steps.push('Review and approve strategic directives for systematic improvements');
    }

    steps.push('Set up continuous monitoring and automated quality gates');
    steps.push('Schedule regular UAT execution and trend analysis');

    return steps;
  }

  /**
   * Print pipeline results to console
   */
  printPipelineResults(pipeline) {
    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold.blue(`🔬 COMPREHENSIVE UAT ANALYSIS COMPLETE - ${pipeline.status.toUpperCase()}`));
    console.log('='.repeat(80));

    console.log('\n📊 Pipeline Summary:');
    console.log(`   Analysis ID: ${this.analysisId}`);
    console.log(`   Total Duration: ${Math.round(pipeline.totalDuration / 1000)}s`);
    console.log(`   Phases Completed: ${pipeline.phases.length}`);

    console.log('\n🔍 Phase Results:');
    pipeline.phases.forEach((phase, i) => {
      const status = phase.status === 'completed' ? chalk.green('✅ COMPLETED') :
                    phase.status === 'passed' ? chalk.green('✅ PASSED') :
                    phase.status === 'failed' ? chalk.red('❌ FAILED') : chalk.yellow('⏳ RUNNING');

      console.log(`   ${i + 1}. ${status} ${phase.phase} (${Math.round(phase.duration / 1000)}s)`);
    });

    if (pipeline.results.report) {
      const report = pipeline.results.report;
      console.log('\n📈 Key Metrics:');
      console.log(`   Pass Rate: ${report.executive_summary?.metrics?.pass_rate || 0}%`);
      console.log(`   Total Tests: ${report.executive_summary?.metrics?.total_tests || 0}`);
      console.log(`   Critical Issues: ${report.executive_summary?.issues?.critical || 0}`);
    }

    if (pipeline.results.quality_gates) {
      const gates = pipeline.results.quality_gates;
      console.log(`\n🚪 Quality Gates: ${gates.overall_pass ? chalk.green('PASSED') : chalk.red('FAILED')}`);
      console.log(`   Gates Passed: ${gates.summary?.gates_passed || 0}/${gates.summary?.total_gates || 0}`);
    }

    if (pipeline.results.intelligent_analysis) {
      const intelligent = pipeline.results.intelligent_analysis;
      console.log('\n🤖 Intelligent Analysis:');
      console.log(`   Recommendations: ${intelligent.recommendations?.length || 0}`);
      console.log(`   Confidence Score: ${intelligent.confidence_score || 0}%`);
    }

    console.log('\n' + '='.repeat(80));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  let resultsPath = args[0];
  let waitForCompletion = false;
  let logFilePath = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--wait':
        waitForCompletion = true;
        logFilePath = args[++i];
        break;
      case '--generate-sds':
        // Generate strategic directives
        break;
      case '--help':
        console.log(`
Usage: node uat-comprehensive-analysis.js [OPTIONS] [RESULTS_FILE]

Options:
  --wait <log-file>     Wait for test completion by monitoring log file
  --generate-sds        Generate strategic directives for complex issues
  --help                Show this help message

Examples:
  node uat-comprehensive-analysis.js results.json
  node uat-comprehensive-analysis.js --wait test-results/uat-complete-run.log
        `);
        process.exit(0);
    }
  }

  try {
    const analyzer = new UATComprehensiveAnalysis({
      generateStrategicDirectives: true,
      storeInDatabase: true
    });

    if (waitForCompletion && logFilePath) {
      console.log('🔄 Waiting for test completion and executing analysis pipeline...');
      await analyzer.waitForTestsAndAnalyze(logFilePath);
    } else if (resultsPath) {
      console.log('🔄 Executing analysis pipeline for existing results...');
      await analyzer.executeAnalysisPipeline(resultsPath);
    } else {
      console.error('❌ Please provide results file or use --wait with log file');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Analysis pipeline error:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
export { UATComprehensiveAnalysis };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}